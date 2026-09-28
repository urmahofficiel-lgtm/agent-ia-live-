import { describe, expect, it } from "vitest";
import { comptesDepuisPages, urlDialogue } from "./meta";
import { creerEtat, lireEtat } from "./meta.server";

describe("état signé", () => {
  it("retrouve l'utilisateur", () => {
    expect(lireEtat(creerEtat("u1", "s", 0), "s", 1000)).toBe("u1");
  });
  it("refuse une signature fausse, un autre secret ou un état expiré", () => {
    const e = creerEtat("u1", "s", 0);
    expect(lireEtat(e.replace(/.$/, (c) => (c === "A" ? "B" : "A")), "s", 1000)).toBeNull();
    expect(lireEtat(e, "autre", 1000)).toBeNull();
    expect(lireEtat(e, "s", 16 * 60_000)).toBeNull();
    expect(lireEtat("n'importe quoi", "s", 0)).toBeNull();
  });
});

describe("comptesDepuisPages", () => {
  it("donne Facebook et l'Instagram relié", () => {
    expect(
      comptesDepuisPages([
        { id: "p1", name: "BTP Ecosystem", access_token: "j1", instagram_business_account: { id: "i1", username: "btpecosystem" } },
        { id: "p2", name: "Autre", access_token: "j2" },
      ]),
    ).toEqual([
      { plateforme: "facebook", externe_id: "p1", nom: "BTP Ecosystem", jeton: "j1" },
      { plateforme: "instagram", externe_id: "i1", nom: "btpecosystem", jeton: "j1" },
      { plateforme: "facebook", externe_id: "p2", nom: "Autre", jeton: "j2" },
    ]);
  });
});

describe("urlDialogue", () => {
  it("demande les droits, ou utilise la configuration si fournie", () => {
    const u = new URL(urlDialogue({ appId: "1", retour: "https://x/r", etat: "e" }));
    expect(u.searchParams.get("scope")).toContain("pages_manage_posts");
    expect(u.searchParams.get("redirect_uri")).toBe("https://x/r");
    const c = new URL(urlDialogue({ appId: "1", retour: "https://x/r", etat: "e", configId: "42" }));
    expect(c.searchParams.get("config_id")).toBe("42");
    expect(c.searchParams.has("scope")).toBe(false);
    expect(c.searchParams.get("override_default_response_type")).toBe("true");
  });
});

describe("connexion Instagram directe", () => {
  it("construit la page d'autorisation Instagram", async () => {
    const { urlDialogueInstagram } = await import("./meta");
    const u = new URL(urlDialogueInstagram({ appId: "9", retour: "https://x/i", etat: "e" }));
    expect(u.hostname).toBe("www.instagram.com");
    expect(u.searchParams.get("scope")).toContain("instagram_business_content_publish");
  });
  it("lit le jeton court sous ses deux formes", async () => {
    const { lireJetonInstagram } = await import("./meta");
    expect(lireJetonInstagram({ access_token: "a", user_id: 12 })).toEqual({ jeton: "a", userId: "12" });
    expect(lireJetonInstagram({ data: [{ access_token: "b", user_id: "34" }] })).toEqual({ jeton: "b", userId: "34" });
    expect(lireJetonInstagram({ error_message: "x" })).toBeNull();
  });
});

describe("commentaires Meta", () => {
  it("garde les commentaires des visiteurs, pas ceux de la page", async () => {
    const { commentairesDePostsFacebook } = await import("./meta");
    const l = commentairesDePostsFacebook("page1", [
      {
        id: "p1",
        message: "Notre offre",
        comments: {
          data: [
            { id: "c1", from: { id: "u1", name: "Marc" }, message: "Combien ça coûte ?" },
            { id: "c2", from: { id: "page1", name: "BTP" }, message: "Merci !" },
          ],
        },
      },
    ]);
    expect(l).toEqual([expect.objectContaining({ id: "c1", postId: "p1", auteur: "Marc", texte: "Combien ça coûte ?", contexte: "Notre offre" })]);
  });
  it("écarte ses propres réponses sur Instagram", async () => {
    const { commentairesDeMediasInstagram } = await import("./meta");
    const l = commentairesDeMediasInstagram("@btp", [
      { id: "m1", comments: { data: [{ id: "a", username: "julie", text: "Top" }, { id: "b", username: "btp", text: "Merci" }] } },
    ]);
    expect(l.map((c) => c.id)).toEqual(["a"]);
  });
});
