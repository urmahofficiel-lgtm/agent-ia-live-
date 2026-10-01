// Coordonnées professionnelles publiées par l'entreprise elle-même (son site,
// ou une page trouvée par la recherche) : extraction et vérification. Un
// numéro n'est retenu que s'il figure réellement sur une page lue : jamais de
// numéro « deviné » par l'IA.

const RE_TEL =
  /(?:\+33[\s.\-]?(?:\(0\)[\s.\-]?)?|\b0)[1-9](?:[\s.\-]?\d{2}){4}\b/g;

// « 04 78 00 00 00 » à partir de n'importe quelle écriture française.
export function normaliserTelephone(brut: string): string | null {
  let n = brut.replace(/\(0\)/, "").replace(/\D/g, "");
  if (n.startsWith("33")) n = `0${n.slice(2)}`;
  if (!/^0[1-9]\d{8}$/.test(n)) return null;
  return n.replace(/(\d{2})(?=\d)/g, "$1 ");
}

// Numéros surtaxés (08 9x) et numéros factices écartés.
const exclu = (n: string) =>
  /^08 9/.test(n) || /^0\d (00 ){3}00$/.test(n) || /^01 23 45 67 89$/.test(n);

export function extraireTelephones(texte: string): string[] {
  const vus = new Set<string>();
  for (const m of texte.matchAll(RE_TEL)) {
    const n = normaliserTelephone(m[0]);
    if (n && !exclu(n)) vus.add(n);
  }
  // Liens « tel: » (souvent sans espaces dans le code de la page).
  for (const m of texte.matchAll(/tel:([+\d\s.\-()]{10,20})/gi)) {
    const n = normaliserTelephone(m[1]);
    if (n && !exclu(n)) vus.add(n);
  }
  return [...vus];
}

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;

export function extraireEmails(texte: string): string[] {
  const vus = new Set<string>();
  for (const m of texte.matchAll(RE_EMAIL)) {
    const e = m[0].toLowerCase().replace(/^\.+|\.+$/g, "");
    if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(e)) continue;
    if (
      /(example|exemple|sentry|wixpress|domain|email)\.|^(nom|votre|your|name)@/.test(
        e,
      )
    )
      continue;
    vus.add(e);
  }
  return [...vus];
}

// Le numéro figure-t-il sur la page (quelle que soit sa mise en forme) ?
export function numeroPresent(numero: string, texte: string): boolean {
  return extraireTelephones(texte).includes(numero);
}

// Texte lisible d'une page HTML (scripts et styles retirés), liens « tel: »
// et « mailto: » conservés.
export function texteDePage(html: string): string {
  const liens = [...html.matchAll(/href=["'](tel:[^"']+|mailto:[^"']+)["']/gi)]
    .map((m) => m[1])
    .join(" ");
  const corps = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  return `${corps} ${liens}`.slice(0, 300_000);
}

// Lien vers la page de contact, s'il y en a une sur la page d'accueil.
export function lienContact(html: string, base: string): string | null {
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    if (!/contact|nous-joindre|coordonn/i.test(m[1])) continue;
    try {
      const u = new URL(m[1], base);
      if (u.hostname === new URL(base).hostname) return u.toString();
    } catch {
      // lien invalide
    }
  }
  return null;
}

export function urlSite(site: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`);
    return /\./.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

// Annuaires et réseaux : on ne les donne pas comme « site » de l'entreprise.
const ANNUAIRES =
  /pagesjaunes|societe\.com|pappers|infogreffe|annuaire|kompass|verif\.com|manageo|facebook|linkedin|instagram|google\.|yelp|mappy|118|starofservice|habitatpresto|travaux\.com/i;
export const estAnnuaire = (url: string) => ANNUAIRES.test(url);

export type Proposition = { telephone: string | null; site: string | null };

// Réponse JSON de l'IA (recherche web).
export function lireProposition(reponse: string): Proposition {
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut < 0 || fin <= debut) return { telephone: null, site: null };
  try {
    const j = JSON.parse(reponse.slice(debut, fin + 1)) as {
      telephone?: unknown;
      site?: unknown;
    };
    const telephone =
      typeof j.telephone === "string" ? normaliserTelephone(j.telephone) : null;
    const site = typeof j.site === "string" ? urlSite(j.site) : null;
    return { telephone, site: site && !estAnnuaire(site) ? site : null };
  } catch {
    return { telephone: null, site: null };
  }
}

export function consigneRecherche(p: {
  nom: string;
  adresse: string | null;
  siret: string | null;
  categorie: string | null;
}) {
  return [
    "Cherche sur le web les coordonnées PROFESSIONNELLES publiques de cette entreprise française :",
    `- Nom : ${p.nom}`,
    p.categorie ? `- Activité : ${p.categorie}` : "",
    p.adresse ? `- Adresse : ${p.adresse}` : "",
    p.siret ? `- SIRET : ${p.siret}` : "",
    "",
    "Je veux son numéro de téléphone professionnel et son site internet officiel (pas un annuaire).",
    "Vérifie que c'est bien la même entreprise (même nom et même ville). N'invente rien : si tu ne trouves pas, mets null.",
    'Réponds uniquement en JSON : {"telephone": "04 00 00 00 00" ou null, "site": "https://..." ou null}',
  ]
    .filter((l) => l !== "")
    .join("\n");
}
