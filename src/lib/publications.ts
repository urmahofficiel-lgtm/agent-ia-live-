import { supabase } from "./supabase";
import type { Tache } from "./types";

// Supprime des publications et tout ce qui leur est lié : leurs images
// (effacées par la base avec la publication), leur journal, et leurs vidéos
// stockées dans le dossier de l'utilisateur.
export async function supprimerPublications(taches: Pick<Tache, "id" | "resultat">[]) {
  const sb = supabase();
  const videos = taches
    .map((t) => t.resultat?.video_url?.split("/object/public/videos/")[1])
    .filter((c): c is string => Boolean(c))
    .map((c) => decodeURIComponent(c));
  if (videos.length) await sb.storage.from("videos").remove(videos);
  const { error } = await sb
    .from("taches")
    .delete()
    .in(
      "id",
      taches.map((t) => t.id),
    );
  return error?.message ?? null;
}
