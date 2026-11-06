// Annonce des nouveautés de BTP Ecosystem (accord de Younes du 06/11/2026) :
// chaque jour, l'agent lit le plan du site (sitemap.xml). Une page
// « /fonctionnalites/… » qu'il n'a jamais vue est une fonction mise en ligne :
// il prépare une publication « Nouveau : … » rédigée UNIQUEMENT d'après le
// contenu de cette page (rien d'inventé).

import { instantParis, jourParis } from "./pilote";

export const SITE_BTP = "https://www.btp-ecosystem.com";

// Adresses des pages de fonctionnalités listées dans le plan du site.
export function pagesFonctionnalites(sitemap: string): string[] {
  const vues = new Set<string>();
  for (const m of sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    try {
      const u = new URL(m[1]);
      if (/(^|\.)btp-ecosystem\.com$/i.test(u.hostname) && /^\/fonctionnalites\/[a-z0-9-]+\/?$/.test(u.pathname)) {
        vues.add(`${SITE_BTP}${u.pathname.replace(/\/$/, "")}`);
      }
    } catch {}
  }
  return [...vues];
}

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decoder = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (t, n) => ENTITES[n.toLowerCase()] ?? t);
const texte = (html: string) =>
  decoder(html.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

export type PageNouveaute = { url: string; titre: string; description: string; contenu: string };

// Titre (h1), description et texte principal de la page.
export function lirePage(url: string, html: string): PageNouveaute | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const titre = texte(h1 ?? html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s*\|\s*BTP Ecosystem\s*$/i, "");
  const description = decoder(html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] ?? "").trim();
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const contenu = texte(main ?? "").slice(0, 2500);
  if (!titre || contenu.length < 200) return null;
  return { url, titre: titre.slice(0, 160), description: description.slice(0, 400), contenu };
}

// Consigne de rédaction : la page est la seule source.
export function consigneNouveaute(p: PageNouveaute, plateforme: string): string {
  const lien = plateforme === "linkedin" ? `${p.url}?utm_source=linkedin` : "lien en bio";
  return [
    `NOUVEAUTÉ de BTP Ecosystem, mise en ligne récemment : « ${p.titre} ».`,
    "Annonce-la comme une nouveauté (« Nouveau sur BTP Ecosystem : … »). Explique en mots simples, pour un artisan ou un architecte, le problème qu'elle règle et comment elle marche.",
    "Utilise UNIQUEMENT les informations de la page ci-dessous : aucun chiffre, aucune promesse ni aucune fonction qui n'y figure pas. Pas de témoignage, pas de nombre de clients.",
    `Appel à l'action : l'essayer gratuitement (${lien}).`,
    `Description de la page : ${p.description}`,
    `Contenu de la page : ${p.contenu}`,
  ]
    .join("\n")
    .slice(0, 4000);
}

const jourSuivant = (jour: string, n: number) => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Publications d'annonce : TikTok et Instagram en carrousel le lendemain midi,
// LinkedIn le mardi ou jeudi suivant au matin (rythme du mode croissance).
export function publicationsNouveaute(p: PageNouveaute, maintenant = new Date()) {
  const aujourdhui = jourParis(maintenant);
  const demain = jourSuivant(aujourdhui, 1);
  let jourLinkedin = demain;
  while (![2, 4].includes(new Date(`${jourLinkedin}T12:00:00Z`).getUTCDay())) jourLinkedin = jourSuivant(jourLinkedin, 1);
  const titre = `Nouveau : ${p.titre}`.slice(0, 200);
  return [
    { plateforme: "tiktok", carrousel: true, planifiee_pour: instantParis(demain, "12:10").toISOString() },
    { plateforme: "instagram", carrousel: true, planifiee_pour: instantParis(demain, "12:20").toISOString() },
    { plateforme: "linkedin", carrousel: false, planifiee_pour: instantParis(jourLinkedin, "08:40").toISOString() },
  ].map((x) => ({ ...x, titre, consigne: consigneNouveaute(p, x.plateforme) }));
}
