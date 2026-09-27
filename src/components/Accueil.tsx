import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Clapperboard,
  Eye,
  Globe,
  LoaderCircle,
  MessageCircle,
  PenLine,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { LogoPlateforme } from "./LogoPlateforme";
import { Vitrine } from "./Vitrine";

// Page d'accueil publique : ce que fait l'agent, comment, et ce que
// l'utilisateur garde sous contrôle.
export function Accueil() {
  return (
    <Vitrine>
      <Hero />
      <Etapes />
      <Fonctions />
      <Reseaux />
      <Controle />
      <Questions />
      <Final />
    </Vitrine>
  );
}

const lienInscription = { to: "/connexion", search: { mode: "inscription" as const } };

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pt-14 pb-20 md:px-6 lg:grid-cols-[1.2fr_1fr] lg:pt-20">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-bord bg-carte px-3 py-1 font-mono text-xs text-doux">
          <span className="size-1.5 rounded-full bg-ok" aria-hidden />
          Agent marketing IA · en français
        </p>
        <h1 className="mt-5 text-4xl leading-[1.05] font-bold tracking-tight md:text-5xl xl:text-[3.6rem]">
          Vos réseaux sociaux avancent.
          <span className="block text-accent">Vous le regardez faire.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-doux">
          Collez le lien de votre site : l'agent comprend votre activité, planifie vos publications, rédige les textes, crée les
          images et les vidéos, puis publie sur vos réseaux. Chaque étape s'affiche en direct, et rien ne part sans votre accord.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            {...lienInscription}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-sur-accent transition hover:brightness-110"
          >
            Créer mon compte
            <ArrowRight size={18} aria-hidden />
          </Link>
          <Link
            to="/connexion"
            className="inline-flex min-h-12 items-center rounded-xl border border-bord px-6 text-base font-medium hover:bg-carte"
          >
            Se connecter
          </Link>
        </div>
        <p className="mt-4 text-sm text-doux">Sans carte bancaire. Aucune entreprise requise.</p>
      </div>
      <ApercuDirect />
    </section>
  );
}

// Aperçu illustratif de la page « En direct » : une publication passe par ses
// étapes. Sous « mouvement réduit », l'état final s'affiche directement.
const ETAPES_DEMO = ["Rédaction", "Visuel", "Vidéo", "Publication"] as const;
const JOURNAL_DEMO = [
  "Lecture de votre site et de votre offre",
  "Texte prêt : « Un devis signé avant de quitter le chantier… »",
  "Visuel créé à l'image de votre métier",
  "Vidéo verticale de 32 s montée avec voix off",
  "Publié sur LinkedIn et Instagram",
];

function ApercuDirect() {
  const [etape, setEtape] = useState<number>(ETAPES_DEMO.length);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setEtape(0);
    const id = setInterval(() => setEtape((e) => (e >= ETAPES_DEMO.length + 1 ? 0 : e + 1)), 1500);
    return () => clearInterval(id);
  }, []);

  const termine = etape >= ETAPES_DEMO.length;

  return (
    <figure className="relative min-w-0" aria-label="Aperçu de la page En direct">
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2rem] bg-accent/10 blur-3xl" />
      <div className="overflow-hidden rounded-2xl border border-bord bg-carte shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-bord px-5 py-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="relative flex size-2.5" aria-hidden>
              {!termine && <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />}
              <span className={`relative inline-flex size-2.5 rounded-full ${termine ? "bg-ok" : "bg-accent"}`} />
            </span>
            {termine ? "Publication terminée" : "L'agent travaille"}
          </span>
          <span className="rounded-md bg-carte-2 px-2 py-0.5 font-mono text-[11px] text-doux">Aperçu</span>
        </div>

        <div className="p-5">
          <div className="flex items-start gap-3">
            <LogoPlateforme id="linkedin" taille={36} />
            <div className="min-w-0">
              <p className="font-semibold">Devis signé en 2 minutes</p>
              <p className="text-xs text-doux">LinkedIn · Instagram · aujourd'hui, 9 h 30</p>
            </div>
          </div>

          <ol className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Étapes">
            {ETAPES_DEMO.map((nom, i) => {
              const fait = i < etape;
              const enCours = i === etape;
              return (
                <li key={nom} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden className={`h-px w-3 ${fait ? "bg-ok/60" : "bg-bord"}`} />}
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors duration-300 ${
                      fait ? "border-ok/40 text-ok" : enCours ? "border-accent/60 text-accent" : "border-bord text-doux"
                    }`}
                  >
                    {fait ? (
                      <Check size={12} aria-hidden />
                    ) : enCours ? (
                      <LoaderCircle size={12} className="animate-spin" aria-hidden />
                    ) : (
                      <span className="size-3" aria-hidden />
                    )}
                    {nom}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-4">
            <p className="text-sm leading-relaxed text-texte/90">
              Un devis signé avant de quitter le chantier. Créez-le sur le téléphone, envoyez-le, faites-le signer en ligne.
              <span className="text-doux"> #artisans #BTP</span>
            </p>
            <div
              aria-hidden
              className={`relative h-28 w-20 overflow-hidden rounded-lg border border-bord transition-opacity duration-500 ${etape >= 2 ? "opacity-100" : "opacity-30"}`}
              style={{ background: "linear-gradient(160deg,#1f3a5a 0%,#2b2233 55%,#ff8a3d 140%)" }}
            >
              <span className="absolute inset-x-2 bottom-2 h-1.5 rounded-full bg-white/70" />
              <span className="absolute inset-x-2 bottom-5 h-1.5 w-2/3 rounded-full bg-white/40" />
              {etape >= 3 && (
                <Clapperboard size={14} className="absolute top-2 right-2 text-white/80" aria-hidden />
              )}
            </div>
          </div>

          <ol className="mt-5 space-y-1.5 border-l border-bord pl-3 font-mono text-[11px] text-doux">
            {JOURNAL_DEMO.slice(0, Math.min(etape + 1, JOURNAL_DEMO.length)).map((l) => (
              <li key={l} className="truncate">
                {l}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-doux">Illustration de la page « En direct » de l'application.</figcaption>
    </figure>
  );
}

function Section({ id, titre, intro, children }: { id: string; titre: string; intro?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
      <h2 id={id} className="max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
        {titre}
      </h2>
      {intro && <p className="mt-3 max-w-2xl text-lg text-doux">{intro}</p>}
      <div className="mt-10">{children}</div>
    </section>
  );
}

const ETAPES = [
  { titre: "Collez le lien de votre site", texte: "L'agent lit vos pages et en tire une fiche : activité, offre, clients, ton, arguments réels." },
  { titre: "Il construit votre stratégie", texte: "Niche, concurrents, angles de contenu et un calendrier de publications adapté à chaque réseau." },
  { titre: "Il prépare chaque publication", texte: "Texte, image dans l'univers de votre métier, vidéo courte avec voix off si vous le souhaitez." },
  { titre: "Vous validez, il publie", texte: "Un clic pour valider. L'agent publie à l'heure prévue et vous montre chaque étape en direct." },
];

function Etapes() {
  return (
    <Section id="comment" titre="Quatre étapes, puis l'agent tourne seul" intro="Aucune compétence en marketing ou en design n'est nécessaire.">
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {ETAPES.map((e, i) => (
          <li key={e.titre} className="rounded-2xl border border-bord bg-carte p-5">
            <span className="font-mono text-sm text-accent">Étape {i + 1}</span>
            <h3 className="mt-2 text-lg font-semibold">{e.titre}</h3>
            <p className="mt-2 text-sm leading-relaxed text-doux">{e.texte}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const FONCTIONS = [
  { icone: PenLine, titre: "Publications sur mesure", texte: "Des textes qui parlent de votre offre, avec vos vrais arguments et un lien vers votre site." },
  { icone: Clapperboard, titre: "Images et vidéos", texte: "Visuels générés pour chaque post, vidéos verticales de 30 à 45 s avec textes à l'écran et voix off." },
  { icone: MessageCircle, titre: "Commentaires et messages", texte: "L'agent propose une réponse à chaque commentaire ou message ; vous l'envoyez en un clic." },
  { icone: Users, titre: "Prospection", texte: "Trouve des entreprises locales par activité et par ville, et les range dans votre liste de prospects." },
  { icone: Target, titre: "Stratégie et calendrier", texte: "Analyse de votre marché, idées de contenus et planning réparti sur les semaines à venir." },
  { icone: Eye, titre: "Suivi en direct", texte: "Chaque action de l'agent s'affiche au moment où il la fait : rédaction, visuel, vidéo, publication." },
];

function Fonctions() {
  return (
    <Section id="fonctions" titre="Tout ce qu'une agence ferait, sans l'agence">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FONCTIONS.map(({ icone: Icone, titre, texte }) => (
          <li key={titre} className="rounded-2xl border border-bord bg-carte p-5">
            <span className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent">
              <Icone size={20} aria-hidden />
            </span>
            <h3 className="mt-4 font-semibold">{titre}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-doux">{texte}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const RESEAUX = [
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["linkedin", "LinkedIn"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
  ["x", "X"],
  ["google_business", "Google Business"],
  ["threads", "Threads"],
  ["pinterest", "Pinterest"],
] as const;

function Reseaux() {
  return (
    <Section id="reseaux" titre="Vos réseaux, connectés en un clic" intro="Vous vous connectez sur la page officielle de chaque réseau. Vos mots de passe ne passent jamais par nous.">
      <ul className="flex flex-wrap gap-3">
        {RESEAUX.map(([id, nom]) => (
          <li key={id} className="flex items-center gap-2.5 rounded-xl border border-bord bg-carte py-2 pr-4 pl-2">
            <LogoPlateforme id={id} taille={32} />
            <span className="text-sm font-medium">{nom}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const GARANTIES = [
  { icone: ShieldCheck, titre: "Validation avant publication", texte: "Par défaut, chaque publication et chaque réponse vous est soumise avant envoi." },
  { icone: Globe, titre: "Fidèle à votre site", texte: "Consigne stricte : l'agent s'appuie sur vos pages et ne cite ni chiffres ni avis que vous n'affichez pas." },
  { icone: Check, titre: "Déconnexion immédiate", texte: "Retirez un réseau ou supprimez votre compte à tout moment, depuis l'application." },
];

function Controle() {
  return (
    <Section id="controle" titre="Vous gardez la main">
      <ul className="grid gap-4 md:grid-cols-3">
        {GARANTIES.map(({ icone: Icone, titre, texte }) => (
          <li key={titre} className="flex gap-4 rounded-2xl border border-bord bg-carte p-5">
            <Icone size={22} className="mt-0.5 shrink-0 text-ok" aria-hidden />
            <div>
              <h3 className="font-semibold">{titre}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-doux">{texte}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const FAQ = [
  {
    q: "Faut-il avoir une entreprise ?",
    r: "Non. Indépendants, artisans, associations ou particuliers : il suffit d'un compte sur les réseaux que vous voulez utiliser.",
  },
  {
    q: "Mon compte Instagram est personnel, ça marche ?",
    r: "Instagram n'autorise la publication automatique que pour les comptes professionnels ou créateurs. Le passage se fait gratuitement en 30 secondes dans les réglages d'Instagram, sans entreprise, et vous gardez vos abonnés.",
  },
  {
    q: "L'agent peut-il publier sans moi ?",
    r: "Seulement si vous le décidez. La validation est activée par défaut : rien n'est publié ni envoyé sans votre accord.",
  },
  {
    q: "Qui voit mes contenus et mes accès ?",
    r: "Vous seul. Les accès à vos réseaux sont conservés côté serveur et ne sont jamais visibles dans le navigateur. Le détail figure dans la politique de confidentialité.",
  },
  {
    q: "Comment arrêter ?",
    r: "Un bouton met l'agent à l'arrêt. Vous pouvez aussi retirer chaque réseau ou supprimer votre compte et toutes vos données depuis les Réglages.",
  },
];

function Questions() {
  return (
    <Section id="questions" titre="Questions fréquentes">
      <div className="max-w-3xl divide-y divide-bord rounded-2xl border border-bord bg-carte">
        {FAQ.map(({ q, r }) => (
          <details key={q} className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {q}
              <span aria-hidden className="text-xl text-doux transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 leading-relaxed text-doux">{r}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Final() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 md:px-6">
      <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-accent/40 bg-carte p-8 md:flex-row md:items-center md:p-12">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Lancez votre agent aujourd'hui</h2>
          <p className="mt-2 text-doux">Créez votre compte, collez le lien de votre site, et regardez-le travailler.</p>
        </div>
        <Link
          {...lienInscription}
          className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-sur-accent transition hover:brightness-110"
        >
          Créer mon compte
          <ArrowRight size={18} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
