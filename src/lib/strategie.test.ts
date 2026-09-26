import { describe, expect, it } from "vitest";
import { demandeDepuisStrategie, lireAnalyse } from "./strategie";

const exemple = {
  resume_niche: "Plombiers indépendants à Lyon",
  positionnement: "Réactivité",
  marche: "…",
  concurrence: "…",
  cibles: [{ persona: "Propriétaire", besoins: "x", freins: "y", ou_les_trouver: "Facebook" }],
  piliers: [{ theme: "Conseils", idees: ["Fuite", "Chauffe-eau"] }],
  plateformes: [
    { id: "instagram", priorite: 2, pourquoi: "", frequence: "2/sem", meilleurs_moments: "soir", formats: "" },
    { id: "facebook", priorite: 1, pourquoi: "", frequence: "3/sem", meilleurs_moments: "midi", formats: "" },
    { id: "myspace", priorite: 1, pourquoi: "", frequence: "", meilleurs_moments: "", formats: "" },
  ],
  hashtags: ["#plombier"],
  angles_prospection: ["Urgence"],
};

describe("lireAnalyse", () => {
  it("lit le JSON entouré de texte, filtre et trie les plateformes", () => {
    const a = lireAnalyse("Voici l'analyse :\n" + JSON.stringify(exemple) + "\nBonne chance");
    expect(a?.resume_niche).toBe("Plombiers indépendants à Lyon");
    expect(a?.plateformes.map((p) => p.id)).toEqual(["facebook", "instagram"]);
  });

  it("tolère des champs manquants ou mal typés", () => {
    const a = lireAnalyse(JSON.stringify({ resume_niche: "Niche", hashtags: "pas une liste", cibles: null }));
    expect(a?.hashtags).toEqual([]);
    expect(a?.cibles).toEqual([]);
  });

  it("renvoie null sans résumé de niche ou sans JSON", () => {
    expect(lireAnalyse("{}")).toBeNull();
    expect(lireAnalyse("pas de json")).toBeNull();
  });
});

describe("demandeDepuisStrategie", () => {
  it("privilégie les réseaux connectés", () => {
    const a = lireAnalyse(JSON.stringify(exemple))!;
    const d = demandeDepuisStrategie(a, ["instagram"], 14);
    expect(d).toContain("instagram (2/sem, soir)");
    expect(d).not.toContain("facebook");
    expect(d).toContain("14 prochains jours");
  });
});
