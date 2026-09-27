import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Marque } from "./Vitrine";
import { Erreur, bouton, champ } from "./ui";

// Messages Supabase les plus courants, en français et avec la marche à suivre.
function traduire(message: string) {
  if (/invalid login credentials/i.test(message)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(message)) return "Adresse pas encore confirmée : cliquez sur le lien reçu par e-mail.";
  if (/already registered/i.test(message)) return "Un compte existe déjà avec cette adresse. Connectez-vous.";
  if (/password should be at least/i.test(message)) return "Le mot de passe doit faire au moins 8 caractères.";
  return message;
}

const ATOUTS = [
  "Analyse de votre site et stratégie de contenu",
  "Textes, images et vidéos prêts à publier",
  "Publication sur vos réseaux après votre validation",
];

export function Connexion({ modeInitial = "connexion" }: { modeInitial?: "connexion" | "inscription" }) {
  const [mode, setMode] = useState(modeInitial);
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [voir, setVoir] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const inscription = mode === "inscription";

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    const auth = supabase().auth;
    const { error, data } = inscription
      ? await auth.signUp({
          email,
          password: motDePasse,
          // Le lien de confirmation ramène sur le site où l'on s'est inscrit.
          options: { emailRedirectTo: window.location.origin },
        })
      : await auth.signInWithPassword({ email, password: motDePasse });
    setEnvoi(false);
    if (error) return setErreur(traduire(error.message));
    if (inscription && !data.session) {
      setInfo("Compte créé. Confirmez votre adresse avec le lien reçu par e-mail, puis connectez-vous.");
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden flex-col justify-between border-r border-bord bg-carte/60 p-10 lg:flex">
        <Link to="/" aria-label="Retour à l'accueil">
          <Marque />
        </Link>
        <div>
          <h2 className="max-w-md text-4xl leading-tight font-bold">Votre agent marketing travaille pendant que vous travaillez.</h2>
          <ul className="mt-8 space-y-3">
            {ATOUTS.map((a) => (
              <li key={a} className="flex items-center gap-3 text-doux">
                <Check size={18} className="shrink-0 text-ok" aria-hidden />
                {a}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-doux">Rien n'est publié sans votre accord.</p>
      </aside>

      <main className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="mb-10 inline-block lg:hidden" aria-label="Retour à l'accueil">
            <Marque />
          </Link>
          <h1 className="text-3xl font-bold">{inscription ? "Créer votre compte" : "Bon retour"}</h1>
          <p className="mt-2 text-doux">
            {inscription ? "Deux champs, et votre agent est prêt à démarrer." : "Connectez-vous pour piloter votre agent."}
          </p>

          <form onSubmit={soumettre} className="mt-8 space-y-4" noValidate={false}>
            <label className="block text-sm font-medium">
              E-mail
              <input
                className={`${champ} mt-1.5 min-h-11 text-base`}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Mot de passe
              <span className="relative mt-1.5 block">
                <input
                  className={`${champ} min-h-11 pr-11 text-base`}
                  type={voir ? "text" : "password"}
                  autoComplete={inscription ? "new-password" : "current-password"}
                  minLength={8}
                  required
                  aria-describedby={inscription ? "aide-mdp" : undefined}
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setVoir((v) => !v)}
                  aria-label={voir ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-doux hover:text-texte"
                >
                  {voir ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </span>
              {inscription && (
                <span id="aide-mdp" className="mt-1.5 block text-xs font-normal text-doux">
                  8 caractères minimum.
                </span>
              )}
            </label>
            <button className={`${bouton} flex min-h-11 w-full items-center justify-center gap-2 text-base`} disabled={envoi}>
              {envoi && <LoaderCircle size={18} className="animate-spin" aria-hidden />}
              {inscription ? "Créer mon compte" : "Se connecter"}
            </button>
          </form>

          <div aria-live="polite">
            <Erreur message={erreur} />
            {info && <p className="mt-3 rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">{info}</p>}
          </div>

          <p className="mt-6 text-sm text-doux">
            {inscription ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
            <button
              type="button"
              className="font-medium text-accent hover:underline"
              onClick={() => {
                setMode(inscription ? "connexion" : "inscription");
                setErreur(null);
                setInfo(null);
              }}
            >
              {inscription ? "Se connecter" : "Créer un compte"}
            </button>
          </p>
          {inscription && (
            <p className="mt-6 text-xs leading-relaxed text-doux">
              En créant un compte, vous acceptez les{" "}
              <Link to="/conditions" className="underline hover:text-texte">
                conditions d'utilisation
              </Link>{" "}
              et la{" "}
              <Link to="/confidentialite" className="underline hover:text-texte">
                politique de confidentialité
              </Link>
              .
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
