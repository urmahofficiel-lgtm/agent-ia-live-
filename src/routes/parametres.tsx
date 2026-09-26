import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Carte, Erreur, Titre, bouton, champ } from "@/components/ui";
import { useReglages } from "@/lib/donnees";
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
      <Titre sous="Comment l'agent doit se comporter.">Réglages</Titre>
      <Carte className="max-w-xl space-y-5">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={form.validation_requise} onChange={(e) => setForm({ ...form, validation_requise: e.target.checked })} />
          <span>
            <span className="font-medium">Me demander de valider avant de publier ou d'envoyer</span>
            <span className="block text-doux">Recommandé au début, le temps de vérifier la qualité du travail de l'agent.</span>
          </span>
        </label>

        <fieldset className="text-sm">
          <legend className="mb-2 font-medium">Mode</legend>
          <label className="mb-2 flex items-start gap-3">
            <input type="radio" name="mode" className="mt-1" checked={form.mode === "prudent"} onChange={() => setForm({ ...form, mode: "prudent" })} />
            <span>
              Prudent <span className="block text-doux">Accès officiels des réseaux, rythme humain. Pas de risque de blocage des comptes.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="radio" name="mode" className="mt-1" checked={form.mode === "agressif"} onChange={() => setForm({ ...form, mode: "agressif" })} />
            <span>
              Agressif <span className="block text-doux">Plus de volume, contrôle de l'écran. Les réseaux peuvent bloquer ou bannir les comptes.</span>
            </span>
          </label>
        </fieldset>

        <label className="block text-sm">
          <span className="font-medium">Nombre maximum de contacts par jour</span>
          <input
            className={`${champ} mt-1 max-w-32`}
            type="number"
            min={0}
            max={1000}
            value={form.limite_contacts_jour}
            onChange={(e) => setForm({ ...form, limite_contacts_jour: Number(e.target.value) })}
          />
        </label>

        <button className={bouton} onClick={sauver}>Enregistrer</button>
        <Erreur message={erreur} />
        {message && <p className="text-sm text-ok">{message}</p>}
      </Carte>
    </>
  );
}
