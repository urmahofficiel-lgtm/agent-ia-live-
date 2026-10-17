import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Clapperboard, ImageIcon, LoaderCircle, Plus, RefreshCw, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Carte, Erreur, Pastille, Titre, bouton, boutonSecondaire, champ } from "@/components/ui";
import { ChoixReseaux } from "@/components/ChoixReseaux";
import { supabase } from "@/lib/supabase";
import { useRequete, useUserId } from "@/lib/donnees";
import { jetonSession } from "@/lib/session";
import { creerCopies } from "@/lib/publications";
import { creneauxConseilles, resultatVideoPerso, valeurChampDate } from "@/lib/video-perso";
import { monterLeMontage, preparerMontage, sequencesScene } from "@/lib/montage.functions";
import { EFFETS, EMOJIS, SONS, SOURCES, TRANSITIONS, VOIX_MONTAGE, planValide, sceneVide, type PlanMontage, type SceneMontage } from "@/lib/montage";

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
      <Titre sous="Collez un lien : l'IA écrit la vidéo phrase par phrase — image adaptée, emoji, effet, transition, son. Vous modifiez tout avant le montage, puis vous programmez la publication.">
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
                    <button className={boutonSecondaire} onClick={() => setCourant({ id: m.id, plan: m.plan, video: m.video_url })}>
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

function Editeur({
  plan,
  video,
  occupe,
  enMontage,
  onChange,
  onMonter,
  onFermer,
}: {
  plan: PlanMontage;
  video: string | null;
  occupe: boolean;
  enMontage: boolean;
  onChange: (p: PlanMontage) => void;
  onMonter: () => void;
  onFermer: () => void;
}) {
  const maj = (champs: Partial<PlanMontage>) => onChange({ ...plan, ...champs });
  const majScene = (i: number, champs: Partial<SceneMontage>) => maj({ scenes: plan.scenes.map((s, k) => (k === i ? { ...s, ...champs } : s)) });
  const deplacer = (i: number, sens: -1 | 1) => {
    const l = [...plan.scenes];
    [l[i], l[i + sens]] = [l[i + sens], l[i]];
    maj({ scenes: l });
  };

  return (
    <>
      <Carte className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{plan.titre || "Votre montage"}</h2>
          <button className="text-xs text-doux underline hover:text-texte" onClick={onFermer}>
            Fermer
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            Accroche (en haut, au début)
            <input className={champ} value={plan.accroche} maxLength={70} onChange={(e) => maj({ accroche: e.target.value })} />
          </label>
          <label className="text-sm">
            Appel à l'action (à la fin)
            <input className={champ} value={plan.cta} maxLength={60} onChange={(e) => maj({ cta: e.target.value })} />
          </label>
          <label className="text-sm">
            Voix
            <select className={champ} value={plan.voix} onChange={(e) => maj({ voix: e.target.value as PlanMontage["voix"] })}>
              {VOIX_MONTAGE.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nom}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Carte>

      <ol className="mb-4 space-y-3">
        {plan.scenes.map((s, i) => (
          <li key={i}>
            <CarteScene
              scene={s}
              numero={i + 1}
              derniere={i === plan.scenes.length - 1}
              onChange={(champs) => majScene(i, champs)}
              onMonter={i > 0 ? () => deplacer(i, -1) : undefined}
              onDescendre={i < plan.scenes.length - 1 ? () => deplacer(i, 1) : undefined}
              onSupprimer={plan.scenes.length > 2 ? () => maj({ scenes: plan.scenes.filter((_, k) => k !== i) }) : undefined}
            />
          </li>
        ))}
      </ol>
      {plan.scenes.length < 12 && (
        <button className={`${boutonSecondaire} mb-6 inline-flex items-center gap-2`} onClick={() => maj({ scenes: [...plan.scenes, sceneVide()] })}>
          <Plus size={15} aria-hidden />
          Ajouter une scène
        </button>
      )}

      <Carte className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <button className={`${bouton} inline-flex items-center gap-2`} disabled={occupe} onClick={onMonter}>
            {enMontage ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : video ? <RefreshCw size={16} aria-hidden /> : <Clapperboard size={16} aria-hidden />}
            {enMontage ? "Montage en cours (1 à 3 min)…" : video ? "Refaire le montage avec mes changements" : "Monter la vidéo"}
          </button>
          <p className="text-xs text-doux">Voix, images, effets, emojis, sons et sous-titres mot à mot sont assemblés automatiquement.</p>
        </div>
        {video && !enMontage && <Programmation video={video} plan={plan} onLegende={(legende) => maj({ legende })} />}
      </Carte>
    </>
  );
}

function CarteScene({
  scene: s,
  numero,
  derniere,
  onChange,
  onMonter,
  onDescendre,
  onSupprimer,
}: {
  scene: SceneMontage;
  numero: number;
  derniere: boolean;
  onChange: (c: Partial<SceneMontage>) => void;
  onMonter?: () => void;
  onDescendre?: () => void;
  onSupprimer?: () => void;
}) {
  const [sequences, setSequences] = useState<{ id: number; apercu: string }[] | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [emojis, setEmojis] = useState(false);

  async function chercher() {
    if (!s.recherche.trim()) return;
    setRecherche(true);
    const r = await sequencesScene({ data: { jeton: await jetonSession(), recherche: s.recherche.trim() } }).catch(() => null);
    setSequences(r?.ok ? r.sequences : []);
    setRecherche(false);
  }

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-bord bg-carte p-4 sm:flex-row">
      <div className="flex shrink-0 flex-col items-center gap-2 sm:w-28">
        <div className="relative grid aspect-[9/16] w-24 place-items-center overflow-hidden rounded-lg border border-bord bg-fond text-doux">
          {s.source === "video" && s.apercu ? (
            <img src={s.apercu} alt="" className="size-full object-cover" />
          ) : s.source === "capture" ? (
            <span className="px-1 text-center text-[11px]">Capture de l'appli</span>
          ) : (
            <ImageIcon size={22} aria-hidden />
          )}
          {s.emoji && <span className="absolute top-1/3 text-3xl">{s.emoji}</span>}
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 font-mono text-[11px] text-white">{numero}</span>
        </div>
        <div className="flex gap-1">
          <IconeBouton titre="Monter la scène" onClick={onMonter}>
            <ArrowUp size={14} />
          </IconeBouton>
          <IconeBouton titre="Descendre la scène" onClick={onDescendre}>
            <ArrowDown size={14} />
          </IconeBouton>
          <IconeBouton titre="Supprimer la scène" onClick={onSupprimer}>
            <Trash2 size={14} />
          </IconeBouton>
        </div>
      </div>

      <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2">
        <label className="text-sm md:col-span-2">
          Phrase dite (voix et sous-titres)
          <textarea className={`${champ} min-h-16`} value={s.phrase} maxLength={220} onChange={(e) => onChange({ phrase: e.target.value })} />
        </label>
        <label className="text-sm">
          Gros texte à l'écran
          <input className={champ} value={s.texte} maxLength={60} onChange={(e) => onChange({ texte: e.target.value })} />
        </label>
        <label className="text-sm">
          Mots en couleur (séparés par une virgule)
          <input
            className={champ}
            value={s.mots_forts.join(", ")}
            onChange={(e) => onChange({ mots_forts: e.target.value.split(",").map((m) => m.trim()).filter(Boolean).slice(0, 3) })}
          />
        </label>

        <div className="text-sm md:col-span-2">
          <span>Emoji</span>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <button type="button" className={`rounded-lg border px-2.5 py-1 text-xs ${!s.emoji ? "border-accent text-texte" : "border-bord text-doux"}`} onClick={() => onChange({ emoji: "" })}>
              Aucun
            </button>
            {(emojis ? EMOJIS : EMOJIS.slice(0, 10)).map((e) => (
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

        <Choix libelle="Effet" valeur={s.effet} options={EFFETS} onChange={(effet) => onChange({ effet })} />
        <Choix libelle="Son au début" valeur={s.son} options={SONS} onChange={(son) => onChange({ son })} />
        {!derniere && <Choix libelle="Transition vers la suivante" valeur={s.transition} options={TRANSITIONS} onChange={(transition) => onChange({ transition })} />}
        <Choix libelle="Image" valeur={s.source} options={SOURCES} onChange={(source) => onChange({ source })} />

        {s.source !== "capture" && (
          <div className="text-sm md:col-span-2">
            <label>
              {s.source === "video" ? "Recherche de la vidéo (mots-clés, en anglais de préférence)" : "Description de l'image IA (en anglais)"}
              <input
                className={champ}
                value={s.source === "video" ? s.recherche : s.prompt || s.recherche}
                onChange={(e) => onChange(s.source === "video" ? { recherche: e.target.value, choix: null, apercu: null } : { prompt: e.target.value })}
              />
            </label>
            {s.source === "video" && (
              <button type="button" className={`${boutonSecondaire} mt-2 inline-flex items-center gap-2`} disabled={recherche || !s.recherche.trim()} onClick={chercher}>
                {recherche ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <Wand2 size={14} aria-hidden />}
                Voir d'autres vidéos
              </button>
            )}
            {sequences && (
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
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
      </div>
    </article>
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
