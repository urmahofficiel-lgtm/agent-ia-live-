// Transforme le journal brut de l'agent en « séances » lisibles : une carte par
// publication, avec les étapes Rédaction → Visuel → Vidéo → Publication.

export type EvenementBrut = {
  id: number;
  tache_id: string | null;
  niveau: "info" | "action" | "erreur";
  message: string;
  capture_url: string | null;
  created_at: string;
};

export type NomEtape = "strategie" | "redaction" | "visuel" | "video" | "publication" | "prospection";
export type EtatEtape = "en_cours" | "fait" | "echec";

export const LIBELLES_ETAPES: Record<NomEtape, string> = {
  strategie: "Stratégie",
  redaction: "Rédaction",
  visuel: "Visuel",
  video: "Vidéo",
  publication: "Publication",
  prospection: "Prospection",
};

const REGLES: { etape: NomEtape; motif: RegExp }[] = [
  { etape: "video", motif: /vid[ée]o|script|voix off|montage|s[ée]quence|sc[èe]nes/i },
  { etape: "visuel", motif: /visuel|image/i },
  { etape: "publication", motif: /🚀|publi[ée] :|publication en cours|[ée]chec de publication/i },
  { etape: "redaction", motif: /r[ée]daction|texte pr[êe]t|brouillon|pr[êe]t à valider/i },
  { etape: "strategie", motif: /site|niche|march[ée]|strat[ée]gie|fiche marque|activit[ée] comprise|calendrier/i },
  { etape: "prospection", motif: /prospect/i },
];

export function etapeDe(message: string): NomEtape | null {
  return REGLES.find((r) => r.motif.test(message))?.etape ?? null;
}

// Messages qui marquent la fin réussie d'une étape.
const FIN = /pr[êe]t|pr[êe]te|publi[ée] :|✅|termin[ée]|compris|lue\(s\)|trouv[ée]s|cr[ée][ée] :/i;

export type Etape = { nom: NomEtape; etat: EtatEtape };

export type Seance = {
  cle: string;
  tacheId: string | null;
  debut: string;
  fin: string;
  etapes: Etape[];
  images: string[];
  erreurs: string[];
  resume: string;
  evenements: EvenementBrut[];
  active: boolean;
};

const ECART_SEANCE_MS = 3 * 60_000;

export function construireSeances(evenements: EvenementBrut[], maintenant = Date.now()): Seance[] {
  const tries = [...evenements].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const seances: Seance[] = [];
  const ouvertes = new Map<string, Seance>();

  for (const e of tries) {
    const t = new Date(e.created_at).getTime();
    // Une séance = même tâche (ou même moment pour les actions globales),
    // sans pause de plus de 3 minutes.
    const cle = e.tache_id ?? "agent";
    let s = ouvertes.get(cle);
    if (!s || t - new Date(s.fin).getTime() > ECART_SEANCE_MS) {
      s = {
        cle: `${cle}-${e.id}`,
        tacheId: e.tache_id,
        debut: e.created_at,
        fin: e.created_at,
        etapes: [],
        images: [],
        erreurs: [],
        resume: "",
        evenements: [],
        active: false,
      };
      ouvertes.set(cle, s);
      seances.push(s);
    }
    s.fin = e.created_at;
    s.evenements.push(e);
    if (e.capture_url) s.images.push(e.capture_url);
    if (e.niveau === "erreur") s.erreurs.push(e.message);

    const nom = etapeDe(e.message);
    if (nom) {
      let etape = s.etapes.find((x) => x.nom === nom);
      if (!etape) {
        etape = { nom, etat: "en_cours" };
        s.etapes.push(etape);
      }
      if (e.niveau === "erreur") etape.etat = "echec";
      else if (e.niveau === "info" && FIN.test(e.message)) etape.etat = "fait";
      else if (etape.etat !== "echec") etape.etat = e.niveau === "action" ? "en_cours" : etape.etat;
    }
    s.resume = e.message;
  }

  for (const s of seances) {
    const recente = maintenant - new Date(s.fin).getTime() < 3 * 60_000;
    const derniere = s.evenements[s.evenements.length - 1];
    s.active = recente && derniere.niveau === "action";
    // Une étape « en cours » d'une séance terminée n'a jamais abouti.
    if (!s.active) for (const e of s.etapes) if (e.etat === "en_cours") e.etat = s.erreurs.length ? "echec" : "fait";
  }
  return seances.reverse();
}
