import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Clapperboard,
  Download,
  ImageIcon,
  LoaderCircle,
  Trash2,
  Upload,
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
import {
  DUREES,
  FORMATS,
  QUALITES,
  coutEstime,
  type Duree,
  type Format,
  type Qualite,
} from "@/lib/studio-video";
import {
  lancerVideoIA,
  studioVideoActif,
  suivreVideoIA,
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
  format: string;
  qualite: Qualite;
  progression: number;
  cout_estime: number | null;
  resultat_url: string | null;
  erreur: string | null;
  created_at: string;
};

const TAILLE_MAX = 10 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

const EXEMPLES = [
  "La personne sourit, tourne lentement la tête vers la caméra et fait un signe de la main. Lumière douce, caméra qui avance doucement.",
  "Style dessin animé : le personnage se met à danser joyeusement, des confettis tombent, couleurs vives.",
  "Plan cinématographique : la caméra tourne autour du sujet, le vent fait bouger les cheveux et les vêtements, ambiance golden hour.",
];

function StudioVideo() {
  const userId = useUserId();
  const [image, setImage] = useState<{ fichier: File; apercu: string } | null>(
    null,
  );
  const [prompt, setPrompt] = useState("");
  const [duree, setDuree] = useState<Duree>(10);
  const [format, setFormat] = useState<Format>("9:16");
  const [qualite, setQualite] = useState<Qualite>("standard");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoIA[]>([]);
  const [actif, setActif] = useState<boolean | null>(null);

  useEffect(() => {
    void studioVideoActif()
      .then((r) => setActif(r.actif))
      .catch(() => setActif(null));
  }, []);

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

  // Tant qu'une vidéo est en cours, le serveur fait avancer la génération
  // (un appel à la fois, toutes les 5 s).
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
          await suivreVideoIA({ data: { id, jeton } }).catch(() => null);
        await new Promise((r) => setTimeout(r, 5000));
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
          format,
          qualite,
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

  async function supprimer(v: VideoIA) {
    if (!window.confirm("Supprimer cette vidéo ?")) return;
    const sb = supabase();
    await sb.storage.from("animations").remove([v.image_chemin]);
    if (v.resultat_url)
      await sb.storage.from("videos").remove([`${userId}/studio-${v.id}.mp4`]);
    await sb.from("videos_ia").delete().eq("id", v.id);
    setVideos((l) => l.filter((x) => x.id !== v.id));
  }

  const pret = image && prompt.trim().length >= 3 && !envoi && actif !== false;

  return (
    <>
      <Titre sous="Une image + votre consigne = une vidéo de 10 à 30 secondes. Photo, dessin, produit, personnage de dessin animé : tout peut s'animer.">
        Studio vidéo IA
      </Titre>

      {actif === false && (
        <Carte className="mb-4 text-sm">
          Le studio n'est pas encore activé : il faut ajouter la clé{" "}
          <strong>XAI_API_KEY</strong> (Grok Imagine, console.x.ai) dans les
          variables Vercel.
        </Carte>
      )}

      <Carte className="mb-6 p-5">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">1. Votre image</p>
            {image ? (
              <div className="relative">
                <img
                  src={image.apercu}
                  alt="Image choisie"
                  className="max-h-72 w-full rounded-xl object-contain bg-fond"
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
                <span className="text-xs">JPG, PNG, WebP · 10 Mo max</span>
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
                maxLength={4000}
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

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Format
                <select
                  className={champ}
                  value={format}
                  onChange={(e) => setFormat(e.target.value as Format)}
                >
                  {FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Qualité
                <select
                  className={champ}
                  value={qualite}
                  onChange={(e) => setQualite(e.target.value as Qualite)}
                >
                  {(Object.keys(QUALITES) as Qualite[]).map((q) => (
                    <option key={q} value={q}>
                      {QUALITES[q].nom}
                    </option>
                  ))}
                </select>
              </label>
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
              Générer la vidéo ({duree} s · env.{" "}
              {coutEstime(duree, qualite).toFixed(2).replace(".", ",")} $)
            </button>
            <p className="text-xs text-doux">
              Comptez 1 à 5 minutes. Au-delà de 15 s, la vidéo est prolongée
              automatiquement en plusieurs morceaux. Utilisez uniquement des
              images dont vous avez les droits ; les visages de vraies personnes
              nécessitent leur accord.
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
                    : `En cours · ${v.progression} %`}
              </Pastille>
              <span className="text-xs text-doux">
                {v.duree} s · {v.format}
              </span>
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
      <p className="mt-4 flex items-center gap-1.5 text-xs text-doux">
        <Upload className="size-3.5" aria-hidden /> Vidéos générées avec Grok
        Imagine (xAI).
      </p>
    </>
  );
}
