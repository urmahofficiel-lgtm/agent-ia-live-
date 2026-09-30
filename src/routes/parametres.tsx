import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Carte, Erreur, Titre, bouton, boutonSecondaire, champ } from "@/components/ui";
import { supprimerCompte } from "@/lib/agent.functions";
import { jetonSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { usePilote, useReglages, useRequete, useStylesParDefaut, useUserId } from "@/lib/donnees";
import { LogoPlateforme } from "@/components/LogoPlateforme";
import { nomPlateforme } from "@/lib/plateformes";
import { CRENEAUX_DEFAUT, CRENEAUX_MAX, RYTHME_MAX, estPilotable, normaliserCreneaux, postsParJour } from "@/lib/pilote";
import { ChoixStyle } from "@/components/StylesCreatifs";
import { STYLES_IMAGE, STYLES_VIDEO, lireStyleImage, lireStyleVideo } from "@/lib/styles";
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

      <PiloteAutomatique agentActif={reglages.agent_actif} validation={reglages.validation_requise} />

      <StylesParDefaut />

      <ConnecteurIA />

      <ZoneSuppression />
    </>
  );
}

// Pilote automatique : chaque jour, l'agent choisit ses sujets et planifie
// N publications par réseau connecté, aux créneaux choisis (heure de Paris).
function PiloteAutomatique({ agentActif, validation }: { agentActif: boolean; validation: boolean }) {
  const userId = useUserId();
  const { pilote, etat, enregistrer } = usePilote();
  const comptes = useRequete<{ plateforme: string; fournisseur: string | null }[]>(
    () => supabase().from("comptes_connectes").select("plateforme, fournisseur").eq("statut", "connecte"),
    [userId],
  );
  const [actif, setActif] = useState(false);
  const [rythme, setRythme] = useState<Record<string, number>>({});
  const [creneaux, setCreneaux] = useState<string[]>(CRENEAUX_DEFAUT);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setActif(pilote.autopilote);
    setRythme(pilote.rythme);
    setCreneaux(normaliserCreneaux(pilote.creneaux));
  }, [pilote.autopilote, pilote.rythme, pilote.creneaux]);

  // Réseaux connectés que le pilote alimente (ni messagerie, ni profil perso),
  // et ceux qui publient via Zernio (limite de l'offre gratuite).
  const lignes = comptes.data ?? [];
  const reseaux = [...new Set(lignes.map((c) => c.plateforme))].filter(estPilotable);
  const viaZernio = new Set(lignes.filter((c) => c.fournisseur === "zernio").map((c) => c.plateforme));
  const desactive = etat !== "ok";

  async function sauver() {
    setMessage(null);
    const propres = normaliserCreneaux(creneaux.filter(Boolean));
    const e = await enregistrer({ autopilote: actif, rythme, creneaux: propres });
    setErreur(e);
    if (!e) setMessage(actif ? "Pilote automatique enregistré : l'agent planifiera les prochains créneaux." : "Pilote automatique coupé.");
  }

  return (
    <section aria-labelledby="pilote-automatique" className="mt-10 max-w-xl rounded-2xl border border-bord bg-carte p-5">
      <h2 id="pilote-automatique" className="text-lg font-semibold">
        Pilote automatique
      </h2>
      <p className="mt-1 text-sm text-doux">
        Chaque matin, l'agent choisit seul ses sujets (conseils, démonstrations, coulisses, offres) et planifie les publications du
        jour sur chaque réseau connecté. Activé en cours de journée, il planifie les créneaux restants.
      </p>
      {etat === "absent" && (
        <p className="mt-3 rounded-lg bg-alerte/10 px-3 py-2 text-sm text-alerte" role="status">
          Réglage bientôt disponible.
        </p>
      )}

      <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1" checked={actif} disabled={desactive} onChange={(e) => setActif(e.target.checked)} />
        <span>
          <span className="font-medium">Laisser l'agent publier tout seul chaque jour</span>
          <span className="block text-doux">
            {validation
              ? "Les publications arrivent « à valider » : vous les relisez avant leur départ."
              : "Les publications partent seules à l'heure prévue."}
          </span>
        </span>
      </label>
      {actif && !agentActif && (
        <p className="mt-2 text-sm text-alerte" role="status">
          L'agent est à l'arrêt : démarrez-le depuis l'accueil pour que le pilote agisse.
        </p>
      )}

      <fieldset className="mt-5" disabled={desactive}>
        <legend className="text-sm font-medium">Publications par jour</legend>
        {reseaux.length === 0 ? (
          <p className="mt-1 text-sm text-doux">Aucun réseau connecté : connectez-en un depuis la page Comptes.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {reseaux.map((id) => (
              <li key={id} className="flex flex-wrap items-center gap-3 text-sm">
                <LogoPlateforme id={id} taille={24} />
                <label htmlFor={`rythme-${id}`} className="min-w-28">
                  {nomPlateforme(id)}
                </label>
                <select
                  id={`rythme-${id}`}
                  className={`${champ} w-auto`}
                  value={postsParJour(rythme, id)}
                  onChange={(e) => setRythme({ ...rythme, [id]: Number(e.target.value) })}
                >
                  {Array.from({ length: RYTHME_MAX }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} par jour
                    </option>
                  ))}
                </select>
                {id === "linkedin" && <span className="text-xs text-doux">1 à 2 par jour suffisent sur LinkedIn</span>}
                {viaZernio.has(id) && id !== "linkedin" && <span className="text-xs text-doux">via Zernio</span>}
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="mt-5" disabled={desactive}>
        <legend className="text-sm font-medium">Créneaux horaires (heure de Paris)</legend>
        <p className="text-xs text-doux">Au-delà du nombre de créneaux, les publications sont réparties entre 8 h et 21 h.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {creneaux.map((h, i) => (
            <span key={i} className="flex items-center gap-1">
              <input
                type="time"
                className={`${champ} w-auto`}
                value={h}
                aria-label={`Créneau ${i + 1}`}
                onChange={(e) => setCreneaux(creneaux.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {creneaux.length > 1 && (
                <button
                  type="button"
                  className={boutonSecondaire}
                  aria-label={`Retirer le créneau ${h}`}
                  onClick={() => setCreneaux(creneaux.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {creneaux.length < CRENEAUX_MAX && (
            <button type="button" className={boutonSecondaire} onClick={() => setCreneaux([...creneaux, "15:00"])}>
              + Créneau
            </button>
          )}
        </div>
      </fieldset>

      <p className="mt-5 rounded-lg bg-alerte/10 px-3 py-2 text-sm text-alerte" role="note">
        Attention : les publications sur une page entreprise LinkedIn et celles envoyées via Zernio (TikTok…) peuvent atteindre la
        limite de l'offre gratuite de Zernio (2 comptes connectés ; 20 publications par mois sur l'ancienne offre gratuite). Au-delà,
        elles échouent jusqu'au passage à une offre payante ou à la nouvelle offre gratuite (tableau de bord Zernio).
      </p>
      <p className="mt-2 text-xs text-doux">Les changements s'appliquent à la prochaine planification (demain si la journée est déjà planifiée).</p>

      <button className={`${bouton} mt-4`} onClick={sauver} disabled={desactive}>
        Enregistrer
      </button>
      <Erreur message={erreur} />
      {message && (
        <p className="mt-2 text-sm text-ok" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

// Studio créatif : style utilisé par défaut pour les vidéos (bouton et Reels
// automatiques) et les images de l'agent. Enregistré dès qu'on le change.
function StylesParDefaut() {
  const styles = useStylesParDefaut();
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function changer(valeurs: Parameters<typeof styles.enregistrer>[0]) {
    setMessage(null);
    const e = await styles.enregistrer(valeurs);
    setErreur(e);
    if (!e) setMessage("Style par défaut enregistré.");
  }

  return (
    <section aria-labelledby="studio-creatif" className="mt-10 max-w-xl rounded-2xl border border-bord bg-carte p-5">
      <h2 id="studio-creatif" className="text-lg font-semibold">
        Studio créatif
      </h2>
      <p className="mt-1 text-sm text-doux">
        Le style que l'agent utilise pour ses vidéos (dont les Reels automatiques) et ses images. Vous pouvez toujours en choisir un
        autre depuis Publications.
      </p>
      {styles.etat === "absent" && (
        <p className="mt-3 rounded-lg bg-alerte/10 px-3 py-2 text-sm text-alerte" role="status">
          Réglage bientôt disponible : en attendant, l'agent utilise les styles « Classique » et « Photo ».
        </p>
      )}
      <div className="mt-4 space-y-5">
        <ChoixStyle
          legende="Vidéos"
          options={STYLES_VIDEO}
          valeur={styles.video}
          desactive={styles.etat !== "ok"}
          onChange={(id) => changer({ style_video: lireStyleVideo(id) })}
        />
        <ChoixStyle
          legende="Images"
          options={STYLES_IMAGE}
          valeur={styles.image}
          desactive={styles.etat !== "ok"}
          onChange={(id) => changer({ style_image: lireStyleImage(id) })}
        />
      </div>
      <Erreur message={erreur} />
      {message && (
        <p className="mt-2 text-sm text-ok" role="status">
          {message}
        </p>
      )}
    </section>
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
