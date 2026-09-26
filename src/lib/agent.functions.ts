import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PLATEFORMES, plateformeParZernio } from "./plateformes";
import { rediger } from "./redaction.server";
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
