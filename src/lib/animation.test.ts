import { describe, expect, it } from "vitest";
import { lireStatutFal, traduireErreurFal, traduireErreurHF, validerPhoto, validerVideo } from "./animation";

describe("validation des fichiers", () => {
  it("accepte une photo JPEG ou PNG raisonnable", () => {
    expect(validerPhoto({ type: "image/jpeg", taille: 2_000_000, largeur: 1080, hauteur: 1350 })).toBeNull();
    expect(validerPhoto({ type: "image/png", taille: 500_000 })).toBeNull();
  });
  it("refuse un mauvais format, une photo trop lourde ou trop petite", () => {
    expect(validerPhoto({ type: "image/webp", taille: 1000 })).toMatch(/JPEG ou PNG/);
    expect(validerPhoto({ type: "image/jpeg", taille: 11 * 1024 * 1024 })).toMatch(/dépasse 10 Mo/);
    expect(validerPhoto({ type: "image/jpeg", taille: 1000, largeur: 200, hauteur: 900 })).toMatch(/trop petite/);
  });
  it("contrôle format, poids et durée de la vidéo", () => {
    expect(validerVideo({ type: "video/mp4", taille: 8_000_000, duree: 12 })).toBeNull();
    expect(validerVideo({ type: "video/quicktime", taille: 1 })).toMatch(/MP4/);
    expect(validerVideo({ type: "video/mp4", taille: 60 * 1024 * 1024 })).toMatch(/dépasse 50 Mo/);
    expect(validerVideo({ type: "video/mp4", taille: 1, duree: 45 })).toMatch(/plus de 30 secondes/);
    expect(validerVideo({ type: "video/mp4", taille: 1, duree: NaN })).toMatch(/illisible/);
  });
});

describe("fal.ai", () => {
  it("lit l'état de la file", () => {
    expect(lireStatutFal({ status: "IN_QUEUE", queue_position: 3 })).toEqual({ statut: "en_file", position: 3 });
    expect(lireStatutFal({ status: "IN_PROGRESS" })).toEqual({ statut: "en_cours" });
    expect(lireStatutFal({ status: "COMPLETED" })).toEqual({ statut: "terminee" });
  });
  it("traduit les erreurs avec la marche à suivre", () => {
    expect(traduireErreurFal(402)).toMatch(/Crédit fal\.ai épuisé/);
    expect(traduireErreurFal(422, "no face detected")).toMatch(/no face detected/);
    expect(traduireErreurFal(503)).toMatch(/momentanément indisponible/);
  });
});

describe("traduireErreurHF", () => {
  it("explique le quota du jour", () => {
    expect(traduireErreurHF("You have exceeded your free GPU quota (150s requested vs. 40s left)")).toMatch(/Quota gratuit/);
  });
  it("reste utile sans détail", () => {
    expect(traduireErreurHF("")).toMatch(/personne est bien visible/);
  });
});
