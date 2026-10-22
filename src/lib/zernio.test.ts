import { describe, expect, it } from "vitest";
import { corpsPost } from "./zernio.server";

describe("corps d'un post Zernio", () => {
  it("sans extras : texte et média, comme avant", () => {
    expect(corpsPost("tiktok", "acc", "Texte", { type: "video", url: "https://v.mp4" })).toEqual({
      content: "Texte",
      publishNow: true,
      platforms: [{ platform: "tiktok", accountId: "acc" }],
      mediaItems: [{ type: "video", url: "https://v.mp4" }],
    });
  });

  it("TikTok : carrousel photo avec musique en tendance, titre court et description complète", () => {
    const c = corpsPost("tiktok", "acc", "5 erreurs de devis\nLa suite dans le carrousel #btp", null, null, { images: ["https://a.jpg", "https://b.jpg"] });
    expect(c.content).toBe("5 erreurs de devis");
    expect(c.mediaItems).toEqual([
      { type: "image", url: "https://a.jpg" },
      { type: "image", url: "https://b.jpg" },
    ]);
    expect(c.platforms[0].platformSpecificData).toEqual({
      tiktokSettings: {
        privacy_level: "PUBLIC_TO_EVERYONE",
        allow_comment: true,
        content_preview_confirmed: true,
        express_consent_given: true,
        media_type: "photo",
        photo_cover_index: 0,
        auto_add_music: true,
        description: "5 erreurs de devis\nLa suite dans le carrousel #btp",
      },
    });
  });

  it("LinkedIn : document PDF à feuilleter et premier commentaire", () => {
    const c = corpsPost("linkedin", "acc", "Texte", { type: "image", url: "https://a.jpg" }, "urn:li:organization:1", {
      document: { url: "https://d.pdf", titre: "5 erreurs de devis" },
      premierCommentaire: "Et vous ?",
    });
    expect(c.mediaItems).toEqual([{ type: "document", url: "https://d.pdf", title: "5 erreurs de devis" }]);
    expect(c.platforms[0].platformSpecificData).toEqual({ organizationUrn: "urn:li:organization:1", firstComment: "Et vous ?", documentTitle: "5 erreurs de devis" });
  });

  it("pas de premier commentaire sur TikTok (non pris en charge)", () => {
    const c = corpsPost("tiktok", "acc", "Texte", null, null, { premierCommentaire: "Et vous ?" });
    expect(c.platforms[0]).toEqual({ platform: "tiktok", accountId: "acc" });
  });
});
