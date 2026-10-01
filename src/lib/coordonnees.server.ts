import { cleNom } from "./annuaire";
import { listerGemini } from "./ia.server";
import {
  consigneRecherche,
  estAnnuaire,
  extraireEmails,
  extraireTelephones,
  lienContact,
  lireProposition,
  numeroPresent,
  texteDePage,
  urlSite,
} from "./coordonnees";

// Recherche automatique du téléphone (et de l'e-mail) d'un prospect :
// 1. son site, s'il est connu (accueil puis page contact) ;
// 2. sinon une recherche web (Gemini + Google Search), puis vérification sur
//    les pages trouvées : le numéro doit y figurer réellement.

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

// La page parle-t-elle bien de cette entreprise ? (un mot distinctif du nom)
function memeEntreprise(nom: string, texte: string) {
  const mots = cleNom(nom)
    .split(" ")
    .filter((m) => m.length >= 4);
  if (!mots.length) return true;
  const t = cleNom(texte.slice(0, 200_000));
  return mots.some((m) => t.includes(m));
}

// Accueil puis page contact du site officiel.
async function depuisSite(
  site: string,
  nom: string,
): Promise<{ telephones: string[]; emails: string[]; url: string } | null> {
  const url = urlSite(site);
  if (!url || estAnnuaire(url)) return null;
  const accueil = await lirePage(url);
  if (!accueil || !memeEntreprise(nom, accueil.texte)) return null;
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

type ReponseGemini = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] };
  }[];
};

async function rechercheWeb(p: ProspectACompleter, cle: string) {
  for (const modele of (await listerGemini(cle)).slice(0, 3)) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${modele}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": cle,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(40_000),
          body: JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: consigneRecherche(p) }] },
            ],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0 },
          }),
        },
      );
      if (!r.ok) {
        console.warn("Recherche web (Gemini)", modele, r.status, (await r.text()).slice(0, 300));
        continue;
      }
      const json = (await r.json()) as ReponseGemini;
      const c = json.candidates?.[0];
      const texte = (c?.content?.parts ?? [])
        .filter((x) => !x.thought)
        .map((x) => x.text ?? "")
        .join("");
      const sources = (c?.groundingMetadata?.groundingChunks ?? [])
        .map((g) => g.web?.uri)
        .filter((u): u is string => Boolean(u));
      return { proposition: lireProposition(texte), sources };
    } catch {
      // modèle suivant
    }
  }
  return null;
}

// « plus_tard » : recherche web indisponible (quota, panne) : on réessaiera.
export async function trouverCoordonnees(
  p: ProspectACompleter,
): Promise<Coordonnees | "plus_tard"> {
  const vide: Coordonnees = {
    telephone: null,
    email: null,
    site: null,
    source: null,
  };

  // 1. Site déjà connu.
  if (p.site) {
    const s = await depuisSite(p.site, p.nom);
    if (s?.telephones.length)
      return {
        telephone: s.telephones[0],
        email: s.emails[0] ?? null,
        site: null,
        source: s.url,
      };
  }

  // 2. Recherche web.
  const cle = process.env.GEMINI_API_KEY;
  if (!cle) return vide;
  const web = await rechercheWeb(p, cle);
  if (!web) return "plus_tard";
  const { proposition, sources } = web;

  // Site officiel proposé : on le lit nous-mêmes.
  const officiel =
    proposition.site && !p.site
      ? await depuisSite(proposition.site, p.nom)
      : null;
  if (officiel?.telephones.length) {
    const telephone =
      proposition.telephone &&
      officiel.telephones.includes(proposition.telephone)
        ? proposition.telephone
        : officiel.telephones[0];
    return {
      telephone,
      email: officiel.emails[0] ?? null,
      site: officiel.url,
      source: officiel.url,
    };
  }

  // Numéro proposé : retenu seulement s'il figure sur une des pages trouvées
  // qui parle bien de cette entreprise.
  if (proposition.telephone) {
    for (const url of sources.slice(0, 4)) {
      const page = await lirePage(url);
      if (
        page &&
        numeroPresent(proposition.telephone, page.texte) &&
        memeEntreprise(p.nom, page.texte)
      ) {
        return {
          telephone: proposition.telephone,
          email: null,
          site: officiel?.url ?? null,
          source: page.url,
        };
      }
    }
  }
  return { ...vide, site: officiel?.url ?? null };
}
