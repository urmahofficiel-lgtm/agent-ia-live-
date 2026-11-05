// Prospection « marchés publics » (accord de Younes du 05/11/2026) : les
// entreprises du BTP qui viennent de remporter un marché de travaux (avis
// d'attribution du BOAMP, données publiques) répondent aux appels d'offres :
// l'analyse gratuite d'appel d'offres leur parle directement.

export type Attribution = { titulaire: string; objet: string; acheteur: string; departement: string; date: string; lien: string | null };

// Avis d'attribution de marchés de travaux parus depuis `depuis` (AAAA-MM-JJ).
export function urlAttributions(depuis: string, limite = 100) {
  const q = new URLSearchParams({
    select: "idweb,objet,nomacheteur,titulaire,code_departement,dateparution,url_avis",
    where: `nature="ATTRIBUTION" and type_marche_facette="Travaux" and dateparution >= "${depuis}"`,
    order_by: "dateparution desc",
    limit: String(Math.min(100, limite)),
  });
  return `https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records?${q}`;
}

// Majors et leurs filiales : pas notre clientèle (TPE et PME du bâtiment).
const GRANDS_GROUPES =
  /\b(vinci|eiffage|bouygues|colas|spie|nge|fayat|razel|eurovia|sogea|demathieu|cegelec|engie|veolia|suez|dalkia|equans|ineo|axians|sade|guintoli|gtm|dodin|campenon|lagrange|leon grosse|léon grosse|rabot dutilleul|ramery|cardinal edifice|giraudon|screg|sacer|via ?france|eurogem|bateg)\b/i;

const propre = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

export function lireAttributions(json: unknown): Attribution[] {
  const resultats = (json as { results?: Record<string, unknown>[] } | null)?.results;
  if (!Array.isArray(resultats)) return [];
  const vus = new Set<string>();
  const sortie: Attribution[] = [];
  for (const r of resultats) {
    const titulaires = Array.isArray(r.titulaire) ? r.titulaire : [r.titulaire];
    const dep = Array.isArray(r.code_departement) ? propre(r.code_departement[0]) : propre(r.code_departement);
    for (const t of titulaires) {
      const titulaire = propre(t);
      const cle = titulaire.toLowerCase();
      // Nom absent, trop court, groupement ou major : écarté.
      if (titulaire.length < 3 || vus.has(cle) || GRANDS_GROUPES.test(titulaire) || /groupement|mandataire|^infructueu|^sans suite/i.test(titulaire)) continue;
      vus.add(cle);
      sortie.push({
        titulaire,
        objet: propre(r.objet).slice(0, 160),
        acheteur: propre(r.nomacheteur).slice(0, 120),
        departement: dep,
        date: propre(r.dateparution).slice(0, 10),
        lien: propre(r.url_avis) || null,
      });
    }
  }
  return sortie;
}

// Recherche de l'entreprise dans l'annuaire officiel (SIRET, adresse).
export function urlEntreprise(nom: string, departement: string) {
  const q = new URLSearchParams({ q: nom, etat_administratif: "A", per_page: "3" });
  if (/^(\d{2}|2[AB]|97\d)$/.test(departement)) q.set("departement", departement);
  return `https://recherche-entreprises.api.gouv.fr/search?${q}`;
}

type EntrepriseBrute = {
  nom_complet?: string;
  activite_principale?: string | null;
  siege?: { siret?: string; adresse?: string; departement?: string } | null;
  tranche_effectif_salarie?: string | null;
  date_creation?: string | null;
};

// Première entreprise du bâtiment (NAF 41, 42, 43) ou de maîtrise d'œuvre (71.1).
export function lireEntreprise(json: unknown) {
  const resultats = (json as { results?: EntrepriseBrute[] } | null)?.results ?? [];
  const e = resultats.find((x) => /^(41|42|43|71\.1)/.test(x.activite_principale ?? ""));
  if (!e?.siege?.siret) return null;
  const annee = (e.date_creation ?? "").slice(0, 4);
  return {
    siret: e.siege.siret,
    adresse: e.siege.adresse ?? null,
    naf: e.activite_principale ?? "",
    creee: /^\d{4}$/.test(annee) ? annee : null,
  };
}

const dateFr = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);

// Ligne « infos » du prospect : le marché remporté (pour personnaliser l'e-mail).
export const infosMarche = (a: Attribution, creee: string | null) =>
  [`Marché public remporté (BOAMP, ${dateFr(a.date)}) : « ${a.objet} »${a.acheteur ? ` pour ${a.acheteur}` : ""}`, creee ? `créée en ${creee}` : ""]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 300);
