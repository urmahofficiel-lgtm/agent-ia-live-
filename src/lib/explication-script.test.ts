import { describe, expect, it } from "vitest";
import { consigneExplication, dureesSurVoix, lireExplication, texteVoix } from "./explication-script";

const plan = (visuel: object, i = 0) => ({ titre1: `TITRE ${i}`, titre2: "FORT", phrase: `Phrase *clé* numéro ${i}`, visuel });

describe("script Explication", () => {
  it("demande des plans courts et interdit les captures absentes", () => {
    expect(consigneExplication({ titre: "Devis", consigne: "" }, "Marque : BTP Ecosystem", 0)).toContain("n'utilise pas le type capture");
    expect(consigneExplication({ titre: "Devis", consigne: "" }, null, 3)).toContain("3 disponible(s)");
  });

  it("lit la réponse, écarte les plans invalides et les captures en trop", () => {
    const json = JSON.stringify({
      mot: "devis !",
      legende: "Ton devis. Commente DEVIS 👇",
      plans: [
        plan({ type: "chiffre", valeur: "2 min" }, 1),
        plan({ type: "capture" }, 2),
        plan({ type: "capture" }, 3),
        plan({ type: "liste", items: ["a", "b"] }, 4),
        plan({ type: "inconnu" }, 5),
        plan({ type: "devis", lignes: [["Dépose", "1 u"], ["Douche", "1 u"]] }, 6),
        plan({ type: "bouton", texte: "Générer" }, 7),
        plan({ type: "dictee", texte: "Salle de bain 6 m²" }, 8),
      ],
    });
    const s = lireExplication(`voici ${json}`, 1, "plans 1 2 3 4 5 6 7 8")!;
    expect(s.mot).toBe("DEVIS");
    expect(s.plans.map((p) => p.visuel.type)).toEqual(["chiffre", "capture", "liste", "devis", "bouton", "dictee"]);
    expect(lireExplication("{}", 0)).toBeNull();
  });

  it("refuse les chiffres inventés et les garanties", () => {
    const sources = "Essai gratuit 14 jours. 1 analyse offerte par mois.";
    const json = JSON.stringify({
      mot: "OFFRE",
      plans: [
        plan({ type: "chiffre", valeur: "100%", legende: "fiabilité garantie" }, 1),
        plan({ type: "chiffre", valeur: "+50%" }, 1),
        plan({ type: "chiffre", valeur: "14 J" }, 1),
        plan({ type: "liste", items: ["Synthèse", "Risques"] }, 1),
        plan({ type: "devis", lignes: [["Faïence", "18 m²"], ["Douche", "1 u"]] }, 1),
        plan({ type: "bouton", texte: "Tester" }, 1),
        plan({ type: "dictee", texte: "Salle de bain 6 m²" }, 1),
      ],
    });
    const s = lireExplication(json, 0, sources)!;
    expect(s.plans.map((p) => p.visuel.type)).toEqual(["chiffre", "liste", "devis", "bouton", "dictee"]);
  });

  it("cale les plans sur la voix", () => {
    const d = dureesSurVoix(["un deux trois", "quatre cinq six sept huit"], 10);
    expect(d[0]).toBeGreaterThanOrEqual(1.8);
    expect(d[1]).toBeGreaterThan(d[0]);
    expect(texteVoix([{ phrase: "Tu ouvres *Devis IA*" }])).toBe("Tu ouvres Devis IA");
  });
});
