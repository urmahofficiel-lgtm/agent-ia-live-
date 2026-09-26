import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Carte, Erreur, Titre, bouton, boutonSecondaire, champ } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useReglages, useRequete, useUserId } from "@/lib/donnees";
import { PLATEFORMES, nomPlateforme } from "@/lib/plateformes";
import { LIBELLE_STATUT, LIBELLE_TYPE, type StatutTache, type Tache, type TypeTache } from "@/lib/types";

export const Route = createFileRoute("/taches")({ component: Taches });

// Types qui produisent quelque chose de visible par d'autres : ils passent par
// « à valider » tant que la validation est activée.
const TYPES_A_VALIDER: TypeTache[] = ["publication", "reponse", "prospection", "relance"];

function Taches() {
  const userId = useUserId();
  const { reglages } = useReglages();
  const liste = useRequete<Tache[]>(
    () => supabase().from("taches").select("*").order("created_at", { ascending: false }).limit(200),
    [userId],
  );
  const [type, setType] = useState<TypeTache>("publication");
  const [plateforme, setPlateforme] = useState("facebook");
  const [titre, setTitre] = useState("");
  const [consigne, setConsigne] = useState("");
  const [quand, setQuand] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    const statut: StatutTache =
      reglages.validation_requise && TYPES_A_VALIDER.includes(type) ? "a_valider" : "en_attente";
    const { error } = await supabase().from("taches").insert({
      user_id: userId,
      type,
      plateforme: type === "appareil" ? null : plateforme,
      titre,
      consigne,
      statut,
      planifiee_pour: quand ? new Date(quand).toISOString() : null,
    });
    setErreur(error?.message ?? null);
    if (!error) {
      setTitre("");
      setConsigne("");
      setQuand("");
      await liste.recharger();
    }
  }

  async function changerStatut(id: string, statut: StatutTache) {
    const { error } = await supabase().from("taches").update({ statut }).eq("id", id);
    setErreur(error?.message ?? null);
    await liste.recharger();
  }

  return (
    <>
      <Titre sous="Donnez des consignes à l'agent : publier, répondre, prospecter, agir sur l'appareil…">Tâches</Titre>

      <Carte className="mb-6">
        <form onSubmit={creer} className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Type
            <select className={champ} value={type} onChange={(e) => setType(e.target.value as TypeTache)}>
              {Object.entries(LIBELLE_TYPE).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          {type !== "appareil" && (
            <label className="text-sm">
              Plateforme
              <select className={champ} value={plateforme} onChange={(e) => setPlateforme(e.target.value)}>
                {PLATEFORMES.map((p) => (
                  <option key={p.id} value={p.id}>{p.nom}</option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm md:col-span-2">
            Titre
            <input className={champ} required value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. : Post promo de la semaine" />
          </label>
          <label className="text-sm md:col-span-2">
            Consigne pour l'agent
            <textarea className={`${champ} min-h-24`} value={consigne} onChange={(e) => setConsigne(e.target.value)} placeholder="Ex. : Crée un post avec une image sur notre offre, ton chaleureux, 3 hashtags." />
          </label>
          <label className="text-sm">
            Planifier pour (optionnel)
            <input className={champ} type="datetime-local" value={quand} onChange={(e) => setQuand(e.target.value)} />
          </label>
          <div className="flex items-end">
            <button className={bouton}>Ajouter la tâche</button>
          </div>
        </form>
        <Erreur message={erreur ?? liste.erreur} />
      </Carte>

      <div className="space-y-2">
        {liste.data?.length === 0 && <p className="text-sm text-doux">Aucune tâche pour l'instant.</p>}
        {liste.data?.map((t) => (
          <Carte key={t.id} className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{t.titre}</p>
              <p className="text-sm text-doux">
                {LIBELLE_TYPE[t.type]}
                {t.plateforme && ` · ${nomPlateforme(t.plateforme)}`} · {LIBELLE_STATUT[t.statut]}
                {t.planifiee_pour && ` · prévu le ${new Date(t.planifiee_pour).toLocaleString("fr-FR")}`}
              </p>
              {t.consigne && <p className="mt-1 text-sm whitespace-pre-wrap">{t.consigne}</p>}
            </div>
            <div className="flex gap-2">
              {t.statut === "a_valider" && (
                <button className={boutonSecondaire} onClick={() => changerStatut(t.id, "en_attente")}>Valider</button>
              )}
              {["a_valider", "en_attente"].includes(t.statut) && (
                <button className={boutonSecondaire} onClick={() => changerStatut(t.id, "annulee")}>Annuler</button>
              )}
            </div>
          </Carte>
        ))}
      </div>
    </>
  );
}
