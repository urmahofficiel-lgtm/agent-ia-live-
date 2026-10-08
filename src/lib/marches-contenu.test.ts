import { describe, expect, it } from "vitest";
import { reglesReseau } from "./texte";
import { consigneTextesVisuel, textesDeSecours } from "./visuel";
import { consigneScript, scriptDeSecours, sousTitresStyle } from "./video";
import { phraseDecouvrir } from "./marches";

// Contenus pour un compte étranger : tout dans la langue du marché, rien
// de français qui s'affiche (titre interne, repères, textes de secours).
const CONTEXTE =
  "Marque : BTP Ecosystem\nSite / lien : https://btp-ecosystem.com\nAppel à l'action : Essai gratuit";
const POST_IT =
  "Preventivi pronti in due minuti, direttamente dal cantiere. Con BTP Ecosystem il computo metrico parte dalla pianta. #edilizia #cantiere";

describe("contenus par marché", () => {
  it("hashtags dans la langue du marché sur Facebook", () => {
    expect(reglesReseau("facebook")).toContain("hashtags précis en français");
    expect(reglesReseau("facebook", "italien")).toContain(
      "hashtags précis en italien",
    );
  });

  it("textes du visuel demandés dans la langue du marché", () => {
    const c = consigneTextesVisuel(
      "promo",
      { titre: "Devis en 2 minutes", brouillon: POST_IT },
      CONTEXTE,
      "it-IT",
    );
    expect(c).toContain("en italien");
    expect(c).toContain("aucun mot de français");
    expect(
      consigneTextesVisuel("promo", { titre: "T", brouillon: "B" }, null),
    ).toContain("en français");
  });

  it("visuel sans IA : ni titre interne ni mots français", () => {
    const t = textesDeSecours(
      "promo",
      { titre: "Devis en 2 minutes depuis le chantier", brouillon: POST_IT },
      CONTEXTE,
      "it-IT",
    );
    expect(t.etiquette).toBe("Da scoprire");
    expect(t.appel).toBe("Scopri di più");
    expect(JSON.stringify(t)).not.toMatch(/Devis|Essai|découvrir/);
    expect(
      textesDeSecours("promo", { titre: "Devis", brouillon: POST_IT }, CONTEXTE)
        .etiquette,
    ).toBe("À découvrir");
  });

  it("script vidéo dans la langue du marché", () => {
    const c = consigneScript(
      { titre: "Devis", consigne: "" },
      CONTEXTE,
      "Facebook",
      false,
      "classique",
      "es-ES",
    );
    expect(c).toContain("en espagnol d'Espagne");
    expect(c).toContain("Factur-X");
    expect(
      consigneScript({ titre: "Devis", consigne: "" }, null, "Facebook"),
    ).toContain("en français.");
    expect(
      consigneScript(
        { titre: "Devis", consigne: "" },
        null,
        "TikTok",
        false,
        "etapes",
        "de-DE",
      ),
    ).toContain("en allemand");
  });

  it("vidéo sans IA : texte du post et phrase finale traduite", () => {
    const s = scriptDeSecours(
      { titre: "Devis en 2 minutes", consigne: "Angle", brouillon: POST_IT },
      CONTEXTE,
      "it-IT",
    );
    expect(JSON.stringify(s.scenes)).not.toContain("Devis");
    expect(s.scenes.at(-1)?.voix).toBe(
      "Scopri BTP Ecosystem su btp-ecosystem.com.",
    );
    expect(phraseDecouvrir("de-DE", "", "")).toBe("Jetzt testen.");
  });

  it("repères avant / après et étapes traduits à l'écran", () => {
    const scenes = [
      { texte_ecran: "A", repere: "" },
      { texte_ecran: "B", repere: "AVANT" },
      { texte_ecran: "C", repere: "APRÈS" },
      { texte_ecran: "D", repere: "" },
    ];
    const ass = sousTitresStyle(
      "avant_apres",
      scenes,
      [2, 2, 2, 2],
      1080,
      1920,
      undefined,
      "it-IT",
    );
    expect(ass).toContain("PRIMA");
    expect(ass).toContain("DOPO");
    expect(ass).not.toContain("APRÈS");
    const etapes = sousTitresStyle(
      "etapes",
      [
        { texte_ecran: "A", repere: "" },
        { texte_ecran: "B", repere: "1" },
        { texte_ecran: "C", repere: "" },
      ],
      [2, 2, 2],
      1080,
      1920,
      undefined,
      "en-GB",
    );
    expect(etapes).toContain("STEP 1/1");
  });
});
