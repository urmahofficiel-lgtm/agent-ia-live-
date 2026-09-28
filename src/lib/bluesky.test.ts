import { describe, expect, it } from "vitest";
import { adapterTexteBluesky, facettesLiens, LIMITE_BLUESKY } from "./bluesky";

const long =
  "**Devis IA** Vous êtes sur un chantier et vous n'avez qu'une minute ? Avec BTP Ecosystem, générez un devis complet en 2 minutes à partir de votre voix, d'une photo ou d'un texte. Pas de courbe d'apprentissage, pas de formation. Gagnez du temps et réduisez les erreurs de saisie au quotidien.\n\n👉 https://btp-ecosystem.com\n#BTP #Devis #Artisans";

describe("Bluesky", () => {
  it("garde un texte court tel quel (sans le gras Markdown)", () => {
    expect(adapterTexteBluesky("**Bonjour** le monde")).toBe("Bonjour le monde");
  });
  it("coupe à 300 caractères en gardant le lien à la fin", () => {
    const t = adapterTexteBluesky(long);
    expect([...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(t)].length).toBeLessThanOrEqual(LIMITE_BLUESKY);
    expect(t.endsWith("https://btp-ecosystem.com")).toBe(true);
    expect(t.startsWith("Devis IA")).toBe(true);
  });
  it("calcule la position des liens en octets", () => {
    const t = "Voir 👉 https://btp-ecosystem.com.";
    const [f] = facettesLiens(t);
    expect(f.features[0].uri).toBe("https://btp-ecosystem.com");
    expect(new TextDecoder().decode(new TextEncoder().encode(t).slice(f.index.byteStart, f.index.byteEnd))).toBe("https://btp-ecosystem.com");
  });
});

describe("Telegram", () => {
  it("accepte @canal, lien t.me ou identifiant numérique", async () => {
    const { normaliserChat } = await import("./telegram.server");
    expect(normaliserChat("t.me/btpecosystem")).toBe("@btpecosystem");
    expect(normaliserChat("https://t.me/btpecosystem/")).toBe("@btpecosystem");
    expect(normaliserChat("btpecosystem")).toBe("@btpecosystem");
    expect(normaliserChat("-1001234567890")).toBe("-1001234567890");
  });
});
