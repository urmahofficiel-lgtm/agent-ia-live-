import type { ReactNode } from "react";

export function Titre({ children, sous }: { children: ReactNode; sous?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl font-bold">{children}</h1>
      {sous && <p className="mt-1 text-sm text-doux">{sous}</p>}
    </header>
  );
}

export function Carte({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-bord bg-carte p-4 ${className}`}>{children}</section>;
}

export const champ =
  "w-full rounded-lg border border-bord bg-fond px-3 py-2 text-sm outline-none focus:border-accent";
export const bouton =
  "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-sur-accent hover:brightness-110 disabled:opacity-50";
export const boutonSecondaire =
  "rounded-lg border border-bord px-3 py-1.5 text-sm hover:bg-bord disabled:opacity-50";

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
