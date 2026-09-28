import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { estManuel, nomPlateforme, PLATEFORMES, plateformeParZernio } from "./plateformes";
import { demanderIA, genererImage } from "./ia.server";
import { consigneScript, durees, imposerScenesProduit, lireScript, scriptDeSecours } from "./video";
import { monterVideo } from "./video.server";
import { voixConfiguree, voixOff } from "./voix.server";
import { pexelsConfigure, photo, sequenceVerticale } from "./pexels.server";
import { preparer, URL_SITE, type Ecrivain } from "./preparation.server";
import { consignePlanification, datePrevue, lirePlan } from "./commande";
import { consigneAnalyse, demandeDepuisStrategie, lireAnalyse, lireProfilDeduit, type Analyse, type Profil } from "./strategie";
import { consigneProfilDepuisSite } from "./site";
import { lireSite } from "./site.server";
import { fabriquerVideo } from "./fabrication-video.server";
import { CATEGORIES, lireReponseOverpass, requeteOverpass } from "./osm";
import { clientMoteur, utilisateurDepuisJeton } from "./supabase-serveur";
import { commentairesFacebook, commentairesInstagram, metaConfigure, repondreFacebook, repondreInstagram, urlConnexionMeta } from "./meta.server";
import { GRAPH_IG, instagramConfigure, urlConnexionInstagram } from "./instagram.server";
import { publierSur, type CompteCible } from "./publication.server";
import { sessionBluesky } from "./bluesky.server";
import { verifierTelegram } from "./telegram.server";
import { linkedinConfigure, urlConnexionLinkedin } from "./linkedin.server";
import {
  creerProfil,
  deconnecterCompte,
  ErreurZernio,
  envoyerMessage,
  listerCommentaires,
  listerComptes,
  listerConversations,
  organisationsLinkedin,
  type Media,
  repondreCommentaire,
  urlAutorisation,
  zernioConfigure,
} from "./zernio.server";

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

const message = (e: unknown) => {
  if (e instanceof ErreurZernio && e.raison === "free_tier_exceeded") {
    return `LIMITE_GRATUITE|${e.lienTableau ?? "https://zernio.com/dashboard/billing"}`;
  }
  return e instanceof Error ? e.message : "Erreur inattendue.";
};
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
      visuel_url: options.refaireImage ? null : (r.visuel_url as string | undefined),
    },
    contexte,
    ecrivainUtilisateur(sb, userId, t.id, r),
  );
}

// Rédige (ou réécrit) le texte ; crée le visuel seulement s'il manque.
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
      const ancien = (t.resultat as { visuel_id?: string } | null)?.visuel_id;
      const r = await preparerPourUtilisateur(sb, user.id, t as TacheLue, await contexteMarque(sb), { refaireImage: true });
      if (!r.visuel_url) return { ok: false, erreur: "L'image n'a pas pu être créée (voir En direct)." };
      // L'ancienne image ne sert plus : on libère la place.
      if (ancien) await sb.from("visuels").delete().eq("id", ancien);
      return { ok: true };
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
      await journal("info", "✅ Terminé. Les publications sont prêtes à valider dans Publications.");
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

      if (!t.plateforme) return { ok: false, erreur: "Cette tâche n'a pas de réseau." };
      if (estManuel(t.plateforme)) return { ok: false, erreur: "Ce réseau se publie depuis votre téléphone : bouton « Partager »." };
      // Connexion directe Meta en priorité (« meta » < « zernio »).
      const { data: compte } = await sb
        .from("comptes_connectes")
        .select("compte_externe_id, cible_urn, fournisseur")
        .eq("plateforme", t.plateforme)
        .eq("statut", "connecte")
        .not("compte_externe_id", "is", null)
        .order("fournisseur") // « instagram » et « meta » passent avant « zernio »
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
        const postId = await publierSur(t.plateforme, user.id, compte as CompteCible, brouillon, media, r.visuel_url);
        await sb
          .from("taches")
          .update({ statut: "terminee", resultat: { ...(t.resultat as object), post_id: postId, publie_le: new Date().toISOString() } })
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
  .inputValidator((input) => z.object({ plateforme: z.string(), via: z.enum(["direct", "zernio"]).optional(), jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ url: string }>> => {
    try {
      // Facebook et Instagram : connexion directe à Meta quand l'app est configurée.
      // Instagram : connexion Instagram directe (compte pro, sans page Facebook).
      if (data.plateforme === "instagram" && instagramConfigure()) {
        const { user } = await utilisateurDepuisJeton(data.jeton);
        return { ok: true, url: urlConnexionInstagram(user.id) };
      }
      // LinkedIn : profil personnel en direct ; la page entreprise passe par Zernio.
      if (data.plateforme === "linkedin" && data.via !== "zernio" && linkedinConfigure()) {
        const { user } = await utilisateurDepuisJeton(data.jeton);
        return { ok: true, url: urlConnexionLinkedin(user.id) };
      }
      if (["facebook", "instagram"].includes(data.plateforme) && metaConfigure()) {
        const { user } = await utilisateurDepuisJeton(data.jeton);
        return { ok: true, url: urlConnexionMeta(user.id) };
      }
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

export type CompteDistant = { id: string; plateforme: string; nom: string | null; actif: boolean; utilise: boolean };

export const synchroniserComptes = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ connectes: number; distants: CompteDistant[] }>> => {
    try {
      if (!zernioConfigure()) return { ok: false, erreur: "ZERNIO_ABSENT" };
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const profil = await profilZernio(sb, user);
      // Le plus récent d'abord : c'est le compte qu'on vient de connecter.
      const comptes = (await listerComptes(profil)).sort((x, y) => (y.createdAt ?? "").localeCompare(x.createdAt ?? ""));

      const utilises = new Set<string>();
      for (const c of comptes) {
        const p = plateformeParZernio(c.platform);
        if (!p || [...utilises].some((id) => comptes.find((x) => x._id === id)?.platform === c.platform)) continue;
        // Un compte que l'utilisateur a mis de côté (autre compte choisi pour
        // ce réseau) le reste.
        const { data: avant } = await sb
          .from("comptes_connectes")
          .select("statut")
          .eq("plateforme", p.id)
          .eq("libelle", "principal")
          .maybeSingle();
        const { error } = await sb.from("comptes_connectes").upsert(
          {
            user_id: user.id,
            plateforme: p.id,
            libelle: "principal",
            statut: c.isActive === false ? "erreur" : avant?.statut === "desactive" ? "desactive" : "connecte",
            compte_externe_id: c._id,
            nom_utilisateur: c.username ?? c.displayName ?? null,
          },
          { onConflict: "user_id,plateforme,libelle" },
        );
        if (!error) utilises.add(c._id);
      }
      // Comptes qui n'existent plus chez Zernio : retirés de la liste.
      const { data: lignes } = await sb.from("comptes_connectes").select("id, compte_externe_id").eq("fournisseur", "zernio");
      const ids = new Set(comptes.map((c) => c._id));
      const perimes = (lignes ?? []).filter((l) => l.compte_externe_id && !ids.has(l.compte_externe_id as string)).map((l) => l.id);
      if (perimes.length) await sb.from("comptes_connectes").delete().in("id", perimes);

      return {
        ok: true,
        connectes: utilises.size,
        distants: comptes.map((c) => ({
          id: c._id,
          plateforme: plateformeParZernio(c.platform)?.id ?? c.platform,
          nom: c.username ?? c.displayName ?? null,
          actif: c.isActive !== false,
          utilise: utilises.has(c._id),
        })),
      };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// Déconnecte un compte chez Zernio (libère une place) et chez nous.
export const deconnecter = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ compteExterneId: z.string().min(1), jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      // Connexion directe Meta : rien à libérer ailleurs, on retire la ligne
      // (le jeton part avec elle).
      const { data: direct } = await sb
        .from("comptes_connectes")
        .select("id")
        .eq("compte_externe_id", data.compteExterneId)
        .neq("fournisseur", "zernio");
      if (direct?.length) {
        const { error } = await sb.from("comptes_connectes").delete().in("id", direct.map((d) => d.id));
        return error ? { ok: false, erreur: error.message } : { ok: true };
      }
      if (!zernioConfigure()) return { ok: false, erreur: "ZERNIO_ABSENT" };
      // Le compte doit appartenir au profil Zernio de cet utilisateur.
      const profil = await profilZernio(sb, user);
      const comptes = await listerComptes(profil);
      if (!comptes.some((c) => c._id === data.compteExterneId)) return { ok: false, erreur: "Compte introuvable." };
      await deconnecterCompte(data.compteExterneId);
      await sb.from("comptes_connectes").delete().eq("compte_externe_id", data.compteExterneId);
      return { ok: true };
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

      const { data: comptes } = await sb.from("comptes_connectes").select("plateforme").eq("statut", "connecte");
      const connectes = [...new Set((comptes ?? []).map((c) => c.plateforme as string))];
      const lignes = plan.map((t, i) => ({
        user_id: user.id,
        type: t.type,
        // Réseau oublié par l'IA : on répartit sur les réseaux connectés.
        plateforme: t.plateforme ?? (connectes.length ? connectes[i % connectes.length] : null),
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
  // Canal de réponse : connexion directe (meta, instagram) ou Zernio.
  fournisseur?: string;
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

// Commentaires des comptes connectés en direct (Facebook, Instagram).
async function commentairesDirects(sb: Sb, userId: string, avertissements: string[]): Promise<ElementBoite[]> {
  const { data: comptes } = await sb
    .from("comptes_connectes")
    .select("plateforme, fournisseur, compte_externe_id, nom_utilisateur")
    .eq("statut", "connecte")
    .in("fournisseur", ["meta", "instagram"]);
  const lots = await Promise.all(
    (comptes ?? []).map(async (c) => {
      try {
        const { data: jeton } = await clientMoteur().rpc("compte_jeton", {
          p_secret: process.env.AGENT_TICK_SECRET ?? "",
          p_user: userId,
          p_externe: c.compte_externe_id,
        });
        if (!jeton) return [];
        const liste =
          c.plateforme === "facebook"
            ? await commentairesFacebook(c.compte_externe_id as string, jeton as string)
            : await commentairesInstagram(
                c.compte_externe_id as string,
                jeton as string,
                c.nom_utilisateur as string | null,
                c.fournisseur === "instagram" ? GRAPH_IG : undefined,
              );
        return liste.map((x) => ({
          genre: "commentaire" as const,
          fournisseur: c.fournisseur as string,
          id: x.id,
          plateforme: c.plateforme as string,
          accountId: c.compte_externe_id as string,
          postId: x.postId,
          auteur: x.auteur,
          texte: x.texte,
          contexte: x.contexte,
          date: x.date,
          lien: x.lien,
        }));
      } catch (e) {
        console.warn("Commentaires directs", c.plateforme, e instanceof Error ? e.message : e);
        avertissements.push(
          `${nomPlateforme(c.plateforme as string)} : commentaires illisibles. Retirez puis reconnectez le compte (page Comptes) pour accorder l'accès aux commentaires.`,
        );
        return [];
      }
    }),
  );
  return lots.flat();
}

async function elementsZernio(sb: Sb, user: { id: string; email?: string }): Promise<ElementBoite[]> {
  if (!zernioConfigure()) return [];
  const profil = await profilZernio(sb, user);
  const [conversations, commentaires] = await Promise.all([
    listerConversations(profil).catch(() => []),
    listerCommentaires(profil).catch(() => []),
  ]);
  return [
    ...commentaires.map((c) => ({
      genre: "commentaire" as const,
      fournisseur: "zernio",
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
        fournisseur: "zernio",
        id: c.id,
        plateforme: plateformeParZernio(c.platform)?.id ?? c.platform,
        accountId: c.accountId,
        auteur: c.participantName || "Contact",
        texte: c.lastMessage ?? "",
        date: c.updatedTime,
        lien: c.url,
      })),
  ];
}

export const chargerBoite = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ elements: ElementBoite[]; avertissements: string[] }>> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const avertissements: string[] = [];
      const [directs, zernio] = await Promise.all([
        commentairesDirects(sb, user.id, avertissements),
        elementsZernio(sb, user).catch(() => {
          avertissements.push("Zernio : messages indisponibles pour le moment.");
          return [];
        }),
      ]);
      const elements = [...directs, ...zernio].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      return { ok: true, elements, avertissements };
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
      const { data: comptes } = await sb
        .from("comptes_connectes")
        .select("id, plateforme, fournisseur")
        .eq("compte_externe_id", data.accountId);
      const compte = comptes?.find((c) => c.fournisseur !== "zernio") ?? comptes?.[0];
      if (!compte) return { ok: false, erreur: "Ce compte n'est pas connecté à votre agent." };

      if (compte.fournisseur === "meta" || compte.fournisseur === "instagram") {
        // Réponse directe via l'API Meta, avec le jeton rangé côté serveur.
        const { data: j } = await clientMoteur().rpc("compte_jeton", {
          p_secret: process.env.AGENT_TICK_SECRET ?? "",
          p_user: user.id,
          p_externe: data.accountId,
        });
        if (!j) return { ok: false, erreur: "Connexion introuvable : reconnectez le compte (page Comptes)." };
        if (compte.plateforme === "facebook") await repondreFacebook(data.id, j as string, data.reponse);
        else await repondreInstagram(data.id, j as string, data.reponse, compte.fournisseur === "instagram" ? GRAPH_IG : undefined);
      } else if (data.genre === "commentaire") {
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
        plan.map((t, i) => ({
          user_id: user.id,
          type: t.type,
          // Réseau oublié par l'IA : on répartit sur les réseaux connectés.
          plateforme: t.plateforme ?? (connectes.length ? connectes[i % connectes.length] : null),
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

// Fusionne l'état de la vidéo dans le résultat de la tâche (relu à chaque fois :
// l'utilisateur a pu modifier le texte entre-temps).
async function etatVideo(sb: Sb, tacheId: string, champs: Record<string, unknown>) {
  const { data } = await sb.from("taches").select("resultat").eq("id", tacheId).single();
  await sb
    .from("taches")
    .update({ resultat: { ...((data?.resultat as object | null) ?? {}), ...champs } })
    .eq("id", tacheId);
}

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
      const { data: pm } = await sb.from("profil_marque").select("site").maybeSingle();
      const video_url = await fabriquerVideo(
        { ...t, brouillon: (t.resultat as { brouillon?: string } | null)?.brouillon },
        contexte,
        (pm?.site as string | undefined) ?? null,
        {
          journal,
          etat: (champs) => etatVideo(sb, t.id, champs),
          deposer: async (mp4) => {
            const chemin = `${user.id}/${t.id}-${Date.now()}.mp4`;
            const { error } = await sb.storage.from("videos").upload(chemin, mp4, { contentType: "video/mp4" });
            if (error) throw new Error(`Enregistrement de la vidéo impossible : ${error.message}`);
            return sb.storage.from("videos").getPublicUrl(chemin).data.publicUrl;
          },
        },
      );
      return { ok: true, video_url };
    } catch (e) {
      try {
        const { sb, user } = await utilisateurDepuisJeton(data.jeton);
        await etatVideo(sb, data.tacheId, { video_etat: "echec", video_erreur: message(e) });
        await sb.from("evenements_taches").insert({
          tache_id: data.tacheId,
          user_id: user.id,
          niveau: "erreur",
          message: `La vidéo n'a pas pu être créée : ${message(e)}`,
        });
      } catch {
        /* journal indisponible */
      }
      return { ok: false, erreur: message(e) };
    }
  });

// --- LinkedIn : profil personnel ou page entreprise ----------------------------

export const pagesLinkedin = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ pages: { urn: string; nom: string }[]; cible: string | null }>> => {
    try {
      const { sb } = await utilisateurDepuisJeton(data.jeton);
      const { data: compte } = await sb
        .from("comptes_connectes")
        .select("compte_externe_id, cible_urn")
        .eq("plateforme", "linkedin")
        .eq("statut", "connecte")
        .maybeSingle();
      if (!compte?.compte_externe_id) return { ok: false, erreur: "LinkedIn n'est pas connecté." };
      const orgs = await organisationsLinkedin(compte.compte_externe_id as string);
      return {
        ok: true,
        pages: orgs.map((o) => ({ urn: `urn:li:organization:${o.id}`, nom: o.localizedName || o.name || o.vanityName || o.id })),
        cible: (compte.cible_urn as string | null) ?? null,
      };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

export const choisirPageLinkedin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ urn: z.string().regex(/^urn:li:organization:\d+$/).nullable(), nom: z.string().max(200).nullable(), jeton }).parse(input),
  )
  .handler(async ({ data }): Promise<Resultat> => {
    try {
      const { sb } = await utilisateurDepuisJeton(data.jeton);
      if (data.urn) {
        // La page doit faire partie de celles que ce compte administre.
        const { data: compte } = await sb.from("comptes_connectes").select("compte_externe_id").eq("plateforme", "linkedin").maybeSingle();
        const orgs = compte?.compte_externe_id ? await organisationsLinkedin(compte.compte_externe_id as string) : [];
        if (!orgs.some((o) => `urn:li:organization:${o.id}` === data.urn)) return { ok: false, erreur: "Page non autorisée pour ce compte." };
      }
      const { error } = await sb.from("comptes_connectes").update({ cible_urn: data.urn, cible_nom: data.nom }).eq("plateforme", "linkedin");
      return error ? { ok: false, erreur: error.message } : { ok: true };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// --- Suppression du compte -----------------------------------------------------

// Efface tout : comptes chez Zernio (libère les places), vidéos stockées, puis
// l'utilisateur lui-même (le reste suit par cascade dans la base).
export const supprimerCompte = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton, confirmation: z.literal("SUPPRIMER") }).parse(input))
  .handler(async ({ data }): Promise<Resultat> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);

      if (zernioConfigure()) {
        const { data: r } = await sb.from("reglages_agent").select("zernio_profile_id").maybeSingle();
        if (r?.zernio_profile_id) {
          const comptes = await listerComptes(r.zernio_profile_id as string).catch(() => []);
          for (const c of comptes) await deconnecterCompte(c._id).catch(() => undefined);
        }
      }

      const { data: fichiers } = await sb.storage.from("videos").list(user.id, { limit: 1000 });
      if (fichiers?.length) await sb.storage.from("videos").remove(fichiers.map((f) => `${user.id}/${f.name}`));

      const { error } = await sb.rpc("supprimer_mon_compte");
      if (error) return { ok: false, erreur: error.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// --- Connexions directes sans validation : Bluesky et Telegram ------------------

// Vérifie les identifiants auprès du réseau, puis les range côté serveur
// (schéma privé) : ils ne reviennent jamais vers le navigateur.
export const connecterDirect = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .discriminatedUnion("plateforme", [
        z.object({ plateforme: z.literal("bluesky"), identifiant: z.string().min(3).max(200), motDePasse: z.string().min(8).max(100), jeton }),
        z.object({ plateforme: z.literal("telegram"), token: z.string().min(20).max(200), chat: z.string().min(2).max(200), jeton }),
      ])
      .parse(input),
  )
  .handler(async ({ data }): Promise<Resultat<{ nom: string }>> => {
    try {
      const { user } = await utilisateurDepuisJeton(data.jeton);
      let externe: string;
      let nom: string;
      let secret: string;
      if (data.plateforme === "bluesky") {
        const s = await sessionBluesky(data);
        externe = s.did;
        nom = s.handle;
        secret = JSON.stringify({ identifiant: data.identifiant.trim(), motDePasse: data.motDePasse.trim() });
      } else {
        const c = await verifierTelegram(data);
        externe = c.chatId;
        nom = c.nom;
        secret = JSON.stringify({ token: data.token.trim(), chat: c.chatId });
      }
      const { error } = await clientMoteur().rpc("compte_direct_enregistrer", {
        p_secret: process.env.AGENT_TICK_SECRET ?? "",
        p_user: user.id,
        p_fournisseur: data.plateforme,
        p_plateforme: data.plateforme,
        p_externe: externe,
        p_nom: nom,
        p_jeton: secret,
      });
      if (error) return { ok: false, erreur: error.message };
      return { ok: true, nom };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });
