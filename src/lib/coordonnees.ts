import { cleNom } from "./annuaire";
import { emailImpersonnel } from "./prospection";

// Coordonnées professionnelles publiées par l'entreprise elle-même (son site,
// ou une page trouvée par la recherche) : extraction et vérification. Un
// numéro n'est retenu que s'il figure réellement sur une page lue : jamais de
// numéro « deviné » par l'IA.

const RE_TEL =
  /(?:\+33[\s.\-]?(?:\(0\)[\s.\-]?)?|\b0)[1-9](?:[\s.\-]?\d{2}){4}\b/g;

// Belgique : « 02 502 01 08 », « 069 25 15 70 », « 0496 79 94 95 », « +32 … »
// ou « 0032 … ». Pas après « BE » (numéro d'entreprise / TVA).
const RE_TEL_BE =
  /(?<!BE\s?)(?:(?:\+|\b00)32[\s.\-/]?(?:\(0\)[\s.\-/]?)?|\b0)[1-9](?:[\s.\-/]?\d){7,8}\b/g;

// Numéro d'entreprise belge écrit « 0456.789.123 » : pas un téléphone.
const numeroEntrepriseBelge = (brut: string) =>
  /^0\d{3}\.\d{3}\.\d{3}$/.test(brut);

// « +32 2 502 01 08 » (zones à un chiffre : Bruxelles, Anvers, Liège, Gand),
// « +32 69 25 15 70 », « +32 496 79 94 95 » (portable) : format international,
// à composer tel quel depuis la France.
function normaliserBelge(brut: string): string | null {
  let n = brut.replace(/\(0\)/, "").replace(/\D/g, "").replace(/^00/, "");
  if (n.startsWith("32")) n = n.slice(2);
  else if (n.startsWith("0")) n = n.slice(1);
  else return null;
  if (/^4[5-9]\d{7}$/.test(n))
    return `+32 ${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
  // 090x : numéros surtaxés.
  if (!/^[1-9]\d{7}$/.test(n) || n.startsWith("90")) return null;
  if (/^[2349]/.test(n))
    return `+32 ${n[0]} ${n.slice(1, 4)} ${n.slice(4, 6)} ${n.slice(6)}`;
  return `+32 ${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 6)} ${n.slice(6)}`;
}

// « 04 78 00 00 00 » à partir de n'importe quelle écriture française ;
// numéro belge au format international (prospect en Belgique).
export function normaliserTelephone(brut: string, pays = "FR"): string | null {
  if (pays === "BE") return normaliserBelge(brut);
  let n = brut.replace(/\(0\)/, "").replace(/\D/g, "");
  if (n.startsWith("33")) n = `0${n.slice(2)}`;
  if (!/^0[1-9]\d{8}$/.test(n)) return null;
  return n.replace(/(\d{2})(?=\d)/g, "$1 ");
}

// Numéros surtaxés (08 9x) et numéros factices écartés.
const exclu = (n: string) =>
  /^08 9/.test(n) || /^0\d (00 ){3}00$/.test(n) || /^01 23 45 67 89$/.test(n);

function* numerosDuTexte(texte: string, pays: string) {
  const re = pays === "BE" ? RE_TEL_BE : RE_TEL;
  for (const m of texte.matchAll(re)) {
    if (pays === "BE" && numeroEntrepriseBelge(m[0])) continue;
    const n = normaliserTelephone(m[0], pays);
    if (n && !exclu(n)) yield { n, pos: m.index ?? 0 };
  }
}

export function extraireTelephones(texte: string, pays = "FR"): string[] {
  const vus = new Set<string>();
  for (const { n } of numerosDuTexte(texte, pays)) vus.add(n);
  // Liens « tel: » (souvent sans espaces dans le code de la page).
  for (const m of texte.matchAll(/tel:([+\d\s.\-()]{9,20})/gi)) {
    const n = normaliserTelephone(m[1], pays);
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
export function numeroPresent(
  numero: string,
  texte: string,
  pays = "FR",
): boolean {
  return extraireTelephones(texte, pays).includes(numero);
}

// E-mail à garder parmi ceux d'une page : celui du domaine de l'entreprise
// d'abord. En Belgique, une adresse impersonnelle (contact@, info@…) passe
// avant tout : c'est la seule qu'on peut prospecter par e-mail.
export function meilleurEmail(
  emails: string[],
  site: string | null,
  pays = "FR",
): string | null {
  const domaine = site
    ? (urlSite(site)
        ?.replace(/^https?:\/\/(www\.)?/i, "")
        .split("/")[0] ?? "")
    : "";
  const note = (e: string) =>
    (pays === "BE" && emailImpersonnel(e) ? 2 : 0) +
    (domaine && e.endsWith(`@${domaine}`) ? 1 : 0);
  return [...emails].sort((a, b) => note(b) - note(a))[0] ?? null;
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

// Articles de presse : le numéro cité est souvent celui d'un homonyme.
const PRESSE =
  /lavenir\.net|dhnet|sudinfo|lesoir|lalibre|rtbf|ouest-france|leparisien|lefigaro|lemonde|20minutes|francebleu|actu\.fr|ladepeche|sudouest|leprogres|lavoixdunord|letelegramme|midilibre|ledauphine|laprovence|nicematin|estrepublicain/i;
export const estPresse = (url: string) => PRESSE.test(url);

// Mots de métier ou de forme juridique : ils ne distinguent pas une
// entreprise (« LW Architectes » ne doit pas valider la page d'un autre
// cabinet d'architectes de la même ville).
const MOTS_COMMUNS = new Set(
  (
    "architecte architectes architecture architectures architect architects " +
    "architecten architectuur archi atelier ateliers bureau cabinet agence " +
    "studio associes associe partners group groupe sprl srl scrl bv bvba nv " +
    "office design interieur interieurs urbanisme ingenierie conseil freres " +
    "plomberie plombier chauffage electricite electricien maconnerie macon " +
    "menuiserie menuisier peinture peintre carrelage couverture couvreur " +
    "charpente renovation construction constructions batiment btp travaux services"
  ).split(" "),
);

// Une page trouvée par la recherche n'est le site de l'entreprise que si son
// domaine reprend le nom (« cittanova.fr » pour « Cittanova ») : une fiche
// d'annuaire ou de registre cite le nom mais donne son propre e-mail.
export function siteDeLEntreprise(url: string, nom: string): boolean {
  let hote: string;
  try {
    hote = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  const compact = (x: string) => x.replace(/[^a-z0-9]/g, "");
  const domaine = compact(hote.split(".").slice(0, -1).join(""));
  return motsDistinctifs(nom).some((m) => {
    const c = compact(m);
    return c.length >= 2 && domaine.includes(c);
  });
}

// Mots du nom qui doivent figurer sur la page : les mots propres d'au moins
// 4 lettres, sinon les sigles (« LW », « 4D »), sinon (nom fait de mots
// communs) les mots d'au moins 4 lettres.
export function motsDistinctifs(nom: string): string[] {
  const tous = cleNom(nom).split(" ").filter(Boolean);
  const propres = tous.filter((m) => !MOTS_COMMUNS.has(m));
  const longs = propres.filter((m) => m.length >= 4);
  if (longs.length) return longs;
  const sigles = propres.filter((m) => m.length >= 2);
  return sigles.length ? sigles : tous.filter((m) => m.length >= 4);
}

// Code postal de l'adresse : 5 chiffres en France, 4 en Belgique (devant la
// commune : « 4020 Liège »).
const codePostal = (adresse: string | null, pays: string) =>
  pays === "BE"
    ? adresse?.match(/\b(\d{4})\s+\p{L}/u)?.[1]
    : adresse?.match(/\b\d{5}\b/)?.[0];

// La page parle-t-elle bien de cette entreprise ? Un mot distinctif du nom
// et, si on le connaît, le code postal.
export function confirmeEntreprise(
  texte: string,
  nom: string,
  adresse: string | null,
  pays = "FR",
): boolean {
  const t = ` ${cleNom(texte.slice(0, 200_000))} `;
  const mots = motsDistinctifs(nom);
  // Un sigle court doit apparaître comme un mot entier.
  const present = (m: string) =>
    m.length >= 4 ? t.includes(m) : t.includes(` ${m} `);
  if (mots.length && !mots.some(present)) return false;
  const cp = codePostal(adresse, pays);
  return !cp || texte.includes(cp);
}

// Sur une page qui liste plusieurs entreprises (annuaire), le numéro le plus
// proche du nom de l'entreprise.
export function telephoneProche(
  texte: string,
  nom: string,
  pays = "FR",
): string | null {
  const mot = motsDistinctifs(nom)[0];
  const bas = texte.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const ancre = mot ? bas.indexOf(mot) : -1;
  let meilleur: { n: string; d: number } | null = null;
  for (const { n, pos } of numerosDuTexte(texte, pays)) {
    // Le numéro suit en général le nom : un numéro placé avant compte triple.
    const d = ancre < 0 ? 0 : pos >= ancre ? pos - ancre : (ancre - pos) * 3;
    if (!meilleur || d < meilleur.d) meilleur = { n, d };
  }
  return meilleur?.n ?? extraireTelephones(texte, pays)[0] ?? null;
}

// Requête de recherche web : nom exact + ville (ou code postal). En
// Belgique, la commune suit le code postal à 4 chiffres ; une adresse réduite
// à la commune (« Namur ») sert telle quelle.
export function requeteRecherche(
  p: { nom: string; adresse: string | null },
  pays = "FR",
): string {
  const lieu =
    pays === "BE"
      ? (p.adresse?.match(/\b\d{4}\s+(.+)$/)?.[1] ??
        (p.adresse && !/\d/.test(p.adresse) ? p.adresse : "Belgique"))
      : (p.adresse?.match(/\b\d{5}\s+(.+)$/)?.[1] ??
        p.adresse?.match(/\b\d{5}\b/)?.[0] ??
        "");
  return `"${p.nom}" ${lieu} téléphone`.replace(/\s+/g, " ").trim();
}
