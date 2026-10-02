import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Clapperboard,
  Download,
  ImageIcon,
  LoaderCircle,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  Carte,
  Erreur,
  Pastille,
  Titre,
  bouton,
  boutonSecondaire,
  champ,
} from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { jetonSession } from "@/lib/session";
import { useUserId } from "@/lib/donnees";
import { DUREES, nombreMorceaux, type Duree } from "@/lib/studio-video";
import {
  avancerVideoIA,
  lancerVideoIA,
  reprendreVideoIA,
} from "@/lib/studio-video.functions";

export const Route = createFileRoute("/studio-video")({
  component: StudioVideo,
});

type VideoIA = {
  id: string;
  statut: "en_attente" | "en_cours" | "terminee" | "echouee";
  image_chemin: string;
  prompt: string;
  duree: number;
  progression: number;
  segments: unknown[];
  resultat_url: string | null;
  erreur: string | null;
  created_at: string;
};

const TAILLE_MAX = 10 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

// Le modèle comprend mieux l'anglais ; le français marche aussi.
const EXEMPLES = [
  "The person smiles, slowly turns the head to the camera and waves. Soft light, slow camera push-in.",
  "Cartoon style: the character starts dancing happily, confetti falling, bright colors.",
  "Cinematic shot: the camera orbits around the subject, wind moving hair and clothes, golden hour.",
];

function StudioVideo() {
  const userId = useUserId();
  const [image, setImage] = useState<{ fichier: File; apercu: string } | null>(
    null,
  );
  const [prompt, setPrompt] = useState("");
  const [duree, setDuree] = useState<Duree>(10);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoIA[]>([]);

  // Liste + mises à jour en direct.
  useEffect(() => {
    if (!userId) return;
    const sb = supabase();
    const charger = () =>
      sb
        .from("videos_ia")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30)
        .then(({ data }) => setVideos((data as VideoIA[]) ?? []));
    void charger();
    const canal = sb
      .channel("videos_ia")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "videos_ia",
          filter: `user_id=eq.${userId}`,
        },
        () => void charger(),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(canal);
    };
  }, [userId]);

  // Tant qu'une vidéo est en cours, on fait calculer le morceau suivant (un
  // appel à la fois ; chacun dure 1 à 4 minutes).
  const enCours = videos
    .filter((v) => v.statut === "en_cours")
    .map((v) => v.id)
    .join(",");
  useEffect(() => {
    if (!enCours) return;
    let arret = false;
    const boucle = async () => {
      while (!arret) {
        const jeton = await jetonSession();
        for (const id of enCours.split(","))
          await avancerVideoIA({ data: { id, jeton } }).catch(() => null);
        await new Promise((r) => setTimeout(r, 3000));
      }
    };
    void boucle();
    return () => {
      arret = true;
    };
  }, [enCours]);

  function choisir(f: File) {
    setErreur(null);
    if (!TYPES.includes(f.type))
      return setErreur("Image JPG, PNG ou WebP uniquement.");
    if (f.size > TAILLE_MAX)
      return setErreur("Image trop lourde (10 Mo maximum).");
    setImage({ fichier: f, apercu: URL.createObjectURL(f) });
  }

  async function generer() {
    if (!userId || !image || prompt.trim().length < 3) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const ext =
        image.fichier.type === "image/png"
          ? "png"
          : image.fichier.type === "image/webp"
            ? "webp"
            : "jpg";
      const chemin = `${userId}/studio-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase()
        .storage.from("animations")
        .upload(chemin, image.fichier, {
          contentType: image.fichier.type,
          upsert: true,
        });
      if (error)
        throw new Error(
          /fetch|network/i.test(error.message)
            ? "La connexion a coupé pendant l'envoi de l'image. Réessayez."
            : error.message,
        );
      const r = await lancerVideoIA({
        data: {
          image: chemin,
          prompt: prompt.trim(),
          duree,
          jeton: await jetonSession(),
        },
      });
      if (!r.ok) throw new Error(r.erreur);
      setImage(null);
      setPrompt("");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setEnvoi(false);
  }

  async function reprendre(v: VideoIA) {
    const r = await reprendreVideoIA({
      data: { id: v.id, jeton: await jetonSession() },
    });
    if (!r.ok) setErreur(r.erreur);
  }

  async function supprimer(v: VideoIA) {
    if (!window.confirm("Supprimer cette vidéo ?")) return;
    const sb = supabase();
    await sb.storage.from("animations").remove([v.image_chemin]);
    await sb.storage
      .from("videos")
      .remove([
        `${userId}/studio-${v.id}.mp4`,
        ...Array.from(
          { length: nombreMorceaux(v.duree) },
          (_, n) => `${userId}/studio-${v.id}-${n}.mp4`,
        ),
      ]);
    await sb.from("videos_ia").delete().eq("id", v.id);
    setVideos((l) => l.filter((x) => x.id !== v.id));
  }

  const pret = image && prompt.trim().length >= 3 && !envoi;

  return (
    <>
      <Titre sous="Une image + votre consigne = une vidéo de 10 à 30 secondes. Photo, dessin, produit, personnage de dessin animé : tout peut s'animer.">
        Studio vidéo IA
      </Titre>

      <Carte className="mb-6 p-5">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">1. Votre image</p>
            {image ? (
              <div className="relative">
                <img
                  src={image.apercu}
                  alt="Image choisie"
                  className="max-h-72 w-full rounded-xl bg-fond object-contain"
                />
                <button
                  type="button"
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
                  onClick={() => setImage(null)}
                  aria-label="Retirer l'image"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <label className="flex h-56 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-bord text-sm text-doux hover:bg-bord/40">
                <ImageIcon className="size-8" aria-hidden />
                Choisir une photo ou un dessin
                <span className="text-xs">
                  JPG, PNG, WebP · 10 Mo max · la vidéo garde le format de
                  l'image
                </span>
                <input
                  type="file"
                  accept={TYPES.join(",")}
                  className="sr-only"
                  onChange={(e) =>
                    e.target.files?.[0] && choisir(e.target.files[0])
                  }
                />
              </label>
            )}
          </div>

          <div className="grid content-start gap-4">
            <label className="grid gap-1 text-sm font-medium">
              2. Ce qui doit se passer dans la vidéo
              <textarea
                className={`${champ} min-h-32 font-normal`}
                value={prompt}
                maxLength={2000}
                placeholder="Décrivez l'action, les mouvements, la caméra, l'ambiance, le style…"
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {EXEMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="rounded-full border border-bord px-2.5 py-1 text-xs text-doux hover:bg-bord"
                  onClick={() => setPrompt(ex)}
                >
                  {ex.slice(0, 38)}…
                </button>
              ))}
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium">3. Durée</p>
              <div className="flex flex-wrap gap-2">
                {DUREES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={duree === d}
                    onClick={() => setDuree(d)}
                    className={`rounded-full border px-4 py-1.5 text-sm ${duree === d ? "border-accent bg-accent/15 text-accent" : "border-bord text-doux hover:bg-bord"}`}
                  >
                    {d} s
                  </button>
                ))}
              </div>
            </div>

            <button
              className={`${bouton} inline-flex items-center justify-center gap-2`}
              disabled={!pret}
              onClick={generer}
            >
              {envoi ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <Clapperboard className="size-4" aria-hidden />
              )}
              Générer la vidéo ({duree} s, gratuit)
            </button>
            <p className="text-xs text-doux">
              La vidéo est fabriquée par morceaux de 5 s (environ 1 à 3 min
              chacun) : gardez la page ouverte. Gratuit avec le quota quotidien
              de Hugging Face : les vidéos courtes passent mieux. Utilisez des
              images dont vous avez les droits.
            </p>
            <Erreur message={erreur} />
          </div>
        </div>
      </Carte>

      <h2 className="mb-3 text-sm font-medium text-doux">Mes vidéos</h2>
      {videos.length === 0 && (
        <Carte className="text-sm text-doux">
          Aucune vidéo pour l'instant : lancez la première ci-dessus.
        </Carte>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => (
          <Carte key={v.id}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Pastille
                ton={
                  v.statut === "terminee"
                    ? "ok"
                    : v.statut === "echouee"
                      ? "erreur"
                      : "plan"
                }
              >
                {v.statut === "terminee"
                  ? "Prête"
                  : v.statut === "echouee"
                    ? "Échec"
                    : `Morceau ${Math.min((v.segments?.length ?? 0) + 1, nombreMorceaux(v.duree))}/${nombreMorceaux(v.duree)} · ${v.progression} %`}
              </Pastille>
              <span className="text-xs text-doux">{v.duree} s</span>
            </div>
            {v.resultat_url ? (
              <video
                src={v.resultat_url}
                controls
                playsInline
                className="mb-2 max-h-96 w-full rounded-xl bg-black"
              />
            ) : v.statut === "en_cours" ? (
              <div className="mb-2 flex h-40 items-center justify-center rounded-xl bg-fond">
                <LoaderCircle
                  className="size-6 animate-spin text-doux"
                  aria-hidden
                />
              </div>
            ) : null}
            <p className="line-clamp-3 text-sm">{v.prompt}</p>
            {v.erreur && <p className="mt-1 text-xs text-erreur">{v.erreur}</p>}
            <div className="mt-3 flex gap-2">
              {v.resultat_url && (
                <a
                  href={v.resultat_url}
                  download
                  className={`${boutonSecondaire} inline-flex items-center gap-1.5`}
                >
                  <Download className="size-4" aria-hidden />
                  Télécharger
                </a>
              )}
              {v.statut === "echouee" && (
                <button
                  className={`${boutonSecondaire} inline-flex items-center gap-1.5`}
                  onClick={() => reprendre(v)}
                >
                  <RotateCcw className="size-4" aria-hidden />
                  Reprendre
                </button>
              )}
              <button
                className={`${boutonSecondaire} inline-flex items-center`}
                onClick={() => supprimer(v)}
                aria-label="Supprimer"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </Carte>
        ))}
      </div>
      <p className="mt-4 text-xs text-doux">
        Vidéos générées avec Wan 2.2 (modèle libre), sur Hugging Face.
      </p>
    </>
  );
}
