import { useEffect, useRef, type CSSProperties } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { FILTRE_CSS, PARAMS_SOUS_TITRES, estMotFort, etatApercu, margeCta, type PlanMontage, type SceneMontage } from "@/lib/montage";

// Aperçu en direct du montage, sans rendu : média de la scène, effet, filtre
// couleur, sous-titres mot à mot dans le style choisi, emoji, accroche et
// appel à l'action. Les tailles suivent la largeur de l'aperçu (unités cqw,
// sur une base 720 × 1280 comme la vidéo finale).
const cqw = (px720: number) => `${(px720 / 720) * 100}cqw`;

// Contour de texte en 8 ombres (plus fiable que text-stroke sur du texte HTML).
const contourTexte = (taille: number, couleur: string) =>
  [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].map(([x, y]) => `${cqw(x * taille)} ${cqw(y * taille)} 0 ${couleur}`).join(", ");

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ApercuDirect({
  plan,
  durees,
  temps,
  lecture,
  onTemps,
  onLecture,
}: {
  plan: PlanMontage;
  durees: number[];
  temps: number;
  lecture: boolean;
  onTemps: (t: number) => void;
  onLecture: (l: boolean) => void;
}) {
  const e = etatApercu(plan, durees, temps);
  const scene = plan.scenes[e.i];

  // Lecture : le temps avance avec l'horloge du navigateur, s'arrête à la fin.
  const tempsRef = useRef(temps);
  tempsRef.current = temps;
  useEffect(() => {
    if (!lecture) return;
    let precedent = performance.now();
    let id = requestAnimationFrame(function image(maintenant) {
      const t = tempsRef.current + (maintenant - precedent) / 1000;
      precedent = maintenant;
      if (t >= e.total) {
        onTemps(e.total);
        onLecture(false);
        return;
      }
      onTemps(t);
      id = requestAnimationFrame(image);
    });
    return () => cancelAnimationFrame(id);
  }, [lecture, e.total, onTemps, onLecture]);

  const st = PARAMS_SOUS_TITRES[plan.sous_titres];
  const flash = scene?.effet === "flash" ? Math.max(0, 1 - e.local / 0.3) : 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative aspect-[9/16] w-full max-w-[300px] select-none overflow-hidden rounded-2xl border border-bord bg-black shadow-lg"
        style={{ containerType: "inline-size" }}
        aria-label="Aperçu du montage"
      >
        {scene && <Media scene={scene} progres={e.progres} local={e.local} lecture={lecture} filtre={FILTRE_CSS[plan.filtre]} />}
        {flash > 0 && <div className="absolute inset-0 bg-white" style={{ opacity: flash }} />}

        {/* Accroche au début, sinon le gros texte de la scène, en haut. */}
        {e.accroche ? (
          <Bandeau haut={140} taille={52} fond="#E00000" couleur="#fff">
            {plan.accroche}
          </Bandeau>
        ) : (
          scene?.texte && (
            <Bandeau haut={150} taille={44} fond="#fff" couleur="#111">
              {scene.texte}
            </Bandeau>
          )
        )}

        {scene?.emoji && (
          <span
            className="absolute left-1/2 leading-none"
            style={{ top: `${(420 / 1280) * 100}%`, fontSize: cqw(150), transform: `translate(-50%, ${cqw(12 * Math.sin(2 * Math.PI * temps * 1.6))})` }}
            aria-hidden
          >
            {scene.emoji}
          </span>
        )}

        {e.mots.length > 0 && scene && (
          <p
            className="absolute inset-x-[7%] text-center font-black leading-tight"
            style={{
              ...(st.alignement === 5 ? { top: "50%", transform: "translateY(-50%)" } : { bottom: `${(st.margeV / 1280) * 100}%` }),
              fontSize: cqw(st.taille),
            }}
          >
            <span
              style={{
                color: "#fff",
                ...(st.bordure === 3
                  ? { background: st.contourCss, padding: `${cqw(6)} ${cqw(14)}`, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }
                  : { textShadow: `${contourTexte(st.contour * 0.6, st.contourCss)}${st.flou ? `, 0 0 ${cqw(18)} ${st.contourCss}` : ""}` }),
              }}
            >
              {e.mots.map((mot, n) => {
                const texte = st.majuscules ? mot.toUpperCase() : mot;
                const style: CSSProperties =
                  n === e.actif
                    ? { color: st.accentCss, display: "inline-block", transform: "scale(1.08)" }
                    : estMotFort(scene, mot)
                      ? { color: st.fortCss }
                      : {};
                return (
                  <span key={n}>
                    {n > 0 && " "}
                    <span style={style}>{texte}</span>
                  </span>
                );
              })}
            </span>
          </p>
        )}

        {e.cta && (
          <Bandeau bas={margeCta(st)} taille={54} fond="#FFD700" couleur="#111">
            {plan.cta}
          </Bandeau>
        )}

        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 font-mono text-[10px] text-white">Scène {e.i + 1}</span>
      </div>

      <div className="flex w-full max-w-[300px] items-center gap-2">
        <button
          type="button"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white"
          aria-label={lecture ? "Pause" : "Lecture"}
          onClick={() => {
            if (!lecture && temps >= e.total - 0.05) onTemps(0);
            onLecture(!lecture);
          }}
        >
          {lecture ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>
        <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full text-doux hover:text-texte" aria-label="Revenir au début" onClick={() => onTemps(0)}>
          <RotateCcw size={15} aria-hidden />
        </button>
        <input
          type="range"
          className="min-w-0 flex-1 accent-accent"
          min={0}
          max={e.total}
          step={0.01}
          value={Math.min(temps, e.total)}
          onChange={(x) => onTemps(Number(x.target.value))}
          aria-label="Position dans la vidéo"
        />
        <span className="shrink-0 font-mono text-xs text-doux">
          {minutes(temps)} / {minutes(e.total)}
        </span>
      </div>
      <p className="max-w-[300px] text-center text-[11px] text-doux">Aperçu sans voix, durées estimées. La vidéo finale suit la voix off.</p>
    </div>
  );
}

function Bandeau({ haut, bas, taille, fond, couleur, children }: { haut?: number; bas?: number; taille: number; fond: string; couleur: string; children: string }) {
  return (
    <p className="absolute inset-x-[8%] text-center font-black leading-snug" style={{ ...(haut !== undefined ? { top: `${(haut / 1280) * 100}%` } : { bottom: `${((bas ?? 0) / 1280) * 100}%` }), fontSize: cqw(taille) }}>
      <span style={{ background: fond, color: couleur, padding: `${cqw(4)} ${cqw(14)}`, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{children.toUpperCase()}</span>
    </p>
  );
}

// Média de la scène avec son effet : zoom avant / arrière, secousse ; les
// images fixes zooment toujours un peu, comme dans la vidéo finale.
function Media({ scene: s, progres, local, lecture, filtre }: { scene: SceneMontage; progres: number; local: number; lecture: boolean; filtre: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const estVideo = (s.source === "perso" || s.source === "ia_video") && s.media_type === "video" && s.media_url;

  // La vidéo perso suit la lecture ; à l'arrêt, elle se cale sur la position.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.playbackRate = s.vitesse || 1;
    if (lecture) void v.play().catch(() => {});
    else v.pause();
  }, [lecture, s.vitesse]);
  useEffect(() => {
    const v = video.current;
    if (v && !lecture && Number.isFinite(v.duration) && v.duration > 0) v.currentTime = (local * (s.vitesse || 1)) % v.duration;
  }, [lecture, local, s.vitesse]);

  const zoom = s.effet === "zoom_avant" ? 1 + 0.16 * progres : s.effet === "zoom_arriere" ? 1.16 - 0.16 * progres : estVideo ? 1 : 1 + 0.06 * progres;
  const secousse = s.effet === "secousse" ? Math.exp(-2.5 * local) : 0;
  const dx = secousse * 16 * Math.sin(2 * Math.PI * local * 9);
  const dy = secousse * 14 * Math.cos(2 * Math.PI * local * 11);
  const style: CSSProperties = { transform: `translate(${cqw(dx)}, ${cqw(dy)}) scale(${zoom * (secousse ? 1.06 : 1)})`, filter: filtre };

  const image = s.source === "perso" ? (s.media_type === "image" ? s.media_url : null) : s.source === "video" || s.source === "ia_video" ? s.apercu : null;
  if (estVideo) return <video ref={video} src={s.media_url!} muted playsInline loop className="absolute inset-0 size-full object-cover" style={style} />;
  if (image) return <img src={image} alt="" className="absolute inset-0 size-full object-cover" style={style} draggable={false} />;
  return (
    <div className="absolute inset-0 flex items-end bg-gradient-to-br from-slate-700 to-slate-900 p-3 text-[10px] text-white/60" style={style}>
      {s.source === "capture" ? "Capture de votre appli" : s.source === "ia_video" ? `Vidéo IA à générer : ${s.mouvement || s.recherche || "décrivez le mouvement"}` : s.source === "image_ia" ? `Image IA : ${s.prompt || s.recherche || "à décrire"}` : `Vidéo : ${s.recherche || "à choisir"}`}
    </div>
  );
}
