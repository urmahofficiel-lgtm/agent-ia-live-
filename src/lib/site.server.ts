import { lookup } from "node:dns/promises";
import { estAdressePrivee, lirePage, normaliserLien, type PageLue } from "./site";

const TAILLE_MAX = 1_500_000;

async function verifierHote(url: URL) {
  const adresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (adresses.length === 0) throw new Error("Site introuvable. Vérifiez le lien.");
  if (adresses.some((a) => estAdressePrivee(a.address))) throw new Error("Lien non autorisé.");
}

// Télécharge une page publique : chaque redirection est revérifiée, taille et
// durée limitées.
async function telecharger(depart: URL) {
  let url = depart;
  for (let i = 0; i < 4; i++) {
    await verifierHote(url);
    const r = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgentIALive/1.0; +https://agent-ia-live.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr,en;q=0.8",
      },
    });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      url = normaliserLien(new URL(r.headers.get("location")!, url).toString());
      continue;
    }
    if (!r.ok) throw new Error(`Le site a répondu ${r.status}.`);
    if (!(r.headers.get("content-type") ?? "").includes("html")) throw new Error("Ce lien n'est pas une page web.");
    const texte = await r.text();
    return { url, html: texte.slice(0, TAILLE_MAX) };
  }
  throw new Error("Trop de redirections.");
}

export async function lireSite(saisie: string): Promise<{ url: string; pages: PageLue[] }> {
  const { url, html } = await telecharger(normaliserLien(saisie));
  const principale = lirePage(html, url);
  const pages = [principale];
  for (const lien of principale.liens) {
    try {
      const p = await telecharger(new URL(lien));
      pages.push(lirePage(p.html, p.url, 3000));
    } catch {
      /* page secondaire illisible : on continue */
    }
  }
  if (!pages.some((p) => p.texte.length > 80 || p.description)) {
    throw new Error("La page ne contient pas assez de texte lisible (site en JavaScript pur ?). Remplissez les champs à la main.");
  }
  return { url: url.toString(), pages };
}
