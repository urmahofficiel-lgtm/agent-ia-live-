import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Activity, Bot, Link2, ListChecks, LogOut, Settings, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase, supabaseConfigure } from "@/lib/supabase";
import { Connexion } from "./Connexion";

const MENU = [
  { to: "/", label: "Tableau de bord", icone: Bot },
  { to: "/en-direct", label: "En direct", icone: Activity },
  { to: "/taches", label: "Tâches", icone: ListChecks },
  { to: "/comptes", label: "Comptes", icone: Link2 },
  { to: "/prospection", label: "Prospection", icone: Users },
  { to: "/parametres", label: "Réglages", icone: Settings },
] as const;

export function Coquille({ children }: { children: ReactNode }) {
  const { session, chargement } = useAuth();

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
  if (chargement) return <Centre>Chargement…</Centre>;
  if (!session) return <Connexion />;

  return (
    <div className="min-h-dvh md:flex">
      <nav className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-bord bg-carte p-2 md:h-dvh md:w-56 md:flex-col md:border-r md:border-b-0 md:p-3">
        <div className="hidden px-3 py-4 text-lg font-semibold md:block">Agent IA Live</div>
        {MENU.map(({ to, label, icone: Icone }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-doux hover:bg-bord hover:text-texte"
            activeProps={{ className: "bg-bord !text-texte" }}
          >
            <Icone size={16} aria-hidden />
            {label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => supabase().auth.signOut()}
          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-doux hover:bg-bord hover:text-texte md:mt-auto"
        >
          <LogOut size={16} aria-hidden />
          Déconnexion
        </button>
      </nav>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}

function Centre({ children }: { children: ReactNode }) {
  return <div className="grid min-h-dvh place-items-center p-4 text-center">{children}</div>;
}
