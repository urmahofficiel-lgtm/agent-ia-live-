import { describe, expect, it } from "vitest";
import { estBloquee, statutPourReseau } from "./publications";

describe("statut selon le réseau", () => {
  it("« À partager » redevient planifiée sur un réseau avec API", () => {
    expect(statutPourReseau("a_partager", "linkedin")).toBe("en_attente");
    expect(statutPourReseau("a_partager", "facebook")).toBe("en_attente");
  });
  it("reste « À partager » sur le profil Facebook perso", () => {
    expect(statutPourReseau("a_partager", "facebook_profil")).toBe("a_partager");
  });
  it("ne touche pas aux autres statuts", () => {
    expect(statutPourReseau("a_valider", "tiktok")).toBe("a_valider");
  });
});

describe("publication bloquée", () => {
  const maintenant = new Date("2026-10-16T12:00:00Z").getTime();
  it("« en cours » depuis plus de 30 minutes", () => {
    expect(estBloquee({ statut: "en_cours", updated_at: "2026-10-16T11:20:00Z" }, maintenant)).toBe(true);
    expect(estBloquee({ statut: "en_cours", updated_at: "2026-10-16T11:45:00Z" }, maintenant)).toBe(false);
  });
  it("jamais pour un autre statut ou sans date", () => {
    expect(estBloquee({ statut: "en_attente", updated_at: "2026-10-01T00:00:00Z" }, maintenant)).toBe(false);
    expect(estBloquee({ statut: "en_cours" }, maintenant)).toBe(false);
  });
});
