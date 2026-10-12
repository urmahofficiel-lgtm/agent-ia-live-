import { describe, expect, it } from "vitest";
import {
  ANGLES_JOURNEE,
  METIERS_JOURNEE,
  MARQUE_JOURNEE,
  SERIE_JOURNEE,
  consigneJournee,
  episodeJournee,
  estJournee,
  heureSerie,
  serieActive,
  tachesJournee,
  titreJournee,
} from "./journee";
import { heuresDuJour, postsParJour } from "./pilote";

const SEMAINE = ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"];

describe("série « Une journée de… »", () => {
  it("la série dure sept jours", () => {
    expect(SEMAINE[0]).toBe(SERIE_JOURNEE.debut);
    expect(SEMAINE.at(-1)).toBe(SERIE_JOURNEE.fin);
    expect(SEMAINE.every(serieActive)).toBe(true);
    expect(serieActive("2026-10-12")).toBe(false);
    expect(serieActive("2026-10-20")).toBe(false);
  });

  it("un métier et un angle différents chaque jour, sans combinaison répétée", () => {
    const eps = SEMAINE.map(episodeJournee);
    expect(new Set(eps.map((e) => e.metier)).size).toBe(7);
    expect(new Set(eps.map((e) => e.angle)).size).toBe(7);
    expect(new Set(eps.map((e) => e.titre)).size).toBe(7);
    expect(new Set(eps.map((e) => e.consigne)).size).toBe(7);
  });

  it("un artisan, puis l'architecte, puis l'expert-comptable", () => {
    expect(SEMAINE.slice(0, 3).map((j) => episodeJournee(j).titre)).toEqual([
      "Une journée de plombier en 2026",
      "Une journée d'architecte en 2026",
      "Une journée d'expert-comptable en 2026",
    ]);
  });

  it("l'élision suit la première lettre", () => {
    const [plombier, architecte] = METIERS_JOURNEE;
    expect(titreJournee(plombier)).toBe("Une journée de plombier en 2026");
    expect(titreJournee(architecte)).toBe("Une journée d'architecte en 2026");
    expect(METIERS_JOURNEE.map(titreJournee).every((t) => /^Une journée d(e |')/.test(t))).toBe(true);
  });

  it("la consigne porte la marque du format et les règles anti-invention", () => {
    const c = consigneJournee(METIERS_JOURNEE[0], ANGLES_JOURNEE[0]);
    expect(c).toContain(MARQUE_JOURNEE);
    expect(c).toContain("pas de chiffre inventé");
    expect(c).toContain("fiche de la marque");
    expect(estJournee(c)).toBe(true);
    expect(estJournee("Conseil : relancez vos devis")).toBe(false);
    expect(estJournee(null)).toBe(false);
  });

  it("le premier épisode place le réveil et le gazole ; aucun autre épisode ne répète ce détail", () => {
    const eps = SEMAINE.map(episodeJournee);
    expect(eps[0].consigne).toContain("gazole");
    expect(eps.slice(1).some((e) => e.consigne.includes("gazole"))).toBe(false);
  });
});

describe("heureSerie", () => {
  it("vise 19 h 30, à plus d'une heure des posts du pilote", () => {
    expect(heureSerie([])).toBe("19:30");
    expect(heureSerie(["12:30"])).toBe("19:30");
    expect(heureSerie(["08:30", "12:30", "18:30"])).toBe("19:35");
    expect(heureSerie(["08:00", "11:15", "14:30", "17:45", "21:00"])).toBe("19:30");
  });

  it("jamais à une heure pile ou moins d'un post existant", () => {
    for (const pilote of [["18:30"], ["19:00"], ["19:30"], ["20:00"], ["17:45", "21:00"], ["19:00", "21:30"]]) {
      const h = heureSerie(pilote);
      expect(h).not.toBeNull();
      const m = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
      for (const p of pilote) expect(Math.abs(m(h as string) - m(p))).toBeGreaterThan(60);
    }
  });

  it("rien si la soirée est pleine", () => {
    expect(heureSerie(["18:30", "19:30", "20:30", "21:30"])).toBeNull();
  });
});

describe("tachesJournee", () => {
  const canaux = [
    { plateforme: "tiktok", marche: "fr-FR" },
    { plateforme: "instagram", marche: "fr-FR" },
    { plateforme: "facebook", marche: "fr-FR" },
    { plateforme: "linkedin", marche: "fr-FR" },
    { plateforme: "tiktok", marche: "it-IT" },
  ];
  const rythme = { facebook: 1, instagram: 5 };
  const creneaux = ["08:30", "12:30", "18:30"];
  const matin = new Date("2026-10-13T03:00:00Z");

  it("un épisode par réseau de la série, en français, le même sujet partout", () => {
    const t = tachesJournee("2026-10-13", canaux, rythme, creneaux, matin);
    expect(t.map((x) => x.plateforme).sort()).toEqual(["facebook", "instagram", "tiktok"]);
    expect(t.every((x) => x.marche === "fr-FR")).toBe(true);
    expect(new Set(t.map((x) => x.titre)).size).toBe(1);
    expect(t.every((x) => estJournee(x.consigne))).toBe(true);
  });

  it("soirée, heure de Paris, sans collision avec le pilote", () => {
    const t = tachesJournee("2026-10-13", canaux, rythme, creneaux, matin);
    const heure = Object.fromEntries(t.map((x) => [x.plateforme, x.planifiee_pour]));
    expect(heure.instagram).toBe("2026-10-13T17:30:00.000Z");
    expect(heure.facebook).toBe("2026-10-13T17:30:00.000Z");
    expect(heure.tiktok).toBe("2026-10-13T17:35:00.000Z");
    for (const x of t) {
      const hhmm = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(x.planifiee_pour)).replace("h", ":");
      for (const p of heuresDuJour(postsParJour(rythme, x.plateforme), creneaux)) {
        const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
        expect(Math.abs(m(hhmm) - m(p))).toBeGreaterThan(60);
      }
    }
  });

  it("rien hors des dates de l'essai", () => {
    expect(tachesJournee("2026-10-12", canaux, rythme, creneaux, matin)).toEqual([]);
    expect(tachesJournee("2026-10-20", canaux, rythme, creneaux, matin)).toEqual([]);
  });

  it("rien si l'heure est déjà passée", () => {
    expect(tachesJournee("2026-10-13", canaux, rythme, creneaux, new Date("2026-10-13T18:00:00Z"))).toEqual([]);
  });

  it("un réseau absent des comptes connectés n'a pas d'épisode", () => {
    const t = tachesJournee("2026-10-13", [{ plateforme: "tiktok", marche: "fr-FR" }], rythme, creneaux, matin);
    expect(t.map((x) => x.plateforme)).toEqual(["tiktok"]);
  });
});
