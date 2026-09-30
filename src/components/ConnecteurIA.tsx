import { useState } from "react";
import { Check, Copy, Plug, Trash2 } from "lucide-react";
import { Carte, Erreur, bouton, boutonSecondaire, champ } from "./ui";
import { supabase } from "@/lib/supabase";
import { jetonSession } from "@/lib/session";
import { useRequete, useUserId } from "@/lib/donnees";
import { creerCleConnecteur } from "@/lib/connecteur.functions";

type Cle = { id: string; nom: string; created_at: string; dernier_usage: string | null };

// Piloter l'agent depuis Claude, ChatGPT… : une adresse secrète par appli.
export function ConnecteurIA() {
  const userId = useUserId();
  const cles = useRequete<Cle[]>(
    () => supabase().from("cles_connecteur").select("id, nom, created_at, dernier_usage").order("created_at", { ascending: false }),
    [userId],
  );
  const [nom, setNom] = useState("Claude");
  const [url, setUrl] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer() {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await creerCleConnecteur({ data: { nom, jeton: await jetonSession() } });
      if (r.ok) setUrl(r.url);
      else setErreur(r.erreur);
      await cles.recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setEnCours(false);
  }

  async function copier() {
    if (!url) return;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }

  async function supprimer(c: Cle) {
    if (!window.confirm(`Déconnecter « ${c.nom} » ? L'appli ne pourra plus piloter l'agent avec cette adresse.`)) return;
    const { error } = await supabase().from("cles_connecteur").delete().eq("id", c.id);
    setErreur(error?.message ?? null);
    await cles.recharger();
  }

  return (
    <Carte className="mt-10 max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Plug size={18} className="text-accent" aria-hidden />
        <h2 className="text-lg font-semibold">Piloter l'agent depuis Claude ou ChatGPT</h2>
      </div>
      <p className="text-sm text-doux">
        Créez une adresse, puis ajoutez-la comme connecteur. Vous pourrez ensuite écrire, par exemple : « Crée un Reel sur nos chantiers
        et publie-le demain à 18 h sur Facebook et Instagram ».
      </p>

      {url ? (
        <div className="space-y-2 rounded-xl border border-accent/50 bg-accent/5 p-3">
          <p className="text-sm font-medium">Votre adresse (affichée une seule fois, gardez-la secrète) :</p>
          <p className="font-mono text-xs break-all">{url}</p>
          <button className={`${bouton} flex items-center gap-2`} onClick={copier}>
            {copie ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copie ? "Copiée" : "Copier l'adresse"}
          </button>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-doux">
            <li>
              <strong>Claude</strong> : Paramètres → Connecteurs → Ajouter un connecteur personnalisé → nom « Agent IA Live » → collez
              l'adresse → Ajouter.
            </li>
            <li>
              <strong>ChatGPT</strong> : Paramètres → Applications et connecteurs → Mode développeur → Créer → collez l'adresse, sans
              authentification.
            </li>
          </ol>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Pour quelle appli ?
            <input className={`${champ} mt-1 w-40`} value={nom} onChange={(e) => setNom(e.target.value)} />
          </label>
          <button className={bouton} disabled={enCours || !nom.trim()} onClick={creer}>
            {enCours ? "Création…" : "Créer une adresse"}
          </button>
        </div>
      )}
      <Erreur message={erreur ?? cles.erreur} />

      {(cles.data ?? []).length > 0 && (
        <ul className="divide-y divide-bord border-t border-bord text-sm">
          {cles.data!.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="font-medium">{c.nom}</span>
                <span className="block text-xs text-doux">
                  {c.dernier_usage ? `Utilisée le ${new Date(c.dernier_usage).toLocaleString("fr-FR")}` : "Pas encore utilisée"}
                </span>
              </span>
              <button className={`${boutonSecondaire} flex items-center gap-1.5`} onClick={() => supprimer(c)}>
                <Trash2 size={14} aria-hidden />
                Déconnecter
              </button>
            </li>
          ))}
        </ul>
      )}
    </Carte>
  );
}
