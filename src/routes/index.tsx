import { createFileRoute } from "@tanstack/react-router";
import { Power } from "lucide-react";
import { Carte, Erreur, Titre } from "@/components/ui";
import { Commande } from "@/components/Commande";
import { supabase } from "@/lib/supabase";
import { useReglages, useRequete, useUserId } from "@/lib/donnees";
import { LIBELLE_STATUT, type StatutTache } from "@/lib/types";

export const Route = createFileRoute("/")({ component: TableauDeBord });

function TableauDeBord() {
  const userId = useUserId();
  const { reglages, enregistrer, erreur } = useReglages();
  const taches = useRequete<{ statut: StatutTache }[]>(() => supabase().from("taches").select("statut"), [userId]);
  const prospects = useRequete<{ id: string }[]>(() => supabase().from("prospects").select("id"), [userId]);

  const compte = (s: StatutTache) => taches.data?.filter((t) => t.statut === s).length ?? 0;
  const actif = reglages.agent_actif;

  return (
    <>
      <Titre sous="Dites à l'agent ce que vous voulez : il crée les tâches, rédige, et publie après votre validation.">Tableau de bord</Titre>

      <Commande />

      <Carte className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-medium">Agent {actif ? "activé" : "à l'arrêt"}</p>
          <p className="text-sm text-doux">
            {reglages.validation_requise
              ? "Chaque publication ou message vous est soumis avant envoi."
              : "L'agent publie et envoie sans validation."}{" "}
            Mode {reglages.mode}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => enregistrer({ agent_actif: !actif })}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white ${actif ? "bg-erreur" : "bg-ok"}`}
        >
          <Power size={16} aria-hidden />
          {actif ? "Arrêter" : "Démarrer"}
        </button>
      </Carte>
      <Erreur message={erreur ?? taches.erreur} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["a_valider", "en_attente", "en_cours", "terminee"] as const).map((s) => (
          <Carte key={s}>
            <p className="text-sm text-doux">{LIBELLE_STATUT[s]}</p>
            <p className="text-2xl font-semibold tabular-nums">{compte(s)}</p>
          </Carte>
        ))}
      </div>

      <Carte className="mt-4">
        <p className="text-sm text-doux">Prospects dans le CRM</p>
        <p className="text-2xl font-semibold tabular-nums">{prospects.data?.length ?? 0}</p>
      </Carte>

    </>
  );
}
