import {
  confirmeEntreprise,
  estAnnuaire,
  extraireEmails,
  extraireTelephones,
  lienContact,
  requeteRecherche,
  telephoneProche,
  texteDePage,
  urlSite,
} from "./coordonnees";

// Recherche automatique du téléphone (et de l'e-mail) d'un prospect :
// 1. son site, s'il est connu (accueil puis page contact) ;
// 2. sinon une recherche web (Tavily, offre gratuite : 1 000 recherches par
//    mois, clé TAVILY_API_KEY). Un numéro n'est retenu que s'il figure sur une
//    page qui cite bien l'entreprise (nom et code postal).

export type ProspectACompleter = {
  id: string;
  nom: string;
  adresse: string | null;
  site: string | null;
  siret: string | null;
  categorie: string | null;
};

export type Coordonnees = {
  telephone: string | null;
  email: string | null;
  site: string | null;
  source: string | null;
};

type Page = { url: string; html: string; texte: string };

async function lirePage(url: string): Promise<Page | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; agent-ia-live/0.1; +https://agent-ia-live.vercel.app)",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("html"))
      return null;
    const html = (await r.text()).slice(0, 1_500_000);
    return { url: r.url || url, html, texte: texteDePage(html) };
  } catch {
    return null;
  }
}

// Accueil puis page contact du site de l'entreprise.
async function depuisSite(site: string, p: ProspectACompleter) {
  const url = urlSite(site);
  if (!url || estAnnuaire(url)) return null;
  const accueil = await lirePage(url);
  if (!accueil || !confirmeEntreprise(accueil.texte, p.nom, null)) return null;
  let telephones = extraireTelephones(accueil.texte);
  let emails = extraireEmails(accueil.texte);
  if (!telephones.length || !emails.length) {
    const contact = lienContact(accueil.html, accueil.url);
    const page = contact ? await lirePage(contact) : null;
    if (page) {
      telephones = [
        ...new Set([...telephones, ...extraireTelephones(page.texte)]),
      ];
      emails = [...new Set([...emails, ...extraireEmails(page.texte)])];
    }
  }
  return { telephones, emails, url: accueil.url };
}

type ResultatTavily = {
  url?: string;
  content?: string;
  raw_content?: string | null;
};

async function rechercheTavily(
  requete: string,
  cle: string,
): Promise<ResultatTavily[] | null> {
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        query: requete,
        max_results: 5,
        search_depth: "basic",
        include_raw_content: "text",
        country: "france",
      }),
    });
    if (!r.ok) {
      console.warn(
        "Recherche web (Tavily)",
        r.status,
        (await r.text()).slice(0, 300),
      );
      return null;
    }
    return ((await r.json()) as { results?: ResultatTavily[] }).results ?? [];
  } catch (e) {
    console.warn("Recherche web (Tavily)", e instanceof Error ? e.message : e);
    return null;
  }
}

// « plus_tard » : recherche web non configurée ou indisponible : on réessaiera.
export async function trouverCoordonnees(
  p: ProspectACompleter,
): Promise<Coordonnees | "plus_tard"> {
  // 1. Site déjà connu.
  if (p.site) {
    const s = await depuisSite(p.site, p);
    if (s?.telephones.length)
      return {
        telephone: s.telephones[0],
        email: s.emails[0] ?? null,
        site: null,
        source: s.url,
      };
  }

  // 2. Recherche web.
  const cle = process.env.TAVILY_API_KEY;
  if (!cle) return "plus_tard";
  const resultats = await rechercheTavily(requeteRecherche(p), cle);
  if (!resultats) return "plus_tard";

  // Le site de l'entreprise d'abord (téléphone + e-mail), puis les autres
  // pages (annuaires compris) : le texte doit citer l'entreprise.
  const tries = [...resultats].sort(
    (a, b) =>
      Number(estAnnuaire(a.url ?? "")) - Number(estAnnuaire(b.url ?? "")),
  );
  for (const r of tries) {
    if (!r.url) continue;
    const texte = `${r.content ?? ""} ${r.raw_content ?? ""}`;
    if (!confirmeEntreprise(texte, p.nom, p.adresse)) continue;
    const telephone = telephoneProche(texte, p.nom);
    if (!telephone) continue;
    const officiel = !estAnnuaire(r.url) && !p.site;
    return {
      telephone,
      email: officiel ? (extraireEmails(texte)[0] ?? null) : null,
      site: officiel ? new URL(r.url).origin : null,
      source: r.url,
    };
  }
  return { telephone: null, email: null, site: null, source: null };
}
