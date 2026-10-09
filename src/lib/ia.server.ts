import { nettoyerPost, reglesReseau, sansHashtagsSiGroupe, sansLienSiReseau } from "./texte";
import { nomPlateforme } from "./plateformes";
import { decorMarche, marcheDe, reglesMarche, systemeMarche } from "./marches";

// Cerveau de l'agent : NVIDIA NIM (API compatible OpenAI).
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
// NVIDIA retire régulièrement des modèles (réponse 404/410) : on essaie une
// liste dans l'ordre et on passe au suivant si l'un a disparu.
// NVIDIA_MODELE (variable Vercel) permet d'en imposer un en tête de liste.
// Ordre : les plus rapides d'abord (la rédaction se fait en direct).
// Mesuré en production : gpt-oss-20b répond en 3 à 6 s ; deepseek-v4.1-flash
// dépasse 45 s.
const MODELES = [
  "openai/gpt-oss-20b",
  "google/gemma-4-31b-it",
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "deepseek-ai/deepseek-v4.1-flash",
];

const MODELE_DISPARU = new Set([404, 410]);
// Délai laissé à un modèle avant de passer au suivant : proportionnel à la
// longueur demandée (un script vidéo ou une stratégie prend plus de temps
// qu'un post).
const delaiMax = (maxTokens: number) => Math.min(150_000, 30_000 + maxTokens * 25);
// Modèles retirés par NVIDIA (404/410) : écartés le temps de vie du serveur.
// Un modèle seulement lent n'est PAS écarté : il sert encore aux demandes courtes.
const retires = new Set<string>();

// Lue au moment de la requête : une variable « Sensible » Vercel n'existe pas
// pendant le build. `agentialive` est le nom sous lequel la clé a été
// enregistrée dans Vercel ; NVIDIA_API_KEY reste le nom recommandé.
function cleNvidia() {
  return process.env.NVIDIA_API_KEY || process.env.agentialive || "";
}

const CONSIGNES_TYPE: Record<string, string> = {
  publication:
    "Rédige une publication prête à poster. Adapte la longueur, le ton et les hashtags à la plateforme. N'ajoute rien d'autre que le texte à publier.",
  reponse:
    "Rédige une réponse courte, polie et utile à un commentaire ou un message. Reste naturel, sans ton robotique.",
  prospection:
    "Rédige un premier message de prospection court et personnalisé : une accroche, la valeur proposée, une question ouverte. Pas de formule agressive.",
  relance:
    "Rédige une relance courte et courtoise, qui rappelle le premier message sans insister lourdement.",
  appareil:
    "Décris, étape par étape, les actions précises à effectuer sur l'appareil pour accomplir la consigne.",
  autre: "Accomplis la consigne de la façon la plus utile possible.",
};

// `marche` : langue et pays du compte visé (« it-IT »…) ; France par défaut.
export type Consigne = { type: string; plateforme: string | null; titre: string; consigne: string; marche?: string | null };

const SYSTEME =
  "Tu es l'assistant marketing et commercial d'un entrepreneur français. Tu écris en français, de façon naturelle et concrète. Tu ne réponds qu'avec le contenu demandé, sans commentaire autour, sans guillemets englobants.";

function appelNvidia(cle: string, modele: string, systeme: string, demande: string, maxTokens: number, delai: number) {
  return fetch(NVIDIA_URL, {
    method: "POST",
    signal: AbortSignal.timeout(delai),
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modele,
      temperature: 0.7,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systeme },
        { role: "user", content: demande },
      ],
    }),
  });
}

// --- Gemini (Google AI Studio, offre gratuite) --------------------------------
// Rapide et fiable sur les réponses longues (script vidéo, calendrier) : il
// passe en premier pour celles-ci, et sert de secours pour le reste.
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
let modelesGemini: string[] | null = null;

// Rang d'un modèle : version la plus récente, « flash » complet avant « lite »,
// version stable avant « preview ».
function rangGemini(nom: string) {
  const version = Number(nom.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  return version * 10 - (nom.includes("lite") ? 3 : 0) - (/preview|exp/.test(nom) ? 1 : 0);
}

// Les noms de modèles changent souvent : on demande la liste à Google plutôt
// que de les écrire en dur.
export async function listerGemini(cle: string) {
  if (modelesGemini) return modelesGemini;
  const r = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": cle }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Gemini : liste des modèles indisponible (${r.status}).`);
  const json = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  modelesGemini = (json.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name)
    .filter((n) => /gemini-[\d.]+-flash/.test(n) && !/tts|image|audio|live|embed|thinking|native/.test(n))
    .sort((a, b) => rangGemini(b) - rangGemini(a))
    .slice(0, 6); // les « lite » en fin de liste : plus disponibles quand Google sature
  return modelesGemini;
}

async function demanderGemini(cle: string, systeme: string, demande: string, echeance: number) {
  let derniere = "Gemini n'a pas répondu.";
  const modeles = await listerGemini(cle);
  // Surcharge (503) ou quota (429) : un second essai sur le premier modèle,
  // après une courte pause, avant de passer aux suivants.
  const essais = modeles.length ? [modeles[0], ...modeles] : [];
  for (const [i, modele] of essais.entries()) {
    if (i === 1) await new Promise((r) => setTimeout(r, 2500));
    const reste = echeance - Date.now();
    if (reste < 5_000) break;
    const debut = Date.now();
    try {
      const r = await fetch(`${GEMINI}/${modele}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(Math.min(60_000, reste)),
        headers: { "x-goog-api-key": cle, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systeme }] },
          contents: [{ role: "user", parts: [{ text: demande }] }],
          generationConfig: { temperature: 0.7 },
        }),
      });
      console.info("Gemini", modele, r.status, Date.now() - debut, "ms");
      if (!r.ok) {
        derniere = `Gemini a refusé la demande (${r.status}).`;
        continue;
      }
      const json = (await r.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[] };
      // Réponse coupée : modèle suivant.
      if (json.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        derniere = "Réponse de Gemini incomplète.";
        continue;
      }
      const texte = (json.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      if (texte) return texte;
      derniere = "Réponse vide de Gemini.";
    } catch {
      derniere = "Gemini a mis trop de temps à répondre.";
    }
  }
  throw new Error(derniere);
}

async function demanderNvidia(cle: string, systeme: string, demande: string, maxTokens: number, echeance: number) {
  // Chaque modèle a au plus la moitié du temps restant : un modèle lent ne
  // doit pas empêcher d'essayer les suivants.
  const modeles = [process.env.NVIDIA_MODELE, ...MODELES].filter((m): m is string => Boolean(m) && !retires.has(m!));
  let derniereErreur = "L'IA NVIDIA n'a pas répondu à temps. Réessayez.";
  for (const modele of modeles) {
    const reste = echeance - Date.now();
    if (reste < 5_000) break;
    const debut = Date.now();
    let r: Response;
    try {
      r = await appelNvidia(cle, modele, systeme, demande, maxTokens, Math.min(delaiMax(maxTokens), Math.max(25_000, reste / 2), reste));
    } catch {
      console.warn("NVIDIA : trop lent, modèle suivant", modele, Date.now() - debut, "ms");
      derniereErreur = "L'IA a mis trop de temps à répondre. Réessayez dans un instant.";
      continue;
    }
    console.info("NVIDIA", modele, r.status, Date.now() - debut, "ms");
    if (MODELE_DISPARU.has(r.status)) {
      retires.add(modele);
      continue;
    }
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      console.error("NVIDIA", r.status, detail);
      derniereErreur = `L'IA NVIDIA a refusé la demande (${r.status}).`;
      if (r.status === 401 || r.status === 403) break; // clé invalide : inutile d'insister
      continue;
    }
    const json = (await r.json()) as { choices?: { message?: { content?: string | null }; finish_reason?: string | null }[] };
    // Réponse coupée faute de place (« Con la geolocal… ») : jamais
    // enregistrée comme un post, on essaie le modèle suivant.
    if (json.choices?.[0]?.finish_reason === "length") {
      console.warn("NVIDIA : réponse coupée, modèle suivant", modele);
      derniereErreur = "Réponse de l'IA incomplète.";
      continue;
    }
    // Les modèles « à raisonnement » renvoient parfois leur réflexion entre
    // balises <think> : on ne garde que la réponse.
    const texte = json.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (texte) return texte;
    // Réponse vide (souvent : tout le budget passé à « réfléchir ») : modèle suivant.
    console.warn("NVIDIA : réponse vide", modele);
    derniereErreur = "Réponse vide de l'IA.";
  }
  throw new Error(derniereErreur);
}

// Appel générique à l'IA : NVIDIA et Gemini, chacun en secours de l'autre.
// Les réponses longues (≥ 1500 jetons) passent d'abord par Gemini, plus
// rapide sur ce type de demande. `delaiTotal` borne l'ensemble des essais
// pour rester sous la limite d'exécution de Vercel.
export async function demanderIA(
  demande: string,
  options: { systeme?: string; maxTokens?: number; delaiTotal?: number; gemini?: "d'abord" | "secours" } = {},
) {
  const maxTokens = options.maxTokens ?? 800;
  const systeme = options.systeme ?? SYSTEME;
  const echeance = Date.now() + (options.delaiTotal ?? 170_000);
  const cleN = cleNvidia();
  const cleG = process.env.GEMINI_API_KEY ?? "";
  if (!cleN && !cleG) throw new Error("Aucune clé d'IA (NVIDIA ou Gemini) dans les variables Vercel.");

  const nvidia = () => demanderNvidia(cleN, systeme, demande, maxTokens, echeance);
  const gemini = () => demanderGemini(cleG, systeme, demande, echeance);
  const ordre = (options.gemini ?? (maxTokens >= 1500 ? "d'abord" : "secours")) === "d'abord" ? [gemini, nvidia] : [nvidia, gemini];
  const essais = ordre.filter((f) => (f === gemini ? cleG : cleN));

  let erreur: unknown = null;
  for (const essai of essais) {
    try {
      return await essai();
    } catch (e) {
      erreur = e;
      console.warn("IA : bascule vers l'autre fournisseur", e instanceof Error ? e.message : e);
    }
  }
  throw erreur instanceof Error ? erreur : new Error("L'IA n'a pas répondu. Réessayez.");
}

// Règles de rédaction quand on connaît la marque : on écrit POUR elle, à
// partir de ce que son site dit réellement.
const REGLES_MARQUE = `Règles impératives :
- Tu écris pour cette marque précise : nomme-la, et fais la promotion de SON offre (pas d'un produit générique).
- Chaque post met en avant UNE fonctionnalité ou UN bénéfice réel de la fiche, avec un exemple concret tiré de la vie de la clientèle visée.
- N'utilise que les faits de la fiche. N'invente AUCUN chiffre, pourcentage, témoignage, nom de client, étude de cas ou garantie qui n'y figure pas.
- Ne décris JAMAIS le fonctionnement d'une fonctionnalité au-delà de ce que dit la fiche : pas d'exemple de résultat inventé (quantités, corrections automatiques, validations, avenants) ; reste sur le bénéfice et sur ce que la fiche affirme.
- Pas de promesse juridique ni de garantie (« 100 % conforme », « conformité garantie », « sans risque d'erreur ») : parle de ce que fait l'outil, pas de ce que la loi exige de toi.
- Prix : ne cite un prix que s'il figure dans la fiche, avec sa condition (« en paiement annuel »).
- Ne cite jamais un concurrent, même pour comparer.
- Première phrase = accroche concrète (une situation de chantier, une question, un POV), jamais le nom du site ni de la marque seul.
- Le post est un texte accompagné d'une image : si la consigne parle de vidéo, live, PDF ou infographie, transforme-la en post texte sur le même sujet.
- Hashtags : 3 à 5 maximum, pris dans la liste conseillée quand elle existe.
- Texte brut prêt à publier : pas de markdown (ni astérisques, ni titres avec #), et ne recopie pas le titre interne en tête du post.`;

export async function rediger(t: Consigne, contexte?: string | null): Promise<string> {
  const texte = await demanderIA(
    [
      contexte ? `Fiche de la marque (source de vérité) :\n${contexte}\n\n${REGLES_MARQUE}\n${reglesReseau(t.plateforme, marcheDe(t.marche).langue)}\n` : "",
      CONSIGNES_TYPE[t.type] ?? CONSIGNES_TYPE.autre,
      t.plateforme ? `Plateforme : ${nomPlateforme(t.plateforme)}.` : "",
      `Titre : ${t.titre}`,
      t.consigne ? `Consigne : ${t.consigne}` : "",
      // Marché étranger : tout le post dans la langue du pays.
      reglesMarche(t.marche),
    ]
      .filter(Boolean)
      .join("\n"),
    { systeme: systemeMarche(t.marche) },
  );
  return sansHashtagsSiGroupe(sansLienSiReseau(nettoyerPost(texte, t.titre), t.plateforme), t.plateforme);
}

// --- Images -------------------------------------------------------------------

// Format adapté à chaque réseau (tailles acceptées par FLUX : multiples de 64
// entre 768 et 1344).
const FORMATS: Record<string, [number, number]> = {
  instagram: [1024, 1024],
  facebook: [1344, 768],
  linkedin: [1344, 768],
  x: [1344, 768],
  threads: [1024, 1024],
  pinterest: [768, 1344],
  tiktok: [768, 1344],
  youtube: [1344, 768],
  google_business: [1344, 768],
  bluesky: [1344, 768],
  reddit: [1344, 768],
  snapchat: [768, 1344],
};

export function formatImage(plateforme: string | null) {
  return FORMATS[plateforme ?? ""] ?? [1024, 1024];
}

// Décrit en anglais (les modèles d'image le comprennent mieux) le visuel qui
// illustre la publication.
export async function promptImage(texte: string, plateforme: string | null, contexte?: string | null, marche?: string | null) {
  const prompt = await demanderIA(
    [
      "Write ONE English prompt for an AI image generator to illustrate this social media post.",
      "The image must show the REAL world of this brand's customers using the product or benefiting from it: the concrete setting, people and objects of the niche (use the 'Univers visuel' line of the brand context when present).",
      "Illustrate the precise feature or benefit the post talks about, as a realistic scene (e.g. a phone or tablet in the hands of the target customer, in their workplace).",
      "Avoid generic clichés: no holograms, no floating screens, no abstract AI brains, no corporate glass offices unless the niche is really about that.",
      "Style: authentic, realistic photography, natural light, suited to the platform. No text, no letters, no logos, no watermark. Max 90 words. Answer with the prompt only.",
      plateforme ? `Platform: ${nomPlateforme(plateforme)}` : "",
      decorMarche(marche),
      contexte ? `Brand context:\n${contexte}` : "",
      `Post:\n${texte}`,
    ]
      .filter(Boolean)
      .join("\n"),
    { systeme: "You are an expert art director. You answer with a single image prompt.", maxTokens: 1200 },
  );
  return prompt.replace(/^["'\s]+|["'\s]+$/g, "");
}

const IMAGE_URL = "https://ai.api.nvidia.com/v1/genai/";
// flux.1-dev : meilleure qualité ; flux.1-schnell : 4 étapes, quelques secondes.
const MODELES_IMAGE = ["black-forest-labs/flux.1-dev", "black-forest-labs/flux.1-schnell", "stabilityai/stable-diffusion-xl"];

function corpsImage(modele: string, prompt: string, [largeur, hauteur]: [number, number]) {
  if (modele.includes("flux.1-schnell")) return { prompt, width: largeur, height: hauteur, steps: 4, seed: 0 };
  if (modele.includes("flux")) return { prompt, mode: "base", width: largeur, height: hauteur, cfg_scale: 3.5, steps: 28, seed: 0 };
  // Stable Diffusion XL (format d'appel différent, image carrée).
  return {
    text_prompts: [
      { text: prompt, weight: 1 },
      { text: "text, letters, watermark, logo, blurry", weight: -1 },
    ],
    cfg_scale: 5,
    sampler: "K_DPM_2_ANCESTRAL",
    seed: 0,
    steps: 30,
  };
}

// Génère une image (JPEG en base64) avec la clé NVIDIA, en basculant de
// modèle si l'un est indisponible.
export async function genererImage(prompt: string, plateforme: string | null) {
  const cle = cleNvidia();
  if (!cle) throw new Error("Clé NVIDIA absente des variables Vercel.");
  const format = formatImage(plateforme);
  const erreurs: string[] = [];
  for (const modele of [process.env.NVIDIA_MODELE_IMAGE, ...MODELES_IMAGE].filter((m): m is string => Boolean(m))) {
    let r: Response;
    try {
      r = await fetch(IMAGE_URL + modele, {
        method: "POST",
        signal: AbortSignal.timeout(modele.includes("schnell") ? 45_000 : 60_000),
        headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(corpsImage(modele, prompt, format)),
      });
    } catch {
      erreurs.push(`${modele.split("/")[1]} trop lent`);
      continue;
    }
    console.info("NVIDIA image", modele, r.status);
    if (!r.ok) {
      erreurs.push(`${modele.split("/")[1]} ${r.status}`);
      console.warn("NVIDIA image", modele, r.status, (await r.text()).slice(0, 200));
      continue;
    }
    const json = (await r.json()) as {
      artifacts?: { base64?: string; finishReason?: string }[];
      image?: string;
      finish_reason?: string;
    };
    const base64 = json.artifacts?.[0]?.base64 ?? json.image;
    const refus = json.artifacts?.[0]?.finishReason === "CONTENT_FILTERED" || json.finish_reason === "CONTENT_FILTERED";
    if (base64 && !refus) return { mime: "image/jpeg", base64 };
    erreurs.push(`${modele.split("/")[1]} : image refusée par le filtre`);
  }
  throw new Error(`Création d'image impossible (${erreurs.join(", ")}).`);
}
