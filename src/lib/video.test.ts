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

describe("raccourcir", () => {
  it("garde une idée complète de 6 mots au plus", async () => {
    const { raccourcir } = await import("./video");
    expect(raccourcir("Pas de courbe d'apprentissage, pas de formation à suivre.")).toBe("Pas de courbe d'apprentissage");
    expect(raccourcir("Devis IA en 2 min")).toBe("Devis IA en 2 min");
    expect(raccourcir("Générez un devis complet à partir de votre voix et d'une photo")).toBe("Générez un devis complet");
    expect(raccourcir("Avec BTP Ecosystem, générez un devis complet en 2 minutes à partir de votre voix")).toBe("Générez un devis complet");
    expect(raccourcir("Gagnez du temps et réduisez les erreurs de saisie.")).toBe("Gagnez du temps");
  });
});

describe("scriptDeSecours : images variées", () => {
  it("utilise un mot-clé d'univers différent par scène et marque des scènes produit", async () => {
    const { scriptDeSecours } = await import("./video");
    const s = scriptDeSecours(
      { titre: "Devis IA", consigne: "", brouillon: "Première phrase assez longue ici. Deuxième phrase assez longue là. Troisième phrase assez longue encore." },
      "Marque : BTP Ecosystem\nUnivers visuel (décors, personnes, objets à montrer) : chantier de rénovation, artisan avec smartphone, camionnette d'artisan",
    );
    const mots = s.scenes.map((x) => x.recherche_stock);
    expect(new Set(mots.slice(0, 3)).size).toBe(3);
    expect(s.scenes.at(-1)?.type_visuel).toBe("produit");
    expect(s.scenes.some((x, i) => i > 0 && i < s.scenes.length - 1 && x.type_visuel === "produit")).toBe(true);
  });
});

describe("styles de vidéo : consignes du script", () => {
  const t = { titre: "Devis en 2 minutes", consigne: "" };
  it("le style classique garde la consigne d'origine", async () => {
    const { consigneScript } = await import("./video");
    expect(consigneScript(t, null, "TikTok", false, "classique")).toBe(consigneScript(t, null, "TikTok", false));
    expect(consigneScript(t, null, "TikTok")).toContain("Entre 5 et 7 scènes.");
  });
  it("chaque style a sa structure", async () => {
    const { consigneScript } = await import("./video");
    const ugc = consigneScript(t, null, "TikTok", false, "ugc");
    expect(ugc).toContain("1re personne");
    expect(ugc).toContain("POV");
    expect(ugc).toMatch(/inventer un témoignage/);
    expect(consigneScript(t, null, "TikTok", false, "avant_apres")).toContain('repere "AVANT"');
    expect(consigneScript(t, null, "TikTok", false, "etapes")).toContain('repere "1", "2", "3"');
    expect(consigneScript(t, null, "TikTok", false, "top3")).toContain("compte à rebours");
    for (const style of ["ugc", "avant_apres", "etapes", "top3"] as const) {
      expect(consigneScript(t, "Marque : X", "TikTok", true, style)).toContain('"repere"');
    }
  });
});

describe("normaliserScript", () => {
  const scene = (texte: string, repere = "") => ({ texte_ecran: texte, voix: texte, visuel: "", recherche_stock: "", type_visuel: "terrain" as const, repere });
  const script = (n: number, reperes: string[] = []) => ({
    titre: "T",
    legende: "L",
    scenes: Array.from({ length: n }, (_, i) => scene(`Scène ${i}`, reperes[i] ?? "")),
  });
  it("numérote les étapes entre l'accroche et l'appel à l'action", async () => {
    const { normaliserScript } = await import("./video");
    expect(normaliserScript(script(6), "etapes").scenes.map((s) => s.repere)).toEqual(["", "1", "2", "3", "4", ""]);
  });
  it("top 3 : trois points au plus, en compte à rebours", async () => {
    const { normaliserScript } = await import("./video");
    const s = normaliserScript(script(7), "top3");
    expect(s.scenes.map((x) => x.repere)).toEqual(["", "3", "2", "1", ""]);
    expect(s.scenes.at(-1)?.texte_ecran).toBe("Scène 6");
  });
  it("avant / après : garde le découpage de l'IA, sinon le devine", async () => {
    const { normaliserScript } = await import("./video");
    expect(normaliserScript(script(6, ["", "AVANT", "AVANT", "APRÈS", "APRÈS", ""]), "avant_apres").scenes.map((x) => x.repere)).toEqual(["", "AVANT", "AVANT", "APRÈS", "APRÈS", ""]);
    expect(normaliserScript(script(6), "avant_apres").scenes.map((x) => x.repere)).toEqual(["", "AVANT", "AVANT", "APRÈS", "APRÈS", ""]);
    expect(normaliserScript(script(5), "avant_apres").scenes.map((x) => x.repere)).toEqual(["", "AVANT", "APRÈS", "APRÈS", ""]);
    expect(normaliserScript(script(3), "avant_apres").scenes.map((x) => x.repere)).toEqual(["AVANT", "APRÈS", ""]);
  });
  it("classique et UGC : aucun repère", async () => {
    const { normaliserScript } = await import("./video");
    for (const style of ["classique", "ugc"] as const) {
      expect(normaliserScript(script(5, ["1", "2", "3", "4", "5"]), style).scenes.every((x) => x.repere === "")).toBe(true);
    }
  });
  it("une scène AVANT ne montre jamais le produit", async () => {
    const { imposerScenesProduit, normaliserScript } = await import("./video");
    const s = imposerScenesProduit(normaliserScript(script(5), "avant_apres"));
    expect(s.scenes.filter((x) => x.repere === "AVANT").every((x) => x.type_visuel === "terrain")).toBe(true);
    expect(s.scenes.some((x) => x.repere === "APRÈS" && x.type_visuel === "produit")).toBe(true);
  });
});

describe("indexTransition", () => {
  it("trouve la première scène APRÈS qui suit une scène AVANT", async () => {
    const { indexTransition } = await import("./video");
    expect(indexTransition(["", "AVANT", "APRÈS", "APRÈS", ""])).toBe(2);
    expect(indexTransition(["", "APRÈS", ""])).toBe(-1);
  });
});

describe("coupesSaccadees", () => {
  it("découpe en plans de 1,5 à 2,5 s qui couvrent toute la scène", async () => {
    const { coupesSaccadees } = await import("./video");
    for (const duree of [2.5, 3, 4.2, 5, 7, 10]) {
      const c = coupesSaccadees(duree);
      expect(c[0][0]).toBe(0);
      expect(c.at(-1)?.[1]).toBe(duree);
      for (const [a, b] of c) {
        expect(b - a).toBeGreaterThanOrEqual(1.49);
        expect(b - a).toBeLessThanOrEqual(2.51);
      }
    }
  });
});

describe("sous-titres mot à mot", () => {
  it("minute chaque mot, dans l'ordre, sur toute la durée", async () => {
    const { minutageMots } = await import("./video");
    const m = minutageMots("POV : vous finissez   vos devis à minuit.", 2, 4);
    expect(m.map((x) => x.mot)).toEqual(["POV", ":", "vous", "finissez", "vos", "devis", "à", "minuit."]);
    expect(m[0].debut).toBe(2);
    expect(m.at(-1)?.fin).toBe(6);
    for (let i = 1; i < m.length; i++) expect(m[i].debut).toBeGreaterThanOrEqual(m[i - 1].debut);
    expect(m[3].fin - m[3].debut).toBeGreaterThan(m[6].fin - m[6].debut);
  });
  it("groupe 1 à 3 mots, coupe à la ponctuation", async () => {
    const { groupesDeMots } = await import("./video");
    const g = groupesDeMots("Personne ne vous dit ça, mais vos devis perdent des clients.".split(" "));
    expect(g.every((x) => x.length >= 1 && x.length <= 3)).toBe(true);
    expect(g.flat().join(" ")).toBe("Personne ne vous dit ça, mais vos devis perdent des clients.");
    expect(g.some((x) => x.at(-1) === "ça,")).toBe(true);
    expect(g.every((x) => x.join(" ").length <= 16 || x.length === 1)).toBe(true);
  });
  it("une ligne par mot, le mot prononcé surligné, l'accroche en haut", async () => {
    const { sousTitresStyle } = await import("./video");
    const ass = sousTitresStyle(
      "ugc",
      [
        { texte_ecran: "POV : le devis à minuit", voix: "Vous faites vos devis à minuit ?" },
        { texte_ecran: "Essayez", voix: "Essayez gratuitement." },
      ],
      [3, 2],
      720,
      1280,
      "#FF8A3D",
    );
    const mots = ass.split("\n").filter((l) => l.includes(",Mots,"));
    expect(mots).toHaveLength(9);
    expect(ass).toContain("{\\1c&H3D8AFF&}VOUS{\\1c&HFFFFFF&}");
    expect(ass).toContain(",Accroche,,0,0,0,,{\\fad(80,120)}POV : le devis à minuit");
  });
  it("repères des styles : étapes, top 3, avant / après", async () => {
    const { sousTitresStyle } = await import("./video");
    const sc = (r: string[]) => r.map((repere, i) => ({ texte_ecran: `Texte ${i}`, repere }));
    expect(sousTitresStyle("etapes", sc(["", "1", "2", "3", ""]), [2, 3, 3, 3, 2], 720, 1280)).toContain("ÉTAPE 2/3");
    expect(sousTitresStyle("top3", sc(["", "3", "2", "1", ""]), [2, 3, 3, 3, 2], 720, 1280)).toContain("}#1");
    const aa = sousTitresStyle("avant_apres", sc(["", "AVANT", "APRÈS", ""]), [2, 3, 3, 2], 720, 1280);
    expect(aa).toMatch(/,Avant,.*AVANT/);
    expect(aa).toMatch(/,Repere,.*APRÈS/);
    expect(aa.split("\n").filter((l) => l.includes(",Principal,"))).toHaveLength(4);
  });
});

describe("choisirCaptures", () => {
  it("garde toutes les captures quand il y en a peu", async () => {
    const { choisirCaptures } = await import("./video");
    expect(choisirCaptures(["a", "b"], "x")).toEqual(["a", "b"]);
  });

  it("prend 4 captures à la suite, toujours les mêmes pour une même publication", async () => {
    const { choisirCaptures } = await import("./video");
    const liste = ["1", "2", "3", "4", "5", "6", "7", "8"];
    const choix = choisirCaptures(liste, "tache-42");
    expect(choix).toHaveLength(4);
    expect(new Set(choix).size).toBe(4);
    expect(choisirCaptures(liste, "tache-42")).toEqual(choix);
    const depart = liste.indexOf(choix[0]);
    expect(choix).toEqual([0, 1, 2, 3].map((i) => liste[(depart + i) % liste.length]));
  });

  it("varie les écrans d'une publication à l'autre", async () => {
    const { choisirCaptures } = await import("./video");
    const liste = ["1", "2", "3", "4", "5", "6", "7", "8"];
    const premiers = new Set(["a", "b", "c", "d", "e", "f"].map((g) => choisirCaptures(liste, `tache-${g}`)[0]));
    expect(premiers.size).toBeGreaterThan(1);
  });
});
