import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Clapperboard, Copy, Film, LoaderCircle, Music, Palette, Redo2, RefreshCw, Send, Sparkles, Trash2, Type, Undo2, Upload, Wand2 } from "lucide-react";
import { Carte, Erreur, Pastille, Titre, bouton, boutonSecondaire, champ } from "@/components/ui";
import { ChoixReseaux } from "@/components/ChoixReseaux";
import { supabase } from "@/lib/supabase";
import { useRequete, useUserId } from "@/lib/donnees";
import { jetonSession } from "@/lib/session";
import { creerCopies } from "@/lib/publications";
import { creneauxConseilles, resultatVideoPerso, valeurChampDate } from "@/lib/video-perso";
import { monterLeMontage, preparerMontage, sequencesScene } from "@/lib/montage.functions";
import {
  EFFETS,
  EMOJIS,
  FILTRES,
  FILTRE_CSS,
  MODELES,
  PARAMS_SOUS_TITRES,
  SONS,
  SOURCES,
  STYLES_SOUS_TITRES,
  TRANSITIONS,
  VITESSES,
  VOIX_MONTAGE,
  appliquerModele,
  dureesEstimees,
  lirePlan,
  planValide,
  sceneVide,
  type PlanMontage,
  type SceneMontage,
} from "@/lib/montage";
import { ApercuDirect } from "@/components/studio/ApercuDirect";
import { Timeline } from "@/components/studio/Timeline";

export const Route = createFileRoute("/montage")({ component: StudioMontage });

type Ligne = { id: string; source: string; plan: PlanMontage; statut: string; video_url: string | null; created_at: string };

const STATUTS: Record<string, { libelle: string; ton: "doux" | "accent" | "ok" | "erreur" }> = {
  brouillon: { libelle: "À relire", ton: "doux" },
  montage: { libelle: "Montage…", ton: "accent" },
  pret: { libelle: "Prête", ton: "ok" },
  echec: { libelle: "Échec", ton: "erreur" },
};

function StudioMontage() {
  const userId = useUserId();
  const liste = useRequete<Ligne[]>(
    () => supabase().from("montages").select("id, source, plan, statut, video_url, created_at").order("created_at", { ascending: false }).limit(8),
    [userId],
  );
  const [lien, setLien] = useState("");
  const [sujet, setSujet] = useState("");
  const [duree, setDuree] = useState(30);
  const [courant, setCourant] = useState<{ id: string; plan: PlanMontage; video: string | null } | null>(null);
  const [etat, setEtat] = useState<"libre" | "plan" | "montage">("libre");
  const [erreur, setErreur] = useState<string | null>(null);

  async function preparer() {
    setErreur(null);
    setEtat("plan");
    try {
      const r = await preparerMontage({ data: { jeton: await jetonSession(), lien: lien.trim() || undefined, sujet: sujet.trim() || undefined, duree } });
      if (r.ok) setCourant({ id: r.id, plan: r.plan, video: null });
      else setErreur(r.erreur);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible de joindre le serveur.");
    }
    setEtat("libre");
    await liste.recharger();
  }

  async function monter() {
    if (!courant) return;
    const invalide = planValide(courant.plan);
    if (invalide) return setErreur(invalide);
    setErreur(null);
    setEtat("montage");
    try {
      const r = await monterLeMontage({ data: { jeton: await jetonSession(), id: courant.id, plan: courant.plan } });
      if (r.ok) setCourant({ ...courant, video: r.video_url });
      else setErreur(r.erreur);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le montage a été interrompu. Réessayez.");
    }
    setEtat("libre");
    await liste.recharger();
  }

  return (
    <>
      <Titre sous="Collez un lien : l'IA écrit la vidéo phrase par phrase. Vous voyez le résultat en direct, vous changez tout (images, vos propres vidéos, sous-titres, filtres, effets, sons), puis vous montez et programmez.">
        Studio montage IA
      </Titre>

      <Carte className="mb-6">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm">
            Lien (site, page produit, article…)
            <input className={champ} value={lien} onChange={(e) => setLien(e.target.value)} placeholder="https://www.btp-ecosystem.com" inputMode="url" />
          </label>
          <label className="text-sm">
            Ou un sujet
            <input className={champ} value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Ex. : arrêter de faire ses devis le soir" />
          </label>
          <label className="text-sm">
            Durée
            <select className={champ} value={duree} onChange={(e) => setDuree(Number(e.target.value))}>
              {[20, 30, 45].map((s) => (
                <option key={s} value={s}>
                  {s} secondes
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className={`${bouton} mt-3 inline-flex items-center gap-2`} disabled={etat !== "libre" || !(lien.trim() || sujet.trim())} onClick={preparer}>
          {etat === "plan" ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
          {etat === "plan" ? "L'IA prépare le montage (30 s à 1 min)…" : "Préparer le montage"}
        </button>
        <Erreur message={erreur ?? liste.erreur} />
      </Carte>

      {courant ? (
        <Editeur
          key={courant.id}
          id={courant.id}
          plan={courant.plan}
          video={courant.video}
          occupe={etat !== "libre"}
          enMontage={etat === "montage"}
          onChange={(plan) => setCourant({ ...courant, plan })}
          onMonter={monter}
          onFermer={() => setCourant(null)}
        />
      ) : (
        (liste.data?.length ?? 0) > 0 && (
          <Carte>
            <h2 className="mb-3 font-medium">Vos derniers montages</h2>
            <ul className="divide-y divide-bord">
              {liste.data!.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.plan?.titre || m.source}</p>
                    <p className="text-xs text-doux">
                      {new Date(m.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · {m.plan?.scenes?.length ?? 0} scènes
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pastille ton={STATUTS[m.statut]?.ton ?? "doux"}>{STATUTS[m.statut]?.libelle ?? m.statut}</Pastille>
                    <button className={boutonSecondaire} onClick={() => setCourant({ id: m.id, plan: lirePlan(m.plan) ?? m.plan, video: m.video_url })}>
                      Ouvrir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Carte>
        )
      )}
    </>
  );
}

type Onglet = "scene" | "style" | "audio" | "textes";

const TYPES_FICHIERS = ["video/mp4", "video/quicktime", "video/webm", "image/jpeg", "image/png", "image/webp"];
const TAILLE_MAX = 50 * 1024 * 1024;

// Éditeur façon CapCut : aperçu en direct, panneau de réglages en onglets,
// timeline ; annuler / rétablir et enregistrement automatique du plan.
function Editeur({
  id,
  plan,
  video,
  occupe,
  enMontage,
  onChange,
  onMonter,
  onFermer,
}: {
  id: string;
  plan: PlanMontage;
  video: string | null;
  occupe: boolean;
  enMontage: boolean;
  onChange: (p: PlanMontage) => void;
  onMonter: () => void;
  onFermer: () => void;
}) {
  const [selection, setSelection] = useState(0);
  const [temps, setTemps] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [onglet, setOnglet] = useState<Onglet>("scene");
  const [sauvegarde, setSauvegarde] = useState<"ok" | "en_cours" | "erreur">("ok");
  const durees = useMemo(() => dureesEstimees(plan.scenes), [plan.scenes]);
  const i = Math.min(selection, plan.scenes.length - 1);

  // Historique : chaque changement est annulable ; une frappe continue dans
  // un champ compte pour un seul changement.
  const passe = useRef<PlanMontage[]>([]);
  const futur = useRef<PlanMontage[]>([]);
  const dernier = useRef(0);
  const planRef = useRef(plan);
  planRef.current = plan;
  const changer = useCallback(
    (p: PlanMontage, frappe = false) => {
      const maintenant = Date.now();
      if (!frappe || maintenant - dernier.current > 800) {
        passe.current.push(planRef.current);
        if (passe.current.length > 100) passe.current.shift();
      }
      dernier.current = frappe ? maintenant : 0;
      futur.current = [];
      onChange(p);
    },
    [onChange],
  );
  const annuler = useCallback(() => {
    const p = passe.current.pop();
    if (!p) return;
    futur.current.push(planRef.current);
    dernier.current = 0;
    onChange(p);
  }, [onChange]);
  const retablir = useCallback(() => {
    const p = futur.current.pop();
    if (!p) return;
    passe.current.push(planRef.current);
    dernier.current = 0;
    onChange(p);
  }, [onChange]);

  // Raccourcis : Ctrl+Z, Ctrl+Maj+Z / Ctrl+Y, Espace (hors des champs de saisie).
  useEffect(() => {
    function touche(e: KeyboardEvent) {
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName))) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) retablir();
        else annuler();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        retablir();
      } else if (e.key === " " && !mod && cible?.tagName !== "BUTTON") {
        e.preventDefault();
        setLecture((l) => !l);
      }
    }
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [annuler, retablir]);

  // Enregistrement automatique du plan, 1,2 s après le dernier changement.
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    setSauvegarde("en_cours");
    const minuterie = setTimeout(async () => {
      const { error } = await supabase().from("montages").update({ plan }).eq("id", id);
      setSauvegarde(error ? "erreur" : "ok");
    }, 1200);
    return () => clearTimeout(minuterie);
  }, [plan, id]);

  const maj = (champs: Partial<PlanMontage>, frappe = false) => changer({ ...plan, ...champs }, frappe);
  const majScene = (k: number, champs: Partial<SceneMontage>, frappe = false) => maj({ scenes: plan.scenes.map((s, n) => (n === k ? { ...s, ...champs } : s)) }, frappe);
  const deplacer = (de: number, vers: number) => {
    const l = [...plan.scenes];
    const [x] = l.splice(de, 1);
    l.splice(vers, 0, x);
    maj({ scenes: l });
    setSelection(vers);
  };
  const ajouter = () => {
    maj({ scenes: [...plan.scenes, sceneVide()] });
    setSelection(plan.scenes.length);
    setOnglet("scene");
  };
  const dupliquer = (k: number) => {
    const l = [...plan.scenes];
    l.splice(k + 1, 0, { ...plan.scenes[k] });
    maj({ scenes: l });
    setSelection(k + 1);
  };
  const supprimer = (k: number) => {
    maj({ scenes: plan.scenes.filter((_, n) => n !== k) });
    setSelection(Math.max(0, k - 1));
  };

  const ONGLETS: { id: Onglet; nom: string; icone: ReactNode }[] = [
    { id: "scene", nom: `Scène ${i + 1}`, icone: <Film size={15} aria-hidden /> },
    { id: "style", nom: "Style", icone: <Palette size={15} aria-hidden /> },
    { id: "audio", nom: "Audio", icone: <Music size={15} aria-hidden /> },
    { id: "textes", nom: "Textes", icone: <Type size={15} aria-hidden /> },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-bord bg-carte px-4 py-3">
        <h2 className="mr-auto min-w-0 truncate text-lg font-semibold">{plan.titre || "Votre montage"}</h2>
        <span className="text-xs text-doux" aria-live="polite">
          {sauvegarde === "en_cours" ? "Enregistrement…" : sauvegarde === "erreur" ? "Non enregistré" : "Enregistré"}
        </span>
        <IconeBouton titre="Annuler (Ctrl+Z)" onClick={passe.current.length ? annuler : undefined}>
          <Undo2 size={15} />
        </IconeBouton>
        <IconeBouton titre="Rétablir (Ctrl+Maj+Z)" onClick={futur.current.length ? retablir : undefined}>
          <Redo2 size={15} />
        </IconeBouton>
        <button className={`${bouton} inline-flex items-center gap-2`} disabled={occupe} onClick={onMonter}>
          {enMontage ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : video ? <RefreshCw size={16} aria-hidden /> : <Clapperboard size={16} aria-hidden />}
          {enMontage ? "Montage (1 à 3 min)…" : video ? "Refaire la vidéo" : "Monter la vidéo"}
        </button>
        <button className="text-xs text-doux underline hover:text-texte" onClick={onFermer}>
          Fermer
        </button>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="self-start lg:sticky lg:top-4">
          <ApercuDirect plan={plan} durees={durees} temps={temps} lecture={lecture} onTemps={setTemps} onLecture={setLecture} />
        </div>

        <div className="min-w-0 rounded-2xl border border-bord bg-carte">
          <div role="tablist" aria-label="Réglages" className="flex gap-1 overflow-x-auto border-b border-bord px-2">
            {ONGLETS.map((o) => (
              <button
                key={o.id}
                role="tab"
                aria-selected={onglet === o.id}
                onClick={() => setOnglet(o.id)}
                className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium ${onglet === o.id ? "border-accent text-texte" : "border-transparent text-doux hover:text-texte"}`}
              >
                {o.icone}
                {o.nom}
              </button>
            ))}
          </div>
          <div className="p-4">
            {onglet === "scene" && plan.scenes[i] && (
              <InspecteurScene
                scene={plan.scenes[i]}
                numero={i + 1}
                derniere={i === plan.scenes.length - 1}
                onChange={(c, frappe) => majScene(i, c, frappe)}
                onMonter={i > 0 ? () => deplacer(i, i - 1) : undefined}
                onDescendre={i < plan.scenes.length - 1 ? () => deplacer(i, i + 1) : undefined}
                onDupliquer={plan.scenes.length < 12 ? () => dupliquer(i) : undefined}
                onSupprimer={plan.scenes.length > 2 ? () => supprimer(i) : undefined}
              />
            )}
            {onglet === "style" && <PanneauStyle plan={plan} scene={plan.scenes[i]} onChange={(p) => changer(p)} />}
            {onglet === "audio" && <PanneauAudio plan={plan} onChange={maj} />}
            {onglet === "textes" && <PanneauTextes plan={plan} onChange={maj} />}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <Timeline
          plan={plan}
          durees={durees}
          temps={temps}
          selection={i}
          onSelection={(k) => {
            setSelection(k);
            setOnglet("scene");
          }}
          onTemps={setTemps}
          onDeplacer={deplacer}
          onAjouter={plan.scenes.length < 12 ? ajouter : undefined}
        />
      </div>

      {video && !enMontage && (
        <Carte className="mb-6">
          <h2 className="font-medium">Vidéo montée</h2>
          <Programmation video={video} plan={plan} onLegende={(legende) => maj({ legende }, true)} />
        </Carte>
      )}
    </>
  );
}

// Réglages de la scène sélectionnée : texte, emoji, image ou vidéo, effet,
// vitesse, son, transition.
function InspecteurScene({
  scene: s,
  numero,
  derniere,
  onChange,
  onMonter,
  onDescendre,
  onDupliquer,
  onSupprimer,
}: {
  scene: SceneMontage;
  numero: number;
  derniere: boolean;
  onChange: (c: Partial<SceneMontage>, frappe?: boolean) => void;
  onMonter?: () => void;
  onDescendre?: () => void;
  onDupliquer?: () => void;
  onSupprimer?: () => void;
}) {
  const userId = useUserId();
  const [sequences, setSequences] = useState<{ id: number; apercu: string }[] | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [emojis, setEmojis] = useState(false);
  const [depot, setDepot] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Nouvelle scène sélectionnée : on referme les résultats de recherche.
  useEffect(() => {
    setSequences(null);
    setErreur(null);
  }, [numero]);

  async function chercher() {
    if (!s.recherche.trim()) return;
    setRecherche(true);
    const r = await sequencesScene({ data: { jeton: await jetonSession(), recherche: s.recherche.trim() } }).catch(() => null);
    setSequences(r?.ok ? r.sequences : []);
    setRecherche(false);
  }

  async function deposer(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !userId) return;
    if (!TYPES_FICHIERS.includes(f.type)) return setErreur("Formats acceptés : MP4, MOV, WebM, JPG, PNG, WebP.");
    if (f.size > TAILLE_MAX) return setErreur("Fichier trop lourd : 50 Mo au maximum.");
    setErreur(null);
    setDepot(true);
    const nom = f.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
    const chemin = `${userId}/${Date.now()}-${nom}`;
    const { error } = await supabase().storage.from("studio").upload(chemin, f, { contentType: f.type });
    setDepot(false);
    if (error) return setErreur(`Envoi impossible : ${error.message}`);
    const url = supabase().storage.from("studio").getPublicUrl(chemin).data.publicUrl;
    onChange({ source: "perso", media_url: url, media_type: f.type.startsWith("video/") ? "video" : "image", choix: null });
  }

  const estVideo = s.source === "video" || (s.source === "perso" && s.media_type === "video");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-auto text-sm font-medium">Scène {numero}</span>
        <IconeBouton titre="Avancer la scène" onClick={onMonter}>
          <ArrowUp size={14} />
        </IconeBouton>
        <IconeBouton titre="Reculer la scène" onClick={onDescendre}>
          <ArrowDown size={14} />
        </IconeBouton>
        <IconeBouton titre="Dupliquer la scène" onClick={onDupliquer}>
          <Copy size={14} />
        </IconeBouton>
        <IconeBouton titre="Supprimer la scène" onClick={onSupprimer}>
          <Trash2 size={14} />
        </IconeBouton>
      </div>

      <label className="text-sm">
        Phrase dite (voix et sous-titres)
        <textarea className={`${champ} min-h-16`} value={s.phrase} maxLength={220} onChange={(e) => onChange({ phrase: e.target.value }, true)} />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          Gros texte en haut
          <input className={champ} value={s.texte} maxLength={60} onChange={(e) => onChange({ texte: e.target.value }, true)} />
        </label>
        <label className="text-sm">
          Mots en couleur (séparés par une virgule)
          <input
            className={champ}
            value={s.mots_forts.join(", ")}
            onChange={(e) => onChange({ mots_forts: e.target.value.split(",").map((m) => m.trim()).filter(Boolean).slice(0, 3) }, true)}
          />
        </label>
      </div>

      <div className="text-sm">
        <span>Emoji</span>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <button type="button" className={`rounded-lg border px-2.5 py-1 text-xs ${!s.emoji ? "border-accent text-texte" : "border-bord text-doux"}`} onClick={() => onChange({ emoji: "" })}>
            Aucun
          </button>
          {(emojis ? EMOJIS : EMOJIS.slice(0, 12)).map((e) => (
            <button
              key={e}
              type="button"
              aria-label={`Emoji ${e}`}
              aria-pressed={s.emoji === e}
              className={`grid size-9 place-items-center rounded-lg border text-lg ${s.emoji === e ? "border-accent bg-accent/10" : "border-bord"}`}
              onClick={() => onChange({ emoji: e })}
            >
              {e}
            </button>
          ))}
          {!emojis && (
            <button type="button" className="text-xs text-accent underline" onClick={() => setEmojis(true)}>
              Plus d'emojis
            </button>
          )}
        </div>
      </div>

      <fieldset className="grid gap-3 rounded-xl border border-bord p-3">
        <legend className="px-1 text-sm font-medium">Image ou vidéo</legend>
        <div className="flex flex-wrap gap-1.5">
          {SOURCES.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={s.source === o.id}
              onClick={() => onChange({ source: o.id })}
              className={`rounded-full border px-3 py-1 text-xs ${s.source === o.id ? "border-accent bg-accent/10 text-texte" : "border-bord text-doux hover:text-texte"}`}
            >
              {o.nom}
            </button>
          ))}
        </div>

        {s.source === "perso" && (
          <div className="text-sm">
            <label className={`${boutonSecondaire} inline-flex cursor-pointer items-center gap-2`}>
              {depot ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <Upload size={14} aria-hidden />}
              {depot ? "Envoi…" : s.media_url ? "Remplacer le fichier" : "Choisir une photo ou une vidéo"}
              <input type="file" className="sr-only" accept={TYPES_FICHIERS.join(",")} disabled={depot} onChange={deposer} />
            </label>
            <p className="mt-1 text-xs text-doux">Vos propres images de chantier : MP4, MOV, JPG, PNG, 50 Mo au maximum.</p>
          </div>
        )}

        {(s.source === "video" || s.source === "image_ia") && (
          <div className="text-sm">
            <label>
              {s.source === "video" ? "Recherche de la vidéo (mots-clés, en anglais de préférence)" : "Description de l'image IA (en anglais)"}
              <input
                className={champ}
                value={s.source === "video" ? s.recherche : s.prompt || s.recherche}
                onChange={(e) => onChange(s.source === "video" ? { recherche: e.target.value, choix: null, apercu: null } : { prompt: e.target.value }, true)}
              />
            </label>
            {s.source === "video" && (
              <button type="button" className={`${boutonSecondaire} mt-2 inline-flex items-center gap-2`} disabled={recherche || !s.recherche.trim()} onClick={chercher}>
                {recherche ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <Wand2 size={14} aria-hidden />}
                Voir d'autres vidéos
              </button>
            )}
            {sequences && (
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {sequences.length === 0 && <p className="col-span-full text-xs text-doux">Aucune vidéo trouvée : essayez d'autres mots-clés.</p>}
                {sequences.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    aria-label="Choisir cette vidéo"
                    aria-pressed={s.choix === q.id}
                    className={`overflow-hidden rounded-md border-2 ${s.choix === q.id ? "border-accent" : "border-transparent"}`}
                    onClick={() => onChange({ choix: q.id, apercu: q.apercu })}
                  >
                    <img src={q.apercu} alt="" className="aspect-[9/16] w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <Erreur message={erreur} />
      </fieldset>

      <div className="grid gap-3 md:grid-cols-2">
        <Choix libelle="Effet" valeur={s.effet} options={EFFETS} onChange={(effet) => onChange({ effet })} />
        <Choix libelle="Son au début" valeur={s.son} options={SONS} onChange={(son) => onChange({ son })} />
        {!derniere && <Choix libelle="Transition vers la suivante" valeur={s.transition} options={TRANSITIONS} onChange={(transition) => onChange({ transition })} />}
        {estVideo && (
          <div className="text-sm">
            <span>Vitesse de la vidéo</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {VITESSES.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={s.vitesse === v}
                  onClick={() => onChange({ vitesse: v })}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-xs ${s.vitesse === v ? "border-accent bg-accent/10 text-texte" : "border-bord text-doux"}`}
                >
                  {v}×
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Modèles en un clic, style des sous-titres et filtre couleur.
function PanneauStyle({ plan, scene, onChange }: { plan: PlanMontage; scene?: SceneMontage; onChange: (p: PlanMontage) => void }) {
  const image = scene ? (scene.source === "perso" && scene.media_type === "image" ? scene.media_url : scene.source === "video" ? scene.apercu : null) : null;
  return (
    <div className="grid gap-5">
      <section>
        <h3 className="mb-2 text-sm font-medium">Modèles en un clic</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODELES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(appliquerModele(plan, m.id))}
              className="rounded-xl border border-bord p-3 text-left hover:border-accent/60"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles size={14} className="text-accent" aria-hidden />
                {m.nom}
              </span>
              <span className="mt-0.5 block text-xs text-doux">{m.description}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-doux">Change le style, le filtre, les effets, les transitions et les sons. Vos phrases et vos images ne bougent pas. Ctrl+Z pour revenir en arrière.</p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Sous-titres</h3>
        <div className="flex flex-wrap gap-2">
          {STYLES_SOUS_TITRES.map((o) => {
            const st = PARAMS_SOUS_TITRES[o.id];
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={plan.sous_titres === o.id}
                onClick={() => onChange({ ...plan, sous_titres: o.id })}
                className={`grid w-28 gap-1 rounded-xl border p-2 text-center ${plan.sous_titres === o.id ? "border-accent bg-accent/10" : "border-bord"}`}
              >
                <span className="grid h-12 place-items-center rounded-lg bg-slate-800 text-sm font-black text-white">
                  <span style={st.bordure === 3 ? { background: st.contourCss, padding: "0 6px" } : { textShadow: `0 0 3px ${st.contourCss}, 0 0 3px ${st.contourCss}` }}>
                    {st.majuscules ? "LE " : "le "}
                    <span style={{ color: st.accentCss }}>{st.majuscules ? "DEVIS" : "devis"}</span>
                  </span>
                </span>
                <span className="text-xs">{o.nom}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Filtre couleur</h3>
        <div className="flex flex-wrap gap-2">
          {FILTRES.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={plan.filtre === o.id}
              onClick={() => onChange({ ...plan, filtre: o.id })}
              className={`grid w-20 gap-1 rounded-xl border p-1.5 text-center ${plan.filtre === o.id ? "border-accent bg-accent/10" : "border-bord"}`}
            >
              <span
                className="block aspect-square rounded-lg"
                style={{
                  background: image ? `url("${image}") center / cover` : "linear-gradient(135deg, #f59e0b, #0ea5e9 60%, #16a34a)",
                  filter: FILTRE_CSS[o.id],
                }}
              />
              <span className="text-xs">{o.nom}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// Voix off et volumes (voix, musique, bruitages).
function PanneauAudio({ plan, onChange }: { plan: PlanMontage; onChange: (c: Partial<PlanMontage>, frappe?: boolean) => void }) {
  const pistes: { id: keyof PlanMontage["mix"]; nom: string }[] = [
    { id: "voix", nom: "Voix off" },
    { id: "musique", nom: "Musique de fond" },
    { id: "effets", nom: "Bruitages (whoosh, pop, ding)" },
  ];
  return (
    <div className="grid gap-5">
      <Choix libelle="Voix" valeur={plan.voix} options={VOIX_MONTAGE} onChange={(voix) => onChange({ voix })} />
      <section className="grid gap-3">
        <h3 className="text-sm font-medium">Mixage</h3>
        {pistes.map((p) => (
          <label key={p.id} className="grid gap-1 text-sm">
            <span className="flex justify-between">
              {p.nom}
              <span className="font-mono text-xs text-doux">{Math.round(plan.mix[p.id] * 100)} %</span>
            </span>
            <input
              type="range"
              className="accent-accent"
              min={0}
              max={2}
              step={0.1}
              value={plan.mix[p.id]}
              onChange={(e) => onChange({ mix: { ...plan.mix, [p.id]: Number(e.target.value) } }, true)}
            />
          </label>
        ))}
        <p className="text-xs text-doux">100 % = réglage conseillé. La musique baisse toute seule sous la voix.</p>
      </section>
    </div>
  );
}

// Textes affichés en dehors des scènes et texte du post.
function PanneauTextes({ plan, onChange }: { plan: PlanMontage; onChange: (c: Partial<PlanMontage>, frappe?: boolean) => void }) {
  return (
    <div className="grid gap-3">
      <label className="text-sm">
        Titre du montage
        <input className={champ} value={plan.titre} maxLength={80} onChange={(e) => onChange({ titre: e.target.value }, true)} />
      </label>
      <label className="text-sm">
        Accroche (en haut, pendant les 2 premières secondes)
        <input className={champ} value={plan.accroche} maxLength={70} onChange={(e) => onChange({ accroche: e.target.value }, true)} />
      </label>
      <label className="text-sm">
        Appel à l'action (pendant la dernière scène)
        <input className={champ} value={plan.cta} maxLength={60} onChange={(e) => onChange({ cta: e.target.value }, true)} />
      </label>
      <label className="text-sm">
        Texte du post (légende)
        <textarea className={`${champ} min-h-28`} value={plan.legende} onChange={(e) => onChange({ legende: e.target.value }, true)} />
      </label>
    </div>
  );
}

function Choix<T extends string>({ libelle, valeur, options, onChange }: { libelle: string; valeur: T; options: readonly { id: T; nom: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="text-sm">
      {libelle}
      <select className={champ} value={valeur} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nom}
          </option>
        ))}
      </select>
    </label>
  );
}

function IconeBouton({ titre, onClick, children }: { titre: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={titre} title={titre} disabled={!onClick} onClick={onClick} className="grid size-8 place-items-center rounded-md border border-bord text-doux hover:text-texte disabled:opacity-30">
      {children}
    </button>
  );
}

// Aperçu de la vidéo montée, puis programmation sur les réseaux choisis.
function Programmation({ video, plan, onLegende }: { video: string; plan: PlanMontage; onLegende: (l: string) => void }) {
  const userId = useUserId();
  const [reseaux, setReseaux] = useState<string[]>([]);
  const [quand, setQuand] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function programmer() {
    if (!userId) return;
    if (!reseaux.length) return setErreur("Choisissez au moins un réseau.");
    setEnvoi(true);
    setErreur(null);
    const e = await creerCopies(
      userId,
      {
        titre: plan.titre || "Vidéo du Studio montage",
        consigne: "Vidéo montée dans le Studio montage : la légende est déjà écrite.",
        // Déjà relue dans le Studio : planifiée directement.
        statut: "en_attente",
        planifiee_pour: quand ? new Date(quand).toISOString() : null,
        resultat: { ...resultatVideoPerso(video), ...(plan.legende.trim() ? { brouillon: plan.legende.trim() } : {}) },
      },
      reseaux,
    );
    setEnvoi(false);
    setErreur(e);
    setFait(!e);
  }

  return (
    <div className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
      <video src={video} controls playsInline className="aspect-[9/16] w-full max-w-[220px] rounded-xl border border-bord bg-black" />
      <div className="grid content-start gap-3">
        <ChoixReseaux valeur={reseaux} onChange={setReseaux} />
        <label className="text-sm">
          Texte du post
          <textarea className={`${champ} min-h-24`} value={plan.legende} onChange={(e) => onLegende(e.target.value)} />
        </label>
        <div className="text-sm">
          <label>
            Date de publication (vide = au prochain passage de l'agent)
            <input className={champ} type="datetime-local" value={quand} onChange={(e) => setQuand(e.target.value)} />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {creneauxConseilles().map((c) => (
              <button key={c.instant.toISOString()} type="button" onClick={() => setQuand(valeurChampDate(c.instant))} className="rounded-full border border-bord px-3 py-1 text-xs text-doux hover:border-accent/60 hover:text-texte">
                {c.libelle}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className={`${bouton} inline-flex items-center gap-2`} disabled={envoi || fait} onClick={programmer}>
            {envoi ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Send size={16} aria-hidden />}
            {fait ? "Programmée" : "Programmer la publication"}
          </button>
          {fait && (
            <Link to="/taches" className="text-sm text-accent underline">
              Voir dans Publications
            </Link>
          )}
          <a href={video} download className="text-sm text-doux underline hover:text-texte">
            Télécharger la vidéo
          </a>
        </div>
        <Erreur message={erreur} />
      </div>
    </div>
  );
}
