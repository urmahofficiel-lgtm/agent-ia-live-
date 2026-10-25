import { describe, expect, it } from "vitest";
import {
  appliquerRelecture,
  assemblerEcoute,
  consigneExtrait,
  consigneQuiParle,
  attribuerVoix,
  genreDeHauteur,
  lireEcoute,
  lireEcouteGuidee,
  lireExtrait,
  passagesParles,
  placesDisponibles,
  repliquesDepuisMots,
  styleReplique,
  VOIX_GEMINI,
  vitessePour,
  voisement,
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

  it("voix Gemini : une façon de dire selon le rôle et la phrase, jamais publicitaire", () => {
    expect(styleReplique({ role: "le maçon", genre: "homme" }, "C'est quoi, la dernière version du plan ?")).toContain("le maçon qui pose la question");
    expect(styleReplique({ role: "voix 2", genre: "femme" }, "Reçu.")).toContain("une femme qui répond du tac au tac");
    expect(styleReplique({ role: "l'architecte", genre: "femme" }, "Je vous montre.")).toContain("aucun ton de publicité");
    expect(VOIX_GEMINI.filter((v) => v.genre === "femme").length).toBeGreaterThanOrEqual(3);
    expect(VOIX_GEMINI.filter((v) => v.genre === "homme").length).toBeGreaterThanOrEqual(3);
  });

  it("passages parlés entre les blancs : petits trous fusionnés, bruits courts ignorés", () => {
    const silences = [
      { debut: 0, fin: 3.7 },
      { debut: 7.3, fin: 7.5 },
      { debut: 7.6, fin: 10.5 },
      { debut: 10.7, fin: 11 },
      { debut: 12.5, fin: 20 },
    ];
    expect(passagesParles(silences, 20)).toEqual([
      { debut: 3.7, fin: 7.6 },
      { debut: 11, fin: 12.5 },
    ]);
  });

  it("mesure la hauteur d'une voix et sa première syllabe", () => {
    const f = 16000;
    const pcm = new Int16Array(f * 2);
    // Silence 0,5 s, puis une voix à 200 Hz.
    for (let k = f / 2; k < pcm.length; k++) pcm[k] = Math.round(8000 * Math.sin((2 * Math.PI * 200 * k) / f));
    const v = voisement(pcm, f, 0, 2);
    expect(v.hauteur).toBeGreaterThan(195);
    expect(v.hauteur).toBeLessThan(205);
    expect(v.premier).toBeCloseTo(0.5, 1);
    expect(genreDeHauteur(v.hauteur)).toBe("femme");
    expect(genreDeHauteur(95)).toBe("homme");
    expect(genreDeHauteur(158)).toBeNull();
  });

  it("écoute guidée : temps mesurés, genre mesuré prioritaire, passages muets écartés", () => {
    const passages = [
      { debut: 0, fin: 4.4, hauteur: 195 },
      { debut: 10.8, fin: 13.1, hauteur: 88 },
      { debut: 183.8, fin: 188.1, hauteur: 208 },
      { debut: 190, fin: 191, hauteur: null },
    ];
    const lu = lireEcouteGuidee(
      JSON.stringify({
        personnages: [
          { id: "voix_1", role: "l'architecte", genre: "femme" },
          { id: "voix_2", role: "le maçon", genre: "homme" },
        ],
        passages: [
          { i: 0, texte: "Bonjour, je suis l'architecte.", debut: 3.8, locuteur: "voix_1" },
          { i: 1, texte: "C'est quoi, la dernière version du plan ?", debut: 5, locuteur: "voix_2" },
          // Voix de femme donnée à tort au maçon : elle passe à une voix de femme.
          { i: 2, texte: "Je l'ouvre sur mon téléphone.", locuteur: "voix_2" },
          { i: 3, texte: "", locuteur: "voix_1" },
        ],
      }),
      passages,
    );
    expect(lu.repliques).toEqual([
      { debut: 3.8, fin: 4.4, texte: "Bonjour, je suis l'architecte.", locuteur: "voix_1" },
      { debut: 10.8, fin: 13.1, texte: "C'est quoi, la dernière version du plan ?", locuteur: "voix_2" },
      { debut: 183.8, fin: 188.1, texte: "Je l'ouvre sur mon téléphone.", locuteur: "voix_1" },
    ]);
    expect(lu.personnages.map((p) => [p.id, p.genre])).toEqual([
      ["voix_1", "femme"],
      ["voix_2", "homme"],
    ]);
  });

  it("un passage transcrit seul, puis qui parle : chaque texte reste à sa place", () => {
    expect(consigneExtrait(null)).toContain('"debut"');
    expect(lireExtrait('Voici : {"texte": "  Bonjour,  je suis l\'architecte. ", "debut": 3.6}')).toEqual({ texte: "Bonjour, je suis l'architecte.", debut: 3.6 });
    expect(lireExtrait("rien")).toEqual({ texte: "", debut: null });
    const passages = [
      { debut: 0, fin: 4.4, hauteur: 195, texte: "Bonjour." },
      { debut: 10.8, fin: 13.1, hauteur: 88, texte: "C'est quoi, la dernière version du plan ?" },
    ];
    expect(consigneQuiParle(passages, null)).toContain("0. [0.0–4.4 s · 195 Hz, femme] Bonjour.");
    const lu = lireEcouteGuidee(
      assemblerEcoute(
        [
          { texte: "Bonjour.", debut: 3.8 },
          { texte: "C'est quoi, la dernière version du plan ?", debut: 0 },
        ],
        '{"personnages": [{"id": "voix_1", "role": "l\'architecte", "genre": "femme"}, {"id": "voix_2", "role": "le maçon", "genre": "homme"}], "passages": [{"i": 0, "locuteur": "voix_1"}, {"i": 1, "locuteur": "voix_2"}]}',
      ),
      passages,
    );
    expect(lu.repliques.map((r) => [r.debut, r.locuteur, r.texte])).toEqual([
      [3.8, "voix_1", "Bonjour."],
      [10.8, "voix_2", "C'est quoi, la dernière version du plan ?"],
    ]);
    // Sans réponse « qui parle » : les voix sont séparées par la hauteur mesurée.
    const seul = lireEcouteGuidee(assemblerEcoute([{ texte: "a", debut: 0 }, { texte: "b", debut: 0 }], null), passages);
    expect(seul.personnages.map((p) => p.genre).sort()).toEqual(["femme", "homme"]);
  });

  it("calage d'une phrase courte après un son d'intro, correction d'un mot mal entendu", () => {
    const passages = [
      { debut: 0, fin: 4.43, hauteur: 229 },
      { debut: 22.62, fin: 25.47, hauteur: 190 },
    ];
    const lu = lireEcouteGuidee(
      assemblerEcoute(
        [
          { texte: "Bonjour.", debut: 0 },
          { texte: "Des devis sages partout et c'est toujours moi qu'on appelle.", debut: 0 },
        ],
        JSON.stringify({
          personnages: [{ id: "voix_1", role: "l'architecte", genre: "femme" }],
          passages: [
            { i: 0, locuteur: "voix_1", texte: "Bonjour ! Je suis l'architecte de ce chantier, et voici ma journée type sur le terrain." },
            { i: 1, locuteur: "voix_1", texte: "Des messages partout, et c'est toujours moi qu'on appelle." },
          ],
        }),
      ),
      passages,
    );
    // « Bonjour » (0,9 s) dans un passage de 4,4 s : calé sur la fin, pas à 0 s.
    expect(lu.repliques[0].debut).toBeGreaterThan(3.2);
    // Correction trop longue (phrase ajoutée) : refusée ; mot mal entendu : corrigé.
    expect(lu.repliques[0].texte).toBe("Bonjour.");
    expect(lu.repliques[1].texte).toBe("Des messages partout, et c'est toujours moi qu'on appelle.");
  });
});
