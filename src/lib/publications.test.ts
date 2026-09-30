import { describe, expect, it } from "vitest";
import { statutPourReseau } from "./publications";

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
