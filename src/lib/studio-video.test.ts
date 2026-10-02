import { describe, expect, it } from "vitest";
import {
  coutEstime,
  decouper,
  lireStatutXai,
  progressionGlobale,
  videoComplete,
  type Segment,
} from "./studio-video";

describe("studio vidéo IA", () => {
  it("découpe en génération (15 s max) puis prolongations (10 s max)", () => {
    expect(decouper(10)).toEqual([10]);
    expect(decouper(15)).toEqual([15]);
    expect(decouper(20)).toEqual([15, 5]);
    expect(decouper(30)).toEqual([15, 10, 5]);
  });

  it("estime le coût", () => {
    expect(coutEstime(10, "standard")).toBe(0.7);
    expect(coutEstime(30, "premium")).toBe(2.4);
  });

  it("lit les réponses de xAI", () => {
    expect(lireStatutXai({ status: "pending", progress: 42 })).toMatchObject({
      statut: "en_cours",
      progression: 42,
    });
    expect(
      lireStatutXai({
        status: "done",
        video: { url: "https://x/v.mp4", duration: 15 },
      }),
    ).toMatchObject({ statut: "termine", url: "https://x/v.mp4", duree: 15 });
    expect(lireStatutXai({ status: "failed" }).statut).toBe("echoue");
    expect(
      lireStatutXai({ status: "done", video: { respect_moderation: false } })
        .erreur,
    ).toMatch(/modération/);
  });

  it("suit l'avancement global et sait si la vidéo est complète", () => {
    const segs: Segment[] = [
      {
        request_id: "a",
        duree: 15,
        genre: "generation",
        statut: "termine",
        url: "u1",
        duree_obtenue: 15,
      },
      { request_id: "b", duree: 5, genre: "prolongation", statut: "en_cours" },
    ];
    expect(progressionGlobale([15, 5], segs, 50)).toBe(88);
    expect(videoComplete([{ ...segs[0] }], 15)).toBe(true);
    expect(
      videoComplete(
        [segs[0], { ...segs[1], statut: "termine", duree_obtenue: 20 }],
        20,
      ),
    ).toBe(true);
    expect(
      videoComplete(
        [segs[0], { ...segs[1], statut: "termine", duree_obtenue: 5 }],
        20,
      ),
    ).toBe(false);
  });
});
