// Lecture d'une page web (site, page produit, SaaS…) pour en tirer le profil
// de l'entreprise. Fonctions pures, testables.

// Adresses internes : le serveur refuse de les ouvrir (protection SSRF).
export function estAdressePrivee(ip: string) {
  const v4 = ip.replace(/^::ffff:/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
    );
  }
  const x = ip.toLowerCase();
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80");
}

export function normaliserLien(saisie: string) {
  const brut = saisie.trim();
  const url = new URL(/^https?:\/\//i.test(brut) ? brut : `https://${brut}`);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Lien invalide.");
  if (!url.hostname.includes(".") || url.hostname.endsWith(".local") || url.hostname === "localhost") {
    throw new Error("Lien invalide.");
  }
  url.hash = "";
  return url;
}

const decoder = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

function meta(html: string, nom: string) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${nom}["'][^>]*>`, "i");
  const balise = html.match(re)?.[0];
  return balise ? decoder(balise.match(/content=["']([^"']*)["']/i)?.[1] ?? "").trim() : "";
}

export type PageLue = { titre: string; description: string; texte: string; liens: string[] };

export function lirePage(html: string, base: URL, maxCaracteres = 6000): PageLue {
  const titre = decoder(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const description = meta(html, "description") || meta(html, "og:description");
  const corps = html
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|section|article|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const texte = decoder(corps)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 2)
    .filter((l, i, t) => t.indexOf(l) === i) // menus répétés
    .join("\n")
    .slice(0, maxCaracteres);

  // Pages utiles du même site : à propos, offre, tarifs, services.
  const utiles = /(a-propos|about|qui-sommes|notre-histoire|pricing|tarif|prix|offre|services?|produits?|features|fonctionnalit)/i;
  const liens = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      if (u.hostname === base.hostname && utiles.test(u.pathname) && u.pathname !== base.pathname) {
        u.hash = "";
        u.search = "";
        liens.add(u.toString());
      }
    } catch {
      /* lien invalide ignoré */
    }
  }
  return { titre, description, texte, liens: [...liens].slice(0, 2) };
}

export function consigneProfilDepuisSite(url: string, pages: PageLue[]) {
  const contenu = pages
    .map((p, i) => `--- Page ${i + 1} : ${p.titre}\n${p.description ? `Description : ${p.description}\n` : ""}${p.texte}`)
    .join("\n\n")
    .slice(0, 12000);
  return `Voici le contenu du site ${url}. Déduis-en le profil de l'entreprise, en français.
Réponds UNIQUEMENT par un objet JSON valide :
{"activite": "ce que fait l'entreprise, 1-2 phrases précises", "offre": "produits / services, prix si visibles, ce qui la distingue", "cible": "clients visés (particuliers/entreprises, profils, besoins)", "zone": "zone géographique servie (ou 'France entière' / 'international')", "ton": "ton de communication observé", "objectif": "objectif marketing le plus probable (leads, ventes en ligne, notoriété…)"}
N'invente pas de faits précis absents du site ; reste général si l'information manque.

${contenu}`;
}
