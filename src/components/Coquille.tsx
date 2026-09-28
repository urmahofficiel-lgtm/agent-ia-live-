import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Activity, Bot, Link2, ListChecks, LogOut, MessageCircle, Settings, Target, Users, Wand2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase, supabaseConfigure } from "@/lib/supabase";
import { Accueil } from "./Accueil";
import { Connexion } from "./Connexion";

// Menu regroupé par usage : piloter l'agent, gérer les contenus, développer
// l'activité, paramétrer.
const MENU = [
  {
    groupe: "Piloter",
    liens: [
      { to: "/", label: "Tableau de bord", icone: Bot },
      { to: "/en-direct", label: "En direct", icone: Activity },
    ],
  },
  {
    groupe: "Contenus",
    liens: [
      { to: "/taches", label: "Publications", icone: ListChecks },
      { to: "/messages", label: "Messages", icone: MessageCircle },
      { to: "/animer", label: "Animer une photo", icone: Wand2 },
    ],
  },
  {
    groupe: "Croissance",
    liens: [
      { to: "/strategie", label: "Stratégie", icone: Target },
      { to: "/prospection", label: "Prospection", icone: Users },
    ],
  },
  {
    groupe: "Paramètres",
    liens: [
      { to: "/comptes", label: "Comptes", icone: Link2 },
      { to: "/parametres", label: "Réglages", icone: Settings },
    ],
  },
] as const;

// Pages visibles sans compte, affichées sans le menu de l'application.
const PAGES_PUBLIQUES = ["/connexion", "/confidentialite", "/conditions", "/suppression-donnees"];

// Adresse officielle. Chaque déploiement Vercel a aussi sa propre adresse
// (agent-ia-live-xxxx.vercel.app) figée sur une ancienne version : on y
// renvoie toujours vers la version à jour.
const ADRESSE_OFFICIELLE = "agent-ia-live.vercel.app";

export function Coquille({ children }: { children: ReactNode }) {
  const { session, chargement } = useAuth();
  const chemin = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const { hostname, pathname, search } = window.location;
    if (hostname.endsWith(".vercel.app") && hostname !== ADRESSE_OFFICIELLE) {
      window.location.replace(`https://${ADRESSE_OFFICIELLE}${pathname}${search}`);
    }
  }, []);

  if (!supabaseConfigure()) {
    return (
      <Centre>
        <p className="text-doux">
          Configuration manquante : renseignez <code>VITE_SUPABASE_URL</code> et{" "}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (voir <code>.env.example</code>).
        </p>
      </Centre>
    );
  }
  if (PAGES_PUBLIQUES.includes(chemin)) return <>{children}</>;
  if (chargement) return <Centre>Chargement…</Centre>;
  // Visiteur : la page d'accueil sur « / », la connexion ailleurs.
  if (!session) return chemin === "/" ? <Accueil /> : <Connexion />;

  return (
    <div className="min-h-dvh md:flex">
      <nav
        aria-label="Menu principal"
        className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-bord bg-fond/95 p-2 backdrop-blur md:h-dvh md:w-60 md:flex-col md:gap-0 md:overflow-y-auto md:border-r md:border-b-0 md:p-4"
      >
        <div className="hidden items-center gap-2 px-2 pb-6 pt-1 md:flex">
          <span className="grid size-8 place-items-center rounded-lg bg-accent font-titre text-sm font-bold text-sur-accent">IA</span>
          <span className="font-titre text-lg font-bold">Agent IA Live</span>
        </div>
        {MENU.map((g) => (
          <div key={g.groupe} className="flex gap-1 md:mb-5 md:flex-col">
            <p className="hidden px-3 pb-1 font-mono text-[11px] tracking-wider text-doux/70 uppercase md:block">{g.groupe}</p>
            {g.liens.map(({ to, label, icone: Icone }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-doux transition-colors hover:bg-carte hover:text-texte"
                activeProps={{ className: "bg-carte !text-texte shadow-[inset_2px_0_0_var(--color-accent)]" }}
              >
                <Icone size={16} aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        ))}
        <button
          type="button"
          onClick={() => supabase().auth.signOut()}
          className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-doux hover:bg-carte hover:text-texte md:mt-auto"
        >
          <LogOut size={16} aria-hidden />
          Déconnexion
        </button>
      </nav>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-10">{children}</main>
    </div>
  );
}

function Centre({ children }: { children: ReactNode }) {
  return <div className="grid min-h-dvh place-items-center p-4 text-center">{children}</div>;
}
