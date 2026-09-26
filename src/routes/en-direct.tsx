import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LoaderCircle, Play } from "lucide-react";
import { Carte, Erreur, Titre, bouton } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { jetonSession } from "@/lib/session";
import { useUserId } from "@/lib/donnees";
import { travaillerMaintenant } from "@/lib/agent.functions";
import type { Evenement } from "@/lib/types";

export const Route = createFileRoute("/en-direct")({ component: EnDirect });

const STYLE = {
  info: "border-bord",
  action: "border-accent/50",
  erreur: "border-erreur/50",
} as const;

// Le moteur automatique passe toutes les 5 minutes (pg_cron).
function minutesAvantPassage(maintenant: Date) {
  return 5 - (maintenant.getMinutes() % 5);
}

function EnDirect() {
  const userId = useUserId();
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [connecte, setConnecte] = useState(false);
  const [lance, setLance] = useState(false);
  const [maintenant, setMaintenant] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setMaintenant(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!userId) return;
    const sb = supabase();
    sb.from("evenements_taches")
      .select("id, tache_id, niveau, message, capture_url, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        setErreur(error?.message ?? null);
        setEvenements((data as Evenement[]) ?? []);
      });

    const canal = sb
      .channel("evenements-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "evenements_taches", filter: `user_id=eq.${userId}` },
        (payload) => {
          setEvenements((prev) => [payload.new as Evenement, ...prev].slice(0, 200));
          setMaintenant(new Date());
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

  const dernier = evenements[0];
  const actif = lance || (dernier && dernier.niveau === "action" && maintenant.getTime() - new Date(dernier.created_at).getTime() < 90_000);

  return (
    <>
      <Titre sous="Chaque étape du travail de l'agent s'affiche ici au moment où il l'exécute.">En direct</Titre>

      <Carte className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex size-3" aria-hidden>
            {actif && <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />}
            <span className={`relative inline-flex size-3 rounded-full ${actif ? "bg-accent" : connecte ? "bg-ok" : "bg-alerte"}`} />
          </span>
          <div>
            <p className="font-medium">{actif ? "L'agent travaille…" : "L'agent est en veille"}</p>
            <p className="text-xs text-doux">
              {actif
                ? dernier?.message
                : `Prochain passage automatique dans ${minutesAvantPassage(maintenant)} min · ${connecte ? "flux en direct connecté" : "connexion au flux…"}`}
            </p>
          </div>
        </div>
        <button className={`${bouton} flex items-center gap-2`} disabled={lance} onClick={lancer}>
          {lance ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Play size={16} aria-hidden />}
          {lance ? "L'agent travaille…" : "Lancer l'agent maintenant"}
        </button>
      </Carte>
      <Erreur message={erreur} />

      {evenements.length === 0 ? (
        <Carte className="text-sm text-doux">
          Aucune activité pour l'instant. Donnez une consigne depuis le tableau de bord ou la page Stratégie, puis lancez l'agent.
        </Carte>
      ) : (
        <ol className="relative space-y-3 border-l border-bord pl-5">
          {evenements.map((e) => (
            <li key={e.id} className="relative">
              <span
                aria-hidden
                className={`absolute top-3 -left-[25px] size-2.5 rounded-full ${
                  e.niveau === "action" ? "bg-accent" : e.niveau === "erreur" ? "bg-erreur" : "bg-ok"
                }`}
              />
              <div className={`rounded-xl border bg-carte p-3 ${STYLE[e.niveau]}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className={`text-sm ${e.niveau === "erreur" ? "text-erreur" : ""}`}>{e.message}</p>
                  <time className="shrink-0 text-xs text-doux tabular-nums">
                    {new Date(e.created_at).toLocaleTimeString("fr-FR")}
                  </time>
                </div>
                {e.capture_url && (
                  <a href={e.capture_url} target="_blank" rel="noreferrer" className="mt-2 block">
                    <img src={e.capture_url} alt="Visuel généré par l'agent" loading="lazy" className="max-h-72 rounded-lg border border-bord" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
