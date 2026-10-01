import { describe, expect, it } from "vitest";
import {
  ferieProche,
  CYCLE_SUJETS,
  REGLES_PILOTE,
  consigneSujets,
  estPilotable,
  heuresDuJour,
  instantParis,
  jourParis,
  lireSujets,
  melangeDuJour,
  minutesParis,
  normaliserCreneaux,
  planDuJour,
  postsParJour,
  tachesDuJour,
} from "./pilote";
import { styleVideoPour } from "./styles";

const CRENEAUX = ["08:30", "12:30", "18:30"];

describe("créneaux et rythme", () => {
  it("normalise les créneaux : format, doublons, tri, défaut", () => {
    expect(
      normaliserCreneaux(["18:30", "8:30", "08:30", "25:00", "midi"]),
    ).toEqual(["08:30", "18:30"]);
    expect(normaliserCreneaux([])).toEqual(CRENEAUX);
    expect(normaliserCreneaux(null)).toEqual(CRENEAUX);
  });

  it("3 posts par défaut, entre 1 et 5", () => {
    expect(postsParJour({}, "facebook")).toBe(3);
    expect(postsParJour({ linkedin: 1 }, "linkedin")).toBe(1);
    expect(postsParJour({ tiktok: 9 }, "tiktok")).toBe(5);
    expect(postsParJour({ x: 0 }, "x")).toBe(1);
    expect(postsParJour(null, "x")).toBe(3);
  });

  it("utilise les créneaux, ou en choisit une partie répartie", () => {
    expect(heuresDuJour(3, CRENEAUX)).toEqual(CRENEAUX);
    expect(heuresDuJour(1, CRENEAUX)).toEqual(["12:30"]);
    expect(heuresDuJour(2, CRENEAUX)).toEqual(["08:30", "18:30"]);
  });

  it("au-delà des créneaux, répartit entre 08:00 et 21:00", () => {
    expect(heuresDuJour(4, CRENEAUX)).toEqual([
      "08:00",
      "12:20",
      "16:40",
      "21:00",
    ]);
    expect(heuresDuJour(5, CRENEAUX)).toEqual([
      "08:00",
      "11:15",
      "14:30",
      "17:45",
      "21:00",
    ]);
  });

  it("exclut messageries, e-mail et réseaux manuels", () => {
    expect(estPilotable("facebook")).toBe(true);
    expect(estPilotable("google_business")).toBe(true);
    expect(estPilotable("facebook_profil")).toBe(false);
    expect(estPilotable("telegram")).toBe(false);
    expect(estPilotable("gmail")).toBe(false);
    expect(estPilotable("inconnu")).toBe(false);
  });
});

describe("heure de Paris", () => {
  it("convertit une heure de Paris en UTC, été comme hiver", () => {
    expect(instantParis("2026-07-01", "08:30").toISOString()).toBe(
      "2026-07-01T06:30:00.000Z",
    );
    expect(instantParis("2026-12-01", "08:30").toISOString()).toBe(
      "2026-12-01T07:30:00.000Z",
    );
    // Jour du passage à l'heure d'hiver (25 octobre 2026).
    expect(instantParis("2026-10-25", "12:30").toISOString()).toBe(
      "2026-10-25T11:30:00.000Z",
    );
  });

  it("lit le jour et l'heure de Paris", () => {
    const t = new Date("2026-09-30T22:30:00Z"); // 00:30 le 1er octobre à Paris
    expect(jourParis(t)).toBe("2026-10-01");
    expect(minutesParis(t)).toBe(30);
  });
});

describe("plan du jour", () => {
  const matin = new Date("2026-10-01T03:10:00Z"); // 05:10 à Paris

  it("un sujet par heure, décliné sur chaque réseau pilotable", () => {
    const p = planDuJour(
      ["facebook", "instagram", "telegram", "facebook_profil", "facebook"],
      {},
      CRENEAUX,
      "2026-10-01",
      matin,
    );
    expect(p.heures).toEqual(CRENEAUX);
    expect(p.creneaux).toHaveLength(6);
    expect(new Set(p.creneaux.map((c) => c.plateforme))).toEqual(
      new Set(["facebook", "instagram"]),
    );
    const midi = p.creneaux.filter((c) => c.heure === "12:30");
    expect(midi.map((c) => c.sujet)).toEqual([1, 1]);
    expect(midi[0].quand).toBe("2026-10-01T10:30:00.000Z");
  });

  it("respecte le rythme de chaque réseau", () => {
    const p = planDuJour(
      ["facebook", "linkedin"],
      { linkedin: 1 },
      CRENEAUX,
      "2026-10-01",
      matin,
    );
    expect(
      p.creneaux.filter((c) => c.plateforme === "linkedin").map((c) => c.heure),
    ).toEqual(["12:30"]);
    expect(p.creneaux.filter((c) => c.plateforme === "facebook")).toHaveLength(
      3,
    );
  });

  it("activé en cours de journée : seulement les créneaux restants", () => {
    const apresMidi = new Date("2026-10-01T12:00:00Z"); // 14:00 à Paris
    const p = planDuJour(["facebook"], {}, CRENEAUX, "2026-10-01", apresMidi);
    expect(p.heures).toEqual(["18:30"]);
    expect(p.creneaux).toEqual([
      expect.objectContaining({ heure: "18:30", sujet: 0 }),
    ]);
    expect(
      planDuJour(
        ["facebook"],
        {},
        CRENEAUX,
        "2026-10-01",
        new Date("2026-10-01T20:00:00Z"),
      ).creneaux,
    ).toEqual([]);
  });
});

describe("mélange des sujets", () => {
  it("le cycle respecte 40/30/20/10", () => {
    const compte = (id: string) => CYCLE_SUJETS.filter((c) => c === id).length;
    expect(CYCLE_SUJETS).toHaveLength(10);
    expect([
      compte("conseil"),
      compte("demo"),
      compte("coulisses"),
      compte("offre"),
    ]).toEqual([4, 3, 2, 1]);
    expect(CYCLE_SUJETS.slice(0, 3)).toEqual(["conseil", "demo", "coulisses"]);
  });

  it("sur 10 jours de 3 sujets, la proportion est respectée", () => {
    const tous = Array.from({ length: 10 }, (_, i) =>
      melangeDuJour(`2026-10-${String(i + 1).padStart(2, "0")}`, 3),
    ).flat();
    const compte = (id: string) => tous.filter((c) => c === id).length;
    expect([
      compte("conseil"),
      compte("demo"),
      compte("coulisses"),
      compte("offre"),
    ]).toEqual([12, 9, 6, 3]);
  });

  it("la consigne donne les types, les titres récents et ce qui marche", () => {
    const c = consigneSujets({
      contexte: "Marque : Plomberie Martin",
      categories: ["conseil", "demo", "offre"],
      titresRecents: ["Détartrer son chauffe-eau"],
      apprentissage: "Les vidéos avant/après marchent le mieux.",
      jour: "2026-10-01",
    });
    expect(c).toContain("Plomberie Martin");
    expect(c).toContain("Détartrer son chauffe-eau");
    expect(c).toContain("avant/après");
    expect(c).toContain("3. Offre directe");
    expect(c).toContain("pas de chiffre inventé");
  });
});

describe("lecture de la réponse de l'IA", () => {
  const reponse = (sujets: object[]) =>
    "Voici :\n```json\n" + JSON.stringify({ sujets }) + "\n```";

  it("lit k sujets et nettoie le markdown", () => {
    const s = lireSujets(
      reponse([
        { titre: "**Fuite sous l'évier**", consigne: "Les 3 gestes" },
        { titre: "Démo", consigne: "" },
      ]),
      2,
    );
    expect(s).toEqual([
      { titre: "Fuite sous l'évier", consigne: "Les 3 gestes" },
      { titre: "Démo", consigne: "Démo" },
    ]);
  });

  it("écarte les titres récents et les doublons, null s'il en manque", () => {
    const r = reponse([
      { titre: "Détartrer son chauffe-eau !" },
      { titre: "A" },
      { titre: "a" },
      { titre: "B" },
    ]);
    expect(
      lireSujets(r, 2, ["détartrer son chauffe eau"])?.map((s) => s.titre),
    ).toEqual(["A", "B"]);
    expect(lireSujets(r, 3, ["détartrer son chauffe eau"])).toBeNull();
  });

  it("null sans JSON ou avec un JSON mal formé", () => {
    expect(lireSujets("désolé", 1)).toBeNull();
    expect(lireSujets("{sujets: [", 1)).toBeNull();
    expect(lireSujets(JSON.stringify({ sujets: "non" }), 1)).toBeNull();
  });

  it("construit les tâches avec les règles de rédaction", () => {
    const p = planDuJour(
      ["facebook", "tiktok"],
      {},
      CRENEAUX,
      "2026-10-01",
      new Date("2026-10-01T03:10:00Z"),
    );
    const sujets = [1, 2, 3].map((i) => ({
      titre: `Sujet ${i}`,
      consigne: `Angle ${i}`,
    }));
    const t = tachesDuJour(p.creneaux, sujets, melangeDuJour("2026-10-01", 3));
    expect(t).toHaveLength(6);
    expect(
      t
        .filter((x) => x.titre === "Sujet 2")
        .map((x) => x.plateforme)
        .sort(),
    ).toEqual(["facebook", "tiktok"]);
    expect(t.every((x) => x.consigne.includes(REGLES_PILOTE))).toBe(true);
  });
});

describe("style vidéo TikTok", () => {
  it("classique devient UGC sur TikTok seulement", () => {
    expect(styleVideoPour("tiktok", "classique")).toBe("ugc");
    expect(styleVideoPour("tiktok", "top3")).toBe("top3");
    expect(styleVideoPour("instagram", "classique")).toBe("classique");
  });
});

describe("jours fériés", () => {
  const liste = [
    { date: "2026-11-01", localName: "Toussaint" },
    { date: "2026-11-11", localName: "Armistice 1918" },
  ];
  it("signale le férié du jour ou des 3 jours suivants", () => {
    expect(ferieProche(liste, "2026-11-01")).toBe(
      "aujourd'hui, c'est Toussaint (jour férié)",
    );
    expect(ferieProche(liste, "2026-10-30")).toBe(
      "Toussaint (jour férié) dans 2 jours",
    );
    expect(ferieProche(liste, "2026-10-20")).toBeNull();
    expect(ferieProche({ erreur: 1 }, "2026-11-01")).toBeNull();
  });
  it("l'ajoute à la consigne des sujets", () => {
    const c = consigneSujets({
      contexte: null,
      categories: ["conseil"],
      titresRecents: [],
      jour: "2026-11-01",
      ferie: "aujourd'hui, c'est Toussaint (jour férié)",
    });
    expect(c).toContain("Calendrier : aujourd'hui, c'est Toussaint");
  });
});
