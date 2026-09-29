import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LIMITES, MODELES_ANIMATION, lireStatutFal, validerPhoto, validerVideo, type ModeAnimation } from "./animation";
import { falConfigure, jetonWebhook, resultatRequete, soumettre, statutRequete } from "./fal.server";
import { ESPACES_HF, animerAvecHF, compteHF, hfConfigure } from "./hf.server";
import { URL_SITE } from "./preparation.server";
import { utilisateurDepuisJeton } from "./supabase-serveur";

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };
type Sb = Awaited<ReturnType<typeof utilisateurDepuisJeton>>["sb"];

const texte = (e: unknown) => (e instanceof Error ? e.message : "Erreur inattendue.");
const DELAI_MAX_MS = 20 * 60_000; // au-delà, la génération est considérée comme perdue
// Hugging Face tourne dans la fonction serveur (5 min maximum sur Vercel).
const DELAI_HF_MS = 270_000;
const PERDUE_HF_MS = 6 * 60_000;

// Métadonnées d'un fichier du dossier de l'utilisateur (taille, type réels).
async function infosFichier(sb: Sb, chemin: string) {
  const dossier = chemin.slice(0, chemin.lastIndexOf("/"));
  const nom = chemin.slice(chemin.lastIndexOf("/") + 1);
  const { data } = await sb.storage.from("animations").list(dossier, { search: nom, limit: 5 });
  const f = data?.find((x) => x.name === nom);
  const meta = (f?.metadata ?? {}) as { size?: number; mimetype?: string };
  return f ? { taille: meta.size ?? 0, type: meta.mimetype ?? "" } : null;
}

export const lancerAnimation = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        mode: z.enum(["visage", "corps"]),
        photo: z.string().min(3).max(300),
        video: z.string().min(3).max(300),
        duree: z.number().positive().max(600),
        consentement: z.literal(true),
        jeton: z.string().min(10),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Resultat<{ id: string }>> => {
    // Hugging Face (gratuit) en priorité, fal.ai (payant) sinon.
    const gratuit = hfConfigure();
    if (!gratuit && !falConfigure()) return { ok: false, erreur: "Service d'animation non activé : ajoutez la clé HF_TOKEN dans Vercel." };
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      // Les fichiers doivent être dans le dossier de l'utilisateur…
      if (![data.photo, data.video].every((c) => c.startsWith(`${user.id}/`) && !c.includes(".."))) {
        return { ok: false, erreur: "Fichier non autorisé." };
      }
      // …et respecter les limites, vérifiées ici sur les fichiers réellement stockés.
      const [photo, video] = await Promise.all([infosFichier(sb, data.photo), infosFichier(sb, data.video)]);
      if (!photo || !video) return { ok: false, erreur: "Fichier introuvable : importez-le à nouveau." };
      const invalide = validerPhoto(photo) ?? validerVideo({ ...video, duree: data.duree });
      if (invalide) return { ok: false, erreur: invalide };

      // Coût maîtrisé : générations simultanées et quotidiennes limitées.
      const depuis = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data: recentes } = await sb.from("animations").select("statut, created_at").gte("created_at", depuis);
      const enCours = (recentes ?? []).filter((a) => ["en_attente", "en_file", "en_cours"].includes(a.statut as string)).length;
      if (enCours >= LIMITES.enCoursMax) return { ok: false, erreur: `${LIMITES.enCoursMax} animations sont déjà en cours : attendez qu'une se termine.` };
      if ((recentes ?? []).length >= LIMITES.parJour) return { ok: false, erreur: `Limite de ${LIMITES.parJour} animations par 24 h atteinte.` };

      const modele = gratuit ? `hf:${ESPACES_HF[data.mode as ModeAnimation].id}` : MODELES_ANIMATION[data.mode as ModeAnimation].id;
      const { data: ligne, error } = await sb
        .from("animations")
        .insert({ user_id: user.id, mode: data.mode, photo_chemin: data.photo, video_chemin: data.video, duree_source: data.duree, fal_modele: modele })
        .select("id")
        .single();
      if (error || !ligne) return { ok: false, erreur: error?.message ?? "Enregistrement impossible." };
      // Gratuit : la page déclenche ensuite executerAnimation.
      if (gratuit) return { ok: true, id: ligne.id };

      try {
        // fal.ai lit les fichiers privés par des liens signés valables 2 h.
        const [lienPhoto, lienVideo] = await Promise.all([
          sb.storage.from("animations").createSignedUrl(data.photo, 7200),
          sb.storage.from("animations").createSignedUrl(data.video, 7200),
        ]);
        if (!lienPhoto.data || !lienVideo.data) throw new Error("Liens des fichiers indisponibles.");
        const webhook = `${URL_SITE}/api/animations/webhook?id=${ligne.id}&m=${data.mode}&jeton=${jetonWebhook(ligne.id)}`;
        const { request_id } = await soumettre(modele, { image_url: lienPhoto.data.signedUrl, video_url: lienVideo.data.signedUrl }, webhook);
        await sb.from("animations").update({ fal_requete: request_id, statut: "en_file" }).eq("id", ligne.id);
        return { ok: true, id: ligne.id };
      } catch (e) {
        await sb.from("animations").update({ statut: "echouee", erreur: texte(e) }).eq("id", ligne.id);
        return { ok: false, erreur: texte(e) };
      }
    } catch (e) {
      return { ok: false, erreur: texte(e) };
    }
  });

type Animation = {
  id: string;
  user_id: string;
  statut: string;
  fal_modele: string | null;
  fal_requete: string | null;
  resultat_source: string | null;
  resultat_url: string | null;
  created_at: string;
};

// Récupère la vidéo finale chez fal.ai et la copie dans notre stockage (le
// lien fal.ai est temporaire).
async function finaliser(sb: Sb, a: Animation) {
  let source = a.resultat_source;
  if (!source && a.fal_modele && a.fal_requete) source = (await resultatRequete(a.fal_modele, a.fal_requete)).video?.url ?? null;
  if (!source) throw new Error("Vidéo absente de la réponse du modèle.");
  const r = await fetch(source, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error("Téléchargement de la vidéo générée impossible.");
  await enregistrer(sb, a, new Uint8Array(await r.arrayBuffer()), source);
}

async function enregistrer(sb: Sb, a: Pick<Animation, "id" | "user_id">, donnees: Uint8Array, source: string) {
  const chemin = `${a.user_id}/animation-${a.id}.mp4`;
  const { error } = await sb.storage
    .from("videos")
    .upload(chemin, donnees, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`Enregistrement de la vidéo impossible : ${error.message}`);
  const resultat_url = sb.storage.from("videos").getPublicUrl(chemin).data.publicUrl;
  await sb.from("animations").update({ statut: "terminee", resultat_source: source, resultat_url, erreur: null }).eq("id", a.id);
}

// Suivi (secours du webhook) : appelé par la page tant qu'une animation n'est
// pas finie. Met à jour la position dans la file, puis récupère le résultat.
export const suivreAnimation = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid(), jeton: z.string().min(10) }).parse(input))
  .handler(async ({ data }): Promise<Resultat> => {
    try {
      const { sb } = await utilisateurDepuisJeton(data.jeton);
      const { data: a } = await sb.from("animations").select("*").eq("id", data.id).single<Animation>();
      if (!a) return { ok: false, erreur: "Animation introuvable." };
      if (a.statut === "echouee" || (a.statut === "terminee" && a.resultat_url)) return { ok: true };
      try {
        if (a.statut === "terminee") {
          await finaliser(sb, a);
          return { ok: true };
        }
        if (!a.fal_modele || !a.fal_requete) {
          // Hugging Face : si la fonction serveur s'est arrêtée sans conclure.
          if (a.fal_modele?.startsWith("hf:") && Date.now() - new Date(a.created_at).getTime() > PERDUE_HF_MS) {
            throw new Error("La génération a été interrompue. Réessayez, si possible avec une vidéo plus courte.");
          }
          return { ok: true };
        }
        const etat = lireStatutFal(await statutRequete(a.fal_modele, a.fal_requete));
        if (etat.statut === "terminee") await finaliser(sb, a);
        else if (etat.statut === "echouee") {
          await resultatRequete(a.fal_modele, a.fal_requete); // lève l'erreur détaillée du modèle
          throw new Error("La génération a échoué.");
        } else if (Date.now() - new Date(a.created_at).getTime() > DELAI_MAX_MS) {
          throw new Error("La génération a pris trop de temps. Réessayez avec une vidéo plus courte.");
        } else {
          await sb.from("animations").update({ statut: etat.statut, position_file: etat.position ?? null }).eq("id", a.id);
        }
      } catch (e) {
        await sb.from("animations").update({ statut: "echouee", erreur: texte(e) }).eq("id", a.id);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, erreur: texte(e) };
    }
  });

// Gratuit (Hugging Face) : exécute l'animation dans cette fonction serveur et
// met la ligne à jour à chaque étape (la page suit en direct).
export const executerAnimation = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid(), jeton: z.string().min(10) }).parse(input))
  .handler(async ({ data }): Promise<Resultat> => {
    try {
      const { sb } = await utilisateurDepuisJeton(data.jeton);
      // Prise en charge atomique : une seule exécution par animation.
      const { data: a } = await sb
        .from("animations")
        .update({ statut: "en_file" })
        .eq("id", data.id)
        .eq("statut", "en_attente")
        .like("fal_modele", "hf:%")
        .select("*")
        .maybeSingle<Animation & { mode: ModeAnimation; photo_chemin: string; video_chemin: string; duree_source: number | null }>();
      if (!a) return { ok: true };
      try {
        const [photo, video] = await Promise.all([
          sb.storage.from("animations").download(a.photo_chemin),
          sb.storage.from("animations").download(a.video_chemin),
        ]);
        if (!photo.data || !video.data) throw new Error("Fichiers introuvables : importez-les à nouveau.");
        const { donnees, source } = await animerAvecHF(
          a.mode,
          { donnees: photo.data, nom: a.photo_chemin.split("/").pop() ?? "photo.jpg" },
          { donnees: video.data, duree: a.duree_source ?? 2 },
          async (etat) => {
            await sb.from("animations").update({ statut: etat.statut, position_file: etat.position ?? null }).eq("id", a.id);
          },
          DELAI_HF_MS,
        );
        await enregistrer(sb, a, donnees, source);
      } catch (e) {
        let message =
          e instanceof Error && e.name === "TimeoutError" ? "La génération a pris trop de temps. Réessayez avec une vidéo plus courte." : texte(e);
        if (message.startsWith("Hugging Face a refusé")) {
          const compte = await compteHF();
          message = compte.valide
            ? `Hugging Face a refusé le calcul pour le compte « ${compte.nom ?? "?"} » : quota gratuit du jour épuisé ou modèle en panne. Réessayez plus tard.`
            : "La clé HF_TOKEN est refusée par Hugging Face : recréez-la (type Read) et remplacez-la dans Vercel, puis Redeploy.";
        }
        await sb.from("animations").update({ statut: "echouee", erreur: message }).eq("id", a.id);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, erreur: texte(e) };
    }
  });
