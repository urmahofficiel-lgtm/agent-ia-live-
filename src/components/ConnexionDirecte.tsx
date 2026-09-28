import { useState, type FormEvent } from "react";
import { LoaderCircle, X } from "lucide-react";
import { Carte, Erreur, bouton, boutonSecondaire, champ } from "./ui";
import { LogoPlateforme } from "./LogoPlateforme";
import { connecterDirect } from "@/lib/agent.functions";
import { jetonSession } from "@/lib/session";

export const RESEAUX_DIRECTS = ["bluesky", "telegram"] as const;
export type ReseauDirect = (typeof RESEAUX_DIRECTS)[number];

// Réseaux sans page d'autorisation : on saisit un identifiant vérifié tout de
// suite auprès du réseau. Rien n'est gardé dans le navigateur.
export function ConnexionDirecte({ reseau, onFini }: { reseau: ReseauDirect; onFini: (connecte: boolean) => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const jeton = await jetonSession();
      const r =
        reseau === "bluesky"
          ? await connecterDirect({ data: { plateforme: "bluesky", identifiant: a, motDePasse: b, jeton } })
          : await connecterDirect({ data: { plateforme: "telegram", token: a, chat: b, jeton } });
      if (r.ok) return onFini(true);
      setErreur(r.erreur);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur");
    }
    setEnvoi(false);
  }

  const bluesky = reseau === "bluesky";
  return (
    <Carte className="mb-6 border-accent/40 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-lg font-semibold">
          <LogoPlateforme id={reseau} taille={32} />
          Connecter {bluesky ? "Bluesky" : "un canal Telegram"}
        </h2>
        <button type="button" onClick={() => onFini(false)} aria-label="Fermer" className="rounded-lg p-2 text-doux hover:bg-bord">
          <X size={18} aria-hidden />
        </button>
      </div>

      <ol className="mb-5 list-decimal space-y-1.5 pl-5 text-sm text-doux">
        {bluesky ? (
          <>
            <li>
              Dans Bluesky : <strong className="text-texte">Paramètres → Confidentialité et sécurité → Mots de passe d'application</strong>.
            </li>
            <li>
              Cliquez sur <strong className="text-texte">Ajouter un mot de passe</strong>, nommez-le « Agent IA Live », copiez-le.
            </li>
            <li>Collez ci-dessous votre identifiant et ce mot de passe (jamais votre mot de passe principal).</li>
          </>
        ) : (
          <>
            <li>
              Dans Telegram, ouvrez <strong className="text-texte">@BotFather</strong>, envoyez <code>/newbot</code> et suivez les étapes : il
              vous donne un <strong className="text-texte">jeton</strong>.
            </li>
            <li>
              Ajoutez ce bot comme <strong className="text-texte">administrateur</strong> de votre canal (droit « Publier des messages »).
            </li>
            <li>Collez ci-dessous le jeton et le nom du canal (ex. @moncanal ou t.me/moncanal).</li>
          </>
        )}
      </ol>

      <form onSubmit={envoyer} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {bluesky ? "Identifiant Bluesky" : "Jeton du bot"}
          <input
            className={`${champ} mt-1`}
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder={bluesky ? "btpecosystem.bsky.social" : "123456789:AA…"}
            autoComplete="off"
            required
          />
        </label>
        <label className="text-sm">
          {bluesky ? "Mot de passe d'application" : "Canal"}
          <input
            className={`${champ} mt-1`}
            type={bluesky ? "password" : "text"}
            value={b}
            onChange={(e) => setB(e.target.value)}
            placeholder={bluesky ? "xxxx-xxxx-xxxx-xxxx" : "@moncanal"}
            autoComplete="off"
            required
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button className={`${bouton} flex items-center gap-2`} disabled={envoi}>
            {envoi && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
            {envoi ? "Vérification…" : "Vérifier et connecter"}
          </button>
          <button type="button" className={boutonSecondaire} onClick={() => onFini(false)}>
            Annuler
          </button>
        </div>
      </form>
      <Erreur message={erreur} />
    </Carte>
  );
}
