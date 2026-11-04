import { describe, expect, it } from "vitest";
import { compositionExplication, motsCles, placementCapture } from "./explication";

describe("vidéo Explication", () => {
  it("met le mot clé en couleur et échappe le reste", () => {
    expect(motsCles("Tu ouvres *Devis IA* <b>")).toBe('Tu ouvres <span class="cle">Devis IA</span> &lt;b&gt;');
  });

  it("place la capture et son cadre dans les 940 × 760 px", () => {
    const p = placementCapture({ type: "capture", image: "a.jpg", largeur: 1080, hauteur: 2105, focus: { x: 0.5, y: 0.5 }, echelle: 1, cadre: { x: 0.1, y: 0.5, l: 0.8, h: 0.05 } });
    expect(p.largeur).toBe(940);
    expect(p.haut).toBeLessThanOrEqual(0);
    expect(p.cadre!.y).toBeGreaterThan(0);
    expect(p.cadre!.y).toBeLessThan(760);
  });

  it("écrit une page complète avec la fin « Commente »", () => {
    const html = compositionExplication({
      marque: "BTP Ecosystem",
      compte: "@btpecosystem",
      plans: [
        { titre: ["TON DEVIS", "EN 2 MIN"], phrase: "Ton devis en *2 minutes*", duree: 3, visuel: { type: "chiffre", valeur: "2 MIN" } },
        { titre: ["UNE ASTUCE", "PAR JOUR"], phrase: "Commente *DEVIS*", duree: 4, visuel: { type: "appel", mot: "DEVIS" } },
      ],
    });
    expect(html).toContain('data-duration="7"');
    expect(html).toContain("ABONNÉ ✓");
    expect(html).toContain('window.__timelines["main"] = tl;');
  });
});
