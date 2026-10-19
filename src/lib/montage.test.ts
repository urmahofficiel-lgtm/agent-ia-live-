import { describe, expect, it } from "vitest";
import { appliquerModele, debutsScenes, dureesEstimees, estMotFort, etatApercu, dureesScenes, fichierEmoji, groupes, lirePlan, motsMinutes, planValide, premierEmoji, sceneVide, sousTitresMontage } from "./montage";

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
    expect(planValide({ ...lirePlan({ scenes: [scene(), scene()] })!, scenes: [sceneVide(), sceneVide()] })).toMatch(/2 scènes/);
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

describe("studio pro", () => {
  it("les anciens plans gardent leurs réglages par défaut", () => {
    const p = lirePlan({ scenes: [scene(), scene()] })!;
    expect(p).toMatchObject({ sous_titres: "karaoke", filtre: "aucun", mix: { voix: 1, musique: 1, effets: 1 } });
    expect(p.scenes[0]).toMatchObject({ vitesse: 1, media_url: null, media_type: null });
  });

  it("borne la vitesse, le mixage et le média perso", () => {
    const p = lirePlan({ mix: { voix: 9, musique: -1, effets: "x" }, scenes: [scene({ vitesse: 3, media_url: "pas une url", media_type: "audio" }), scene({ vitesse: 0.5 })] })!;
    expect(p.mix).toEqual({ voix: 2, musique: 0, effets: 1 });
    expect(p.scenes[0]).toMatchObject({ vitesse: 1, media_url: null, media_type: null });
    expect(p.scenes[1].vitesse).toBe(0.5);
  });

  it("applique un modèle sans toucher aux phrases", () => {
    const p = lirePlan({ scenes: [scene(), scene(), scene()] })!;
    const v = appliquerModele(p, "pro");
    expect(v).toMatchObject({ sous_titres: "sobre", filtre: "cinema" });
    expect(v.scenes.every((s) => s.transition === "fondu" && s.son === "aucun" && s.emoji === "")).toBe(true);
    expect(v.scenes.map((s) => s.phrase)).toEqual(p.scenes.map((s) => s.phrase));
    expect(appliquerModele(p, "viral").scenes[0].effet).toBe("secousse");
  });

  it("sous-titres dans le style choisi", () => {
    const p = lirePlan({ sous_titres: "viral", scenes: [scene({ phrase: "un deux trois quatre cinq six" }), scene()] })!;
    const ass = sousTitresMontage(p, [3, 3]);
    expect(ass).toContain("Style: Mots,DejaVu Sans,80,");
    expect(ass).toContain("&H0014FF39&");
    const sobre = sousTitresMontage({ ...p, sous_titres: "sobre" }, [3, 3]);
    expect(sobre).toContain("un deux trois");
    expect(sobre).not.toContain("UN DEUX");
  });

  it("groupes de mots selon le style", () => {
    const m = motsMinutes("un deux trois quatre cinq six", 0, 3);
    expect(groupes(m, 2).every((g) => g.length <= 2)).toBe(true);
    expect(groupes(m, 4)[0]).toHaveLength(4);
  });

  it("durées estimées pour l'aperçu", () => {
    const [court, long] = dureesEstimees([{ phrase: "Ok" }, { phrase: "un deux trois quatre cinq six sept huit neuf dix onze douze treize" }]);
    expect(court).toBe(1.5);
    expect(long).toBeCloseTo(5.3, 1);
  });
});

describe("aperçu en direct", () => {
  const p = lirePlan({ accroche: "Stop", cta: "Essai gratuit", scenes: [scene({ phrase: "un deux trois quatre", mots_forts: ["Trois"] }), scene({ phrase: "cinq six" })] })!;
  it("trouve la scène, le groupe de mots et le mot prononcé", () => {
    const e = etatApercu(p, [4, 2], 0.1);
    expect(e).toMatchObject({ i: 0, mots: ["un", "deux", "trois"], actif: 0, accroche: true, cta: false, total: 6 });
    const f = etatApercu(p, [4, 2], 5);
    expect(f).toMatchObject({ i: 1, accroche: false, cta: true });
    expect(f.progres).toBeCloseTo(0.5, 2);
    expect(etatApercu(p, [4, 2], 99).i).toBe(1);
  });
  it("reconnaît les mots forts", () => {
    expect(estMotFort(p.scenes[0], "TROIS,")).toBe(true);
    expect(estMotFort(p.scenes[0], "deux")).toBe(false);
  });
});

describe("appel à l'action", () => {
  it("passe au-dessus des sous-titres placés en bas", () => {
    const p = lirePlan({ sous_titres: "sobre", cta: "Essai", scenes: [scene(), scene()] })!;
    expect(sousTitresMontage(p, [3, 3])).toContain(",60,60,420,1");
    expect(sousTitresMontage({ ...p, sous_titres: "viral" }, [3, 3])).toContain(",60,60,230,1");
  });
});
