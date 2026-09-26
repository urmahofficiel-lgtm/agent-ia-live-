import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Carte, Erreur, Titre, bouton, champ } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useRequete, useUserId } from "@/lib/donnees";
import type { Prospect } from "@/lib/types";
import { CATEGORIES } from "@/lib/osm";
import { trouverProspects } from "@/lib/agent.functions";
import { jetonSession } from "@/lib/session";

export const Route = createFileRoute("/prospection")({ component: Prospection });

const STATUTS: Record<string, string> = {
  nouveau: "Nouveau",
  contacte: "Contacté",
  relance: "Relancé",
  a_repondu: "A répondu",
  client: "Client",
  refus: "Refus",
  ne_plus_contacter: "Ne plus contacter",
};

function Prospection() {
  const userId = useUserId();
  const liste = useRequete<Prospect[]>(
    () => supabase().from("prospects").select("*").order("created_at", { ascending: false }),
    [userId],
  );
  const [form, setForm] = useState({ type: "entreprise", nom: "", entreprise: "", email: "", telephone: "", source: "", consentement: false });
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState({ categorie: "restaurant", ville: "" });
  const [cherche, setCherche] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);

  async function chercher(e: FormEvent) {
    e.preventDefault();
    setCherche(true);
    setErreur(null);
    setResultat(null);
    try {
      const r = await trouverProspects({ data: { ...recherche, max: 50, jeton: await jetonSession() } });
      if (r.ok) setResultat(`${r.trouves} trouvé(s), ${r.ajoutes} nouveau(x) ajouté(s) à votre liste.`);
      else setErreur(r.erreur);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setCherche(false);
    await liste.recharger();
  }

  const maj = (champ: keyof typeof form, valeur: string | boolean) => setForm((f) => ({ ...f, [champ]: valeur }));

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    const { error } = await supabase().from("prospects").insert({
      user_id: userId,
      ...form,
      entreprise: form.entreprise || null,
      email: form.email || null,
      telephone: form.telephone || null,
      source: form.source || null,
    });
    setErreur(error?.message ?? null);
    if (!error) {
      setForm((f) => ({ ...f, nom: "", entreprise: "", email: "", telephone: "", consentement: false }));
      await liste.recharger();
    }
  }

  async function changerStatut(id: string, statut: string) {
    const { error } = await supabase().from("prospects").update({ statut }).eq("id", id);
    setErreur(error?.message ?? null);
    await liste.recharger();
  }

  return (
    <>
      <Titre sous="Votre mini-CRM : qui trouver, qui contacter, qui relancer, qui a répondu.">Prospection</Titre>

      <Carte className="mb-4">
        <h2 className="mb-3 font-medium">Trouver des entreprises automatiquement</h2>
        <form onSubmit={chercher} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm">
            Activité
            <select className={champ} value={recherche.categorie} onChange={(e) => setRecherche({ ...recherche, categorie: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Ville
            <input className={champ} required placeholder="Lyon" value={recherche.ville} onChange={(e) => setRecherche({ ...recherche, ville: e.target.value })} />
          </label>
          <div className="flex items-end">
            <button className={bouton} disabled={cherche}>{cherche ? "Recherche…" : "Chercher"}</button>
          </div>
        </form>
        {resultat && <p className="mt-2 text-sm text-ok">{resultat}</p>}
        <p className="mt-2 text-xs text-doux">Source : OpenStreetMap (données publiques). Téléphone, site et e-mail quand ils sont renseignés.</p>
      </Carte>

      <Carte className="mb-6">
        <h2 className="mb-3 font-medium">Ajouter un prospect à la main</h2>
        <form onSubmit={ajouter} className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            Type
            <select className={champ} value={form.type} onChange={(e) => maj("type", e.target.value)}>
              <option value="entreprise">Entreprise</option>
              <option value="particulier">Particulier</option>
            </select>
          </label>
          <label className="text-sm">
            Nom
            <input className={champ} required value={form.nom} onChange={(e) => maj("nom", e.target.value)} />
          </label>
          <label className="text-sm">
            Entreprise
            <input className={champ} value={form.entreprise} onChange={(e) => maj("entreprise", e.target.value)} />
          </label>
          <label className="text-sm">
            E-mail
            <input className={champ} type="email" value={form.email} onChange={(e) => maj("email", e.target.value)} />
          </label>
          <label className="text-sm">
            Téléphone
            <input className={champ} type="tel" value={form.telephone} onChange={(e) => maj("telephone", e.target.value)} />
          </label>
          <label className="text-sm">
            Source
            <input className={champ} placeholder="Google Maps, LinkedIn…" value={form.source} onChange={(e) => maj("source", e.target.value)} />
          </label>
          {form.type === "particulier" && (
            <label className="flex items-center gap-2 text-sm md:col-span-3">
              <input type="checkbox" checked={form.consentement} onChange={(e) => maj("consentement", e.target.checked)} />
              Ce particulier a donné son accord pour être contacté (obligatoire pour le démarcher — RGPD)
            </label>
          )}
          <div className="md:col-span-3">
            <button className={bouton}>Ajouter le prospect</button>
          </div>
        </form>
        <Erreur message={erreur ?? liste.erreur} />
      </Carte>

      <Carte className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="text-doux">
            <tr className="border-b border-bord">
              <th className="p-3 font-medium">Nom</th>
              <th className="p-3 font-medium">Contact</th>
              <th className="p-3 font-medium">Source</th>
              <th className="p-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {liste.data?.length === 0 && (
              <tr><td colSpan={4} className="p-3 text-doux">Aucun prospect pour l'instant.</td></tr>
            )}
            {liste.data?.map((p) => (
              <tr key={p.id} className="border-b border-bord last:border-0">
                <td className="p-3">
                  {p.nom}
                  <span className="block text-xs text-doux">
                    {p.type === "particulier" ? `Particulier${p.consentement ? " · accord ✓" : " · sans accord"}` : p.entreprise ?? "Entreprise"}
                  </span>
                </td>
                <td className="p-3 text-doux">{[p.email, p.telephone].filter(Boolean).join(" · ") || "—"}</td>
                <td className="p-3 text-doux">{p.source ?? "—"}</td>
                <td className="p-3">
                  <select className={champ} value={p.statut} onChange={(e) => changerStatut(p.id, e.target.value)} aria-label={`Statut de ${p.nom}`}>
                    {Object.entries(STATUTS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Carte>
    </>
  );
}
