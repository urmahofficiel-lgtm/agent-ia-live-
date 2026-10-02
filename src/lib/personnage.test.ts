import { describe, expect, it } from "vitest";
import { choisirVoix, lireAnalyse, motsMax, tonVoix } from "./personnage";

describe("personnage et voix", () => {
  it("choisit une voix selon l'âge et le sexe", () => {
    expect(choisirVoix({ age: "enfant", sexe: "femme" })).toBe("Leda");
    expect(choisirVoix({ age: "adulte", sexe: "homme" })).toBe("Charon");
    expect(choisirVoix({ age: "senior", sexe: "homme" })).toBe("Algenib");
    expect(choisirVoix({ age: null, sexe: null })).toBe("Kore");
  });

  it("lit l'analyse de Gemini", () => {
    const a = lireAnalyse(
      '{"parole":"Bonjour, je m\'appelle Younes","langue":"FR","age":"adulte","sexe":"homme","dessin":false,"consigne_visuelle":"A man talks to the camera, natural mouth movements"}',
      "x",
    );
    expect(a).toMatchObject({
      parole: "Bonjour, je m'appelle Younes",
      langue: "fr",
      age: "adulte",
      sexe: "homme",
    });
    expect(tonVoix(a!)).toMatch(/adulte.*masculine.*fr/);
    expect(
      lireAnalyse(
        '{"parole":null,"age":"bizarre","sexe":"?"}',
        "Un chat danse",
      ),
    ).toMatchObject({
      parole: null,
      age: null,
      sexe: null,
      consigne_visuelle: "Un chat danse",
    });
    expect(lireAnalyse("pas de json", "x")).toBeNull();
  });

  it("limite la phrase à la durée de la vidéo", () => {
    expect(motsMax(10)).toBe(25);
    expect(motsMax(30)).toBe(75);
  });
});
