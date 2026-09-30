import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Carte, Erreur, Titre, bouton, champ } from "@/components/ui";
import { supprimerCompte } from "@/lib/agent.functions";
import { jetonSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { useReglages } from "@/lib/donnees";
import { ConnecteurIA } from "@/components/ConnecteurIA";
import type { Reglages } from "@/lib/types";

export const Route = createFileRoute("/parametres")({ component: Parametres });

function Parametres() {
  const { reglages, enregistrer } = useReglages();
  const [form, setForm] = useState<Reglages>(reglages);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => setForm(reglages), [reglages]);

  async function sauver() {
    const e = await enregistrer(form);
    setErreur(e);
    setMessage(e ? null : "Réglages enregistrés.");
  }

  return (
    <>
      <Titre sous="Comment l'agent doit se comporter, et votre compte.">Réglages</Titre>
      <Carte className="max-w-xl space-y-5">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={form.validation_requise} onChange={(e) => setForm({ ...form, validation_requise: e.target.checked })} />
          <span>
            <span className="font-medium">Me demander de valider avant de publier ou d'envoyer</span>
            <span className="block text-doux">Recommandé au début, le temps de vérifier la qualité du travail de l'agent.</span>
          </span>
        </label>

        <button className={bouton} onClick={sauver}>Enregistrer</button>
        <Erreur message={erreur} />
        {message && <p className="text-sm text-ok">{message}</p>}
      </Carte>

      <ConnecteurIA />

      <ZoneSuppression />
    </>
  );
}

// Suppression définitive : demande de taper un mot pour éviter les erreurs.
function ZoneSuppression() {
  const [confirmation, setConfirmation] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function supprimer() {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await supprimerCompte({ data: { jeton: await jetonSession(), confirmation: "SUPPRIMER" } });
      if (!r.ok) {
        setErreur(r.erreur);
        setEnCours(false);
        return;
      }
      await supabase().auth.signOut();
      window.location.assign("/");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
      setEnCours(false);
    }
  }

  return (
    <section aria-labelledby="zone-suppression" className="mt-10 max-w-xl rounded-2xl border border-erreur/40 p-5">
      <h2 id="zone-suppression" className="text-lg font-semibold text-erreur">
        Supprimer mon compte
      </h2>
      <p className="mt-2 text-sm text-doux">
        Efface définitivement votre compte, votre stratégie, vos publications, images, vidéos, prospects et tous les accès aux
        réseaux sociaux. Cette action est irréversible.
      </p>
      <label className="mt-4 block text-sm">
        Tapez <span className="font-mono font-semibold">SUPPRIMER</span> pour confirmer
        <input className={`${champ} mt-1 max-w-56`} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" />
      </label>
      <button
        className="mt-3 rounded-lg bg-erreur px-4 py-2 text-sm font-semibold text-fond hover:brightness-110 disabled:opacity-50"
        disabled={confirmation !== "SUPPRIMER" || enCours}
        onClick={supprimer}
      >
        {enCours ? "Suppression…" : "Supprimer définitivement"}
      </button>
      <Erreur message={erreur} />
    </section>
  );
}
