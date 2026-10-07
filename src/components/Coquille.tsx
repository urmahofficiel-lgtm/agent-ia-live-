import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  Clapperboard,
  Link2,
  ListChecks,
  LogOut,
  Menu,
  MessageCircle,
  Settings,
  Target,
  Users,
  Wand2,
  X,
} from "lucide-react";
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
      { to: "/statistiques", label: "Statistiques", icone: BarChart3 },
    ],
  },
  {
    groupe: "Contenus",
    liens: [
      { to: "/taches", label: "Publications", icone: ListChecks },
      { to: "/messages", label: "Messages", icone: MessageCircle },
      { to: "/studio-video", label: "Studio vidéo IA", icone: Clapperboard },
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

// Les 4 pages de tous les jours, toujours à portée de pouce sur téléphone ;
// les autres sont dans le bouton « Menu ».
const ONGLETS_TELEPHONE = [
  { to: "/", label: "Accueil", icone: Bot },
  { to: "/en-direct", label: "En direct", icone: Activity },
  { to: "/taches", label: "Publications", icone: ListChecks },
  { to: "/prospection", label: "Prospection", icone: Users },
] as const;

// Pages visibles sans compte, affichées sans le menu de l'application.
const PAGES_PUBLIQUES = [
  "/connexion",
  "/confidentialite",
  "/conditions",
  "/suppression-donnees",
];

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
      window.location.replace(
        `https://${ADRESSE_OFFICIELLE}${pathname}${search}`,
      );
    }
  }, []);

  if (!supabaseConfigure()) {
    return (
      <Centre>
        <p className="text-doux">
          Configuration manquante : renseignez <code>VITE_SUPABASE_URL</code> et{" "}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (voir{" "}
          <code>.env.example</code>).
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
      {/* Ordinateur : menu à gauche. */}
      <nav
        aria-label="Menu principal"
        className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-bord bg-fond/95 p-4 backdrop-blur md:flex"
      >
        <Marque className="px-2 pb-6 pt-1" />
        {MENU.map((g) => (
          <div key={g.groupe} className="mb-5 flex flex-col">
            <p className="px-3 pb-1 font-mono text-[11px] tracking-wider text-doux/70 uppercase">
              {g.groupe}
            </p>
            {g.liens.map(({ to, label, icone: Icone }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-doux transition-colors hover:bg-carte hover:text-texte"
                activeProps={{
                  className:
                    "bg-carte !text-texte shadow-[inset_2px_0_0_var(--color-accent)]",
                }}
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
          className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-doux hover:bg-carte hover:text-texte"
        >
          <LogOut size={16} aria-hidden />
          Déconnexion
        </button>
      </nav>

      {/* Téléphone : bandeau fin en haut, onglets en bas. */}
      <header className="sticky top-0 z-20 flex h-12 items-center border-b border-bord bg-fond/95 px-4 backdrop-blur md:hidden">
        <Marque />
      </header>
      <NavigationTelephone chemin={chemin} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 md:p-10">
        {children}
      </main>
    </div>
  );
}

function Marque({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="grid size-8 place-items-center rounded-lg bg-accent font-titre text-sm font-bold text-sur-accent">
        IA
      </span>
      <span className="font-titre text-lg font-bold">Agent IA Live</span>
    </div>
  );
}

// Barre d'onglets du bas + feuille « Menu » avec toutes les pages.
function NavigationTelephone({ chemin }: { chemin: string }) {
  const [ouvert, setOuvert] = useState(false);
  const fermer = useRef<HTMLButtonElement>(null);
  const actif = (to: string) =>
    to === "/" ? chemin === "/" : chemin.startsWith(to);
  const dansMenu = !ONGLETS_TELEPHONE.some((o) => actif(o.to));

  // Le menu se referme quand on change de page, et avec la touche Échap.
  useEffect(() => setOuvert(false), [chemin]);
  useEffect(() => {
    if (!ouvert) return;
    fermer.current?.focus();
    const touche = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [ouvert]);

  return (
    <>
      <nav
        aria-label="Menu principal"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-bord bg-fond/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {ONGLETS_TELEPHONE.map(({ to, label, icone: Icone }) => (
          <Link
            key={to}
            to={to}
            aria-current={actif(to) ? "page" : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${actif(to) ? "text-accent" : "text-doux"}`}
          >
            <Icone size={20} aria-hidden />
            {label}
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={ouvert}
          aria-controls="menu-telephone"
          onClick={() => setOuvert(true)}
          className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${dansMenu ? "text-accent" : "text-doux"}`}
        >
          <Menu size={20} aria-hidden />
          Menu
        </button>
      </nav>

      {ouvert && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Fermer le menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setOuvert(false)}
          />
          <div
            id="menu-telephone"
            role="dialog"
            aria-modal="true"
            aria-label="Toutes les pages"
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-bord bg-carte p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="font-titre text-lg font-semibold">
                Toutes les pages
              </p>
              <button
                ref={fermer}
                type="button"
                aria-label="Fermer"
                onClick={() => setOuvert(false)}
                className="grid size-10 place-items-center rounded-lg text-doux hover:bg-bord"
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            {MENU.map((g) => (
              <div key={g.groupe} className="mb-3">
                <p className="px-2 pb-1 font-mono text-[11px] tracking-wider text-doux/70 uppercase">
                  {g.groupe}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {g.liens.map(({ to, label, icone: Icone }) => (
                    <Link
                      key={to}
                      to={to}
                      aria-current={actif(to) ? "page" : undefined}
                      className={`flex min-h-12 items-center gap-2.5 rounded-xl border px-3 text-sm ${actif(to) ? "border-accent/60 bg-accent/10 text-texte" : "border-bord bg-fond text-doux"}`}
                    >
                      <Icone size={18} aria-hidden />
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => supabase().auth.signOut()}
              className="mt-1 flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-bord px-3 text-sm text-doux"
            >
              <LogOut size={18} aria-hidden />
              Déconnexion
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Centre({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center p-4 text-center">
      {children}
    </div>
  );
}
