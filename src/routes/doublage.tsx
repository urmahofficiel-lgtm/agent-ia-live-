import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent } from "react";
import { Download, LoaderCircle, Mic, Upload } from "lucide-react";
import { Carte, Erreur, Pastille, Titre, bouton } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { jetonSession } from "@/lib/session";
import { useUserId } from "@/lib/donnees";
import { etatDoublage } from "@/lib/doublage.functions";
import type { Personnage, Replique } from "@/lib/doublage";

export const Route = createFileRoute("/doublage")({ component: Doublage });

const TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const TAILLE_MAX = 50 * 1024 * 1024;

type Ligne = {
  id: string;
  statut: "en_attente" | "en_cours" | "pret" | "echec";
  etape: "ecoute" | "voix" | "mixage";
  etude: { repliques: Replique[]; personnages: (Personnage & { nom_voix: string })[]; moteur: string } | null;
  segments: Record<string, unknown>;
  video_url: string | null;
  erreur: string | null;
  created_at: string;
};

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function avancement(d: Ligne) {
  if (d.statut === "en_attente") return "En file : démarre dans moins d'une minute.";
  if (d.etape === "ecoute") return "L'agent écoute la vidéo et lit les images…";
  if (d.etape === "voix") return `Voix des personnages : ${Object.keys(d.segments).length} / ${d.etude?.repliques.length ?? "?"} répliques.`;
  return "Mixage du nouveau son…";
}

function Doublage() {
  const userId = useUserId();
  const [elevenlabs, setElevenlabs] = useState<boolean | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [doublages, setDoublages] = useState<Ligne[]>([]);

  useEffect(() => {
    jetonSession()
      .then((j) => etatDoublage({ data: { jeton: j } }))
      .then((r) => setElevenlabs(r.ok ? r.elevenlabs : false))
      .catch(() => setElevenlabs(false));
  }, []);

  // Liste, rafraîchie toutes les 5 s tant qu'un doublage avance.
  const enCours = doublages.some((d) => d.statut === "en_attente" || d.statut === "en_cours");
  useEffect(() => {
    if (!userId) return;
    let actif = true;
    const charger = async () => {
      const { data } = await supabase()
        .from("doublages")
        .select("id, statut, etape, etude, segments, video_url, erreur, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (actif && data) setDoublages(data as Ligne[]);
    };
    void charger();
    const minuteur = enCours ? setInterval(charger, 5000) : null;
    return () => {
      actif = false;
      if (minuteur) clearInterval(minuteur);
    };
  }, [userId, enCours]);

  async function deposer(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !userId) return;
    if (!TYPES.includes(f.type)) return setErreur("Formats acceptés : MP4, MOV, WebM.");
    if (f.size > TAILLE_MAX) return setErreur("Vidéo trop lourde : 50 Mo au maximum.");
    setErreur(null);
    setEnvoi(true);
    const nom = f.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
    const chemin = `${userId}/${Date.now()}-${nom}`;
    const { error } = await supabase().storage.from("studio").upload(chemin, f, { contentType: f.type });
    if (error) {
      setEnvoi(false);
      return setErreur(`Envoi impossible : ${error.message}`);
    }
    const source_url = supabase().storage.from("studio").getPublicUrl(chemin).data.publicUrl;
    const { data, error: e2 } = await supabase()
      .from("doublages")
      .insert({ source_url })
      .select("id, statut, etape, etude, segments, video_url, erreur, created_at")
      .single();
    setEnvoi(false);
    if (e2 || !data) return setErreur(`Demande impossible : ${e2?.message ?? "réessayez"}`);
    setDoublages((l) => [data as Ligne, ...l]);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Titre sous="Gardez vos images telles quelles : l'agent écoute la vidéo, lit ce qui est à l'écran, reconnaît chaque personnage et refait toutes les voix en français, posées exactement au même moment.">
        Voix réalistes
      </Titre>

      <Carte className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className={`${bouton} inline-flex cursor-pointer items-center gap-2 ${envoi ? "pointer-events-none opacity-50" : ""}`}>
            {envoi ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
            {envoi ? "Envoi…" : "Doubler une vidéo"}
            <input type="file" accept={TYPES.join(",")} className="sr-only" onChange={deposer} disabled={envoi} />
          </label>
          <span className="text-sm text-doux">MP4, MOV ou WebM, 50 Mo et 10 minutes au plus. Comptez 2 à 5 minutes ; vous pouvez fermer la page.</span>
        </div>
        {elevenlabs !== null && (
          <p className="text-xs text-doux">
            Voix : {elevenlabs ? "ElevenLabs" : "Gemini, une voix par personnage, ton de conversation"}.
          </p>
        )}
        <Erreur message={erreur} />
      </Carte>

      <div className="mt-4 grid gap-4">
        {doublages.map((d) => (
          <Carte key={d.id} className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-sm text-doux">{new Date(d.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
              {d.statut === "pret" && <Pastille ton="ok">Prête</Pastille>}
              {d.statut === "echec" && <Pastille ton="erreur">Échec</Pastille>}
              {(d.statut === "en_attente" || d.statut === "en_cours") && (
                <Pastille ton="accent">
                  <span className="inline-flex items-center gap-1">
                    <LoaderCircle size={12} className="animate-spin" /> En cours
                  </span>
                </Pastille>
              )}
              {d.video_url && (
                <a href={d.video_url} download className={`${bouton} inline-flex items-center gap-2`}>
                  <Download size={16} /> Télécharger
                </a>
              )}
            </div>
            {(d.statut === "en_attente" || d.statut === "en_cours") && (
              <p className="flex items-center gap-2 text-sm" aria-live="polite">
                <Mic size={14} /> {avancement(d)}
                {d.erreur && <span className="text-doux"> (nouvel essai : {d.erreur})</span>}
              </p>
            )}
            {d.statut === "echec" && <p className="text-sm text-erreur">{d.erreur ?? "Le doublage n'a pas abouti."}</p>}
            {d.video_url && <video src={d.video_url} controls className="max-h-96 w-full rounded-xl bg-black" />}
            {d.etude && (
              <>
                <div className="flex flex-wrap gap-2">
                  {d.etude.personnages.map((p) => (
                    <Pastille key={p.id} ton="doux">
                      {p.role} · voix {p.nom_voix || "?"}
                    </Pastille>
                  ))}
                </div>
                <details>
                  <summary className="cursor-pointer text-sm text-doux">Texte de la vidéo ({d.etude.repliques.length} répliques)</summary>
                  <ol className="mt-2 grid gap-1.5 text-sm">
                    {d.etude.repliques.map((r, i) => (
                      <li key={i} className="grid grid-cols-[3.5rem_8rem_1fr] gap-2">
                        <span className="tabular-nums text-doux">{minutes(r.debut)}</span>
                        <span className="truncate font-medium">{d.etude?.personnages.find((p) => p.id === r.locuteur)?.role ?? r.locuteur}</span>
                        <span>{r.texte}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              </>
            )}
          </Carte>
        ))}
      </div>
    </div>
  );
}
