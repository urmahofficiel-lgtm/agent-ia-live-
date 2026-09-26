import { nomPlateforme } from "./plateformes";

// Cerveau de l'agent : NVIDIA NIM (API compatible OpenAI).
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
// NVIDIA retire régulièrement des modèles (réponse 404/410) : on essaie une
// liste dans l'ordre et on passe au suivant si l'un a disparu.
// NVIDIA_MODELE (variable Vercel) permet d'en imposer un en tête de liste.
const MODELES = [
  "mistralai/mistral-large-2-instruct",
  "google/gemma-4-31b-it",
  "deepseek-ai/deepseek-v4.1-flash",
  "nvidia/llama-3.1-nemotron-70b-instruct",
];

const MODELE_DISPARU = new Set([404, 410]);

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

export type Consigne = { type: string; plateforme: string | null; titre: string; consigne: string };

const SYSTEME =
  "Tu es l'assistant marketing et commercial d'un entrepreneur français. Tu écris en français, de façon naturelle et concrète. Tu ne réponds qu'avec le contenu demandé, sans commentaire autour, sans guillemets englobants.";

function appelNvidia(cle: string, modele: string, systeme: string, demande: string, maxTokens: number) {
  return fetch(NVIDIA_URL, {
    method: "POST",
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

// Appel générique au cerveau NVIDIA, avec bascule automatique de modèle.
export async function demanderIA(demande: string, options: { systeme?: string; maxTokens?: number } = {}) {
  const cle = cleNvidia();
  if (!cle) throw new Error("Clé NVIDIA absente des variables Vercel.");

  const modeles = [process.env.NVIDIA_MODELE, ...MODELES].filter((m): m is string => Boolean(m));
  let r: Response | undefined;
  for (const modele of modeles) {
    r = await appelNvidia(cle, modele, options.systeme ?? SYSTEME, demande, options.maxTokens ?? 800);
    if (!MODELE_DISPARU.has(r.status)) break;
    console.warn("NVIDIA : modèle indisponible", modele, r.status);
  }
  if (!r) throw new Error("Aucun modèle NVIDIA configuré.");

  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    console.error("NVIDIA", r.status, detail);
    throw new Error(`L'IA NVIDIA a refusé la demande (${r.status}).`);
  }
  const json = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  // Les modèles « à raisonnement » renvoient parfois leur réflexion entre
  // balises <think> : on ne garde que la réponse.
  const texte = json.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!texte) throw new Error("Réponse vide de l'IA.");
  return texte;
}

export function rediger(t: Consigne, contexte?: string | null): Promise<string> {
  return demanderIA(
    [
      contexte ? `Contexte de l'entreprise (à respecter) :\n${contexte}\n` : "",
      CONSIGNES_TYPE[t.type] ?? CONSIGNES_TYPE.autre,
      t.plateforme ? `Plateforme : ${nomPlateforme(t.plateforme)}.` : "",
      `Titre : ${t.titre}`,
      t.consigne ? `Consigne : ${t.consigne}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
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
export async function promptImage(texte: string, plateforme: string | null, contexte?: string | null) {
  const prompt = await demanderIA(
    [
      "Write ONE English prompt for an AI image generator to illustrate this social media post.",
      "Style: professional, modern, realistic photography or clean editorial illustration, suited to the brand and platform.",
      "No text, no letters, no logos, no watermark in the image. Max 80 words. Answer with the prompt only.",
      plateforme ? `Platform: ${nomPlateforme(plateforme)}` : "",
      contexte ? `Brand context:\n${contexte}` : "",
      `Post:\n${texte}`,
    ]
      .filter(Boolean)
      .join("\n"),
    { systeme: "You are an expert art director. You answer with a single image prompt.", maxTokens: 200 },
  );
  return prompt.replace(/^["'\s]+|["'\s]+$/g, "");
}

const IMAGE_URL = "https://ai.api.nvidia.com/v1/genai/";
const MODELES_IMAGE = ["black-forest-labs/flux.1-dev", "black-forest-labs/flux.1-schnell", "stabilityai/stable-diffusion-3-medium"];

function corpsImage(modele: string, prompt: string, [largeur, hauteur]: [number, number]) {
  if (modele.includes("flux.1-schnell")) return { prompt, width: largeur, height: hauteur, steps: 4, seed: 0 };
  if (modele.includes("flux")) return { prompt, mode: "base", width: largeur, height: hauteur, cfg_scale: 3.5, steps: 28, seed: 0 };
  const ratio = largeur === hauteur ? "1:1" : largeur > hauteur ? "16:9" : "9:16";
  return { prompt, aspect_ratio: ratio, cfg_scale: 5, steps: 40, seed: 0, negative_prompt: "text, letters, watermark, logo" };
}

// Génère une image (JPEG en base64) avec la clé NVIDIA, en basculant de
// modèle si l'un est indisponible.
export async function genererImage(prompt: string, plateforme: string | null) {
  const cle = cleNvidia();
  if (!cle) throw new Error("Clé NVIDIA absente des variables Vercel.");
  const format = formatImage(plateforme);
  let derniere = "";
  for (const modele of [process.env.NVIDIA_MODELE_IMAGE, ...MODELES_IMAGE].filter((m): m is string => Boolean(m))) {
    const r = await fetch(IMAGE_URL + modele, {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corpsImage(modele, prompt, format)),
    });
    if (!r.ok) {
      derniere = `${modele} ${r.status}`;
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
    derniere = `${modele} : image refusée par le filtre`;
  }
  throw new Error(`Création d'image impossible (${derniere}).`);
}
