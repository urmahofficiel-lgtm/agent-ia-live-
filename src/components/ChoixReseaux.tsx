import { Check } from "lucide-react";
import { LogoPlateforme } from "./LogoPlateforme";
import { supabase } from "@/lib/supabase";
import { useRequete, useUserId } from "@/lib/donnees";
import { PLATEFORMES } from "@/lib/plateformes";

// Choix de un ou plusieurs réseaux, les réseaux connectés en premier.
export function ChoixReseaux({ valeur, onChange }: { valeur: string[]; onChange: (reseaux: string[]) => void }) {
  const userId = useUserId();
  const comptes = useRequete<{ plateforme: string }[]>(
    () => supabase().from("comptes_connectes").select("plateforme").eq("statut", "connecte"),
    [userId],
  );
  const connectes = new Set((comptes.data ?? []).map((c) => c.plateforme));
  const liste = PLATEFORMES.filter((p) => p.categorie === "reseau" || p.categorie === "local").sort(
    (a, b) => Number(connectes.has(b.id)) - Number(connectes.has(a.id)),
  );
  const basculer = (id: string) => onChange(valeur.includes(id) ? valeur.filter((x) => x !== id) : [...valeur, id]);

  return (
    <fieldset>
      <legend className="text-sm">Réseaux</legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {liste.map((p) => {
          const choisi = valeur.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              role="checkbox"
              aria-checked={choisi}
              onClick={() => basculer(p.id)}
              className={`flex min-h-10 items-center gap-2 rounded-lg border py-1.5 pr-3 pl-1.5 text-sm transition-colors ${
                choisi ? "border-accent bg-accent/10 text-texte" : "border-bord text-doux hover:border-doux/50 hover:text-texte"
              }`}
            >
              <LogoPlateforme id={p.id} taille={26} />
              {p.nom}
              {connectes.has(p.id) && <span className="size-1.5 rounded-full bg-ok" title="Connecté" aria-label="connecté" />}
              {choisi && <Check size={14} className="text-accent" aria-hidden />}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-doux">
        Point vert : réseau connecté. Plusieurs réseaux = une publication par réseau, que vous pouvez adapter ensuite.
      </p>
    </fieldset>
  );
}
