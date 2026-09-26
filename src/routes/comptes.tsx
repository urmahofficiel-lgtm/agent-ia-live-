import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Carte, Erreur, Titre, boutonSecondaire } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useRequete, useUserId } from "@/lib/donnees";
import { PLATEFORMES } from "@/lib/plateformes";

export const Route = createFileRoute("/comptes")({ component: Comptes });

type Compte = { id: string; plateforme: string; statut: string };

const LIBELLE: Record<string, string> = {
  a_connecter: "Choisi, en attente de connexion",
  connecte: "Connecté",
  erreur: "Erreur",
  desactive: "Désactivé",
};

function Comptes() {
  const userId = useUserId();
  const comptes = useRequete<Compte[]>(() => supabase().from("comptes_connectes").select("id, plateforme, statut"), [userId]);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ajouter(plateforme: string) {
    if (!userId) return;
    const { error } = await supabase().from("comptes_connectes").insert({ user_id: userId, plateforme, libelle: "principal" });
    setErreur(error?.message ?? null);
    await comptes.recharger();
  }

  async function retirer(id: string) {
    const { error } = await supabase().from("comptes_connectes").delete().eq("id", id);
    setErreur(error?.message ?? null);
    await comptes.recharger();
  }

  return (
    <>
      <Titre sous="Choisissez les réseaux que l'agent devra gérer.">Comptes connectés</Titre>
      <Carte className="mb-4 border-alerte/40 text-sm">
        <p className="font-medium text-alerte">Connexion réelle pas encore branchée</p>
        <p className="mt-1 text-doux">
          Pour l'instant, « Ajouter » enregistre seulement le réseau dans votre liste. La vraie connexion (vous
          autorisez l'agent sur Facebook, Instagram, LinkedIn…) arrive à l'étape suivante : le bouton ouvrira
          alors la page d'autorisation du réseau.
        </p>
      </Carte>
      <Erreur message={erreur ?? comptes.erreur} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLATEFORMES.map((p) => {
          const compte = comptes.data?.find((c) => c.plateforme === p.id);
          return (
            <Carte key={p.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{p.nom}</p>
                <p className="text-xs text-doux">
                  {compte ? LIBELLE[compte.statut] : "Non ajouté"} · {p.api ? "accès officiel" : "via l'écran"}
                </p>
              </div>
              {compte ? (
                <button className={boutonSecondaire} onClick={() => retirer(compte.id)}>Retirer</button>
              ) : (
                <button className={boutonSecondaire} onClick={() => ajouter(p.id)}>Ajouter</button>
              )}
            </Carte>
          );
        })}
      </div>
    </>
  );
}
