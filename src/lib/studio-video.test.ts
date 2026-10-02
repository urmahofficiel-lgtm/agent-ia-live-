import { describe, expect, it } from "vitest";
import {
  consigneMorceau,
  dureeMorceau,
  nombreMorceaux,
  progression,
} from "./studio-video";

describe("studio vidéo IA", () => {
  it("découpe la vidéo en morceaux de 5 s", () => {
    expect(nombreMorceaux(10)).toBe(2);
    expect(nombreMorceaux(15)).toBe(3);
    expect(nombreMorceaux(30)).toBe(6);
    expect([0, 1].map((n) => dureeMorceau(10, n))).toEqual([5, 5]);
  });

  it("suit l'avancement", () => {
    expect(progression(20, 0)).toBe(0);
    expect(progression(20, 2)).toBe(50);
    expect(progression(10, 2)).toBe(99);
  });

  it("demande une suite fluide après le premier morceau", () => {
    expect(consigneMorceau("Un chat danse", 0)).toBe("Un chat danse");
    expect(consigneMorceau("Un chat danse", 1)).toMatch(
      /Continue the same scene/,
    );
  });
});
