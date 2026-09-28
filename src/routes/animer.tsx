import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Download, Film, ImageIcon, LoaderCircle, RotateCcw, Trash2, Upload, Wand2, X } from "lucide-react";
import { Carte, Erreur, Pastille, Titre, bouton, boutonSecondaire } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { jetonSession } from "@/lib/session";
import { useUserId } from "@/lib/donnees";
import { LIMITES, MODELES_ANIMATION, validerPhoto, validerVideo, type ModeAnimation } from "@/lib/animation";
import { executerAnimation, lancerAnimation, suivreAnimation } from "@/lib/animation.functions";

export const Route = createFileRoute("/animer")({ component: Animer });

type Animation = {
  id: string;
  mode: ModeAnimation;
  statut: "en_attente" | "en_file" | "en_cours" | "terminee" | "echouee";
  photo_chemin: string;
  video_chemin: string;
  duree_source: number | null;
  position_file: number | null;
  resultat_url: string | null;
  erreur: string | null;
  created_at: string;
};

type Fichier = { fichier: File; apercu: string; duree?: number };

const EN_COURS = ["en_attente", "en_file", "en_cours"];

// Dimensions d'une image et durée d'une vidéo, lues dans le navigateur avant l'envoi.
function lireImage(f: File) {
  return new Promise<{ largeur: number; hauteur: number }>((ok, ko) => {
    const img = new Image();
    img.onload = () => ok({ largeur: img.naturalWidth, hauteur: img.naturalHeight });
    img.onerror = () => ko(new Error("Image illisible."));
    img.src = URL.createObjectURL(f);
  });
}
function lireDuree(f: File) {
  return new Promise<number>((ok) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => ok(v.duration);
    v.onerror = () => ok(Number.NaN);
    v.src = URL.createObjectURL(f);
  });
}

function Animer() {
  const userId = useUserId();
  const [photo, setPhoto] = useState<Fichier | null>(null);
  const [video, setVideo] = useState<Fichier | null>(null);
  const [mode, setMode] = useState<ModeAnimation>("corps");
  const [accord, setAccord] = useState(false);
  const [etape, setEtape] = useState<"libre" | "envoi" | "lancement">("libre");
  const [erreur, setErreur] = useState<string | null>(null);
  const [animations, setAnimations] = useState<Animation[]>([]);

  // Liste + mises à jour en direct (Realtime), le webhook fal.ai mettant la base à jour.
  useEffect(() => {
    if (!userId) return;
    const sb = supabase();
    const charger = () =>
      sb
        .from("animations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20)
        .then(({ data }) => setAnimations((data as Animation[]) ?? []));
    void charger();
    const canal = sb
      .channel("animations")
      .on("postgres_changes", { event: "*", schema: "public", table: "animations", filter: `user_id=eq.${userId}` }, () => void charger())
      .subscribe();
    return () => {
      void sb.removeChannel(canal);
    };
  }, [userId]);

  // Secours du webhook : tant qu'une animation tourne (ou n'a pas encore sa
  // copie durable), on demande au serveur de vérifier chez fal.ai.
  const aSuivre = animations.filter((a) => EN_COURS.includes(a.statut) || (a.statut === "terminee" && !a.resultat_url)).map((a) => a.id);
  const cle = aSuivre.join(",");
  useEffect(() => {
    if (!cle) return;
    const suivre = async () => {
      const jeton = await jetonSession();
      await Promise.all(cle.split(",").map((id) => suivreAnimation({ data: { id, jeton } }).catch(() => null)));
    };
    void suivre();
    const t = setInterval(() => void suivre(), 6000);
    return () => clearInterval(t);
  }, [cle]);

  async function choisirPhoto(f: File) {
    setErreur(null);
    const dims = await lireImage(f).catch(() => undefined);
    const e = validerPhoto({ type: f.type, taille: f.size, ...dims });
    if (e) return setErreur(e);
    setPhoto({ fichier: f, apercu: URL.createObjectURL(f) });
  }

  async function choisirVideo(f: File) {
    setErreur(null);
    const duree = await lireDuree(f);
    const e = validerVideo({ type: f.type, taille: f.size, duree });
    if (e) return setErreur(e);
    setVideo({ fichier: f, apercu: URL.createObjectURL(f), duree });
  }

  async function lancer(chemins?: { photo: string; video: string; duree: number; mode: ModeAnimation }) {
    if (!userId) return;
    setErreur(null);
    try {
      let c = chemins;
      if (!c) {
        if (!photo || !video?.duree) return;
        setEtape("envoi");
        const sb = supabase();
        const base = `${userId}/${crypto.randomUUID()}`;
        const chemin = { photo: `${base}-photo.${photo.fichier.type === "image/png" ? "png" : "jpg"}`, video: `${base}-video.mp4` };
        const [p, v] = await Promise.all([
          sb.storage.from("animations").upload(chemin.photo, photo.fichier, { contentType: photo.fichier.type }),
          sb.storage.from("animations").upload(chemin.video, video.fichier, { contentType: "video/mp4" }),
        ]);
        if (p.error || v.error) throw new Error(`Envoi des fichiers impossible : ${(p.error ?? v.error)!.message}`);
        c = { ...chemin, duree: video.duree, mode };
      }
      setEtape("lancement");
      const jeton = await jetonSession();
      const r = await lancerAnimation({ data: { ...c, consentement: true, jeton } });
      if (!r.ok) throw new Error(r.erreur);
      // Version gratuite : la génération tourne pendant cet appel (1 à 4 min),
      // la liste suit son avancement en direct.
      void executerAnimation({ data: { id: r.id, jeton } }).catch(() => null);
      if (!chemins) {
        setPhoto(null);
        setVideo(null);
        setAccord(false);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setEtape("libre");
  }

  async function supprimer(a: Animation) {
    if (!window.confirm("Supprimer cette animation et ses fichiers ?")) return;
    const sb = supabase();
    await sb.storage.from("animations").remove([a.photo_chemin, a.video_chemin]);
    if (a.resultat_url) await sb.storage.from("videos").remove([`${userId}/animation-${a.id}.mp4`]);
    await sb.from("animations").delete().eq("id", a.id);
    setAnimations((l) => l.filter((x) => x.id !== a.id));
  }

  const pret = photo && video && accord && etape === "libre";

  return (
    <>
      <Titre sous="Importez une photo et une vidéo : la personne de la photo reproduit les mouvements de la vidéo.">Animer une photo</Titre>

      <Carte className="p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <ZoneImport
            titre="1. Photo à animer"
            aide={`JPEG ou PNG · ${LIMITES.photo.tailleMax / 1024 / 1024} Mo max · personne bien visible, de face`}
            accepte="image/jpeg,image/png"
            icone={<ImageIcon size={22} aria-hidden />}
            onFichier={choisirPhoto}
            onRetirer={() => setPhoto(null)}
            apercu={photo && <img src={photo.apercu} alt="Photo choisie" className="max-h-64 rounded-lg object-contain" />}
          />
          <ZoneImport
            titre="2. Vidéo des mouvements"
            aide={`MP4 · ${LIMITES.video.tailleMax / 1024 / 1024} Mo max · ${LIMITES.video.dureeMax} s max`}
            accepte="video/mp4"
            icone={<Film size={22} aria-hidden />}
            onFichier={choisirVideo}
            onRetirer={() => setVideo(null)}
            apercu={
              video && (
                <div className="flex flex-col items-center gap-1">
                  <video src={video.apercu} muted loop autoPlay playsInline className="max-h-64 rounded-lg" />
                  <span className="text-xs text-doux">{video.duree?.toFixed(1)} s</span>
                </div>
              )
            }
          />
        </div>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium">3. Ce qui bouge</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(MODELES_ANIMATION) as ModeAnimation[]).map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${mode === m ? "border-accent bg-accent/10" : "border-bord hover:border-doux/50"}`}
              >
                <input type="radio" name="mode" className="mt-1 accent-accent" checked={mode === m} onChange={() => setMode(m)} />
                <span>
                  <span className="font-medium">{MODELES_ANIMATION[m].nom}</span>
                  <span className="block text-doux">{MODELES_ANIMATION[m].description}</span>
                  {m === "corps" && <span className="mt-1 block text-xs text-doux">Version gratuite : les 5 premières secondes de la vidéo.</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-5 flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 accent-accent" checked={accord} onChange={(e) => setAccord(e.target.checked)} />
          <span>
            J'ai le droit d'utiliser cette photo et cette vidéo, et <strong>la personne représentée a donné son accord</strong>. Je ne
            l'utiliserai pas pour tromper ou nuire.
          </span>
        </label>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className={`${bouton} flex min-h-11 items-center gap-2`} disabled={!pret} onClick={() => lancer()}>
            {etape !== "libre" ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Wand2 size={16} aria-hidden />}
            {etape === "envoi" ? "Envoi des fichiers…" : etape === "lancement" ? "Lancement…" : "Animer la photo"}
          </button>
          <span className="text-xs text-doux">
            Durée habituelle : 1 à 4 minutes. Gardez cette page ouverte jusqu'à la fin.
          </span>
        </div>
        <Erreur message={erreur} />
      </Carte>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Vos animations</h2>
      {animations.length === 0 ? (
        <Carte className="text-sm text-doux">Aucune animation pour l'instant.</Carte>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {animations.map((a) => (
            <li key={a.id}>
              <CarteAnimation
                a={a}
                onRelancer={() => lancer({ photo: a.photo_chemin, video: a.video_chemin, duree: a.duree_source ?? 1, mode: a.mode })}
                onSupprimer={() => supprimer(a)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ZoneImport({
  titre,
  aide,
  accepte,
  icone,
  onFichier,
  onRetirer,
  apercu,
}: {
  titre: string;
  aide: string;
  accepte: string;
  icone: ReactNode;
  onFichier: (f: File) => void;
  onRetirer: () => void;
  apercu: ReactNode;
}) {
  const [survol, setSurvol] = useState(false);
  const entree = useRef<HTMLInputElement>(null);
  const deposer = (e: DragEvent) => {
    e.preventDefault();
    setSurvol(false);
    const f = e.dataTransfer.files[0];
    if (f) onFichier(f);
  };

  return (
    <div>
      <p className="mb-2 text-sm font-medium">{titre}</p>
      {apercu ? (
        <div className="relative flex min-h-52 items-center justify-center rounded-xl border border-bord bg-fond p-3">
          {apercu}
          <button
            type="button"
            onClick={onRetirer}
            aria-label="Retirer le fichier"
            className="absolute top-2 right-2 rounded-lg bg-carte/90 p-1.5 text-doux hover:text-texte"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => entree.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setSurvol(true);
          }}
          onDragLeave={() => setSurvol(false)}
          onDrop={deposer}
          className={`flex min-h-52 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center text-sm transition-colors ${
            survol ? "border-accent bg-accent/10" : "border-bord hover:border-doux/60"
          }`}
        >
          <span className="text-doux">{icone}</span>
          <span className="flex items-center gap-1.5 font-medium">
            <Upload size={14} aria-hidden />
            Glissez un fichier ou cliquez pour choisir
          </span>
          <span className="text-xs text-doux">{aide}</span>
        </button>
      )}
      <input
        ref={entree}
        type="file"
        accept={accepte}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFichier(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

const LIBELLES: Record<Animation["statut"], { ton: "accent" | "plan" | "ok" | "erreur"; texte: string }> = {
  en_attente: { ton: "plan", texte: "Préparation" },
  en_file: { ton: "plan", texte: "En file d'attente" },
  en_cours: { ton: "accent", texte: "Génération en cours" },
  terminee: { ton: "ok", texte: "Terminée" },
  echouee: { ton: "erreur", texte: "Échec" },
};

function CarteAnimation({ a, onRelancer, onSupprimer }: { a: Animation; onRelancer: () => void; onSupprimer: () => void }) {
  const [maintenant, setMaintenant] = useState(Date.now());
  const enCours = EN_COURS.includes(a.statut) || (a.statut === "terminee" && !a.resultat_url);
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, [enCours]);
  const ecoule = Math.max(0, Math.round((maintenant - new Date(a.created_at).getTime()) / 1000));
  const libelle = a.statut === "terminee" && !a.resultat_url ? { ton: "accent" as const, texte: "Récupération de la vidéo" } : LIBELLES[a.statut];

  return (
    <Carte className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pastille ton={libelle.ton}>{libelle.texte}</Pastille>
        <span className="text-xs text-doux">
          {MODELES_ANIMATION[a.mode].nom} · {new Date(a.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
        </span>
      </div>

      {enCours && (
        <div aria-live="polite">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-bord">
            <div className="barre-activite absolute inset-0" />
          </div>
          <p className="mt-2 text-xs text-doux tabular-nums">
            {a.statut === "en_file" && a.position_file != null ? `Position dans la file : ${a.position_file + 1} · ` : ""}
            {Math.floor(ecoule / 60)} min {String(ecoule % 60).padStart(2, "0")} s écoulées
          </p>
        </div>
      )}

      {a.resultat_url && (
        <video src={a.resultat_url} controls playsInline preload="metadata" className="max-h-96 w-full rounded-lg bg-black" />
      )}

      {a.statut === "echouee" && <p className="rounded-lg bg-erreur/10 px-3 py-2 text-sm text-erreur">{a.erreur ?? "La génération a échoué."}</p>}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-bord pt-3">
        {a.resultat_url && (
          <a href={a.resultat_url} download className={`${boutonSecondaire} flex items-center gap-1.5`}>
            <Download size={15} aria-hidden />
            Télécharger
          </a>
        )}
        {a.statut === "echouee" && (
          <button className={`${boutonSecondaire} flex items-center gap-1.5`} onClick={onRelancer}>
            <RotateCcw size={15} aria-hidden />
            Réessayer
          </button>
        )}
        {!enCours && (
          <button className="ml-auto flex items-center gap-1.5 text-sm text-doux hover:text-erreur" onClick={onSupprimer}>
            <Trash2 size={14} aria-hidden />
            Supprimer
          </button>
        )}
      </div>
    </Carte>
  );
}
