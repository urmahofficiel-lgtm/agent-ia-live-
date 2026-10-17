import { describe, expect, it } from "vitest";
import { debutsScenes, dureesScenes, fichierEmoji, groupes, lirePlan, motsMinutes, planValide, premierEmoji, sceneVide, sousTitresMontage } from "./montage";

const scene = (o: object = {}) => ({ phrase: "Le soir vous faites encore vos devis à la main ?", texte: "Devis à 22 h", mots_forts: ["devis"], emoji: "😤", effet: "secousse", transition: "coupe", son: "whoosh", source: "video", recherche: "worker night desk", prompt: "", ...o });

describe("plan de montage", () => {
  it("lit la réponse de l'IA et corrige ce qui est invalide", () => {
    const p = lirePlan(`Voici : ${JSON.stringify({ titre: "T", accroche: "", cta: "", scenes: [scene(), scene({ effet: "explosion", transition: "?", emoji: "pas d'emoji", source: "x" }), { phrase: "" }] })}`);
    expect(p?.scenes).toHaveLength(2);
    expect(p?.scenes[1]).toMatchObject({ effet: "zoom_avant", transition: "coupe", emoji: "", source: "video", choix: null });
    expect(p?.accroche).toBe("T");
    expect(p?.cta).toBe("Lien en bio");
    expect(p?.voix).toBe("Charon");
  });

  it("refuse moins de 2 scènes ou une réponse illisible", () => {
    expect(lirePlan(JSON.stringify({ scenes: [scene()] }))).toBeNull();
    expect(lirePlan("rien")).toBeNull();
    expect(lirePlan({ scenes: [scene(), scene()] })).not.toBeNull();
  });

  it("retire ce qui casserait les sous-titres", () => {
    const p = lirePlan({ scenes: [scene({ phrase: "Un {\\pos(0,0)} test" }), scene()] });
    expect(p?.scenes[0].phrase).toBe("Un pos(0,0) test");
  });

  it("valide le plan avant montage", () => {
    expect(planValide({ titre: "", accroche: "", cta: "", legende: "", voix: "Charon", scenes: [sceneVide(), sceneVide()] })).toMatch(/2 scènes/);
  });
});

describe("emojis", () => {
  it("garde le premier emoji et donne son fichier Noto", () => {
    expect(premierEmoji("super 🔥🔥")).toBe("🔥");
    expect(premierEmoji("aucun")).toBe("");
    expect(fichierEmoji("🔥")).toBe("emoji_u1f525.png");
    expect(fichierEmoji("⚠️")).toBe("emoji_u26a0.png");
    expect(fichierEmoji("👷")).toBe("emoji_u1f477.png");
  });
});

describe("minutage", () => {
  it("partage la voix au prorata des phrases", () => {
    const d = dureesScenes([{ phrase: "Court." }, { phrase: "Une phrase bien plus longue que la première, avec du contenu." }], 10);
    expect(d[1]).toBeGreaterThan(d[0]);
    expect(d[0] + d[1]).toBeCloseTo(10.5, 1);
    expect(debutsScenes([2, 3, 4])).toEqual([0, 2, 5]);
  });
  it("sans voix, un temps de lecture borné", () => {
    for (const x of dureesScenes([{ phrase: "Ok" }, { phrase: "x".repeat(300) }])) {
      expect(x).toBeGreaterThanOrEqual(1.8);
      expect(x).toBeLessThanOrEqual(5);
    }
  });
  it("mots minutés en continu et groupés par 3 au plus", () => {
    const m = motsMinutes("un deux trois quatre. cinq", 1, 4);
    expect(m[0].debut).toBe(1);
    expect(m[m.length - 1].fin).toBe(5);
    const g = groupes(m);
    expect(g.every((x) => x.length <= 3)).toBe(true);
    expect(g[1].map((x) => x.mot)).toContain("quatre.");
  });
});

describe("sous-titres", () => {
  it("accroche, karaoké, mots forts et appel à l'action", () => {
    const p = lirePlan({ accroche: "Stop aux devis du soir", cta: "Essai gratuit", scenes: [scene(), scene({ texte: "La solution" })] })!;
    const ass = sousTitresMontage(p, [3, 3]);
    expect(ass).toContain("STOP AUX DEVIS DU SOIR");
    expect(ass).toContain("LA SOLUTION");
    expect(ass).toContain("ESSAI GRATUIT");
    expect(ass).toContain("&H0066FF66&}DEVIS");
  });
});
