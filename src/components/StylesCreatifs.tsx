import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Camera, ChevronDown, Clapperboard, ListOrdered, LoaderCircle, Megaphone, Quote, Smartphone, SquareSplitHorizontal, Trophy, Type } from "lucide-react";
import { boutonSecondaire } from "@/components/ui";

// Menus de choix du style des vidéos et des images (page Publications,
// Réglages).

type OptionStyle = { id: string; nom: string; description: string };

const ICONES: Record<string, ReactNode> = {
  classique: <Clapperboard size={16} />,
  ugc: <Smartphone size={16} />,
  avant_apres: <SquareSplitHorizontal size={16} />,
  etapes: <ListOrdered size={16} />,
  top3: <Trophy size={16} />,
  photo: <Camera size={16} />,
  accroche: <Type size={16} />,
  citation: <Quote size={16} />,
  promo: <Megaphone size={16} />,
};

const Icone = ({ id }: { id: string }) => (
  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent" aria-hidden>
    {ICONES[id]}
  </span>
);

// Bouton qui ouvre la liste des styles ; choisir un style lance l'action.
export function MenuStyle({
  children,
  icone,
  options,
  defaut,
  occupe,
  enCours,
  titre,
  onChoix,
}: {
  children: ReactNode;
  icone: ReactNode;
  options: readonly OptionStyle[];
  defaut: string;
  occupe: boolean;
  enCours: boolean;
  titre?: string;
  onChoix: (style: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  // Fermeture au clic à l'extérieur ; focus sur le style par défaut à l'ouverture.
  useEffect(() => {
    if (!ouvert) return;
    const items = menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]");
    const i = options.findIndex((o) => o.id === defaut);
    items?.[Math.max(0, i)]?.focus();
    const dehors = (e: MouseEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert, options, defaut]);

  function clavier(e: KeyboardEvent) {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOuvert(false);
      bouton.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const pas = e.key === "ArrowDown" ? 1 : -1;
      items[(i + pas + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") setOuvert(false);
  }

  return (
    <div ref={racine} className="relative" onKeyDown={clavier}>
      <button
        ref={bouton}
        className={`${boutonSecondaire} flex items-center gap-1.5`}
        disabled={occupe}
        title={titre}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-controls={ouvert ? id : undefined}
        onClick={() => setOuvert((v) => !v)}
      >
        <span aria-hidden>{enCours ? <LoaderCircle size={15} className="animate-spin" /> : icone}</span>
        {children}
        <ChevronDown size={14} aria-hidden className={`text-doux transition-transform ${ouvert ? "rotate-180" : ""}`} />
      </button>
      {ouvert && (
        <div
          ref={menu}
          id={id}
          role="menu"
          className="absolute bottom-full left-0 z-20 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-bord bg-carte-2 p-1.5 shadow-xl shadow-black/40 sm:bottom-auto sm:top-full sm:mt-2 sm:mb-0"
        >
          <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-doux">Choisir le style</p>
          {options.map((o) => (
            <button
              key={o.id}
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none hover:bg-bord focus-visible:bg-bord"
              onClick={() => {
                setOuvert(false);
                onChoix(o.id);
              }}
            >
              <Icone id={o.id} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {o.nom}
                  {o.id === defaut && <span className="rounded-full bg-accent/15 px-1.5 text-[11px] text-accent">par défaut</span>}
                </span>
                <span className="block text-xs text-doux">{o.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Choix d'un style par défaut (Réglages) : cartes à cocher.
export function ChoixStyle({
  legende,
  options,
  valeur,
  onChange,
  desactive,
}: {
  legende: string;
  options: readonly OptionStyle[];
  valeur: string;
  onChange: (id: string) => void;
  desactive?: boolean;
}) {
  const nom = useId();
  return (
    <fieldset disabled={desactive} className="disabled:opacity-60">
      <legend className="mb-2 text-sm font-medium">{legende}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.id}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-bord bg-fond/60 p-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
          >
            <input type="radio" className="sr-only" name={nom} value={o.id} checked={valeur === o.id} onChange={() => onChange(o.id)} />
            <Icone id={o.id} />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{o.nom}</span>
              <span className="block text-xs text-doux">{o.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
