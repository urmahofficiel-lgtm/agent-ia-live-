import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Clapperboard, ImageIcon, LoaderCircle, PenLine, Plus, RotateCcw, Send, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Carte, Erreur, Pastille, Titre, bouton, boutonSecondaire, champ } from "@/components/ui";
import { LogoPlateforme } from "@/components/LogoPlateforme";
import { supabase } from "@/lib/supabase";
import { useReglages, useRequete, useStylesParDefaut, useUserId } from "@/lib/donnees";
import { PLATEFORMES, estManuel, nomPlateforme } from "@/lib/plateformes";
import { MARCHES, MARCHE_DEFAUT, estEtranger, marcheDe } from "@/lib/marches";
import { creerVideo, genererBrouillon, publierTache, regenererVisuel } from "@/lib/agent.functions";
import { jetonSession } from "@/lib/session";
import { STATUTS } from "@/lib/statuts";
import { LIBELLE_TYPE, type StatutTache, type Tache } from "@/lib/types";
import { creerCopies, statutPourReseau, supprimerPublications } from "@/lib/publications";
import { ChoixReseaux } from "@/components/ChoixReseaux";
import { BoutonPartage } from "@/components/BoutonPartage";
import { MenuStyle } from "@/components/StylesCreatifs";
import { STYLES_IMAGE, STYLES_VIDEO, lireStyleVideo, nomStyleVideo, type StyleImage, type StyleVideo } from "@/lib/styles";

export const Route = createFileRoute("/taches")({ component: Publications });

const ONGLETS: { id: string; libelle: string; statuts: StatutTache[]; vide: string }[] = [
  { id: "partager", libelle: "À partager", statuts: ["a_partager"], vide: "Rien à partager. Les publications « Facebook perso » arrivent ici à l'heure prévue." },
  { id: "valider", libelle: "À valider", statuts: ["a_valider"], vide: "Rien à valider. L'agent déposera ici ses prochains brouillons." },
  { id: "planifiees", libelle: "Planifiées", statuts: ["en_attente", "en_cours"], vide: "Aucune publication planifiée. Validez un brouillon pour le planifier." },
  { id: "publiees", libelle: "Publiées", statuts: ["terminee"], vide: "Rien de publié pour l'instant." },
  { id: "echouees", libelle: "Échouées", statuts: ["echouee"], vide: "Aucun échec." },
  { id: "annulees", libelle: "Annulées", statuts: ["annulee"], vide: "Aucune publication annulée." },
];

type Travail = { id: string; quoi: "texte" | "image" | "video" | "publication" };

const EN_COURS: Record<Travail["quoi"], string> = {
  texte: "Rédaction…",
  image: "Création de l'image…",
  video: "Création de la vidéo (1 à 3 min)…",
  publication: "Publication…",
};

function Publications() {
  const userId = useUserId();
  const liste = useRequete<Tache[]>(
    () => supabase().from("taches").select("*").order("created_at", { ascending: false }).limit(200),
    [userId],
  );
  const [onglet, setOnglet] = useState<string | null>(null);
  const [formulaire, setFormulaire] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [travail, setTravail] = useState<Travail | null>(null);
  const styles = useStylesParDefaut();

  // Appel serveur commun : affiche l'erreur éventuelle puis recharge la liste.
  async function action(t: Travail, appel: (jeton: string) => Promise<{ ok: boolean; erreur?: string }>) {
    setTravail(t);
    setErreur(null);
    try {
      const r = await appel(await jetonSession());
      if (!r.ok) setErreur(r.erreur ?? "Erreur");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible de joindre le serveur. Réessayez.");
    }
    setTravail(null);
    await liste.recharger();
  }

  async function changerStatut(id: string, statut: StatutTache) {
    const { error } = await supabase().from("taches").update({ statut }).eq("id", id);
    setErreur(error?.message ?? null);
    await liste.recharger();
  }

  const actions: Actions = {
    travail,
    styles: { video: styles.video, image: styles.image },
    rediger: (id) => action({ id, quoi: "texte" }, (jeton) => genererBrouillon({ data: { tacheId: id, jeton } })),
    image: (id, style) => action({ id, quoi: "image" }, (jeton) => regenererVisuel({ data: { tacheId: id, jeton, style } })),
    video: (id, style) => action({ id, quoi: "video" }, (jeton) => creerVideo({ data: { tacheId: id, jeton, style } })),
    publier: (id) => action({ id, quoi: "publication" }, (jeton) => publierTache({ data: { tacheId: id, jeton } })),
    statut: changerStatut,
    recharger: liste.recharger,
    supprimer: async (t) => {
      if (!window.confirm(`Supprimer définitivement « ${t.titre} » ? Son texte, son image et sa vidéo seront effacés.`)) return;
      setErreur(await supprimerPublications([t]));
      await liste.recharger();
    },
  };

  async function viderOnglet(liste_: Tache[], libelle: string) {
    if (!window.confirm(`Supprimer définitivement les ${liste_.length} publications « ${libelle} » ? Textes, images et vidéos seront effacés.`)) return;
    setErreur(await supprimerPublications(liste_));
    await liste.recharger();
  }

  const taches = liste.data ?? [];
  // Une vidéo se crée en arrière-plan (1 à 3 min) : la liste se met à jour
  // seule tant qu'une création est en cours, même si la page a été rechargée.
  const videoEnCours = taches.some((t) => etatVideo(t) === "en_cours");
  const recharger = liste.recharger;
  useEffect(() => {
    if (!videoEnCours) return;
    const id = setInterval(() => void recharger(), 8000);
    return () => clearInterval(id);
  }, [videoEnCours, recharger]);

  // Par défaut : « À partager » s'il y a quelque chose à publier soi-même, sinon « À valider ».
  const parDefaut = taches.some((t) => t.statut === "a_partager") ? "partager" : "valider";
  const courant = ONGLETS.find((o) => o.id === (onglet ?? parDefaut)) ?? ONGLETS[1];
  const visibles = taches.filter((t) => courant.statuts.includes(t.statut));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-4">
        <Titre sous="Relisez, validez et planifiez ce que l'agent prépare pour vos réseaux.">Publications</Titre>
        <button className={`${bouton} mb-6 flex items-center gap-2`} onClick={() => setFormulaire((v) => !v)} aria-expanded={formulaire}>
          {formulaire ? <X size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
          {formulaire ? "Fermer" : "Nouvelle publication"}
        </button>
      </div>

      {formulaire && (
        <NouvelleTache
          onCree={async () => {
            setFormulaire(false);
            setOnglet("valider");
            await liste.recharger();
          }}
        />
      )}

      <div role="tablist" aria-label="Filtrer par statut" className="mb-5 flex gap-1 overflow-x-auto border-b border-bord">
        {ONGLETS.map((o) => {
          const n = taches.filter((t) => o.statuts.includes(t.statut)).length;
          const actif = o.id === courant.id;
          return (
            <button
              key={o.id}
              role="tab"
              aria-selected={actif}
              onClick={() => setOnglet(o.id)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium ${
                actif ? "border-accent text-texte" : "border-transparent text-doux hover:text-texte"
              }`}
            >
              {o.libelle}
              <span className={`rounded-full px-1.5 font-mono text-xs ${actif ? "bg-accent/15 text-accent" : "bg-bord text-doux"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <Erreur message={erreur ?? liste.erreur} />

      {(courant.id === "annulees" || courant.id === "echouees") && visibles.length > 1 && (
        <div className="mb-3 flex justify-end">
          <button
            className={`${boutonSecondaire} flex items-center gap-2 hover:border-erreur/60 hover:text-erreur`}
            onClick={() => viderOnglet(visibles, courant.libelle)}
          >
            <Trash2 size={15} aria-hidden />
            Tout supprimer ({visibles.length})
          </button>
        </div>
      )}

      {liste.data && visibles.length === 0 ? (
        <Carte className="text-sm text-doux">{courant.vide}</Carte>
      ) : (
        <ul className="mt-3 space-y-3">
          {visibles.map((t) => (
            <li key={t.id}>
              <CartePublication tache={t} actions={actions} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

type Actions = {
  travail: Travail | null;
  // Styles par défaut (Réglages), proposés en premier dans les menus.
  styles: { video: StyleVideo; image: StyleImage };
  rediger: (id: string) => void;
  image: (id: string, style?: string) => void;
  video: (id: string, style?: string) => void;
  publier: (id: string) => void;
  statut: (id: string, s: StatutTache) => void;
  recharger: () => Promise<void>;
  supprimer: (t: Tache) => void;
};

// État réel de la vidéo : une création « en cours » depuis plus de 6 minutes a
// été interrompue (limite d'exécution du serveur).
function etatVideo(t: Tache): "en_cours" | "echec" | "prete" | null {
  const r = t.resultat;
  if (r?.video_etat === "en_cours") {
    const depuis = Date.now() - new Date(r.video_debut ?? 0).getTime();
    return depuis > 6 * 60_000 ? "echec" : "en_cours";
  }
  return r?.video_etat ?? (r?.video_url ? "prete" : null);
}

function CartePublication({ tache: t, actions: a }: { tache: Tache; actions: Actions }) {
  const [deplie, setDeplie] = useState(false);
  const [edition, setEdition] = useState(false);
  const modifiable = ["a_valider", "en_attente", "a_partager"].includes(t.statut);
  const editable = modifiable || t.statut === "echouee" || t.statut === "annulee";
  const brouillon = t.resultat?.brouillon;
  const video = t.resultat?.video_url;
  const image = t.resultat?.visuel_url;
  const occupe = a.travail !== null;
  const ici = a.travail?.id === t.id ? a.travail.quoi : null;
  const estPublication = t.type === "publication";
  const sansReseau = estPublication && !t.plateforme;
  const manuel = estManuel(t.plateforme);
  const video_etat = ici === "video" ? "en_cours" : etatVideo(t);
  const styleVideo = t.resultat?.video_style ? lireStyleVideo(t.resultat.video_style) : null;

  // Une seule action principale, selon l'état de la publication.
  let principale: ReactNode = null;
  if (modifiable && !brouillon) {
    principale = (
      <BoutonAction principal occupe={occupe} enCours={ici === "texte"} onClick={() => a.rediger(t.id)} icone={<PenLine size={15} />}>
        Rédiger avec l'IA
      </BoutonAction>
    );
  } else if (t.statut === "a_valider") {
    principale = (
      <button className={bouton} disabled={occupe} title="L'agent publiera à l'heure prévue (s'il est démarré)" onClick={() => a.statut(t.id, "en_attente")}>
        Valider
      </button>
    );
  } else if (manuel && brouillon && ["en_attente", "a_partager"].includes(t.statut)) {
    principale = <BoutonPartage principal tache={t} onPublie={a.recharger} />;
  } else if (t.statut === "en_attente" && estPublication) {
    principale = (
      <BoutonAction principal occupe={occupe || sansReseau} enCours={ici === "publication"} onClick={() => a.publier(t.id)} icone={<Send size={15} />}>
        Publier maintenant
      </BoutonAction>
    );
  } else if (t.statut === "echouee" || t.statut === "annulee") {
    principale = (
      <button className={boutonSecondaire} onClick={() => a.statut(t.id, "a_valider")}>
        Remettre à valider
      </button>
    );
  }

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-bord bg-carte p-4 sm:flex-row">
      <Apercu video={video} image={image} titre={t.titre} enCours={ici === "image" || video_etat === "en_cours"} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {t.plateforme && <LogoPlateforme id={t.plateforme} taille={22} />}
          <h3 className="font-semibold">{t.titre}</h3>
          <Pastille ton={STATUTS[t.statut].ton}>{STATUTS[t.statut].libelle}</Pastille>
          {video && video_etat !== "en_cours" && (
            <Pastille ton="plan">Vidéo{styleVideo && styleVideo !== "classique" ? ` · ${nomStyleVideo(styleVideo)}` : ""}</Pastille>
          )}
          {sansReseau && (
            <Pastille ton="alerte">
              <AlertTriangle size={12} aria-hidden />
              Réseau à choisir
            </Pastille>
          )}
        </div>
        <p className="mt-1 text-xs text-doux">
          {estPublication ? (t.plateforme ? nomPlateforme(t.plateforme) : "Réseau non choisi") : LIBELLE_TYPE[t.type]}
          {/* Publication pour un compte étranger : son pays. */}
          {estEtranger(t.marche) && ` · ${marcheDe(t.marche).drapeau} ${marcheDe(t.marche).pays}`}
          {t.planifiee_pour
            ? ` · prévue le ${new Date(t.planifiee_pour).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}`
            : ` · créée le ${new Date(t.created_at).toLocaleDateString("fr-FR")}`}
        </p>

        {edition ? (
          <EditeurPublication
            tache={t}
            onFini={async (enregistre) => {
              setEdition(false);
              if (enregistre) await a.recharger();
            }}
          />
        ) : brouillon ? (
          <div className="mt-3">
            <p className={`text-sm whitespace-pre-wrap ${deplie ? "" : "line-clamp-4"}`}>{brouillon}</p>
            {brouillon.length > 240 && (
              <button className="mt-1 text-xs text-accent hover:underline" onClick={() => setDeplie((v) => !v)}>
                {deplie ? "Réduire" : "Lire tout"}
              </button>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-doux">
            {ici === "texte" ? "L'agent rédige…" : t.consigne || "Pas encore de texte : l'agent le rédigera à son prochain passage."}
          </p>
        )}

        {(ici || video_etat === "en_cours") && (
          <p className="mt-3 flex items-center gap-2 text-xs text-accent" aria-live="polite">
            <LoaderCircle size={14} className="animate-spin" aria-hidden />
            {EN_COURS[ici ?? "video"]}
            <Link to="/en-direct" className="underline">
              Suivre en direct
            </Link>
          </p>
        )}

        {video_etat === "echec" && !ici && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-erreur/10 px-3 py-2 text-sm text-erreur" role="status">
            <span>
              La vidéo n'a pas pu être créée
              {t.resultat?.video_erreur ? ` : ${t.resultat.video_erreur}` : " : création interrompue."}
            </span>
            {modifiable && (
              <button
                className="inline-flex items-center gap-1.5 font-medium underline disabled:opacity-50"
                disabled={occupe}
                onClick={() => a.video(t.id, styleVideo ?? undefined)}
              >
                <RotateCcw size={14} aria-hidden />
                Réessayer
              </button>
            )}
          </div>
        )}

        {(principale || editable || t.statut === "terminee") && !edition && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-bord pt-3">
            {principale}
            {editable && (
              <BoutonAction occupe={occupe} enCours={false} onClick={() => setEdition(true)} icone={<SlidersHorizontal size={15} />}>
                Modifier
              </BoutonAction>
            )}
            {brouillon && t.statut === "a_valider" && estPublication && manuel && <BoutonPartage tache={t} onPublie={a.recharger} />}
            {brouillon && t.statut === "a_valider" && estPublication && !manuel && (
              <BoutonAction
                occupe={occupe || sansReseau}
                enCours={ici === "publication"}
                onClick={() => a.publier(t.id)}
                icone={<Send size={15} />}
                titre={sansReseau ? "Choisissez d'abord un réseau (Modifier)" : undefined}
              >
                Publier maintenant
              </BoutonAction>
            )}
            {modifiable && brouillon && (
              <BoutonAction occupe={occupe} enCours={ici === "texte"} onClick={() => a.rediger(t.id)} icone={<PenLine size={15} />}>
                Réécrire
              </BoutonAction>
            )}
            {modifiable && estPublication && brouillon && (
              <MenuStyle
                options={STYLES_IMAGE}
                defaut={a.styles.image}
                occupe={occupe}
                enCours={ici === "image"}
                icone={<ImageIcon size={15} />}
                onChoix={(style) => a.image(t.id, style)}
              >
                {image ? "Nouvelle image" : "Créer l'image"}
              </MenuStyle>
            )}
            {modifiable && estPublication && (
              <MenuStyle
                options={STYLES_VIDEO}
                defaut={a.styles.video}
                occupe={occupe || video_etat === "en_cours"}
                enCours={video_etat === "en_cours"}
                icone={<Clapperboard size={15} />}
                titre="Vidéo verticale de 20 à 45 s : script, séquences filmées, textes à l'écran et voix off"
                onChoix={(style) => a.video(t.id, style)}
              >
                {video ? "Refaire la vidéo" : "Créer une vidéo"}
              </MenuStyle>
            )}
            {modifiable && (
              <button className="ml-auto text-sm text-doux hover:text-erreur disabled:opacity-50" disabled={occupe} onClick={() => a.statut(t.id, "annulee")}>
                Annuler
              </button>
            )}
            {(t.statut === "annulee" || t.statut === "echouee" || t.statut === "terminee") && (
              <button
                className="ml-auto flex items-center gap-1.5 text-sm text-doux hover:text-erreur disabled:opacity-50"
                disabled={occupe}
                onClick={() => a.supprimer(t)}
              >
                <Trash2 size={14} aria-hidden />
                Supprimer
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// Date ISO → valeur d'un champ datetime-local (heure locale).
function versChampDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Modification manuelle : sujet, réseau, date et heure, texte, médias.
function EditeurPublication({ tache: t, onFini }: { tache: Tache; onFini: (enregistre: boolean) => void }) {
  const [titre, setTitre] = useState(t.titre);
  const userId = useUserId();
  const [reseaux, setReseaux] = useState<string[]>(t.plateforme ? [t.plateforme] : []);
  const [quand, setQuand] = useState(versChampDate(t.planifiee_pour));
  const [texte, setTexte] = useState(t.resultat?.brouillon ?? "");
  const [consigne, setConsigne] = useState(t.consigne);
  const [sansVideo, setSansVideo] = useState(false);
  const [sansImage, setSansImage] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const estPublication = t.type === "publication";

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    const resultat: Record<string, unknown> = { ...(t.resultat ?? {}) };
    if (texte.trim()) resultat.brouillon = texte;
    else delete resultat.brouillon;
    if (sansVideo) for (const k of ["video_url", "video_script", "video_le", "video_etat", "video_erreur", "video_debut"]) delete resultat[k];
    if (sansImage) delete resultat.visuel_url;
    const commun = {
      titre: titre.trim() || t.titre,
      consigne,
      planifiee_pour: quand ? new Date(quand).toISOString() : null,
    };
    // Cette publication garde le premier réseau choisi (le sien s'il est
    // toujours coché) ; les autres réseaux reçoivent chacun une copie.
    const principal = t.plateforme && reseaux.includes(t.plateforme) ? t.plateforme : (reseaux[0] ?? null);
    const { error } = await supabase()
      .from("taches")
      .update({ ...commun, plateforme: principal, resultat, statut: statutPourReseau(t.statut, principal) })
      .eq("id", t.id);
    const autres = reseaux.filter((r) => r !== principal);
    const erreurCopies =
      !error && autres.length && userId ? await creerCopies(userId, { ...commun, statut: t.statut, resultat, marche: t.marche }, autres) : null;
    setEnvoi(false);
    if (error || erreurCopies) return setErreur(error?.message ?? erreurCopies);
    onFini(true);
  }

  return (
    <form onSubmit={enregistrer} className="mt-3 space-y-3 rounded-xl border border-bord bg-fond/60 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          Sujet
          <input className={`${champ} mt-1`} value={titre} onChange={(e) => setTitre(e.target.value)} required />
        </label>
        {estPublication && (
          <div className="sm:col-span-2">
            <ChoixReseaux valeur={reseaux} onChange={setReseaux} />
          </div>
        )}
        <label className="text-sm">
          Date et heure de publication
          <input className={`${champ} mt-1`} type="datetime-local" value={quand} onChange={(e) => setQuand(e.target.value)} />
          <span className="mt-1 block text-xs text-doux">Vide : dès que vous validez.</span>
        </label>
      </div>
      <label className="block text-sm">
        Texte publié
        <textarea
          className={`${champ} mt-1 min-h-40 leading-relaxed`}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Laissez vide pour que l'agent le rédige."
        />
        <span className="mt-1 block text-right text-xs text-doux tabular-nums">{texte.length} caractères</span>
      </label>
      <label className="block text-sm">
        Consigne pour l'agent
        <textarea
          className={`${champ} mt-1 min-h-16`}
          value={consigne}
          onChange={(e) => setConsigne(e.target.value)}
          placeholder="Utilisée quand vous cliquez sur « Réécrire » ou « Créer une vidéo »."
        />
      </label>
      {(t.resultat?.video_url || t.resultat?.visuel_url) && (
        <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <legend className="sr-only">Médias</legend>
          {t.resultat?.video_url && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sansVideo} onChange={(e) => setSansVideo(e.target.checked)} />
              Retirer la vidéo (l'image sera publiée)
            </label>
          )}
          {t.resultat?.visuel_url && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sansImage} onChange={(e) => setSansImage(e.target.checked)} />
              Retirer l'image
            </label>
          )}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button className={`${bouton} flex items-center gap-2`} disabled={envoi}>
          {envoi && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
          Enregistrer
        </button>
        <button type="button" className={boutonSecondaire} onClick={() => onFini(false)}>
          Annuler les modifications
        </button>
      </div>
      <Erreur message={erreur} />
    </form>
  );
}

function BoutonAction({
  children,
  icone,
  onClick,
  occupe,
  enCours,
  principal,
  titre,
}: {
  children: ReactNode;
  icone: ReactNode;
  onClick: () => void;
  occupe: boolean;
  enCours: boolean;
  principal?: boolean;
  titre?: string;
}) {
  return (
    <button className={`${principal ? bouton : boutonSecondaire} flex items-center gap-1.5`} disabled={occupe} onClick={onClick} title={titre}>
      <span aria-hidden>{enCours ? <LoaderCircle size={15} className="animate-spin" /> : icone}</span>
      {children}
    </button>
  );
}

function Apercu({ video, image, titre, enCours }: { video?: string; image?: string; titre: string; enCours: boolean }) {
  const cadre = "relative block w-full shrink-0 self-start overflow-hidden rounded-xl border border-bord bg-fond sm:w-40";
  if (enCours)
    return (
      <div className={`${cadre} flex aspect-[4/5] items-center justify-center`}>
        <LoaderCircle className="animate-spin text-accent" aria-label="Création en cours" />
      </div>
    );
  if (video)
    return (
      <div className={cadre}>
        <video src={video} controls playsInline preload="metadata" className="aspect-[9/16] w-full bg-black object-cover" />
      </div>
    );
  if (image)
    return (
      <a href={image} target="_blank" rel="noreferrer" className={cadre}>
        <img src={image} alt={`Visuel de « ${titre} »`} loading="lazy" className="aspect-video w-full object-cover sm:aspect-[4/5]" />
      </a>
    );
  return (
    <div className={`${cadre} hidden aspect-[4/5] items-center justify-center text-xs text-doux sm:flex`}>
      <span className="flex flex-col items-center gap-1">
        <ImageIcon size={20} aria-hidden />
        Pas de visuel
      </span>
    </div>
  );
}

function NouvelleTache({ onCree }: { onCree: () => Promise<void> }) {
  const userId = useUserId();
  const { reglages } = useReglages();
  const [reseaux, setReseaux] = useState<string[]>([]);
  const [titre, setTitre] = useState("");
  const [consigne, setConsigne] = useState("");
  const [quand, setQuand] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  // Langue et pays : proposés seulement si un compte étranger est connecté.
  const comptes = useRequete<{ marche: string }[]>(
    () => supabase().from("comptes_connectes").select("marche").eq("statut", "connecte"),
    [userId],
  );
  const marches = MARCHES.filter((m) => m.id === MARCHE_DEFAUT || comptes.data?.some((c) => c.marche === m.id));
  const [marche, setMarche] = useState(MARCHE_DEFAUT);

  async function creer(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (reseaux.length === 0) return setErreur("Choisissez au moins un réseau.");
    const statut: StatutTache = reglages.validation_requise ? "a_valider" : "en_attente";
    const erreur = await creerCopies(
      userId,
      {
        titre,
        consigne,
        statut,
        planifiee_pour: quand ? new Date(quand).toISOString() : null,
        resultat: null,
        marche: marche === MARCHE_DEFAUT ? null : marche,
      },
      reseaux,
    );
    setErreur(erreur);
    if (!erreur) await onCree();
  }

  return (
    <Carte className="mb-6">
      <form onSubmit={creer} className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <ChoixReseaux valeur={reseaux} onChange={setReseaux} />
        </div>
        {marches.length > 1 && (
          <label className="text-sm md:col-span-2">
            Langue et pays
            <select className={champ} value={marche} onChange={(e) => setMarche(e.target.value)}>
              {marches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.drapeau} {m.libelle}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm md:col-span-2">
          Sujet
          <input className={champ} required value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. : Devis en 2 minutes depuis le chantier" />
        </label>
        <label className="text-sm md:col-span-2">
          Consigne pour l'agent (optionnel)
          <textarea
            className={`${champ} min-h-24`}
            value={consigne}
            onChange={(e) => setConsigne(e.target.value)}
            placeholder="Ex. : Mettre en avant la signature électronique, ton direct, finir par le lien vers le site."
          />
        </label>
        <label className="text-sm">
          Date de publication (optionnel)
          <input className={champ} type="datetime-local" value={quand} onChange={(e) => setQuand(e.target.value)} />
        </label>
        <div className="flex items-end">
          <button className={bouton}>Créer</button>
        </div>
      </form>
      <Erreur message={erreur} />
    </Carte>
  );
}
