import { listerGemini } from "./ia.server";
import { consigneAnalyse, lireAnalyse, type AnalyseScene } from "./personnage";

// Gemini regarde l'image et lit la consigne : âge et sexe du personnage,
// phrase à dire et sa langue (clé GEMINI_API_KEY existante).
export async function analyserScene(
  image: Uint8Array,
  mime: string,
  prompt: string,
  duree: number,
): Promise<AnalyseScene | null> {
  const cle = process.env.GEMINI_API_KEY;
  if (!cle) return null;
  const modeles = await listerGemini(cle).catch(() => [] as string[]);
  for (const modele of modeles.slice(0, 4)) {
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
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: mime,
                      data: Buffer.from(image).toString("base64"),
                    },
                  },
                  { text: consigneAnalyse(prompt, duree) },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
            },
          }),
        },
      );
      if (!r.ok) {
        console.warn("Analyse personnage", modele, r.status);
        continue;
      }
      const json = (await r.json()) as {
        candidates?: {
          content?: { parts?: { text?: string; thought?: boolean }[] };
        }[];
      };
      const texte = (json.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("");
      const a = lireAnalyse(texte, prompt);
      if (a) return a;
    } catch (e) {
      console.warn(
        "Analyse personnage",
        modele,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return null;
}
