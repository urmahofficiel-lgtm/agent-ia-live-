import { describe, expect, it } from "vitest";
import {
  appliquerRelecture,
  attribuerVoix,
  lireEcoute,
  placesDisponibles,
  repliquesDepuisMots,
  vitessePour,
  type Replique,
} from "./doublage";

const mot = (texte: string, debut: number, fin: number, locuteur = "speaker_0") => ({ texte, debut, fin, locuteur });

describe("doublage", () => {
  it("découpe les mots en répliques : changement de voix, fin de phrase + blanc", () => {
    const r = repliquesDepuisMots([
      mot("Bonjour.", 3.8, 4.3),
      mot("Je", 4.5, 4.6),
      mot("suis", 4.6, 4.8),
      mot("l'architecte.", 4.8, 5.6),
      mot("Avant,", 6.6, 7.0),
      mot("voilà.", 7.0, 7.4),
      mot("C'est", 7.6, 7.8, "speaker_1"),
      mot("quoi", 7.8, 8.0, "speaker_1"),
      mot("?", 8.0, 8.0, "speaker_1"),
    ]);
    expect(r.map((x) => [x.texte, x.locuteur])).toEqual([
      ["Bonjour. Je suis l'architecte.", "speaker_0"],
      ["Avant, voilà.", "speaker_0"],
      ["C'est quoi?", "speaker_1"],
    ]);
    expect(r[0]).toMatchObject({ debut: 3.8, fin: 5.6 });
  });

  it("lit la transcription minutée de Gemini, dans l'ordre, sans répliques vides", () => {
    const r = lireEcoute(
      'Voici : {"repliques": [{"debut": 10.6, "fin": 13.9, "texte": "C\'est quoi ?", "locuteur": "voix_2"}, {"debut": 3.8, "fin": 7.3, "texte": "Bonjour.", "locuteur": "voix_1"}, {"debut": 8, "fin": 7, "texte": "x"}, {"debut": 9, "fin": 10, "texte": " "}]}',
    );
    expect(r.map((x) => x.texte)).toEqual(["Bonjour.", "C'est quoi ?"]);
    expect(lireEcoute("rien")).toEqual([]);
  });

  const repliques: Replique[] = [
    { debut: 3.8, fin: 7.3, texte: "Bonjour, je suis l'architecte.", locuteur: "voix_1" },
    { debut: 10.6, fin: 13.9, texte: "C'est quoi la dernière version ?", locuteur: "voix_2" },
    { debut: 19.4, fin: 22.4, texte: "Le compte rendu arrive quand ?", locuteur: "voix_3" },
    { debut: 22.4, fin: 30, texte: "Des messages partout.", locuteur: "voix_1" },
  ];

  it("applique la relecture : texte corrigé, rôle et genre ; sinon garde la transcription", () => {
    const lu = appliquerRelecture(
      repliques,
      '{"personnages": [{"id": "voix_1", "role": "l\'architecte", "genre": "femme"}, {"id": "voix_2", "role": "le maçon", "genre": "homme"}], "repliques": [{"i": 1, "texte": "C\'est quoi, la dernière version du plan ?"}]}',
    );
    expect(lu.repliques[1].texte).toBe("C'est quoi, la dernière version du plan ?");
    expect(lu.repliques[0].texte).toBe(repliques[0].texte);
    expect(lu.personnages).toEqual([
      { id: "voix_1", role: "l'architecte", genre: "femme" },
      { id: "voix_2", role: "le maçon", genre: "homme" },
      { id: "voix_3", role: "voix 3", genre: "homme" },
    ]);
    expect(appliquerRelecture(repliques, null).repliques).toEqual(repliques);
  });

  it("une voix différente par personnage, du bon genre, françaises d'abord", () => {
    const personnages = [
      { id: "voix_1", role: "l'architecte", genre: "femme" as const },
      { id: "voix_2", role: "le maçon", genre: "homme" as const },
      { id: "voix_3", role: "la cliente", genre: "femme" as const },
    ];
    const choix = attribuerVoix(personnages, repliques, [
      { id: "en_f", nom: "Rachel", genre: "femme", francaise: false },
      { id: "fr_f1", nom: "Claire", genre: "femme", francaise: true },
      { id: "fr_h", nom: "Thomas", genre: "homme", francaise: true },
      { id: "fr_f2", nom: "Émilie", genre: "femme", francaise: true },
    ]);
    // L'architecte parle le plus : première voix française féminine.
    expect(choix).toEqual({ voix_1: "fr_f1", voix_2: "fr_h", voix_3: "fr_f2" });
  });

  it("cale chaque voix dans sa place, sans accélérer de plus de 25 %", () => {
    expect(placesDisponibles(repliques, 40).map((x) => Math.round(x * 100) / 100)).toEqual([6.72, 8.72, 2.92, 17.52]);
    expect(vitessePour(5, 6)).toBe(1);
    expect(vitessePour(6.6, 6)).toBe(1.1);
    expect(vitessePour(12, 6)).toBe(1.25);
  });
});
