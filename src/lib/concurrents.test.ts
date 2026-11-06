import { describe, expect, it } from "vitest";
import { consigneVeilleConcurrents, empreinte, lireRapport, lireVideos, textePage } from "./concurrents";

describe("veille concurrents", () => {
  it("garde le texte lisible de la page", () => {
    const t = textePage("<head><title>x</title></head><body><script>var a=1</script><h1>Tarifs</h1><p>29&nbsp;&euro; / mois</p></body>");
    expect(t).toBe("Tarifs 29 € / mois");
  });

  it("voit qu'une page a changé", () => {
    expect(empreinte("Pro 29 €")).toBe(empreinte("Pro 29 €"));
    expect(empreinte("Pro 29 €")).not.toBe(empreinte("Pro 35 €"));
  });

  it("lit les vidéos Apify", () => {
    const v = lireVideos([
      { authorMeta: { name: "obat_logiciel" }, createTimeISO: "2026-11-04T19:04:46.000Z", playCount: 359, diggCount: 9, commentCount: 0, isSlideshow: false, text: "Assurances  BTP" },
      { text: "sans auteur" },
    ]);
    expect(v).toEqual([{ compte: "obat_logiciel", date: "2026-11-04", vues: 359, likes: 9, commentaires: 0, carrousel: false, texte: "Assurances BTP" }]);
    expect(lireVideos(null)).toEqual([]);
  });

  it("demande un rapport sans rien inventer, avec les vidéos de la semaine", () => {
    const c = consigneVeilleConcurrents(
      [{ concurrent: "Obat", url: "https://www.obat.fr/tarifs", texte: "Pro 29 €", changee: true }],
      [
        { compte: "obat_logiciel", date: "2026-11-04", vues: 359, likes: 9, commentaires: 0, carrousel: false, texte: "Assurances" },
        { compte: "batappli", date: "2026-10-14", vues: 312, likes: 5, commentaires: 0, carrousel: false, texte: "IA" },
      ],
      "2026-11-02",
    );
    expect(c).toContain("CHANGÉE");
    expect(c).toContain("N'invente aucun chiffre");
    expect(c.split("depuis le 2026-11-02")[1].split("mieux marché")[0]).not.toContain("batappli");
  });

  it("lit le rapport de l'IA", () => {
    expect(lireRapport('Voici : {"rapport": "Obat pousse la facture électronique.", "idees": ["a", "b", "c", "d"]}')).toEqual({
      rapport: "Obat pousse la facture électronique.",
      idees: ["a", "b", "c"],
    });
    expect(lireRapport("rien")).toBeNull();
  });
});
