import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Play, X } from "lucide-react";
import { Carte, Erreur, Pastille, Titre, bouton } from "@/components/ui";
import { LogoPlateforme } from "@/components/LogoPlateforme";
import { supabase } from "@/lib/supabase";
import { jetonSession } from "@/lib/session";
import { useUserId } from "@/lib/donnees";
import { travaillerMaintenant } from "@/lib/agent.functions";
import { LIBELLES_ETAPES, construireSeances, type Etape, type Seance } from "@/lib/activite";
import { STATUTS } from "@/lib/statuts";
import type { Evenement, Tache } from "@/lib/types";

export const Route = createFileRoute("/en-direct")({ component: EnDirect });

type TacheResumee = Pick<Tache, "id" | "titre" | "plateforme" | "statut" | "resultat">;

// Le moteur automatique passe toutes les 5 minutes (pg_cron).
function minutesAvantPassage(maintenant: Date) {
  return 5 - (maintenant.getMinutes() % 5);
}

const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

function jour(iso: string) {
  const d = new Date(iso);
  const auj = new Date();
  const hier = new Date(auj.getTime() - 86_400_000);
  if (d.toDateString() === auj.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === hier.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function EnDirect() {
  const userId = useUserId();
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [taches, setTaches] = useState<Record<string, TacheResumee>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [connecte, setConnecte] = useState(false);
  const [lance, setLance] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!userId) return;
    const sb = supabase();

    const chargerTaches = async (ids: string[]) => {
      if (ids.length === 0) return;
      const { data } = await sb.from("taches").select("id, titre, plateforme, statut, resultat").in("id", ids);
      if (data) setTaches((prev) => ({ ...prev, ...Object.fromEntries((data as TacheResumee[]).map((t) => [t.id, t])) }));
    };

    sb.from("evenements_taches")
      .select("id, tache_id, niveau, message, capture_url, created_at")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        setErreur(error?.message ?? null);
        const liste = (data as Evenement[]) ?? [];
        setEvenements(liste);
        void chargerTaches([...new Set(liste.flatMap((e) => (e.tache_id ? [e.tache_id] : [])))]);
      });

    const canal = sb
      .channel("evenements-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "evenements_taches", filter: `user_id=eq.${userId}` },
        (payload) => {
          const e = payload.new as Evenement;
          setEvenements((prev) => [e, ...prev].slice(0, 300));
          setMaintenant(Date.now());
          // Titre, statut et médias de la publication à jour à chaque étape.
          if (e.tache_id) void chargerTaches([e.tache_id]);
        },
      )
      .subscribe((statut) => setConnecte(statut === "SUBSCRIBED"));

    return () => {
      void sb.removeChannel(canal);
    };
  }, [userId]);

  async function lancer() {
    setLance(true);
    setErreur(null);
    try {
      const r = await travaillerMaintenant({ data: { jeton: await jetonSession() } });
      if (!r.ok) setErreur(r.erreur);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setLance(false);
  }

  const seances = useMemo(() => construireSeances(evenements, maintenant), [evenements, maintenant]);
  const enCours = seances.find((s) => s.active);
  const actif = lance || !!enCours;

  // Séances regroupées par jour.
  const parJour = useMemo(() => {
    const groupes: { jour: string; seances: Seance[] }[] = [];
    for (const s of seances) {
      const j = jour(s.fin);
      const dernier = groupes[groupes.length - 1];
      if (dernier?.jour === j) dernier.seances.push(s);
      else groupes.push({ jour: j, seances: [s] });
    }
    return groupes;
  }, [seances]);

  return (
    <>
      <Titre sous="Chaque publication préparée par l'agent, étape par étape, au moment où il y travaille.">En direct</Titre>

      <Carte className={`relative mb-8 overflow-hidden p-0 ${actif ? "border-accent/60" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="relative flex size-3 shrink-0" aria-hidden>
              {actif && <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />}
              <span className={`relative inline-flex size-3 rounded-full ${actif ? "bg-accent" : connecte ? "bg-ok" : "bg-alerte"}`} />
            </span>
            <div className="min-w-0">
              <p className="font-titre text-lg font-semibold">{actif ? "L'agent travaille" : "L'agent est en veille"}</p>
              <p className="text-sm text-doux" aria-live="polite">
                {enCours
                  ? `${enCours.tacheId ? `« ${taches[enCours.tacheId]?.titre ?? "Publication"} » — ` : ""}${enCours.resume}`
                  : lance
                    ? "Démarrage…"
                    : `Prochain passage automatique dans ${minutesAvantPassage(new Date(maintenant))} min · ${connecte ? "suivi en direct actif" : "connexion au suivi…"}`}
              </p>
            </div>
          </div>
          <button className={`${bouton} flex items-center gap-2`} disabled={lance} onClick={lancer}>
            {lance ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Play size={16} aria-hidden />}
            {lance ? "Travail en cours…" : "Lancer l'agent maintenant"}
          </button>
        </div>
        {actif && <div className="barre-activite" aria-hidden />}
      </Carte>
      <Erreur message={erreur} />

      {seances.length === 0 ? (
        <Carte className="text-sm text-doux">
          Rien pour l'instant. Donnez une consigne depuis le{" "}
          <Link to="/" className="text-accent underline">
            tableau de bord
          </Link>{" "}
          ou créez un calendrier depuis la page{" "}
          <Link to="/strategie" className="text-accent underline">
            Stratégie
          </Link>
          , puis lancez l'agent.
        </Carte>
      ) : (
        <div className="space-y-8">
          {parJour.map((g) => (
            <section key={g.jour}>
              <h2 className="mb-3 font-mono text-xs tracking-widest text-doux uppercase">{g.jour}</h2>
              <ul className="space-y-3">
                {g.seances.map((s) => (
                  <li key={s.cle}>
                    <CarteSeance seance={s} tache={s.tacheId ? taches[s.tacheId] : undefined} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function CarteSeance({ seance: s, tache }: { seance: Seance; tache?: TacheResumee }) {
  const video = tache?.resultat?.video_url;
  const image = s.images[s.images.length - 1] ?? tache?.resultat?.visuel_url;
  const statut = tache ? STATUTS[tache.statut] : undefined;
  const titre = tache?.titre ?? (s.tacheId ? "Publication" : "Travail de l'agent");

  return (
    <article className={`rounded-2xl border bg-carte p-4 ${s.active ? "border-accent/60" : "border-bord"}`}>
      <div className="flex gap-4">
        {tache?.plateforme && (
          <div className="shrink-0 pt-0.5">
            <LogoPlateforme id={tache.plateforme} taille={32} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="font-semibold">{titre}</h3>
            {statut && <Pastille ton={statut.ton}>{statut.libelle}</Pastille>}
            {s.active && <Pastille ton="accent">En direct</Pastille>}
            <time className="ml-auto font-mono text-xs text-doux tabular-nums">
              {heure(s.debut)}
              {heure(s.debut) !== heure(s.fin) && ` → ${heure(s.fin)}`}
            </time>
          </div>

          {s.etapes.length > 0 && <PisteEtapes etapes={s.etapes} />}

          {s.erreurs.length > 0 ? (
            <p className="mt-3 rounded-lg bg-erreur/10 px-3 py-2 text-sm text-erreur">{s.erreurs[s.erreurs.length - 1]}</p>
          ) : (
            <p className="mt-3 line-clamp-2 text-sm text-doux">{s.resume}</p>
          )}

          {video ? (
            <video src={video} controls preload="metadata" className="mt-3 h-64 rounded-lg border border-bord bg-black" />
          ) : (
            image && (
              <a href={image} target="_blank" rel="noreferrer" className="mt-3 inline-block">
                <img
                  src={image}
                  alt={`Visuel de « ${titre} »`}
                  loading="lazy"
                  // Image remplacée ou supprimée depuis : on n'affiche pas d'icône cassée.
                  onError={(e) => (e.currentTarget.parentElement!.style.display = "none")}
                  className="h-40 rounded-lg border border-bord object-cover"
                />
              </a>
            )
          )}

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-doux select-none hover:text-texte">
              Voir le détail ({s.evenements.length} ligne{s.evenements.length > 1 ? "s" : ""})
            </summary>
            <ol className="mt-2 space-y-1.5 border-l border-bord pl-3">
              {s.evenements.map((e) => (
                <li key={e.id} className="flex gap-3 text-xs">
                  <time className="shrink-0 font-mono text-doux tabular-nums">{new Date(e.created_at).toLocaleTimeString("fr-FR")}</time>
                  <span className={e.niveau === "erreur" ? "text-erreur" : e.niveau === "action" ? "text-texte" : "text-doux"}>{e.message}</span>
                </li>
              ))}
            </ol>
          </details>
        </div>
      </div>
    </article>
  );
}

function PisteEtapes({ etapes }: { etapes: Etape[] }) {
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Étapes">
      {etapes.map((e, i) => (
        <li key={e.nom} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="h-px w-4 bg-bord" />}
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${
              e.etat === "fait" ? "border-ok/40 text-ok" : e.etat === "echec" ? "border-erreur/40 text-erreur" : "border-accent/60 text-accent"
            }`}
          >
            {e.etat === "fait" ? (
              <Check size={12} aria-hidden />
            ) : e.etat === "echec" ? (
              <X size={12} aria-hidden />
            ) : (
              <LoaderCircle size={12} className="animate-spin" aria-hidden />
            )}
            {LIBELLES_ETAPES[e.nom]}
            <span className="sr-only">{e.etat === "fait" ? " : terminé" : e.etat === "echec" ? " : échec" : " : en cours"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
