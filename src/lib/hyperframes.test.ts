import { describe, expect, it } from "vitest";
import { compositionAnimee, decouperSousTitres, dureeTotale, type PlanAnime } from "./hyperframes";

const plan: PlanAnime = {
  marque: "BTP Ecosystem",
  accent: "#f28a1e",
  fin: "Essai gratuit, lien en bio",
  voix: "voix.wav",
  musique: "musique.m4a",
  scenes: [
    { texte_ecran: "Tes devis le soir ?", voix: "Tu passes encore tes soirées à faire tes devis ?", duree: 3.2, image: "s0.jpg", produit: false },
    { texte_ecran: "Dicte-le <vite>", voix: "Dicte ton devis à la voix, directement sur le chantier.", duree: 4, image: "s1.png", produit: true, repere: "1" },
  ],
};

describe("vidéo animée HyperFrames", () => {
  it("découpe la voix en paquets de 3 mots répartis sur la scène", () => {
    const p = decouperSousTitres("un deux trois quatre cinq", 2, 3);
    expect(p).toHaveLength(2);
    expect(p[0].mots.map((m) => m.mot)).toEqual(["un", "deux", "trois"]);
    expect(p[0].debut).toBeGreaterThanOrEqual(2);
    expect(p[1].debut + p[1].duree).toBeLessThanOrEqual(5.01);
    expect(decouperSousTitres("  ", 0, 2)).toEqual([]);
  });

  it("écrit une page HyperFrames complète et échappe les textes", () => {
    const html = compositionAnimee(plan);
    expect(dureeTotale(plan)).toBe(7.2);
    expect(html).toContain('data-composition-id="main" data-start="0" data-duration="7.2"');
    expect(html).toContain('window.__timelines["main"] = tl;');
    expect(html).toContain('id="tel-1"');
    expect(html).toContain("Dicte-le &lt;vite&gt;");
    expect(html).not.toContain("<vite>");
    expect(html).toContain('<audio id="voix" src="voix.wav"');
    expect(html).toContain('id="marque"');
    // Le titre de la première scène est à l'écran dès 0 s (miniature).
    expect(html).toContain('tl.fromTo("#titre-0", { scale: 1.12 }');
  });

  it("refuse une couleur d'accent invalide", () => {
    expect(compositionAnimee({ ...plan, accent: "red;}" })).toContain("--accent: #f28a1e");
  });
});
