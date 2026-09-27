import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { EDITEUR } from "@/lib/editeur";

export function Marque({ taille = "md" }: { taille?: "md" | "lg" }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`grid place-items-center rounded-lg bg-accent font-titre font-bold text-sur-accent ${taille === "lg" ? "size-9 text-base" : "size-8 text-sm"}`}
      >
        IA
      </span>
      <span className="font-titre text-lg font-bold whitespace-nowrap">{EDITEUR.produit}</span>
    </span>
  );
}

// Cadre des pages publiques : en-tête simple et pied de page avec les liens légaux.
export function Vitrine({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-sur-accent">
        Aller au contenu
      </a>
      <header className="sticky top-0 z-20 border-b border-bord/60 bg-fond/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link to="/" aria-label={`${EDITEUR.produit}, accueil`}>
            <Marque />
          </Link>
          <nav aria-label="Compte" className="flex items-center gap-2">
            <Link to="/connexion" className="hidden rounded-lg px-3 py-2 text-sm text-doux hover:text-texte sm:inline-block">
              Se connecter
            </Link>
            <Link
              to="/connexion"
              search={{ mode: "inscription" }}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold whitespace-nowrap text-sur-accent hover:brightness-110"
            >
              Créer mon compte
            </Link>
          </nav>
        </div>
      </header>
      <div id="contenu" className="flex-1">
        {children}
      </div>
      <PiedDePage />
    </div>
  );
}

export function PiedDePage() {
  return (
    <footer className="border-t border-bord/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-doux md:flex-row md:items-center md:justify-between md:px-6">
        <p>
          © 2026 {EDITEUR.produit} · édité par{" "}
          <a href={EDITEUR.site} className="underline hover:text-texte" target="_blank" rel="noreferrer">
            {EDITEUR.societe}
          </a>
        </p>
        <nav aria-label="Informations légales" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/confidentialite" className="hover:text-texte">
            Confidentialité
          </Link>
          <Link to="/conditions" className="hover:text-texte">
            Conditions d'utilisation
          </Link>
          <Link to="/suppression-donnees" className="hover:text-texte">
            Suppression des données
          </Link>
          <a href={`mailto:${EDITEUR.contact}`} className="hover:text-texte">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}

// Mise en page commune des pages légales.
export function PageLegale({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <Vitrine>
      <article className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <p className="font-mono text-xs tracking-widest text-doux uppercase">Mis à jour le {EDITEUR.miseAJour}</p>
        <h1 className="mt-2 text-3xl font-bold md:text-4xl">{titre}</h1>
        <div className="legal mt-8 space-y-4 leading-relaxed text-texte/90">{children}</div>
      </article>
    </Vitrine>
  );
}
