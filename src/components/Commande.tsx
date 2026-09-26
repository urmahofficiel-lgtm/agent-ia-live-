import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Carte, Erreur, bouton, champ } from "./ui";
import { planifierCommande } from "@/lib/agent.functions";
import { jetonSession } from "@/lib/session";

const EXEMPLES = [
  "Publie 3 posts LinkedIn cette semaine pour présenter mon activité",
  "Un post Instagram et un post Facebook demain matin sur notre offre du moment",
  "Prépare un message de prospection pour les restaurants",
];

// Le point d'entrée principal : on dit ce qu'on veut, l'agent s'organise.
export function Commande() {
  const [demande, setDemande] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const navigate = useNavigate();

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await planifierCommande({ data: { demande, jeton: await jetonSession() } });
      if (r.ok) {
        setDemande("");
        await navigate({ to: "/taches" });
      } else setErreur(r.erreur);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setEnvoi(false);
  }

  return (
    <Carte className="mb-4">
      <form onSubmit={envoyer}>
        <label htmlFor="commande" className="mb-2 flex items-center gap-2 font-medium">
          <Sparkles size={16} className="text-accent" aria-hidden />
          Que doit faire l'agent ?
        </label>
        <textarea
          id="commande"
          className={`${champ} min-h-20`}
          placeholder={EXEMPLES[0]}
          value={demande}
          onChange={(e) => setDemande(e.target.value)}
          required
          minLength={3}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className={bouton} disabled={envoi}>
            {envoi ? "L'agent s'organise…" : "Envoyer à l'agent"}
          </button>
          {EXEMPLES.slice(1).map((x) => (
            <button key={x} type="button" className="text-left text-xs text-doux underline" onClick={() => setDemande(x)}>
              {x}
            </button>
          ))}
        </div>
      </form>
      <Erreur message={erreur} />
    </Carte>
  );
}
