import { nomPlateforme } from "./plateformes";

// Cerveau de l'agent : NVIDIA NIM (API compatible OpenAI).
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODELE_DEFAUT = "meta/llama-3.3-70b-instruct";

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

export async function rediger(t: Consigne): Promise<string> {
  const cle = cleNvidia();
  if (!cle) throw new Error("Clé NVIDIA absente des variables Vercel.");

  const r = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.NVIDIA_MODELE || MODELE_DEFAUT,
      temperature: 0.7,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content:
            "Tu es l'assistant marketing et commercial d'un entrepreneur français. Tu écris en français, de façon naturelle et concrète. Tu ne réponds qu'avec le contenu demandé, sans commentaire autour, sans guillemets englobants.",
        },
        {
          role: "user",
          content: [
            CONSIGNES_TYPE[t.type] ?? CONSIGNES_TYPE.autre,
            t.plateforme ? `Plateforme : ${nomPlateforme(t.plateforme)}.` : "",
            `Titre : ${t.titre}`,
            t.consigne ? `Consigne : ${t.consigne}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    }),
  });

  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    console.error("NVIDIA", r.status, detail);
    throw new Error(`L'IA NVIDIA a refusé la demande (${r.status}).`);
  }
  const json = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const texte = json.choices?.[0]?.message?.content?.trim();
  if (!texte) throw new Error("Réponse vide de l'IA.");
  return texte;
}
