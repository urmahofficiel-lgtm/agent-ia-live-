import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PLATEFORMES, plateformeParZernio } from "./plateformes";
import { demanderIA, rediger } from "./ia.server";
import { consignePlanification, datePrevue, lirePlan } from "./commande";
import { CATEGORIES, lireReponseOverpass, requeteOverpass } from "./osm";
import { utilisateurDepuisJeton } from "./supabase-serveur";
import { creerProfil, listerComptes, publier, urlAutorisation, zernioConfigure } from "./zernio.server";

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

const message = (e: unknown) => (e instanceof Error ? e.message : "Erreur inattendue.");
const jeton = z.string().min(10);
const URL_SITE = "https://agent-ia-live.vercel.app";

// --- Rédaction -------------------------------------------------------------

export const genererBrouillon = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ tacheId: z.string().uuid(), jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ brouillon: string }>> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const { data: t, error } = await sb
        .from("taches")
        .select("id, type, plateforme, titre, consigne, resultat")
        .eq("id", data.tacheId)
        .single();
      if (error || !t) return { ok: false, erreur: "Tâche introuvable." };

      const journal = (niveau: string, msg: string) =>
        sb.from("evenements_taches").insert({ tache_id: t.id, user_id: user.id, niveau, message: msg });

      await journal("action", `Rédaction en cours : « ${t.titre} »`);
      try {
        const brouillon = await rediger(t);
        await sb
          .from("taches")
          .update({ resultat: { ...(t.resultat ?? {}), brouillon, genere_le: new Date().toISOString() } })
          .eq("id", t.id);
        await journal("info", `Brouillon prêt pour « ${t.titre} » — à valider.`);
        return { ok: true, brouillon };
      } catch (e) {
        await journal("erreur", message(e));
        throw e;
      }
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
      await journal("action", `Publication en cours : « ${t.titre} »`);
      try {
        const post = await publier(zernio, compte.compte_externe_id, brouillon);
        await sb
          .from("taches")
          .update({ statut: "terminee", resultat: { ...(t.resultat as object), post_id: post._id, publie_le: new Date().toISOString() } })
          .eq("id", t.id);
        await journal("info", `Publié : « ${t.titre} »`);
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
      const reponse = await demanderIA(consignePlanification(data.demande, maintenant), {
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
