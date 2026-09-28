import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Power } from "lucide-react";
import { Carte, Erreur, Titre, bouton, boutonSecondaire } from "@/components/ui";
import { Commande } from "@/components/Commande";
import { supabase } from "@/lib/supabase";
import { useReglages, useRequete, useUserId } from "@/lib/donnees";
import type { StatutTache } from "@/lib/types";

export const Route = createFileRoute("/")({ component: TableauDeBord });

function TableauDeBord() {
  const userId = useUserId();
  const { reglages, enregistrer, erreur } = useReglages();
  const taches = useRequete<{ statut: StatutTache }[]>(() => supabase().from("taches").select("statut"), [userId]);
  const profil = useRequete<{ analyse_le: string | null }>(() => supabase().from("profil_marque").select("analyse_le").maybeSingle(), [userId]);
  const comptes = useRequete<{ id: string }[]>(() => supabase().from("comptes_connectes").select("id").eq("statut", "connecte"), [userId]);
  const prospects = useRequete<{ id: string }[]>(() => supabase().from("prospects").select("id"), [userId]);

  const compte = (...s: StatutTache[]) => taches.data?.filter((t) => s.includes(t.statut)).length ?? 0;
  const actif = reglages.agent_actif;
  const charge = !taches.chargement && !profil.chargement && !comptes.chargement;

  const etapes = [
    { fait: !!profil.data?.analyse_le, libelle: "Analyser votre site et votre marché", lien: "/strategie" as const, action: "Ouvrir la stratégie" },
    { fait: (comptes.data?.length ?? 0) > 0, libelle: "Connecter au moins un réseau", lien: "/comptes" as const, action: "Connecter" },
    { fait: (taches.data?.length ?? 0) > 0, libelle: "Planifier vos premières publications", lien: "/strategie" as const, action: "Créer le calendrier" },
    { fait: actif, libelle: "Démarrer l'agent", lien: null, action: "" },
  ];
  const restantes = etapes.filter((e) => !e.fait).length;

  return (
    <>
      <Titre sous="Dites à l'agent ce que vous voulez : il rédige, crée les visuels et publie après votre validation.">Tableau de bord</Titre>

      <Carte className={`mb-6 flex flex-wrap items-center justify-between gap-4 p-5 ${actif ? "border-ok/40" : "border-alerte/40"}`}>
        <div className="flex items-center gap-4">
          <span className={`size-3 shrink-0 rounded-full ${actif ? "bg-ok" : "bg-alerte"}`} aria-hidden />
          <div>
            <p className="font-titre text-lg font-semibold">{actif ? "Agent en service" : "Agent à l'arrêt"}</p>
            <p className="text-sm text-doux">
              {actif ? "Il travaille toutes les 5 minutes, même quand vous êtes déconnecté." : "Démarrez-le pour qu'il prépare et publie automatiquement."}{" "}
              {reglages.validation_requise ? "Rien ne part sans votre validation." : "Il publie sans validation."}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => enregistrer({ agent_actif: !actif })} className={`${actif ? boutonSecondaire : bouton} flex items-center gap-2`}>
          <Power size={16} aria-hidden />
          {actif ? "Arrêter l'agent" : "Démarrer l'agent"}
        </button>
      </Carte>
      <Erreur message={erreur ?? taches.erreur} />

      {charge && restantes > 0 && (
        <Carte className="mb-6 p-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Mise en route</h2>
            <span className="font-mono text-xs text-doux">
              {etapes.length - restantes}/{etapes.length} terminées
            </span>
          </div>
          <ol className="space-y-2">
            {etapes.map((e) => (
              <li key={e.libelle} className="flex items-center gap-3 rounded-lg border border-bord bg-fond/50 px-3 py-2.5">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${e.fait ? "border-ok bg-ok text-fond" : "border-bord"}`}
                  aria-hidden
                >
                  {e.fait && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={`flex-1 text-sm ${e.fait ? "text-doux line-through" : ""}`}>
                  {e.libelle}
                  <span className="sr-only">{e.fait ? " (fait)" : " (à faire)"}</span>
                </span>
                {!e.fait &&
                  (e.lien ? (
                    <Link to={e.lien} className="text-sm font-medium text-accent hover:underline">
                      {e.action} →
                    </Link>
                  ) : (
                    <span className="text-xs text-doux">Bouton ci-dessus</span>
                  ))}
              </li>
            ))}
          </ol>
        </Carte>
      )}

      <Commande />

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Chiffre libelle="À valider" valeur={compte("a_valider")} lien="/taches" accent />
        {compte("a_partager") > 0 && <Chiffre libelle="À partager" valeur={compte("a_partager")} lien="/taches" accent />}
        <Chiffre libelle="Planifiées" valeur={compte("en_attente", "en_cours")} lien="/taches" />
        <Chiffre libelle="Publiées" valeur={compte("terminee")} lien="/taches" />
        <Chiffre libelle="Prospects" valeur={prospects.data?.length ?? 0} lien="/prospection" />
      </div>
    </>
  );
}

function Chiffre({ libelle, valeur, lien, accent }: { libelle: string; valeur: number; lien: "/taches" | "/prospection"; accent?: boolean }) {
  return (
    <Link to={lien} className="group rounded-2xl border border-bord bg-carte p-4 hover:border-accent/50">
      <p className="text-sm text-doux group-hover:text-texte">{libelle}</p>
      <p className={`mt-1 font-titre text-3xl font-bold tabular-nums ${accent && valeur > 0 ? "text-accent" : ""}`}>{valeur}</p>
    </Link>
  );
}
