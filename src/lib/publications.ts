import { supabase } from "./supabase";
import { estManuel } from "./plateformes";
import type { StatutTache, Tache } from "./types";

type Resultat = NonNullable<Tache["resultat"]> & { visuel_id?: string };

// Supprime des publications et tout ce qui leur est lié : leurs images
// (effacées par la base avec la publication), leur journal, et leurs vidéos
// stockées — sauf une vidéo encore utilisée par une copie sur un autre réseau.
export async function supprimerPublications(taches: Pick<Tache, "id" | "resultat">[]) {
  const sb = supabase();
  const ids = taches.map((t) => t.id);
  const urls = [...new Set(taches.map((t) => t.resultat?.video_url).filter((u): u is string => Boolean(u)))];

  const { error } = await sb.from("taches").delete().in("id", ids);
  if (error) return error.message;

  if (urls.length) {
    const { data: restantes } = await sb.from("taches").select("resultat").in("resultat->>video_url", urls);
    const encoreUtilisees = new Set((restantes ?? []).map((r) => (r.resultat as Resultat | null)?.video_url));
    const fichiers = urls
      .filter((u) => !encoreUtilisees.has(u))
      .map((u) => u.split("/object/public/videos/")[1])
      .filter((c): c is string => Boolean(c))
      .map((c) => decodeURIComponent(c));
    if (fichiers.length) await sb.storage.from("videos").remove(fichiers);
  }
  return null;
}

// « À partager » n'existe que pour les réseaux sans API (profil Facebook perso) :
// sur un autre réseau, la publication redevient planifiée et l'agent la publie.
export function statutPourReseau(statut: StatutTache, plateforme: string | null): StatutTache {
  return statut === "a_partager" && !estManuel(plateforme) ? "en_attente" : statut;
}

export type NouvellePublication = {
  titre: string;
  consigne: string;
  statut: StatutTache;
  planifiee_pour: string | null;
  resultat: Resultat | null;
  // Langue et pays (« it-IT »…) ; absent ou null = France.
  marche?: string | null;
};

// Crée une copie de la publication pour chaque réseau demandé. Chaque copie a
// son propre statut (publiée, en échec…) et peut être adaptée à son réseau.
// L'image est dupliquée : supprimer une copie n'enlève pas celle des autres.
export async function creerCopies(userId: string, base: NouvellePublication, reseaux: string[]) {
  const sb = supabase();
  const visuelId = base.resultat?.visuel_id;
  let visuel: { mime: string; donnees: string; prompt: string | null } | null = null;
  if (visuelId) {
    const { data } = await sb.from("visuels").select("mime, donnees, prompt").eq("id", visuelId).maybeSingle();
    visuel = data;
  }

  for (const plateforme of reseaux) {
    const { data: tache, error } = await sb
      .from("taches")
      .insert({ user_id: userId, type: "publication", plateforme, ...base, statut: statutPourReseau(base.statut, plateforme) })
      .select("id")
      .single();
    if (error || !tache) return error?.message ?? "Création impossible.";
    if (visuel && visuelId && base.resultat?.visuel_url) {
      const { data: copie } = await sb
        .from("visuels")
        .insert({ user_id: userId, tache_id: tache.id, ...visuel })
        .select("id")
        .single();
      if (copie) {
        await sb
          .from("taches")
          .update({ resultat: { ...base.resultat, visuel_id: copie.id, visuel_url: base.resultat.visuel_url.replace(visuelId, copie.id) } })
          .eq("id", tache.id);
      }
    }
  }
  return null;
}
