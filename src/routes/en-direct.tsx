import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Carte, Erreur, Titre } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useUserId } from "@/lib/donnees";
import type { Evenement } from "@/lib/types";

export const Route = createFileRoute("/en-direct")({ component: EnDirect });

const COULEUR = { info: "text-doux", action: "text-accent", erreur: "text-erreur" } as const;

function EnDirect() {
  const userId = useUserId();
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [connecte, setConnecte] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const sb = supabase();
    sb.from("evenements_taches")
      .select("id, tache_id, niveau, message, created_at")
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
        (payload) => setEvenements((prev) => [payload.new as Evenement, ...prev].slice(0, 200)),
      )
      .subscribe((statut) => setConnecte(statut === "SUBSCRIBED"));

    return () => {
      void sb.removeChannel(canal);
    };
  }, [userId]);

  return (
    <>
      <Titre sous="Chaque action de l'agent apparaît ici au moment où il l'exécute.">En direct</Titre>
      <p className="mb-3 flex items-center gap-2 text-sm text-doux">
        <span className={`inline-block size-2 rounded-full ${connecte ? "bg-ok" : "bg-alerte"}`} aria-hidden />
        {connecte ? "Connecté au flux en direct" : "Connexion au flux…"}
      </p>
      <Erreur message={erreur} />
      <Carte>
        {evenements.length === 0 ? (
          <p className="text-sm text-doux">Aucune activité pour l'instant.</p>
        ) : (
          <ol className="space-y-2 font-mono text-sm">
            {evenements.map((e) => (
              <li key={e.id} className="flex gap-3">
                <time className="shrink-0 text-doux tabular-nums">
                  {new Date(e.created_at).toLocaleTimeString("fr-FR")}
                </time>
                <span className={COULEUR[e.niveau]}>{e.message}</span>
              </li>
            ))}
          </ol>
        )}
      </Carte>
      <p className="mt-3 text-xs text-doux">
        La vue écran (voir le PC / téléphone de l'agent en direct) arrivera avec le moteur d'exécution.
      </p>
    </>
  );
}
