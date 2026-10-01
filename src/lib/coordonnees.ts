import { cleNom } from "./annuaire";

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

// La page parle-t-elle bien de cette entreprise ? Un mot distinctif du nom
// et, si on le connaît, le code postal.
export function confirmeEntreprise(
  texte: string,
  nom: string,
  adresse: string | null,
): boolean {
  const t = cleNom(texte.slice(0, 200_000));
  const mots = cleNom(nom)
    .split(" ")
    .filter((m) => m.length >= 4);
  if (mots.length && !mots.some((m) => t.includes(m))) return false;
  const cp = adresse?.match(/\b\d{5}\b/)?.[0];
  return !cp || texte.includes(cp);
}

// Sur une page qui liste plusieurs entreprises (annuaire), le numéro le plus
// proche du nom de l'entreprise.
export function telephoneProche(texte: string, nom: string): string | null {
  const mot = cleNom(nom)
    .split(" ")
    .find((m) => m.length >= 4);
  const bas = texte.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const ancre = mot ? bas.indexOf(mot) : -1;
  let meilleur: { n: string; d: number } | null = null;
  for (const m of texte.matchAll(RE_TEL)) {
    const n = normaliserTelephone(m[0]);
    if (!n || exclu(n)) continue;
    // Le numéro suit en général le nom : un numéro placé avant compte triple.
    const pos = m.index ?? 0;
    const d = ancre < 0 ? 0 : pos >= ancre ? pos - ancre : (ancre - pos) * 3;
    if (!meilleur || d < meilleur.d) meilleur = { n, d };
  }
  return meilleur?.n ?? extraireTelephones(texte)[0] ?? null;
}

// Requête de recherche web : nom exact + ville (ou code postal).
export function requeteRecherche(p: {
  nom: string;
  adresse: string | null;
}): string {
  const lieu =
    p.adresse?.match(/\b\d{5}\s+(.+)$/)?.[1] ??
    p.adresse?.match(/\b\d{5}\b/)?.[0] ??
    "";
  return `"${p.nom}" ${lieu} téléphone`.replace(/\s+/g, " ").trim();
}
