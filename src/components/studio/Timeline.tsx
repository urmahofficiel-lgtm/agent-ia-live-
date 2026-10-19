import { useState } from "react";
import { Plus } from "lucide-react";
import { TRANSITIONS, debutsScenes, type PlanMontage } from "@/lib/montage";

// Pixels par seconde de la timeline ; un bloc garde une largeur lisible.
const PX = 30;
const LARGEUR_MIN = 72;

// Timeline façon CapCut : un bloc par scène (largeur = durée), la tête de
// lecture, les transitions entre les blocs. Clic : sélectionner la scène et
// s'y placer ; glisser-déposer : changer l'ordre.
export function Timeline({
  plan,
  durees,
  temps,
  selection,
  onSelection,
  onTemps,
  onDeplacer,
  onAjouter,
}: {
  plan: PlanMontage;
  durees: number[];
  temps: number;
  selection: number;
  onSelection: (i: number) => void;
  onTemps: (t: number) => void;
  onDeplacer: (de: number, vers: number) => void;
  onAjouter?: () => void;
}) {
  const [glisse, setGlisse] = useState<number | null>(null);
  const [cible, setCible] = useState<number | null>(null);
  const debuts = debutsScenes(durees);
  const largeurs = durees.map((d) => Math.max(LARGEUR_MIN, d * PX));
  const gauches = largeurs.map((_, i) => largeurs.slice(0, i).reduce((a, b) => a + b, 0) + i * 6);
  // Tête de lecture : dans le bloc de la scène en cours, au prorata.
  let k = 0;
  while (k < durees.length - 1 && debuts[k + 1] <= temps) k++;
  const tete = (gauches[k] ?? 0) + (largeurs[k] ?? 0) * Math.min(1, Math.max(0, (temps - (debuts[k] ?? 0)) / (durees[k] || 1)));

  return (
    <div className="rounded-2xl border border-bord bg-carte p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-doux">
        <span>Timeline · glissez une scène pour la déplacer</span>
        <span className="font-mono">{durees.reduce((a, b) => a + b, 0).toFixed(1)} s</span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="relative flex gap-1.5" style={{ width: (gauches.at(-1) ?? 0) + (largeurs.at(-1) ?? 0) + (onAjouter ? 60 : 0) }}>
          {plan.scenes.map((s, i) => {
            const image = s.source === "perso" && s.media_type === "image" ? s.media_url : s.source === "video" || s.source === "ia_video" ? s.apercu : null;
            const transition = TRANSITIONS.find((t) => t.id === s.transition);
            return (
              <div key={i} className="relative shrink-0" style={{ width: largeurs[i] }}>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    setGlisse(i);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setCible(i);
                  }}
                  onDragLeave={() => setCible((c) => (c === i ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (glisse !== null && glisse !== i) onDeplacer(glisse, i);
                    setGlisse(null);
                    setCible(null);
                  }}
                  onDragEnd={() => {
                    setGlisse(null);
                    setCible(null);
                  }}
                  onClick={() => {
                    onSelection(i);
                    onTemps(debuts[i] + 0.01);
                  }}
                  aria-label={`Scène ${i + 1} : ${s.phrase || "vide"}`}
                  aria-pressed={selection === i}
                  className={`relative flex h-20 w-full flex-col justify-between overflow-hidden rounded-lg border-2 p-1.5 text-left text-[11px] text-white transition ${
                    selection === i ? "border-accent" : cible === i ? "border-accent/50" : "border-transparent"
                  } ${glisse === i ? "opacity-40" : ""}`}
                  style={{
                    background: image ? `linear-gradient(rgba(0,0,0,.25), rgba(0,0,0,.65)), url("${image}") center / cover` : "linear-gradient(135deg, #334155, #0f172a)",
                  }}
                >
                  <span className="flex items-center justify-between">
                    <span className="rounded bg-black/60 px-1 font-mono">{i + 1}</span>
                    <span className="flex items-center gap-1">
                      {s.source === "ia_video" && <span className={`rounded px-1 text-[9px] font-semibold ${s.media_url ? "bg-accent text-white" : "bg-black/60"}`}>IA</span>}
                      {s.emoji && <span className="text-base leading-none">{s.emoji}</span>}
                    </span>
                  </span>
                  <span className="line-clamp-2 leading-tight drop-shadow">{s.phrase || "Scène vide"}</span>
                </button>
                {i < plan.scenes.length - 1 && s.transition !== "coupe" && (
                  <span
                    className="absolute -right-[11px] top-1/2 z-10 grid size-4 -translate-y-1/2 rotate-45 place-items-center rounded-sm border border-accent bg-carte"
                    title={`Transition : ${transition?.nom}`}
                  />
                )}
              </div>
            );
          })}
          {onAjouter && (
            <button
              type="button"
              onClick={onAjouter}
              aria-label="Ajouter une scène"
              className="grid h-20 w-12 shrink-0 place-items-center rounded-lg border-2 border-dashed border-bord text-doux hover:border-accent/60 hover:text-texte"
            >
              <Plus size={18} aria-hidden />
            </button>
          )}
          <span className="pointer-events-none absolute -top-1 bottom-[-4px] w-0.5 rounded bg-accent" style={{ left: tete }} aria-hidden />
        </div>
      </div>
    </div>
  );
}
