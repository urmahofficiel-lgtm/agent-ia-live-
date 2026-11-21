import { describe, expect, it } from "vitest";
import { estHistoire } from "./decoupe-script";
import { choisirSujet, consigneFiche, consignePublication, ficheDeConsigne, lireFiche, requetesSujet, SUJETS } from "./histoires";

const eiffel = SUJETS.find((s) => s.cle === "tour-eiffel")!;
const TEXTES = "Construite de 1887 à 1889 par Gustave Eiffel et ses ingénieurs Maurice Koechlin et Émile Nouguier. Environ 250 ouvriers. Coût : 7,8 millions de francs-or. 18 038 pièces de fer, 2 500 000 rivets.";

const reponse = (o: Record<string, unknown>) => `Voici : ${JSON.stringify(o)}`;
const bonne = {
  nom: "La tour Eiffel",
  lieu: "Paris",
  periode: "1887-1889",
  duree: "2 ans",
  architectes: ["Gustave Eiffel", "Maurice Koechlin"],
  entreprises: ["Compagnie des établissements Eiffel"],
  ouvriers: "environ 250 ouvriers",
  cout: "7,8 millions de francs-or",
  chiffres: ["18 038 pièces de fer", "2 500 000 rivets"],
  anecdotes: ["Elle devait être démontée."],
  accroche: "Construite en 2 ans.",
};

describe("sujets", () => {
  it("ont des clés uniques et valides pour la base", () => {
    const cles = SUJETS.map((s) => s.cle);
    expect(new Set(cles).size).toBe(cles.length);
    for (const c of cles) expect(c).toMatch(/^[a-z0-9-]{2,80}$/);
    expect(SUJETS.length).toBeGreaterThanOrEqual(45);
  });
  it("ne reprend jamais un sujet déjà raconté", () => {
    expect(choisirSujet([])?.cle).toBe(SUJETS[0].cle);
    expect(choisirSujet([SUJETS[0].cle])?.cle).toBe(SUJETS[1].cle);
    expect(choisirSujet(SUJETS.map((s) => s.cle))).toBeNull();
  });
  it("cherche l'histoire, les acteurs et les chiffres", () => {
    const q = requetesSujet(eiffel);
    expect(q).toHaveLength(3);
    expect(q.join(" ")).toMatch(/architecte.*ouvriers/);
    expect(q.join(" ")).toContain("coût");
  });
});

describe("fiche de recherche", () => {
  it("garde les faits présents dans les sources", () => {
    const f = lireFiche(reponse(bonne), eiffel, TEXTES);
    expect(f?.cout).toBe("7,8 millions de francs-or");
    expect(f?.ouvriers).toBe("environ 250 ouvriers");
    expect(f?.chiffres).toHaveLength(2);
    expect(f?.architectes).toContain("Gustave Eiffel");
  });
  it("écarte un chiffre absent des sources", () => {
    const f = lireFiche(reponse({ ...bonne, cout: "12 millions d'euros", chiffres: ["330 mètres", "18 038 pièces de fer"] }), eiffel, TEXTES);
    expect(f?.cout).toBeNull();
    expect(f?.chiffres).toEqual(["18 038 pièces de fer"]);
  });
  it("refuse une fiche trop pauvre", () => {
    expect(lireFiche(reponse({ nom: "La tour Eiffel", lieu: "Paris" }), eiffel, TEXTES)).toBeNull();
    expect(lireFiche("rien", eiffel, TEXTES)).toBeNull();
  });
  it("traite « null » écrit en texte comme une absence", () => {
    expect(lireFiche(reponse({ ...bonne, cout: "null" }), eiffel, TEXTES)?.cout).toBeNull();
  });
  it("demande les années, les acteurs, les ouvriers et le coût sans rien inventer", () => {
    const c = consigneFiche(eiffel, [{ titre: "Page", url: "https://exemple.fr", texte: "Texte" }]);
    for (const m of ["architectes", "entreprises", "ouvriers", "cout", "n'invente RIEN"]) expect(c).toContain(m);
  });
});

describe("publication du soir", () => {
  const f = lireFiche(reponse(bonne), eiffel, TEXTES)!;
  const sources = [{ titre: "Page", url: "https://exemple.fr/eiffel", texte: TEXTES }];
  const consigne = consignePublication(eiffel, f, sources);

  it("porte le format Histoire et la fiche, relue par la vidéo", () => {
    expect(estHistoire(consigne)).toBe(true);
    const fiche = ficheDeConsigne(consigne);
    expect(fiche).toContain("Coût : 7,8 millions de francs-or");
    expect(fiche).toContain("Architectes / ingénieurs : Gustave Eiffel ; Maurice Koechlin");
    expect(fiche).toContain("https://exemple.fr/eiffel");
    expect(fiche).not.toContain("Format vidéo");
  });
  it("sans fiche dans la consigne, rien n'est lu", () => {
    expect(ficheDeConsigne("Histoire : la tour Eiffel")).toBeNull();
    expect(ficheDeConsigne(null)).toBeNull();
  });
  it("tient dans la limite de la base", () => {
    expect(consigne.length).toBeLessThan(6000);
  });
});
