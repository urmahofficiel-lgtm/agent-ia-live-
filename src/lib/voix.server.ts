// Voix off française avec Gemini TTS (clé Google AI Studio, offre gratuite).
// Facultatif : sans GEMINI_API_KEY, les vidéos sont montées sans voix.
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODELES = [
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
  "gemini-2.5-flash-preview-tts",
];
const VOIX = process.env.GEMINI_VOIX || "Kore";

export const voixConfiguree = () => Boolean(process.env.GEMINI_API_KEY);

export type Audio = { donnees: Buffer; format: "wav" | "pcm"; duree: number };

// Manière de lire le texte (style de la vidéo).
export const TON_PUBLICITAIRE =
  "voix off publicitaire française, dynamique et chaleureuse";
export const TON_PARLE =
  "voix française naturelle et enjouée, comme une personne qui parle face caméra sur TikTok : spontanée, rythme rapide, sourire dans la voix";

// Durée d'un WAV (PCM 16 bits) à partir de son en-tête.
export function dureeWav(wav: Buffer) {
  const frequence = wav.readUInt32LE(24);
  const canaux = wav.readUInt16LE(22);
  const bits = wav.readUInt16LE(34);
  let i = 12;
  while (i + 8 <= wav.length) {
    const id = wav.toString("ascii", i, i + 4);
    const taille = wav.readUInt32LE(i + 4);
    if (id === "data")
      return (
        Math.min(taille, wav.length - i - 8) / (frequence * canaux * (bits / 8))
      );
    i += 8 + taille;
  }
  return 0;
}

async function viaInteractions(
  cle: string,
  modele: string,
  texte: string,
  ton: string,
  voix: string,
): Promise<Audio | null> {
  const r = await fetch(`${BASE}/interactions`, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: { "x-goog-api-key": cle, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modele,
      input: [
        {
          type: "user_input",
          content: [
            {
              type: "text",
              text: texte,
              annotations: [{ type: "speech_metadata", style: ton }],
            },
          ],
        },
      ],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: voix }] },
    }),
  });
  console.info("Gemini TTS (interactions)", modele, r.status);
  if (!r.ok) return null;
  const json = (await r.json()) as {
    steps?: { type?: string; content?: { type?: string; data?: string }[] }[];
  };
  const audio = (json.steps ?? [])
    .filter((s) => s.type === "model_output")
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === "audio" && c.data)
    .pop();
  if (!audio?.data) return null;
  const donnees = Buffer.from(audio.data, "base64");
  const wav = donnees.toString("ascii", 0, 4) === "RIFF";
  return {
    donnees,
    format: wav ? "wav" : "pcm",
    duree: wav ? dureeWav(donnees) : donnees.length / 48000,
  };
}

// Ancienne méthode (generateContent), gardée en secours.
async function viaGenerateContent(
  cle: string,
  modele: string,
  texte: string,
  ton: string,
  voix: string,
): Promise<Audio | null> {
  const r = await fetch(`${BASE}/models/${modele}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: { "x-goog-api-key": cle, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { parts: [{ text: `Lis ce texte comme une ${ton} : ${texte}` }] },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voix } },
        },
      },
    }),
  });
  console.info("Gemini TTS (generateContent)", modele, r.status);
  if (!r.ok) return null;
  const json = (await r.json()) as {
    candidates?: {
      content?: {
        parts?: { inlineData?: { data?: string; mimeType?: string } }[];
      };
    }[];
  };
  const part = json.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data,
  );
  if (!part?.inlineData?.data) return null;
  const donnees = Buffer.from(part.inlineData.data, "base64");
  const wav = donnees.toString("ascii", 0, 4) === "RIFF";
  return {
    donnees,
    format: wav ? "wav" : "pcm",
    duree: wav ? dureeWav(donnees) : donnees.length / 48000,
  };
}

// voix : une des voix Gemini (Kore, Puck, Leda…), choisie par le Studio vidéo
// selon l'âge et le sexe du personnage.
export async function voixOff(
  texte: string,
  ton = TON_PUBLICITAIRE,
  voix = VOIX,
): Promise<Audio | null> {
  const cle = process.env.GEMINI_API_KEY;
  if (!cle) return null;
  for (const modele of [process.env.GEMINI_MODELE_TTS, ...MODELES].filter(
    (m): m is string => Boolean(m),
  )) {
    for (const methode of [viaInteractions, viaGenerateContent]) {
      try {
        const a = await methode(cle, modele, texte, ton, voix);
        if (a && a.duree > 1) return a;
      } catch (e) {
        console.warn("Gemini TTS", modele, e instanceof Error ? e.message : e);
      }
    }
  }
  return null;
}

// PCM brut de Gemini (24 kHz, mono, 16 bits) → WAV lisible partout.
export function enWav(a: Audio): Buffer {
  if (a.format === "wav") return a.donnees;
  const entete = Buffer.alloc(44);
  entete.write("RIFF", 0);
  entete.writeUInt32LE(36 + a.donnees.length, 4);
  entete.write("WAVEfmt ", 8);
  entete.writeUInt32LE(16, 16);
  entete.writeUInt16LE(1, 20);
  entete.writeUInt16LE(1, 22);
  entete.writeUInt32LE(24000, 24);
  entete.writeUInt32LE(48000, 28);
  entete.writeUInt16LE(2, 32);
  entete.writeUInt16LE(16, 34);
  entete.write("data", 36);
  entete.writeUInt32LE(a.donnees.length, 40);
  return Buffer.concat([entete, a.donnees]);
}
