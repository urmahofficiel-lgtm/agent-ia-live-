import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent } from "react";
import { Download, LoaderCircle, Mic, Upload } from "lucide-react";
import { Carte, Erreur, Pastille, Titre, bouton } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { jetonSession } from "@/lib/session";
import { useUserId } from "@/lib/donnees";
import { doublerMaVideo, etatDoublage } from "@/lib/doublage.functions";
import type { Personnage, Replique } from "@/lib/doublage";

export const Route = createFileRoute("/doublage")({ component: Doublage });

const TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const TAILLE_MAX = 50 * 1024 * 1024;

type Resultat = { video_url: string; repliques: Replique[]; personnages: (Personnage & { voix: string })[]; moteur: string };

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Doublage() {
  const userId = useUserId();
  const [elevenlabs, setElevenlabs] = useState<boolean | null>(null);
  const [source, setSource] = useState<{ url: string; nom: string } | null>(null);
  const [etape, setEtape] = useState<"libre" | "envoi" | "doublage">("libre");
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  useEffect(() => {
    jetonSession()
      .then((j) => etatDoublage({ data: { jeton: j } }))
      .then((r) => setElevenlabs(r.ok ? r.elevenlabs : false))
      .catch(() => setElevenlabs(false));
  }, []);

  async function deposer(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !userId) return;
    if (!TYPES.includes(f.type)) return setErreur("Formats acceptés : MP4, MOV, WebM.");
    if (f.size > TAILLE_MAX) return setErreur("Vidéo trop lourde : 50 Mo au maximum.");
    setErreur(null);
    setResultat(null);
    setEtape("envoi");
    const nom = f.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
    const chemin = `${userId}/${Date.now()}-${nom}`;
    const { error } = await supabase().storage.from("studio").upload(chemin, f, { contentType: f.type });
    setEtape("libre");
    if (error) return setErreur(`Envoi impossible : ${error.message}`);
    setSource({ url: supabase().storage.from("studio").getPublicUrl(chemin).data.publicUrl, nom: f.name });
  }

  async function doubler() {
    if (!source) return;
    setErreur(null);
    setResultat(null);
    setEtape("doublage");
    const r = await doublerMaVideo({ data: { jeton: await jetonSession(), url: source.url } }).catch((e: unknown) => ({
      ok: false as const,
      erreur: e instanceof Error ? e.message : "Le doublage n'a pas abouti. Réessayez.",
    }));
    setEtape("libre");
    if (!r.ok) return setErreur(r.erreur);
    setResultat(r);
  }

  const occupe = etape !== "libre";
  const role = (id: string) => resultat?.personnages.find((p) => p.id === id)?.role ?? id;

  return (
    <div className="mx-auto max-w-4xl">
      <Titre sous="Gardez vos images telles quelles : l'agent écoute la vidéo, lit ce qui est à l'écran, reconnaît chaque personnage et refait toutes les voix en français, avec des voix réalistes posées exactement au même moment.">
        Voix réalistes
      </Titre>

      {elevenlabs === false && (
        <Carte className="mb-4 border-alerte/40">
          <p className="text-sm">
            <strong>Voix ElevenLabs non branchées.</strong> Le doublage marche déjà, avec les voix Gemini (moins naturelles). Pour des voix
            vraiment humaines : créez une clé API sur elevenlabs.io (Developers → API keys), puis ajoutez-la dans Vercel sous le nom{" "}
            <code className="rounded bg-bord px-1">ELEVENLABS_API_KEY</code>.
          </p>
        </Carte>
      )}

      <Carte className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className={`${bouton} inline-flex cursor-pointer items-center gap-2 ${occupe ? "pointer-events-none opacity-50" : ""}`}>
            {etape === "envoi" ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
            {source ? "Choisir une autre vidéo" : "Choisir la vidéo"}
            <input type="file" accept={TYPES.join(",")} className="sr-only" onChange={deposer} disabled={occupe} />
          </label>
          {source && <span className="truncate text-sm text-doux">{source.nom}</span>}
        </div>

        {source && (
          <>
            <video src={source.url} controls className="max-h-80 w-full rounded-xl bg-black" />
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={`${bouton} inline-flex items-center gap-2`} onClick={doubler} disabled={occupe}>
                {etape === "doublage" ? <LoaderCircle size={16} className="animate-spin" /> : <Mic size={16} />}
                {etape === "doublage" ? "Doublage en cours…" : "Refaire les voix"}
              </button>
              {etape === "doublage" && (
                <span className="text-sm text-doux" aria-live="polite">
                  Écoute, lecture des images, voix, mixage : 1 à 4 minutes. Laissez la page ouverte.
                </span>
              )}
            </div>
          </>
        )}
        <Erreur message={erreur} />
      </Carte>

      {resultat && (
        <Carte className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-lg font-semibold">Vidéo doublée</h2>
            <Pastille ton={resultat.moteur === "elevenlabs" ? "ok" : "alerte"}>{resultat.moteur === "elevenlabs" ? "Voix ElevenLabs" : "Voix Gemini"}</Pastille>
            <a href={resultat.video_url} download className={`${bouton} inline-flex items-center gap-2`}>
              <Download size={16} /> Télécharger
            </a>
          </div>
          <video src={resultat.video_url} controls className="max-h-96 w-full rounded-xl bg-black" />
          <div className="flex flex-wrap gap-2">
            {resultat.personnages.map((p) => (
              <Pastille key={p.id} ton="accent">
                {p.role} · {p.voix || "voix"}
              </Pastille>
            ))}
          </div>
          <ol className="grid gap-1.5 text-sm">
            {resultat.repliques.map((r, i) => (
              <li key={i} className="grid grid-cols-[3.5rem_8rem_1fr] gap-2">
                <span className="tabular-nums text-doux">{minutes(r.debut)}</span>
                <span className="truncate font-medium">{role(r.locuteur)}</span>
                <span>{r.texte}</span>
              </li>
            ))}
          </ol>
        </Carte>
      )}
    </div>
  );
}
