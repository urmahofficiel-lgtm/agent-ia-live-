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

export function rediger(t: Consigne): Promise<string> {
  return demanderIA(
    [
      CONSIGNES_TYPE[t.type] ?? CONSIGNES_TYPE.autre,
      t.plateforme ? `Plateforme : ${nomPlateforme(t.plateforme)}.` : "",
      `Titre : ${t.titre}`,
      t.consigne ? `Consigne : ${t.consigne}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
