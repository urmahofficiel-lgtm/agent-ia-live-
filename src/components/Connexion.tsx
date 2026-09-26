import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { Carte, Erreur, bouton, champ } from "./ui";

export function Connexion() {
  const [mode, setMode] = useState<"connexion" | "inscription">("connexion");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    const auth = supabase().auth;
    const { error, data } =
      mode === "connexion"
        ? await auth.signInWithPassword({ email, password: motDePasse })
        : await auth.signUp({ email, password: motDePasse });
    setEnvoi(false);
    if (error) return setErreur(error.message);
    if (mode === "inscription" && !data.session) {
      setInfo("Compte créé. Confirmez votre adresse via l'e-mail reçu, puis connectez-vous.");
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Carte className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">Agent IA Live</h1>
        <p className="mb-4 text-sm text-doux">
          {mode === "connexion" ? "Connectez-vous pour piloter votre agent." : "Créez votre compte."}
        </p>
        <form onSubmit={soumettre} className="space-y-3">
          <label className="block text-sm">
            E-mail
            <input className={champ} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm">
            Mot de passe
            <input
              className={champ}
              type="password"
              autoComplete={mode === "connexion" ? "current-password" : "new-password"}
              minLength={8}
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          </label>
          <button className={`${bouton} w-full`} disabled={envoi}>
            {envoi ? "…" : mode === "connexion" ? "Se connecter" : "Créer le compte"}
          </button>
        </form>
        <Erreur message={erreur} />
        {info && <p className="mt-2 text-sm text-ok">{info}</p>}
        <button
          type="button"
          className="mt-4 text-sm text-doux underline"
          onClick={() => setMode(mode === "connexion" ? "inscription" : "connexion")}
        >
          {mode === "connexion" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </Carte>
    </div>
  );
}
