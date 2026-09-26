import type { ReactNode } from "react";

export function Titre({ children, sous }: { children: ReactNode; sous?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold">{children}</h1>
      {sous && <p className="mt-1 text-sm text-doux">{sous}</p>}
    </header>
  );
}

export function Carte({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-bord bg-carte p-4 ${className}`}>{children}</section>;
}

export const champ =
  "w-full rounded-lg border border-bord bg-fond px-3 py-2 text-sm outline-none focus:border-accent";
export const bouton =
  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
export const boutonSecondaire =
  "rounded-lg border border-bord px-3 py-1.5 text-sm hover:bg-bord disabled:opacity-50";

export function Erreur({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="mt-2 text-sm text-erreur">{message}</p>;
}
