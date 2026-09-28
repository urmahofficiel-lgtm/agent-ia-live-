import { describe, expect, it } from "vitest";
import { texteLinkedin, urlDialogueLinkedin } from "./linkedin";

describe("LinkedIn", () => {
  it("échappe les caractères réservés et garde les hashtags cliquables", () => {
    expect(texteLinkedin("**Devis** (2 min) pour @vous #BTP #Devis_IA")).toBe(
      "Devis \\(2 min\\) pour \\@vous {hashtag|\\#|BTP} {hashtag|\\#|Devis_IA}",
    );
  });
  it("laisse les liens intacts", () => {
    expect(texteLinkedin("👉 https://btp-ecosystem.com/devis")).toBe("👉 https://btp-ecosystem.com/devis");
  });
  it("demande les droits de publication du profil", () => {
    const u = new URL(urlDialogueLinkedin({ clientId: "c", retour: "https://x/r", etat: "e" }));
    expect(u.searchParams.get("scope")).toBe("openid profile w_member_social");
  });
});
