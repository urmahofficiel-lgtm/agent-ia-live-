import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function Titre({ children, sous }: { children: ReactNode; sous?: ReactNode }) {
  return (
    <header className="mb-5 md:mb-6">
      <h1 className="text-2xl font-bold md:text-3xl">{children}</h1>
      {sous && <p className="mt-1 text-sm text-doux">{sous}</p>}
    </header>
  );
}

export function Carte({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-bord bg-carte p-4 ${className}`}>{children}</section>;
}

export const champ =
  "w-full rounded-lg border border-bord bg-fond px-3 py-2 text-base outline-none focus:border-accent md:text-sm";
export const bouton =
  "rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-sur-accent hover:brightness-110 disabled:opacity-50 md:py-2";
export const boutonSecondaire =
  "rounded-lg border border-bord px-3 py-2 text-sm hover:bg-bord disabled:opacity-50 md:py-1.5";

export function Erreur({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="mt-2 text-sm text-erreur">{message}</p>;
}

// Pastille d'état (publication, étape…).
export function Pastille({ ton, children }: { ton: "ok" | "alerte" | "erreur" | "accent" | "doux" | "plan"; children: ReactNode }) {
  const styles = {
    ok: "bg-ok/15 text-ok",
    alerte: "bg-alerte/15 text-alerte",
    erreur: "bg-erreur/15 text-erreur",
    accent: "bg-accent/15 text-accent",
    doux: "bg-bord text-doux",
    plan: "bg-plan/15 text-plan",
  } as const;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[ton]}`}>{children}</span>;
}

// Bloc repliable (réglages, outils) : une ligne quand il est fermé, pour que
// la liste reste en haut de l'écran. Natif (<details>) : clavier et lecteurs
// d'écran gérés par le navigateur.
export function Repli({
  titre,
  icone,
  resume,
  children,
  ouvert = false,
  className = "",
}: {
  titre: string;
  icone?: ReactNode;
  resume?: ReactNode;
  children: ReactNode;
  ouvert?: boolean;
  className?: string;
}) {
  return (
    <details
      open={ouvert}
      className={`group rounded-2xl border border-bord bg-carte ${className}`}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        {icone && <span className="shrink-0 text-doux">{icone}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{titre}</span>
          {resume && (
            <span className="block truncate text-xs text-doux">{resume}</span>
          )}
        </span>
        <ChevronDown
          size={18}
          aria-hidden
          className="shrink-0 text-doux transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-bord p-4">{children}</div>
    </details>
  );
}
