import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { Clapperboard, ImageIcon, LoaderCircle, PenLine, Plus, Send, X } from "lucide-react";
import { Carte, Erreur, Pastille, Titre, bouton, boutonSecondaire, champ } from "@/components/ui";
import { LogoPlateforme } from "@/components/LogoPlateforme";
import { supabase } from "@/lib/supabase";
import { useReglages, useRequete, useUserId } from "@/lib/donnees";
import { PLATEFORMES, nomPlateforme } from "@/lib/plateformes";
import { creerVideo, genererBrouillon, publierTache, regenererVisuel } from "@/lib/agent.functions";
import { jetonSession } from "@/lib/session";
import { STATUTS } from "@/lib/statuts";
import { LIBELLE_TYPE, type StatutTache, type Tache, type TypeTache } from "@/lib/types";

export const Route = createFileRoute("/taches")({ component: Publications });

// Types qui produisent quelque chose de visible par d'autres : ils passent par
// « à valider » tant que la validation est activée.
const TYPES_A_VALIDER: TypeTache[] = ["publication", "reponse", "prospection", "relance"];

const ONGLETS: { id: string; libelle: string; statuts: StatutTache[]; vide: string }[] = [
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
  const [onglet, setOnglet] = useState(ONGLETS[0].id);
  const [formulaire, setFormulaire] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [travail, setTravail] = useState<Travail | null>(null);

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
    rediger: (id) => action({ id, quoi: "texte" }, (jeton) => genererBrouillon({ data: { tacheId: id, jeton } })),
    image: (id) => action({ id, quoi: "image" }, (jeton) => regenererVisuel({ data: { tacheId: id, jeton } })),
    video: (id) => action({ id, quoi: "video" }, (jeton) => creerVideo({ data: { tacheId: id, jeton } })),
    publier: (id) => action({ id, quoi: "publication" }, (jeton) => publierTache({ data: { tacheId: id, jeton } })),
    statut: changerStatut,
  };

  const taches = liste.data ?? [];
  const courant = ONGLETS.find((o) => o.id === onglet) ?? ONGLETS[0];
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
  rediger: (id: string) => void;
  image: (id: string) => void;
  video: (id: string) => void;
  publier: (id: string) => void;
  statut: (id: string, s: StatutTache) => void;
};

function CartePublication({ tache: t, actions: a }: { tache: Tache; actions: Actions }) {
  const [deplie, setDeplie] = useState(false);
  const modifiable = ["a_valider", "en_attente"].includes(t.statut);
  const brouillon = t.resultat?.brouillon;
  const video = t.resultat?.video_url;
  const image = t.resultat?.visuel_url;
  const occupe = a.travail !== null;
  const ici = a.travail?.id === t.id ? a.travail.quoi : null;
  const estPublication = t.type === "publication";

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
  } else if (t.statut === "en_attente" && estPublication) {
    principale = (
      <BoutonAction principal occupe={occupe} enCours={ici === "publication"} onClick={() => a.publier(t.id)} icone={<Send size={15} />}>
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
      <Apercu video={video} image={image} titre={t.titre} enCours={ici === "image" || ici === "video"} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {t.plateforme && <LogoPlateforme id={t.plateforme} taille={22} />}
          <h3 className="font-semibold">{t.titre}</h3>
          <Pastille ton={STATUTS[t.statut].ton}>{STATUTS[t.statut].libelle}</Pastille>
        </div>
        <p className="mt-1 text-xs text-doux">
          {estPublication ? nomPlateforme(t.plateforme) : LIBELLE_TYPE[t.type]}
          {t.planifiee_pour
            ? ` · prévue le ${new Date(t.planifiee_pour).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}`
            : ` · créée le ${new Date(t.created_at).toLocaleDateString("fr-FR")}`}
        </p>

        {brouillon ? (
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

        {ici && (
          <p className="mt-3 text-xs text-accent" aria-live="polite">
            {EN_COURS[ici]}{" "}
            <Link to="/en-direct" className="underline">
              Suivre en direct
            </Link>
          </p>
        )}

        {(principale || modifiable) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-bord pt-3">
            {principale}
            {brouillon && t.statut === "a_valider" && estPublication && (
              <BoutonAction occupe={occupe} enCours={ici === "publication"} onClick={() => a.publier(t.id)} icone={<Send size={15} />}>
                Publier maintenant
              </BoutonAction>
            )}
            {modifiable && brouillon && (
              <BoutonAction occupe={occupe} enCours={ici === "texte"} onClick={() => a.rediger(t.id)} icone={<PenLine size={15} />}>
                Réécrire
              </BoutonAction>
            )}
            {modifiable && estPublication && brouillon && (
              <BoutonAction occupe={occupe} enCours={ici === "image"} onClick={() => a.image(t.id)} icone={<ImageIcon size={15} />}>
                {image ? "Nouvelle image" : "Créer l'image"}
              </BoutonAction>
            )}
            {modifiable && estPublication && (
              <BoutonAction
                occupe={occupe}
                enCours={ici === "video"}
                onClick={() => a.video(t.id)}
                icone={<Clapperboard size={15} />}
                titre="Vidéo verticale de 30 à 45 s : script, séquences filmées, textes à l'écran et voix off"
              >
                {video ? "Refaire la vidéo" : "Créer une vidéo"}
              </BoutonAction>
            )}
            {modifiable && (
              <button className="ml-auto text-sm text-doux hover:text-erreur disabled:opacity-50" disabled={occupe} onClick={() => a.statut(t.id, "annulee")}>
                Annuler
              </button>
            )}
          </div>
        )}
      </div>
    </article>
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
  const [type, setType] = useState<TypeTache>("publication");
  const [plateforme, setPlateforme] = useState("linkedin");
  const [titre, setTitre] = useState("");
  const [consigne, setConsigne] = useState("");
  const [quand, setQuand] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    const statut: StatutTache = reglages.validation_requise && TYPES_A_VALIDER.includes(type) ? "a_valider" : "en_attente";
    const { error } = await supabase()
      .from("taches")
      .insert({
        user_id: userId,
        type,
        plateforme: type === "appareil" ? null : plateforme,
        titre,
        consigne,
        statut,
        planifiee_pour: quand ? new Date(quand).toISOString() : null,
      });
    setErreur(error?.message ?? null);
    if (!error) await onCree();
  }

  return (
    <Carte className="mb-6">
      <form onSubmit={creer} className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          Type
          <select className={champ} value={type} onChange={(e) => setType(e.target.value as TypeTache)}>
            {Object.entries(LIBELLE_TYPE).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {type !== "appareil" && (
          <label className="text-sm">
            Réseau
            <select className={champ} value={plateforme} onChange={(e) => setPlateforme(e.target.value)}>
              {PLATEFORMES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
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
