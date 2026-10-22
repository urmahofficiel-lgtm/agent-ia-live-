import { describe, expect, it } from "vitest";
import {
  CYCLE_CROISSANCE,
  MARQUEUR_CROISSANCE,
  consigneCroissance,
  estCroissance,
  estSansPub,
  extrairePremierCommentaire,
  jargonDans,
  melangeCroissance,
  promessesDans,
  reglesCroissance,
  resultatCroissance,
  sujetsDeLaVeille,
  sujetsDeSecours,
} from "./croissance";

describe("piliers du mode croissance", () => {
  it("11 posts sur 14 sans publicité, bien répartis", () => {
    expect(CYCLE_CROISSANCE).toHaveLength(14);
    const pub = CYCLE_CROISSANCE.filter((p) => p === "demo" || p === "offre").length;
    expect(pub).toBe(3);
    // Jamais deux posts « produit » d'affilée dans le cycle.
    CYCLE_CROISSANCE.forEach((p, i) => {
      const suivant = CYCLE_CROISSANCE[(i + 1) % 14];
      expect((p === "demo" || p === "offre") && (suivant === "demo" || suivant === "offre")).toBe(false);
    });
  });

  it("le mélange continue d'un jour à l'autre", () => {
    const a = melangeCroissance("2026-10-24", 4);
    const b = melangeCroissance("2026-10-25", 4);
    expect(a).toHaveLength(4);
    expect(b).not.toEqual(a);
  });

  it("carrousel seulement là où il existe, Trial Reel seulement sur Instagram", () => {
    expect(resultatCroissance("astuce", "instagram")).toEqual({ pilier: "astuce", format: "carrousel", video_etat: "carrousel" });
    expect(resultatCroissance("astuce", "linkedin")).toMatchObject({ format: "carrousel" });
    expect(resultatCroissance("astuce", "facebook")).toEqual({ pilier: "astuce" });
    expect(resultatCroissance("pov", "instagram")).toEqual({ pilier: "pov", essai_reel: true });
    expect(resultatCroissance("pov", "tiktok")).toEqual({ pilier: "pov" });
    expect(resultatCroissance("inconnu", "instagram")).toEqual({});
  });

  it("la consigne porte le repère et dit si le post est sans publicité", () => {
    const c = consigneCroissance("erreur");
    expect(c).toContain(MARQUEUR_CROISSANCE);
    expect(estCroissance(c)).toBe(true);
    expect(estSansPub(c)).toBe(true);
    const demo = consigneCroissance("demo");
    expect(estCroissance(demo)).toBe(true);
    expect(estSansPub(demo)).toBe(false);
    expect(estCroissance("Conseil utile pour la clientèle")).toBe(false);
  });
});

describe("mots à bannir", () => {
  it("repère le jargon technique, pas les mots du terrain", () => {
    expect(jargonDans("Chiffrement AES-256 et webhooks ERP")).toEqual(["aes-256", "chiffrement", "webhooks", "erp"]);
    expect(jargonDans("Une API pour l'Open Banking")).toEqual(["api", "open banking"]);
    expect(jargonDans("Un devis rapide sur le chantier, payé à temps")).toEqual([]);
  });

  it("repère les promesses intenables", () => {
    expect(promessesDans("Des factures 100 % conformes, zéro erreur")).toEqual(["promesse « 100 % »", "promesse « zéro »"]);
    expect(promessesDans("La garantie décennale expliquée simplement")).toEqual([]);
  });
});

describe("rédaction", () => {
  it("règles d'engagement selon le réseau, premier commentaire là où il existe", () => {
    expect(reglesCroissance("instagram", true)).toContain("enregistrer le post");
    expect(reglesCroissance("instagram", true)).toContain("Premier commentaire");
    expect(reglesCroissance("instagram", true)).toContain("ne nomme PAS la marque");
    expect(reglesCroissance("tiktok", false)).not.toContain("Premier commentaire");
    expect(reglesCroissance("tiktok", false)).toContain("une seule phrase concrète");
  });

  it("sort le premier commentaire du texte", () => {
    const t = "POV : le client rappelle à 22 h\n\nOn a tous vécu ça.\n\nPremier commentaire : Et vous, vous répondez ?\n\n#btp #artisan";
    expect(extrairePremierCommentaire(t)).toEqual({
      texte: "POV : le client rappelle à 22 h\n\nOn a tous vécu ça.\n\n#btp #artisan",
      commentaire: "Et vous, vous répondez ?",
    });
    expect(extrairePremierCommentaire("Un texte simple.")).toEqual({ texte: "Un texte simple.", commentaire: null });
  });
});

describe("sujets de secours", () => {
  const veille = "Sujets du moment :\n- Suspension du label RGE contre la fraude → angle : ce qui change pour les artisans (source : https://exemple.fr/a)\n- Hausse du prix du carburant\nMots de la cible : marge, devis";

  it("lit les sujets de la veille", () => {
    expect(sujetsDeLaVeille(veille)).toEqual([
      { titre: "Suspension du label RGE contre la fraude", consigne: "ce qui change pour les artisans" },
      { titre: "Hausse du prix du carburant", consigne: "Hausse du prix du carburant" },
    ]);
    expect(sujetsDeLaVeille(null)).toEqual([]);
  });

  it("veille d'abord, puis banque, sans sujet récent", () => {
    const s = sujetsDeSecours(4, veille, ["Hausse du prix du carburant"], "2026-10-23");
    expect(s).toHaveLength(4);
    expect(s[0].titre).toBe("Suspension du label RGE contre la fraude");
    expect(s.map((x) => x.titre)).not.toContain("Hausse du prix du carburant");
    expect(new Set(s.map((x) => x.titre)).size).toBe(4);
  });
});
