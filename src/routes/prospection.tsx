import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import {
  Globe,
  LoaderCircle,
  Mail,
  MessageCircle,
  Phone,
  PenLine,
  Search,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  Carte,
  Erreur,
  Pastille,
  Titre,
  bouton,
  boutonSecondaire,
  champ,
} from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useRequete, useUserId } from "@/lib/donnees";
import type { Prospect } from "@/lib/types";
import { CATEGORIES } from "@/lib/osm";
import {
  envoyerEmail,
  redigerProspect,
  trouverProspects,
} from "@/lib/agent.functions";
import { jetonSession } from "@/lib/session";
import {
  estARelancer,
  liensContact,
  messageErreurProspect,
  type Canal,
  type LienContact,
} from "@/lib/prospection";

const hote = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "le web";
  }
};

// Réglages de l'agent e-mail : rédaction automatique, validation ou envoi
// direct, nombre d'e-mails par jour, adresses d'expédition et de réponse.
function AgentEmail({
  reglages: r,
  enregistrer,
}: {
  reglages: ReglagesProspection;
  enregistrer: (v: Partial<ReglagesProspection>) => Promise<void>;
}) {
  const adresse = (v: string) => v.trim().toLowerCase() || null;
  return (
    <Carte className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Mail className="size-4" aria-hidden />
          Agent e-mail
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={r.email_auto}
            disabled={!r.email_expediteur}
            onChange={(e) => void enregistrer({ email_auto: e.target.checked })}
          />
          {r.email_auto ? "Activé" : "Désactivé"}
        </label>
      </div>
      <p className="mt-1 text-xs text-doux">
        En semaine de 8 h à 18 h, l'agent écrit aux nouveaux prospects qui ont
        une adresse e-mail, puis relance une fois sans réponse. Chaque e-mail
        contient un lien de désinscription en 1 clic ; un prospect désinscrit ou
        qui signale un spam n'est plus jamais contacté.
      </p>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <label className="grid gap-1">
          Adresse d'expédition
          <input
            type="email"
            className={champ}
            placeholder="prospection@btp-ecosystem.com"
            defaultValue={r.email_expediteur ?? ""}
            key={`exp-${r.email_expediteur}`}
            onBlur={(e) => {
              const v = adresse(e.target.value);
              if (v !== r.email_expediteur)
                void enregistrer({ email_expediteur: v });
            }}
          />
        </label>
        <label className="grid gap-1">
          Les réponses arrivent sur
          <input
            type="email"
            className={champ}
            placeholder="votre adresse habituelle"
            defaultValue={r.email_reponse ?? ""}
            key={`rep-${r.email_reponse}`}
            onBlur={(e) => {
              const v = adresse(e.target.value);
              if (v !== r.email_reponse) void enregistrer({ email_reponse: v });
            }}
          />
        </label>
        <label className="flex items-center gap-2">
          E-mails par jour
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            className={`${champ} w-20`}
            defaultValue={r.email_par_jour}
            key={`jour-${r.email_par_jour}`}
            onBlur={(e) => {
              const v = borner(e.target.value, 1, 100, r.email_par_jour);
              if (v !== r.email_par_jour)
                void enregistrer({ email_par_jour: v });
            }}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={r.email_validation}
            onChange={(e) =>
              void enregistrer({ email_validation: e.target.checked })
            }
          />
          Je relis chaque e-mail avant l'envoi
        </label>
      </div>
      <p className="mt-2 text-xs text-doux">
        Conseil : commencez à 10 par jour avec la relecture, puis montez
        progressivement (20, puis 30) pour ne pas tomber dans les indésirables.
      </p>
    </Carte>
  );
}

export const Route = createFileRoute("/prospection")({
  component: Prospection,
});

const STATUTS: Record<
  string,
  {
    libelle: string;
    ton: "ok" | "alerte" | "erreur" | "accent" | "doux" | "plan";
  }
> = {
  nouveau: { libelle: "Nouveau", ton: "doux" },
  contacte: { libelle: "Contacté", ton: "plan" },
  relance: { libelle: "Relancé", ton: "plan" },
  a_repondu: { libelle: "A répondu", ton: "accent" },
  client: { libelle: "Client", ton: "ok" },
  refus: { libelle: "Refus", ton: "doux" },
  ne_plus_contacter: { libelle: "Ne plus contacter", ton: "erreur" },
};

type Filtre =
  | "tous"
  | "a_valider"
  | "a_relancer"
  | "nouveau"
  | "rge"
  | "contactes"
  | "a_repondu"
  | "client";
const FILTRES: { id: Filtre; libelle: string }[] = [
  { id: "tous", libelle: "Tous" },
  { id: "a_valider", libelle: "À valider" },
  { id: "a_relancer", libelle: "À relancer" },
  { id: "nouveau", libelle: "Nouveaux" },
  { id: "rge", libelle: "RGE" },
  { id: "contactes", libelle: "Contactés" },
  { id: "a_repondu", libelle: "Ont répondu" },
  { id: "client", libelle: "Clients" },
];

type ReglagesProspection = {
  limite_contacts_jour: number;
  relance_apres_jours: number;
  email_auto: boolean;
  email_validation: boolean;
  email_par_jour: number;
  email_expediteur: string | null;
  email_reponse: string | null;
};

const erreurLisible = (m: string) => messageErreurProspect(m) ?? m;
const borner = (v: string, min: number, max: number, defaut: number) =>
  Math.min(Math.max(Number.parseInt(v, 10) || defaut, min), max);

function Prospection() {
  const userId = useUserId();
  const liste = useRequete<Prospect[]>(
    () =>
      supabase()
        .from("prospects")
        .select("*")
        .order("created_at", { ascending: false }),
    [userId],
  );
  const reglages = useRequete<ReglagesProspection>(
    () =>
      supabase()
        .from("reglages_agent")
        .select(
          "limite_contacts_jour, relance_apres_jours, email_auto, email_validation, email_par_jour, email_expediteur, email_reponse",
        )
        .maybeSingle(),
    [userId],
  );
  const restants = useRequete<number>(
    () => supabase().rpc("mes_contacts_restants"),
    [userId],
  );
  const limite = reglages.data?.limite_contacts_jour ?? 20;
  const delai = reglages.data?.relance_apres_jours ?? 7;

  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [erreur, setErreur] = useState<string | null>(null);

  const prospects = liste.data ?? [];
  // Répartition par filtre, calculée une fois par chargement.
  const parFiltre = useMemo(() => {
    const maintenant = new Date();
    const garder = (p: Prospect, f: Filtre) => {
      if (f === "tous") return true;
      if (f === "a_valider")
        return p.brouillon !== null && p.statut !== "ne_plus_contacter";
      if (f === "a_relancer") return estARelancer(p, delai, maintenant);
      if (f === "rge") return /\bRGE\b/.test(p.infos ?? "");
      if (f === "contactes")
        return p.statut === "contacte" || p.statut === "relance";
      return p.statut === f;
    };
    return Object.fromEntries(
      FILTRES.map((f) => [f.id, prospects.filter((p) => garder(p, f.id))]),
    ) as Record<Filtre, Prospect[]>;
  }, [prospects, delai]);
  const aRelancer = useMemo(
    () => new Set(parFiltre.a_relancer.map((p) => p.id)),
    [parFiltre],
  );
  const affiches = parFiltre[filtre];

  async function actualiser() {
    await Promise.all([liste.recharger(), restants.recharger()]);
  }

  async function enregistrerReglages(valeurs: Partial<ReglagesProspection>) {
    if (!userId) return;
    const { error } = await supabase()
      .from("reglages_agent")
      .upsert({ user_id: userId, ...valeurs });
    setErreur(error?.message ?? null);
    await Promise.all([reglages.recharger(), restants.recharger()]);
  }

  return (
    <>
      <Titre sous="Trouvez des entreprises, laissez l'IA préparer un message sur mesure. Les e-mails peuvent partir seuls (agent e-mail) ; SMS et WhatsApp, c'est vous qui envoyez.">
        Prospection
      </Titre>

      <Recherche onFini={actualiser} />

      <Carte className="mb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <p className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-ok" aria-hidden />
            <span>
              Contacts possibles aujourd'hui :{" "}
              <strong className="tabular-nums">{restants.data ?? "…"}</strong> /{" "}
              {limite}
            </span>
          </p>
          <label className="flex items-center gap-2">
            Limite par jour
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={1000}
              className={`${champ} w-20`}
              defaultValue={limite}
              key={`limite-${limite}`}
              onBlur={(e) => {
                const v = borner(e.target.value, 0, 1000, limite);
                if (v !== limite)
                  void enregistrerReglages({ limite_contacts_jour: v });
              }}
            />
          </label>
          <label className="flex items-center gap-2">
            Relancer après
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={90}
              className={`${champ} w-20`}
              defaultValue={delai}
              key={`delai-${delai}`}
              onBlur={(e) => {
                const v = borner(e.target.value, 1, 90, delai);
                if (v !== delai)
                  void enregistrerReglages({ relance_apres_jours: v });
              }}
            />
            jours sans réponse
          </label>
        </div>
        <p className="mt-2 text-xs text-doux">
          Prospection B2B : le message doit concerner l'activité du destinataire
          et lui permettre de s'opposer (mention « STOP » ajoutée
          automatiquement). Un prospect « Ne plus contacter » n'est plus jamais
          proposé au contact.
        </p>
        <Erreur message={erreur ?? reglages.erreur} />
      </Carte>

      {reglages.data && (
        <AgentEmail
          reglages={reglages.data}
          enregistrer={enregistrerReglages}
        />
      )}

      <nav
        className="mb-3 flex flex-wrap gap-2"
        aria-label="Filtrer les prospects"
      >
        {FILTRES.map((f) => {
          const actif = filtre === f.id;
          return (
            <button
              key={f.id}
              aria-pressed={actif}
              onClick={() => setFiltre(f.id)}
              className={`rounded-full border px-3 py-1 text-sm ${actif ? "border-accent bg-accent/15 text-accent" : "border-bord text-doux hover:bg-bord"}`}
            >
              {f.libelle}{" "}
              <span className="tabular-nums">{parFiltre[f.id].length}</span>
            </button>
          );
        })}
      </nav>

      <Erreur message={liste.erreur} />
      {!liste.chargement && affiches.length === 0 && (
        <Carte className="mb-6 text-sm text-doux">
          {filtre === "tous"
            ? "Aucun prospect pour l'instant : lancez une recherche ci-dessus."
            : "Aucun prospect dans cette catégorie."}
        </Carte>
      )}
      <div className="mb-6 space-y-3">
        {affiches.map((p) => (
          // Nouvelle clé quand un message est (ré)écrit : la carte repart du texte enregistré.
          <ProspectCarte
            key={`${p.id}-${p.brouillon?.redige_le ?? ""}`}
            p={p}
            aRelancer={aRelancer.has(p.id)}
            onChange={actualiser}
          />
        ))}
      </div>

      <AjoutManuel userId={userId} onAjout={liste.recharger} />
    </>
  );
}

function Recherche({ onFini }: { onFini: () => Promise<void> }) {
  const [recherche, setRecherche] = useState({
    categorie: "restaurant",
    ville: "",
  });
  const [cherche, setCherche] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function chercher(e: FormEvent) {
    e.preventDefault();
    setCherche(true);
    setErreur(null);
    setResultat(null);
    try {
      const r = await trouverProspects({
        data: { ...recherche, max: 50, jeton: await jetonSession() },
      });
      if (r.ok)
        setResultat(
          `${r.trouves} trouvé(s), ${r.ajoutes} nouveau(x) ajouté(s) à votre liste.`,
        );
      else setErreur(r.erreur);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setCherche(false);
    await onFini();
  }

  return (
    <Carte className="mb-4">
      <h2 className="mb-3 font-medium">Trouver des entreprises</h2>
      <form
        onSubmit={chercher}
        className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
      >
        <label className="text-sm">
          Activité
          <select
            className={champ}
            value={recherche.categorie}
            onChange={(e) =>
              setRecherche({ ...recherche, categorie: e.target.value })
            }
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Ville
          <input
            className={champ}
            required
            placeholder="Lyon"
            value={recherche.ville}
            onChange={(e) =>
              setRecherche({ ...recherche, ville: e.target.value })
            }
          />
        </label>
        <div className="flex items-end">
          <button
            className={`${bouton} inline-flex items-center gap-2`}
            disabled={cherche}
          >
            {cherche ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Search className="size-4" aria-hidden />
            )}
            {cherche ? "Recherche…" : "Chercher"}
          </button>
        </div>
      </form>
      {resultat && (
        <p className="mt-2 text-sm text-ok" role="status">
          {resultat}
        </p>
      )}
      <Erreur message={erreur} />
      <p className="mt-2 text-xs text-doux">
        Sources : OpenStreetMap (téléphone, site et e-mail quand ils sont
        renseignés) et l'annuaire officiel des entreprises (SIRET, ancienneté,
        taille, certification RGE). Les entreprises qui refusent la prospection
        sont écartées, et celles déjà dans votre liste ne sont pas ajoutées deux
        fois.
      </p>
    </Carte>
  );
}

const ICONES: Record<LienContact["type"], typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  sms: MessageCircle,
  telephone: Phone,
};

function ProspectCarte({
  p,
  aRelancer,
  onChange,
}: {
  p: Prospect;
  aRelancer: boolean;
  onChange: () => Promise<void>;
}) {
  const [texte, setTexte] = useState(p.brouillon?.texte ?? "");
  const [objet, setObjet] = useState(p.brouillon?.objet ?? "");
  const [etat, setEtat] = useState<"libre" | Canal | "maj" | "envoi">("libre");
  const [erreur, setErreur] = useState<string | null>(null);
  const [statutOuvert, setStatutOuvert] = useState(false);

  const oppose = p.statut === "ne_plus_contacter";
  const termine = oppose || p.statut === "client" || p.statut === "refus";
  const sansAccord = p.type === "particulier" && !p.consentement;
  const dejaContacte = p.statut === "contacte" || p.statut === "relance";
  const brouillon =
    p.brouillon && !oppose ? { ...p.brouillon, objet, texte } : null;
  const liens = liensContact(p, brouillon);
  const appel = liens.find((l) => l.type === "telephone");
  const statut = STATUTS[p.statut] ?? STATUTS.nouveau;
  const occupe = etat !== "libre";

  async function rediger(canal: Canal) {
    setEtat(canal);
    setErreur(null);
    try {
      const r = await redigerProspect({
        data: {
          prospectId: p.id,
          relance: dejaContacte,
          canal,
          jeton: await jetonSession(),
        },
      });
      if (!r.ok) setErreur(r.erreur);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setEtat("libre");
    await onChange();
  }

  // Garde les retouches de l'utilisateur.
  async function sauverBrouillon() {
    if (
      !p.brouillon ||
      (texte === p.brouillon.texte && objet === p.brouillon.objet)
    )
      return;
    const { error } = await supabase().rpc("enregistrer_brouillon_prospect", {
      p_id: p.id,
      p_brouillon: { ...p.brouillon, objet, texte },
    });
    setErreur(error ? erreurLisible(error.message) : null);
  }

  // Envoi direct de l'e-mail (Resend), après avoir gardé les retouches.
  async function envoyer() {
    setEtat("envoi");
    setErreur(null);
    try {
      await sauverBrouillon();
      const r = await envoyerEmail({
        data: { prospectId: p.id, jeton: await jetonSession() },
      });
      if (!r.ok) setErreur(r.erreur);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setEtat("libre");
    await onChange();
  }

  async function marquer(nouveau: string) {
    if (nouveau === p.statut) return;
    if (
      nouveau === "ne_plus_contacter" &&
      !confirm(`${p.nom} ne sera plus jamais proposé au contact. Confirmer ?`)
    )
      return;
    setEtat("maj");
    setErreur(null);
    const { error } = await supabase().rpc("marquer_prospect", {
      p_id: p.id,
      p_statut: nouveau,
      p_contenu: brouillon?.texte ?? null,
    });
    setErreur(error ? erreurLisible(error.message) : null);
    setEtat("libre");
    await onChange();
  }

  async function jeterBrouillon() {
    const { error } = await supabase()
      .from("prospects")
      .update({ brouillon: null })
      .eq("id", p.id);
    setErreur(error?.message ?? null);
    await onChange();
  }

  const icone = (canal: Canal, Repos: typeof Mail) =>
    etat === canal ? (
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
    ) : (
      <Repos className="size-4" aria-hidden />
    );

  return (
    <Carte>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{p.nom}</p>
          <p className="text-xs text-doux">
            {[
              p.type === "particulier"
                ? `Particulier${p.consentement ? " · accord ✓" : " · sans accord"}`
                : (p.categorie ?? p.entreprise),
              p.adresse ?? p.notes,
            ]
              .filter(Boolean)
              .join(" · ") || "Entreprise"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {brouillon && <Pastille ton="alerte">Message à valider</Pastille>}
          {aRelancer && <Pastille ton="alerte">À relancer</Pastille>}
          <Pastille ton={statut.ton}>{statut.libelle}</Pastille>
        </div>
      </div>

      {p.infos && <p className="mt-1 text-xs text-doux">{p.infos}</p>}

      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-doux">
        {p.email && (
          <span className="inline-flex items-center gap-1 break-all">
            <Mail className="size-3.5 shrink-0" aria-hidden />
            {p.email}
          </span>
        )}
        {p.telephone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="size-3.5" aria-hidden />
            {p.telephone}
          </span>
        )}
        {p.site && (
          <a
            href={/^https?:\/\//.test(p.site) ? p.site : `https://${p.site}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            <Globe className="size-3.5" aria-hidden />
            Site
          </a>
        )}
        {p.siret && (
          <a
            href={`https://annuaire-entreprises.data.gouv.fr/etablissement/${p.siret}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            <ShieldCheck className="size-3.5" aria-hidden />
            Fiche officielle
          </a>
        )}
        {p.telephone && p.coordonnees_source && (
          <a
            href={p.coordonnees_source}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            Trouvé sur {hote(p.coordonnees_source)}
          </a>
        )}
        {!p.telephone &&
          !p.coordonnees_cherchees_at &&
          p.type === "entreprise" && (
            <span className="inline-flex items-center gap-1">
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              Recherche du téléphone en cours…
            </span>
          )}
        {!p.email && !p.telephone && p.coordonnees_cherchees_at && (
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent([p.nom, p.adresse].filter(Boolean).join(" "))}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            <Search className="size-3.5" aria-hidden />
            Trouver son téléphone
          </a>
        )}
        {p.dernier_contact_at && (
          <span>
            Dernier contact :{" "}
            {new Date(p.dernier_contact_at).toLocaleDateString("fr-FR")}
          </span>
        )}
      </p>

      {brouillon && (
        <div className="mt-3 space-y-2 rounded-xl border border-bord bg-fond p-3">
          <p className="text-xs text-doux">
            {brouillon.genre === "relance" ? "Relance" : "Premier message"} ·{" "}
            {brouillon.canal === "email" ? "e-mail" : "SMS / WhatsApp"} ·
            relisez et modifiez avant d'envoyer
          </p>
          {brouillon.canal === "email" && (
            <input
              className={champ}
              aria-label="Objet de l'e-mail"
              value={objet}
              onChange={(e) => setObjet(e.target.value)}
              onBlur={sauverBrouillon}
            />
          )}
          <textarea
            className={`${champ} min-h-40`}
            aria-label={`Message pour ${p.nom}`}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onBlur={sauverBrouillon}
          />
          <div className="flex flex-wrap gap-2">
            {brouillon.canal === "email" && p.email && (
              <button
                className={`${bouton} inline-flex items-center gap-1.5`}
                disabled={occupe || sansAccord}
                onClick={envoyer}
              >
                {etat === "envoi" ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="size-4" aria-hidden />
                )}
                Envoyer l'e-mail
              </button>
            )}
            {liens
              .filter((l) => l.type !== "telephone")
              .map((l) => {
                const Icone = ICONES[l.type];
                return (
                  <a
                    key={l.type}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`${boutonSecondaire} inline-flex items-center gap-1.5`}
                  >
                    <Icone className="size-4" aria-hidden />
                    Ouvrir dans {l.libelle}
                  </a>
                );
              })}
            <button
              className={`${bouton} inline-flex items-center gap-1.5`}
              disabled={occupe || sansAccord}
              onClick={() => marquer("contacte")}
            >
              <Send className="size-4" aria-hidden />
              J'ai envoyé : marquer contacté
            </button>
            <button
              className={`${boutonSecondaire} inline-flex items-center gap-1.5`}
              disabled={occupe}
              onClick={() => rediger(brouillon.canal)}
            >
              {icone(brouillon.canal, PenLine)}
              Réécrire
            </button>
            <button
              className={`${boutonSecondaire} inline-flex items-center`}
              disabled={occupe}
              onClick={jeterBrouillon}
              aria-label="Supprimer ce brouillon"
              title="Supprimer ce brouillon"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
          <p className="text-xs text-doux">
            Les boutons ouvrent votre messagerie avec le texte prérempli : rien
            ne part sans votre clic sur « Envoyer ».
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!brouillon && !termine && !sansAccord && (
          <>
            {p.email && (
              <button
                className={`${boutonSecondaire} inline-flex items-center gap-1.5`}
                disabled={occupe}
                onClick={() => rediger("email")}
              >
                {icone("email", PenLine)}
                {dejaContacte
                  ? "Préparer une relance par e-mail"
                  : "Rédiger un e-mail"}
              </button>
            )}
            <button
              className={`${boutonSecondaire} inline-flex items-center gap-1.5`}
              disabled={occupe}
              onClick={() => rediger("message")}
            >
              {icone("message", MessageCircle)}
              {dejaContacte
                ? "Préparer une relance (SMS / WhatsApp)"
                : "Rédiger un SMS / WhatsApp"}
            </button>
          </>
        )}
        {sansAccord && (
          <p className="text-xs text-erreur">
            Particulier sans accord préalable : démarchage interdit (RGPD).
          </p>
        )}
        {!oppose && appel && (
          <a
            href={appel.href}
            className={`${boutonSecondaire} inline-flex items-center gap-1.5`}
          >
            <Phone className="size-4" aria-hidden />
            Appeler
          </a>
        )}
        <button
          className="text-xs text-doux underline"
          onClick={() => setStatutOuvert((o) => !o)}
          aria-expanded={statutOuvert}
        >
          Changer le statut
        </button>
        {statutOuvert && (
          <select
            className={`${champ} w-auto`}
            value={p.statut}
            disabled={occupe}
            onChange={(e) => marquer(e.target.value)}
            aria-label={`Statut de ${p.nom}`}
          >
            {Object.entries(STATUTS).map(([v, s]) => (
              <option key={v} value={v}>
                {s.libelle}
              </option>
            ))}
          </select>
        )}
      </div>
      <Erreur message={erreur} />
    </Carte>
  );
}

function AjoutManuel({
  userId,
  onAjout,
}: {
  userId: string | null;
  onAjout: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    type: "entreprise",
    nom: "",
    entreprise: "",
    email: "",
    telephone: "",
    source: "",
    consentement: false,
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const maj = (champ: keyof typeof form, valeur: string | boolean) =>
    setForm((f) => ({ ...f, [champ]: valeur }));

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    const { error } = await supabase()
      .from("prospects")
      .insert({
        user_id: userId,
        ...form,
        entreprise: form.entreprise || null,
        email: form.email || null,
        telephone: form.telephone || null,
        source: form.source || null,
      });
    setErreur(error?.message ?? null);
    if (!error) {
      setForm((f) => ({
        ...f,
        nom: "",
        entreprise: "",
        email: "",
        telephone: "",
        consentement: false,
      }));
      await onAjout();
    }
  }

  return (
    <Carte>
      <details>
        <summary className="cursor-pointer font-medium">
          Ajouter un prospect à la main
        </summary>
        <form onSubmit={ajouter} className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            Type
            <select
              className={champ}
              value={form.type}
              onChange={(e) => maj("type", e.target.value)}
            >
              <option value="entreprise">Entreprise</option>
              <option value="particulier">Particulier</option>
            </select>
          </label>
          <label className="text-sm">
            Nom
            <input
              className={champ}
              required
              value={form.nom}
              onChange={(e) => maj("nom", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Entreprise
            <input
              className={champ}
              value={form.entreprise}
              onChange={(e) => maj("entreprise", e.target.value)}
            />
          </label>
          <label className="text-sm">
            E-mail
            <input
              className={champ}
              type="email"
              value={form.email}
              onChange={(e) => maj("email", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Téléphone
            <input
              className={champ}
              type="tel"
              value={form.telephone}
              onChange={(e) => maj("telephone", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Source
            <input
              className={champ}
              placeholder="Google Maps, LinkedIn…"
              value={form.source}
              onChange={(e) => maj("source", e.target.value)}
            />
          </label>
          {form.type === "particulier" && (
            <label className="flex items-center gap-2 text-sm md:col-span-3">
              <input
                type="checkbox"
                checked={form.consentement}
                onChange={(e) => maj("consentement", e.target.checked)}
              />
              Ce particulier a donné son accord pour être contacté (obligatoire
              pour le démarcher — RGPD)
            </label>
          )}
          <div className="md:col-span-3">
            <button className={bouton}>Ajouter le prospect</button>
          </div>
        </form>
        <Erreur message={erreur} />
      </details>
    </Carte>
  );
}
