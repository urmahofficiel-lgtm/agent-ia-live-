import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PLATEFORMES, plateformeParZernio } from "./plateformes";
import { demanderIA, genererImage } from "./ia.server";
import { consigneScript, durees, lireScript } from "./video";
import { monterVideo } from "./video.server";
import { voixConfiguree, voixOff } from "./voix.server";
import { preparer, URL_SITE, type Ecrivain } from "./preparation.server";
import { consignePlanification, datePrevue, lirePlan } from "./commande";
import { consigneAnalyse, demandeDepuisStrategie, lireAnalyse, lireProfilDeduit, type Analyse, type Profil } from "./strategie";
import { consigneProfilDepuisSite } from "./site";
import { lireSite } from "./site.server";
import { CATEGORIES, lireReponseOverpass, requeteOverpass } from "./osm";
import { utilisateurDepuisJeton } from "./supabase-serveur";
import {
  creerProfil,
  envoyerMessage,
  listerCommentaires,
  listerComptes,
  listerConversations,
  publier,
  type Media,
  repondreCommentaire,
  urlAutorisation,
  zernioConfigure,
} from "./zernio.server";

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

const message = (e: unknown) => (e instanceof Error ? e.message : "Erreur inattendue.");
const jeton = z.string().min(10);

// --- Préparation (texte + visuel) --------------------------------------------

type Sb = Awaited<ReturnType<typeof utilisateurDepuisJeton>>["sb"];

// Écrivain « côté site » : agit avec le jeton de l'utilisateur (RLS).
function ecrivainUtilisateur(sb: Sb, userId: string, tacheId: string, resultatInitial: object | null): Ecrivain {
  let resultat: Record<string, unknown> = { ...(resultatInitial ?? {}) };
  return {
    journal: (niveau, msg, image) =>
      sb.from("evenements_taches").insert({ tache_id: tacheId, user_id: userId, niveau, message: msg, capture_url: image ?? null }),
    enregistrer: async (partiel) => {
      resultat = { ...resultat, ...partiel };
      await sb.from("taches").update({ resultat }).eq("id", tacheId);
    },
    ajouterVisuel: async (mime, donnees, prompt) => {
      const { data, error } = await sb
        .from("visuels")
        .insert({ user_id: userId, tache_id: tacheId, mime, donnees, prompt })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Enregistrement de l'image impossible.");
      return data.id as string;
    },
  };
}

async function contexteMarque(sb: Sb) {
  const { data } = await sb.rpc("mon_contexte_marque");
  return (data as string | null) || null;
}

type TacheLue = { id: string; type: string; plateforme: string | null; titre: string; consigne: string; resultat: Record<string, unknown> | null };

async function preparerPourUtilisateur(sb: Sb, userId: string, t: TacheLue, contexte: string | null, options: { refaireTexte?: boolean; refaireImage?: boolean } = {}) {
  const r = t.resultat ?? {};
  return preparer(
    {
      type: t.type,
      plateforme: t.plateforme,
      titre: t.titre,
      consigne: t.consigne,
      brouillon: options.refaireTexte ? null : (r.brouillon as string | undefined),
      visuel_url: options.refaireTexte || options.refaireImage ? null : (r.visuel_url as string | undefined),
    },
    contexte,
    ecrivainUtilisateur(sb, userId, t.id, r),
  );
}

// Rédige (ou réécrit) le texte ET crée le visuel d'une tâche.
export const genererBrouillon = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ tacheId: z.string().uuid(), jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ brouillon: string }>> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const { data: t } = await sb.from("taches").select("id, type, plateforme, titre, consigne, resultat").eq("id", data.tacheId).single();
      if (!t) return { ok: false, erreur: "Tâche introuvable." };
      const r = await preparerPourUtilisateur(sb, user.id, t as TacheLue, await contexteMarque(sb), { refaireTexte: true });
      return { ok: true, brouillon: r.brouillon };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// Recrée seulement l'image.
export const regenererVisuel = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ tacheId: z.string().uuid(), jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const { data: t } = await sb.from("taches").select("id, type, plateforme, titre, consigne, resultat").eq("id", data.tacheId).single();
      if (!t) return { ok: false, erreur: "Tâche introuvable." };
      const r = await preparerPourUtilisateur(sb, user.id, t as TacheLue, await contexteMarque(sb), { refaireImage: true });
      return r.visuel_url ? { ok: true } : { ok: false, erreur: "L'image n'a pas pu être créée (voir En direct)." };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// « Lancer maintenant » : l'agent traite tout de suite les tâches en attente
// de préparation, sous les yeux de l'utilisateur (page En direct).
export const travaillerMaintenant = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ traitees: number }>> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const { data: taches } = await sb
        .from("taches")
        .select("id, type, plateforme, titre, consigne, resultat")
        .in("statut", ["a_valider", "en_attente"])
        .in("type", ["publication", "reponse", "prospection", "relance"])
        .order("planifiee_pour", { ascending: true, nullsFirst: true })
        .limit(20);
      const aFaire = ((taches ?? []) as TacheLue[])
        .filter((t) => !t.resultat?.brouillon || (t.type === "publication" && !t.resultat?.visuel_url))
        .slice(0, 3);

      const journal = (niveau: string, msg: string) => sb.from("evenements_taches").insert({ user_id: user.id, niveau, message: msg });
      if (aFaire.length === 0) {
        await journal("info", "Rien à préparer : toutes les tâches ont déjà leur texte et leur visuel.");
        return { ok: true, traitees: 0 };
      }
      await journal("action", `▶️ L'agent démarre : ${aFaire.length} tâche(s) à préparer.`);
      const contexte = await contexteMarque(sb);
      if (!contexte) await journal("info", "Astuce : remplissez la page Stratégie pour que l'agent écrive pour votre niche.");
      for (const t of aFaire) {
        try {
          await preparerPourUtilisateur(sb, user.id, t, contexte);
        } catch (e) {
          await journal("erreur", `« ${t.titre} » : ${message(e)}`);
        }
      }
      await journal("info", "✅ Terminé. Les publications sont prêtes à valider dans Tâches.");
      return { ok: true, traitees: aFaire.length };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// --- Publication immédiate -------------------------------------------------

export const publierTache = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ tacheId: z.string().uuid(), jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const { data: t } = await sb
        .from("taches")
        .select("id, type, plateforme, titre, resultat")
        .eq("id", data.tacheId)
        .single();
      if (!t) return { ok: false, erreur: "Tâche introuvable." };
      const brouillon = (t.resultat as { brouillon?: string } | null)?.brouillon;
      const r = (t.resultat ?? {}) as { visuel_url?: string; video_url?: string };
      const media: Media | null = r.video_url
        ? { type: "video", url: r.video_url }
        : r.visuel_url
          ? { type: "image", url: r.visuel_url }
          : null;
      if (!brouillon) return { ok: false, erreur: "Rédigez d'abord le contenu avec l'IA." };

      const zernio = PLATEFORMES.find((p) => p.id === t.plateforme)?.zernio;
      if (!zernio) return { ok: false, erreur: "Cette plateforme ne peut pas encore publier." };
      const { data: compte } = await sb
        .from("comptes_connectes")
        .select("compte_externe_id")
        .eq("plateforme", t.plateforme)
        .eq("statut", "connecte")
        .not("compte_externe_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (!compte?.compte_externe_id) {
        return { ok: false, erreur: "Connectez d'abord ce réseau (page Comptes)." };
      }

      const journal = (niveau: string, msg: string) =>
        sb.from("evenements_taches").insert({ tache_id: t.id, user_id: user.id, niveau, message: msg });

      await sb.from("taches").update({ statut: "en_cours" }).eq("id", t.id);
      await journal("action", `🚀 Publication en cours sur ${PLATEFORMES.find((p) => p.id === t.plateforme)?.nom} : « ${t.titre} »`);
      try {
        const post = await publier(zernio, compte.compte_externe_id, brouillon, media);
        await sb
          .from("taches")
          .update({ statut: "terminee", resultat: { ...(t.resultat as object), post_id: post._id, publie_le: new Date().toISOString() } })
          .eq("id", t.id);
        await journal("info", `✅ Publié : « ${t.titre} »`);
        return { ok: true };
      } catch (e) {
        await sb.from("taches").update({ statut: "echouee" }).eq("id", t.id);
        await journal("erreur", `Échec de publication : ${message(e)}`);
        throw e;
      }
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// --- Connexion des réseaux -------------------------------------------------

async function profilZernio(sb: Awaited<ReturnType<typeof utilisateurDepuisJeton>>["sb"], user: { id: string; email?: string }) {
  const { data: r } = await sb.from("reglages_agent").select("zernio_profile_id").maybeSingle();
  if (r?.zernio_profile_id) return r.zernio_profile_id as string;
  const id = await creerProfil(`agent-ia-live ${user.email ?? user.id}`);
  await sb.from("reglages_agent").upsert({ user_id: user.id, zernio_profile_id: id });
  return id;
}

export const urlConnexion = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ plateforme: z.string(), jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ url: string }>> => {
    try {
      if (!zernioConfigure()) return { ok: false, erreur: "ZERNIO_ABSENT" };
      const p = PLATEFORMES.find((x) => x.id === data.plateforme);
      if (!p?.zernio) return { ok: false, erreur: "Cette plateforme n'est pas encore connectable." };
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const profil = await profilZernio(sb, user);
      const url = await urlAutorisation(p.zernio, profil, `${URL_SITE}/comptes`);
      return { ok: true, url };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

export const synchroniserComptes = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ connectes: number }>> => {
    try {
      if (!zernioConfigure()) return { ok: false, erreur: "ZERNIO_ABSENT" };
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const profil = await profilZernio(sb, user);
      const comptes = await listerComptes(profil);

      let connectes = 0;
      for (const c of comptes) {
        const p = plateformeParZernio(c.platform);
        if (!p) continue;
        const ligne = {
          user_id: user.id,
          plateforme: p.id,
          libelle: "principal",
          statut: c.isActive === false ? "erreur" : "connecte",
          compte_externe_id: c._id,
          nom_utilisateur: c.username ?? c.displayName ?? null,
        };
        const { error } = await sb.from("comptes_connectes").upsert(ligne, { onConflict: "user_id,plateforme,libelle" });
        if (!error) connectes++;
      }
      return { ok: true, connectes };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// --- Commande en langage courant ---------------------------------------------

export const planifierCommande = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ demande: z.string().min(3).max(2000), jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ creees: number }>> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const maintenant = new Date();
      const contexte = await contexteMarque(sb);
      const reponse = await demanderIA(consignePlanification(data.demande, maintenant, contexte), {
        systeme: "Tu es un planificateur. Tu réponds uniquement en JSON valide.",
        maxTokens: 2500,
      });
      const plan = lirePlan(reponse);
      if (plan.length === 0) return { ok: false, erreur: "L'IA n'a pas compris la demande. Reformulez-la." };

      const { data: reglages } = await sb.from("reglages_agent").select("validation_requise").maybeSingle();
      const validation = reglages?.validation_requise ?? true;
      const aValider = new Set(["publication", "reponse", "prospection", "relance"]);

      const lignes = plan.map((t) => ({
        user_id: user.id,
        type: t.type,
        plateforme: t.type === "appareil" ? null : (t.plateforme ?? null),
        titre: t.titre,
        consigne: t.consigne,
        statut: validation && aValider.has(t.type) ? "a_valider" : "en_attente",
        planifiee_pour: datePrevue(t, maintenant)?.toISOString() ?? null,
      }));
      const { error } = await sb.from("taches").insert(lignes);
      if (error) return { ok: false, erreur: error.message };
      await sb.from("evenements_taches").insert({
        user_id: user.id,
        niveau: "action",
        message: `Commande comprise : ${lignes.length} tâche(s) créée(s). Les brouillons arrivent dans quelques minutes.`,
      });
      return { ok: true, creees: lignes.length };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// --- Recherche de prospects ---------------------------------------------------

export const trouverProspects = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        categorie: z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]]),
        ville: z.string().min(2).max(80),
        max: z.number().int().min(1).max(200).default(50),
        jeton,
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Resultat<{ trouves: number; ajoutes: number }>> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const r = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "agent-ia-live/0.1 (prospection)",
          Accept: "application/json",
        },
        body: new URLSearchParams({ data: requeteOverpass(data.categorie, data.ville, data.max) }),
      });
      if (!r.ok) return { ok: false, erreur: `Service de recherche indisponible (${r.status}). Réessayez.` };
      const trouves = lireReponseOverpass(await r.text());

      // Ne pas recréer un prospect déjà présent (même nom).
      const { data: existants } = await sb.from("prospects").select("nom");
      const deja = new Set((existants ?? []).map((p) => (p.nom as string).toLowerCase()));
      const categorie = CATEGORIES.find((c) => c.id === data.categorie)!;
      const nouveaux = trouves
        .filter((p) => !deja.has(p.nom.toLowerCase()))
        .map((p) => ({
          user_id: user.id,
          type: "entreprise",
          nom: p.nom,
          entreprise: p.nom,
          email: p.email,
          telephone: p.telephone,
          site: p.site,
          source: `OpenStreetMap · ${categorie.nom} · ${data.ville}`,
          notes: p.adresse,
        }));
      if (nouveaux.length) {
        const { error } = await sb.from("prospects").insert(nouveaux);
        if (error) return { ok: false, erreur: error.message };
      }
      await sb.from("evenements_taches").insert({
        user_id: user.id,
        niveau: "info",
        message: `Prospection : ${trouves.length} ${categorie.nom.toLowerCase()} trouvés à ${data.ville}, ${nouveaux.length} nouveaux ajoutés au CRM.`,
      });
      return { ok: true, trouves: trouves.length, ajoutes: nouveaux.length };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// --- Boîte de réception -------------------------------------------------------

export type ElementBoite = {
  genre: "commentaire" | "message";
  id: string;
  plateforme: string;
  accountId: string;
  postId?: string;
  auteur: string;
  texte: string;
  contexte?: string;
  date?: string;
  lien?: string | null;
};

export const chargerBoite = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ elements: ElementBoite[] }>> => {
    try {
      if (!zernioConfigure()) return { ok: false, erreur: "ZERNIO_ABSENT" };
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const profil = await profilZernio(sb, user);
      const [conversations, commentaires] = await Promise.all([
        listerConversations(profil).catch(() => []),
        listerCommentaires(profil).catch(() => []),
      ]);
      const elements: ElementBoite[] = [
        ...commentaires.map((c) => ({
          genre: "commentaire" as const,
          id: c.id,
          plateforme: plateformeParZernio(c.platform)?.id ?? c.platform,
          accountId: c.accountId,
          postId: c.postId,
          auteur: c.from?.name || c.from?.username || "Quelqu'un",
          texte: c.message,
          contexte: c.post,
          date: c.createdTime,
          lien: c.url,
        })),
        ...conversations
          .filter((c) => c.lastMessage)
          .map((c) => ({
            genre: "message" as const,
            id: c.id,
            plateforme: plateformeParZernio(c.platform)?.id ?? c.platform,
            accountId: c.accountId,
            auteur: c.participantName || "Contact",
            texte: c.lastMessage ?? "",
            date: c.updatedTime,
            lien: c.url,
          })),
      ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      return { ok: true, elements };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

export const proposerReponse = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        genre: z.enum(["commentaire", "message"]),
        auteur: z.string().max(200),
        texte: z.string().max(4000),
        contexte: z.string().max(1000).optional(),
        jeton,
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Resultat<{ reponse: string }>> => {
    try {
      await utilisateurDepuisJeton(data.jeton);
      const reponse = await demanderIA(
        [
          data.genre === "commentaire"
            ? "Rédige une réponse courte, chaleureuse et utile à ce commentaire laissé sous une de nos publications."
            : "Rédige une réponse courte, polie et utile à ce message privé. Si c'est une demande commerciale, propose un échange.",
          data.contexte ? `Publication concernée : ${data.contexte}` : "",
          `Auteur : ${data.auteur}`,
          `Texte reçu : ${data.texte}`,
          "Réponds dans la langue du texte reçu. Ne réponds qu'avec le texte à envoyer.",
        ]
          .filter(Boolean)
          .join("\n"),
        { maxTokens: 300 },
      );
      return { ok: true, reponse };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

export const envoyerReponse = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        genre: z.enum(["commentaire", "message"]),
        id: z.string().min(1),
        accountId: z.string().min(1),
        postId: z.string().optional(),
        auteur: z.string().max(200),
        reponse: z.string().min(1).max(4000),
        jeton,
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Resultat> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      // Le compte visé doit bien appartenir à l'utilisateur.
      const { data: compte } = await sb
        .from("comptes_connectes")
        .select("id")
        .eq("compte_externe_id", data.accountId)
        .maybeSingle();
      if (!compte) return { ok: false, erreur: "Ce compte n'est pas connecté à votre agent." };

      if (data.genre === "commentaire") {
        if (!data.postId) return { ok: false, erreur: "Publication inconnue." };
        await repondreCommentaire(data.postId, data.accountId, data.id, data.reponse);
      } else {
        await envoyerMessage(data.id, data.accountId, data.reponse);
      }
      await sb.from("evenements_taches").insert({
        user_id: user.id,
        niveau: "info",
        message: `Réponse envoyée à ${data.auteur} (${data.genre}).`,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// --- Stratégie : analyse de la niche et du marché ------------------------------

// Analyse de niche + marché, rangée dans le profil.
async function lancerAnalyse(sb: Sb, userId: string, profil: Profil, extraitSite?: string) {
  const journal = (niveau: string, msg: string) => sb.from("evenements_taches").insert({ user_id: userId, niveau, message: msg });
  await journal("action", "🔎 Analyse de votre niche et de votre marché…");
  let analyse: Analyse | null = null;
  for (let essai = 0; essai < 2 && !analyse; essai++) {
    analyse = lireAnalyse(
      await demanderIA(consigneAnalyse(profil, extraitSite), {
        systeme: "Tu es un stratège marketing. Tu réponds uniquement en JSON valide.",
        maxTokens: 4000,
      }),
    );
  }
  if (!analyse) {
    await journal("erreur", "L'analyse n'a pas abouti. Réessayez.");
    throw new Error("L'IA n'a pas renvoyé d'analyse exploitable. Réessayez.");
  }
  await sb.from("profil_marque").update({ analyse_marche: analyse, analyse_le: new Date().toISOString() }).eq("user_id", userId);
  await journal(
    "info",
    `Stratégie prête : ${analyse.resume_niche.slice(0, 120)} — réseaux prioritaires : ${analyse.plateformes
      .slice(0, 3)
      .map((p) => PLATEFORMES.find((x) => x.id === p.id)?.nom)
      .join(", ")}.`,
  );
  return analyse;
}

export const analyserMarche = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ analyse: Analyse }>> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const { data: profil } = await sb
        .from("profil_marque")
        .select("activite, offre, cible, zone, ton, site, objectif, extrait_site")
        .maybeSingle();
      if (!profil?.activite) return { ok: false, erreur: "Décrivez d'abord votre activité, ou collez le lien de votre site." };
      const { extrait_site, ...p } = profil;
      return { ok: true, analyse: await lancerAnalyse(sb, user.id, p as Profil, (extrait_site as string | null) ?? undefined) };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// Le plus simple : un lien (site, page produit, SaaS…). L'agent lit le site,
// remplit le profil, puis analyse le marché à partir du vrai contenu.
export const analyserDepuisLien = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ lien: z.string().min(4).max(500), jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ profil: Profil; analyse: Analyse }>> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const journal = (niveau: string, msg: string) => sb.from("evenements_taches").insert({ user_id: user.id, niveau, message: msg });

      await journal("action", `🌐 Lecture du site ${data.lien}…`);
      const site = await lireSite(data.lien);
      await journal("info", `${site.pages.length} page(s) lue(s) : ${site.pages.map((p) => p.titre || "sans titre").join(" · ")}`);

      await journal("action", "🧠 Compréhension de l'activité, de l'offre et des clients…");
      let deduit = null;
      for (let essai = 0; essai < 2 && !deduit; essai++) {
        deduit = lireProfilDeduit(
          await demanderIA(consigneProfilDepuisSite(site.url, site.pages), {
            systeme: "Tu es un analyste marketing. Tu réponds uniquement en JSON valide.",
            maxTokens: 1500,
          }),
        );
      }
      if (!deduit) return { ok: false, erreur: "L'IA n'a pas réussi à comprendre le site. Remplissez les champs à la main." };

      const profil: Profil = { ...deduit.profil, site: site.url };
      const extrait = site.pages.map((p) => `${p.titre}\n${p.description}\n${p.texte}`).join("\n\n");
      const { error } = await sb.from("profil_marque").upsert({
        user_id: user.id,
        ...profil,
        nom: deduit.nom,
        fiche: { ...deduit.fiche, lien_cta: deduit.fiche.lien_cta || site.url },
        extrait_site: extrait.slice(0, 12000),
      });
      if (error) return { ok: false, erreur: error.message };
      await journal(
        "info",
        `Fiche marque : ${deduit.nom || "marque"} — ${deduit.fiche.fonctionnalites.length} fonctionnalités, ${deduit.fiche.preuves.length} preuves relevées sur le site.`,
      );
      await journal("info", `Activité comprise : ${profil.activite.slice(0, 150)}`);

      const analyse = await lancerAnalyse(sb, user.id, profil, extrait);
      return { ok: true, profil, analyse };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

export const planifierDepuisStrategie = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jours: z.number().int().min(3).max(30).default(14), jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ creees: number }>> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const { data: profil } = await sb.from("profil_marque").select("analyse_marche").maybeSingle();
      const analyse = profil?.analyse_marche as Analyse | null;
      if (!analyse) return { ok: false, erreur: "Lancez d'abord l'analyse de marché." };
      const { data: comptes } = await sb.from("comptes_connectes").select("plateforme").eq("statut", "connecte");
      const connectes = (comptes ?? []).map((c) => c.plateforme as string);

      const maintenant = new Date();
      const reponse = await demanderIA(
        consignePlanification(demandeDepuisStrategie(analyse, connectes, data.jours), maintenant, await contexteMarque(sb)),
        { systeme: "Tu es un planificateur. Tu réponds uniquement en JSON valide.", maxTokens: 3500 },
      );
      const plan = lirePlan(reponse);
      if (plan.length === 0) return { ok: false, erreur: "Le calendrier n'a pas pu être créé. Réessayez." };
      const { data: reglages } = await sb.from("reglages_agent").select("validation_requise").maybeSingle();
      const validation = reglages?.validation_requise ?? true;
      const { error } = await sb.from("taches").insert(
        plan.map((t) => ({
          user_id: user.id,
          type: t.type,
          plateforme: t.plateforme ?? null,
          titre: t.titre,
          consigne: t.consigne,
          statut: validation ? "a_valider" : "en_attente",
          planifiee_pour: datePrevue(t, maintenant)?.toISOString() ?? null,
        })),
      );
      if (error) return { ok: false, erreur: error.message };
      await sb.from("evenements_taches").insert({
        user_id: user.id,
        niveau: "action",
        message: `📅 Calendrier créé : ${plan.length} publications sur ${data.jours} jours, selon votre stratégie.`,
      });
      return { ok: true, creees: plan.length };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// --- Vidéo courte verticale (TikTok, Reels, Shorts) ----------------------------

export const creerVideo = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ tacheId: z.string().uuid(), jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ video_url: string }>> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const { data: t } = await sb.from("taches").select("id, plateforme, titre, consigne, resultat").eq("id", data.tacheId).single();
      if (!t) return { ok: false, erreur: "Tâche introuvable." };
      const journal = (niveau: string, msg: string, image?: string) =>
        sb.from("evenements_taches").insert({ tache_id: t.id, user_id: user.id, niveau, message: msg, capture_url: image ?? null });
      const contexte = await contexteMarque(sb);
      const reseau = PLATEFORMES.find((p) => p.id === t.plateforme)?.nom ?? "TikTok, Reels et Shorts";

      await journal("action", `🎬 Écriture du script vidéo : « ${t.titre} »`);
      let script = null;
      for (let essai = 0; essai < 2 && !script; essai++) {
        script = lireScript(
          await demanderIA(consigneScript(t, contexte, reseau), {
            systeme: "Tu es scénariste de vidéos courtes pour les réseaux sociaux. Tu réponds uniquement en JSON valide.",
            maxTokens: 3000,
          }),
        );
      }
      if (!script) return { ok: false, erreur: "Le script vidéo n'a pas pu être écrit. Réessayez." };
      await journal("info", `Script : ${script.scenes.length} scènes — « ${script.scenes[0].texte_ecran} »`);

      let voix = null;
      if (voixConfiguree()) {
        await journal("action", "🎙️ Enregistrement de la voix off (Gemini)…");
        voix = await voixOff(script.scenes.map((s) => s.voix).join(" "));
        await journal(voix ? "info" : "erreur", voix ? `Voix off prête (${Math.round(voix.duree)} s).` : "Voix off impossible : vidéo sans voix.");
      }
      const d = durees(script.scenes, voix ? voix.duree + 0.6 : undefined);

      await journal("action", `🖼️ Création des ${script.scenes.length} images des scènes…`);
      const images: Buffer[] = [];
      const univers = contexte?.match(/Univers visuel[^:]*: (.*)/)?.[1] ?? "";
      for (let i = 0; i < script.scenes.length; i += 3) {
        const lot = script.scenes.slice(i, i + 3);
        const faits = await Promise.all(
          lot.map((s) =>
            genererImage(`${s.visuel}. ${univers} Vertical 9:16 composition, realistic photo, no text.`, "tiktok"),
          ),
        );
        images.push(...faits.map((f) => Buffer.from(f.base64, "base64")));
      }

      await journal("action", "✂️ Montage de la vidéo (zoom, textes, voix)…");
      const mp4 = await monterVideo(
        script.scenes.map((s, i) => ({ image: images[i], texte_ecran: s.texte_ecran })),
        d,
        voix ?? undefined,
      );

      const chemin = `${user.id}/${t.id}-${Date.now()}.mp4`;
      const { error: errStockage } = await sb.storage.from("videos").upload(chemin, mp4, { contentType: "video/mp4" });
      if (errStockage) return { ok: false, erreur: `Enregistrement de la vidéo impossible : ${errStockage.message}` };
      const video_url = sb.storage.from("videos").getPublicUrl(chemin).data.publicUrl;

      const resultat = {
        ...((t.resultat as object | null) ?? {}),
        brouillon: script.legende || (t.resultat as { brouillon?: string } | null)?.brouillon,
        video_url,
        video_script: script,
        video_le: new Date().toISOString(),
      };
      await sb.from("taches").update({ resultat }).eq("id", t.id);
      await journal("info", `✅ Vidéo prête (${Math.round(d.reduce((a, b) => a + b, 0))} s, ${(mp4.length / 1e6).toFixed(1)} Mo) — à valider dans Tâches.`);
      return { ok: true, video_url };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });
