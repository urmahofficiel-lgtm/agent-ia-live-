import { describe, expect, it } from "vitest";
import { durees, lireScript, sousTitresAss } from "./video";

const scenes = [
  { texte_ecran: "Vos devis vous prennent des heures ?", voix: "Vous passez vos soirées sur vos devis ?", visuel: "a" },
  { texte_ecran: "Devis IA en 2 minutes", voix: "Avec BTP Ecosystem, l'IA prépare votre devis pendant que vous êtes sur le chantier.", visuel: "b" },
  { texte_ecran: "Essai gratuit", voix: "Essayez gratuitement sur btp-ecosystem.com.", visuel: "c" },
];

describe("lireScript", () => {
  it("lit le script entouré de texte et garde les scènes utiles", () => {
    const s = lireScript("Voici :\n" + JSON.stringify({ titre: "T", scenes: [...scenes, { texte_ecran: "", voix: "" }], legende: "L" }));
    expect(s?.scenes).toHaveLength(3);
    expect(s?.legende).toBe("L");
  });
  it("refuse un script trop court ou illisible", () => {
    expect(lireScript(JSON.stringify({ scenes: scenes.slice(0, 2) }))).toBeNull();
    expect(lireScript("désolé")).toBeNull();
  });
});

describe("durees", () => {
  it("répartit la durée selon le texte parlé, entre 2,5 et 10 s", () => {
    const d = durees(scenes, 30);
    expect(d).toHaveLength(3);
    expect(d[1]).toBeGreaterThan(d[0]);
    for (const x of d) expect(x).toBeGreaterThanOrEqual(2.5);
    for (const x of d) expect(x).toBeLessThanOrEqual(10);
  });
});

describe("sousTitresAss", () => {
  it("enchaîne les sous-titres sans trou et neutralise les accolades", () => {
    const ass = sousTitresAss([{ texte_ecran: "a {\\b1} b" }, { texte_ecran: "c" }], [2, 3.5], 720, 1280);
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:02.00");
    expect(ass).toContain("Dialogue: 0,0:00:02.00,0:00:05.50");
    expect(ass).toContain("A B1 B");
    expect(ass).toContain("PlayResX: 720");
  });
});

describe("dureeWav", async () => {
  const { dureeWav } = await import("./voix.server");
  it("calcule la durée d'un WAV 24 kHz mono 16 bits", () => {
    const donnees = Buffer.alloc(24000 * 2 * 3); // 3 s
    const entete = Buffer.alloc(44);
    entete.write("RIFF", 0);
    entete.writeUInt32LE(36 + donnees.length, 4);
    entete.write("WAVEfmt ", 8);
    entete.writeUInt32LE(16, 16);
    entete.writeUInt16LE(1, 20);
    entete.writeUInt16LE(1, 22);
    entete.writeUInt32LE(24000, 24);
    entete.writeUInt32LE(48000, 28);
    entete.writeUInt16LE(2, 32);
    entete.writeUInt16LE(16, 34);
    entete.write("data", 36);
    entete.writeUInt32LE(donnees.length, 40);
    expect(dureeWav(Buffer.concat([entete, donnees]))).toBeCloseTo(3, 5);
  });
});

describe("scriptDeSecours", () => {
  it("construit au moins 4 scènes avec l'appel à l'action de la marque", async () => {
    const { scriptDeSecours } = await import("./video");
    const s = scriptDeSecours(
      {
        titre: "Devis IA en 2 min",
        consigne: "",
        brouillon:
          "**Devis IA en 2 min**\nVous êtes sur un chantier et vous n'avez qu'une minute ? Avec BTP Ecosystem, générez un devis complet en 2 minutes. 👉 https://btp-ecosystem.com #BTP #Devis",
      },
      "Marque : BTP Ecosystem\nSite / lien à mettre dans les posts : https://btp-ecosystem.com",
    );
    expect(s.scenes.length).toBeGreaterThanOrEqual(4);
    expect(s.scenes.at(-1)?.voix).toBe("Découvrez BTP Ecosystem sur btp-ecosystem.com.");
    expect(s.scenes.every((x) => x.texte_ecran.split(" ").length <= 6)).toBe(true);
    expect(s.scenes.some((x) => x.voix.includes("http") || x.voix.includes("#"))).toBe(false);
  });
});
