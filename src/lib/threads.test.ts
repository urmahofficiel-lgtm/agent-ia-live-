import { describe, expect, it } from "vitest";
import { LIMITE_THREADS, texteThreads } from "./threads.server";

describe("texte des posts Threads", () => {
  it("garde un seul hashtag à la fin", () => {
    expect(texteThreads("La tour Eiffel devait disparaître.\n\n#btp #chantier #histoire")).toBe("La tour Eiffel devait disparaître.\n\n#btp");
  });
  it("tient en 500 caractères, coupé sur un mot entier", () => {
    const t = texteThreads(`${"mot ".repeat(200)}fin`);
    expect(t.length).toBeLessThanOrEqual(LIMITE_THREADS);
    expect(t.endsWith("mot…")).toBe(true);
  });
  it("laisse un texte court tel quel", () => {
    expect(texteThreads("Bonjour")).toBe("Bonjour");
  });
});
