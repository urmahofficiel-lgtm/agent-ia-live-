import { describe, expect, it } from "vitest";
import {
  adresseValide,
  composerEmail,
  domaineAutorise,
  expediteur,
  lienDesinscription,
  signatureMarque,
} from "./email";

describe("agent e-mail", () => {
  const jeton = "0b9f6a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";

  it("n'autorise que les domaines vérifiés", () => {
    expect(domaineAutorise("prospection@btp-ecosystem.com", undefined)).toBe(
      true,
    );
    expect(
      domaineAutorise("contact@mail.btp-ecosystem.com", "btp-ecosystem.com"),
    ).toBe(true);
    expect(domaineAutorise("moi@gmail.com", undefined)).toBe(false);
    expect(domaineAutorise("x@autre.fr", "btp-ecosystem.com, autre.fr")).toBe(
      true,
    );
  });

  it("valide les adresses et compose l'expéditeur", () => {
    expect(adresseValide("contact@plomberie.fr")).toBe(true);
    expect(adresseValide("pas une adresse")).toBe(false);
    expect(adresseValide("a@b.fr, c@d.fr")).toBe(false);
    expect(expediteur("BTP <Ecosystem>", "p@btp-ecosystem.com")).toBe(
      "BTP Ecosystem <p@btp-ecosystem.com>",
    );
    expect(expediteur(null, "p@btp-ecosystem.com")).toBe("p@btp-ecosystem.com");
  });

  it("ajoute la signature et le lien de désinscription, échappe le HTML", () => {
    const m = composerEmail({
      objet: "",
      texte: "Bonjour <b>Jean</b>,\n\nVoir https://www.btp-ecosystem.com.",
      marque: "BTP Ecosystem",
      site: "https://www.btp-ecosystem.com",
      jeton,
    });
    expect(m.objet).toBe("Une idée pour votre activité");
    expect(m.texte).toContain(lienDesinscription(jeton));
    expect(m.texte).toContain("BTP Ecosystem · https://www.btp-ecosystem.com");
    expect(m.html).toContain("&lt;b&gt;Jean&lt;/b&gt;");
    expect(m.html).toContain(`href="${lienDesinscription(jeton)}"`);
    expect(m.html).toContain('<a href="https://www.btp-ecosystem.com"');
  });

  it("ajoute la fiche professionnelle (logo, téléphone, réseaux, mentions)", () => {
    const g = signatureMarque("BTP Ecosystem", "https://www.btp-ecosystem.com");
    expect(g).not.toBeNull();
    expect(signatureMarque("Autre marque", "https://autre.fr")).toBeNull();
    const m = composerEmail({
      objet: "Bonjour",
      texte: "Message.",
      marque: "BTP Ecosystem",
      site: "https://www.btp-ecosystem.com",
      jeton,
      signature: g,
    });
    expect(m.html).toContain("icon-512.png");
    expect(m.html).toContain('href="tel:+33744563043"');
    expect(m.html).toContain("tiktok.com/@btpecosystem");
    expect(m.html).toContain("SIREN 930 526 579");
    expect(m.texte).toContain("Tél. 07 44 56 30 43");
    expect(m.texte).toContain("LinkedIn : https://www.linkedin.com/");
    // le lien de désinscription reste présent
    expect(m.texte).toContain(lienDesinscription(jeton));
    expect(m.html).toContain(`href="${lienDesinscription(jeton)}"`);
  });

  it("peut intégrer le logo en cid: au lieu de l'adresse du site", () => {
    const g = signatureMarque("BTP Ecosystem", "https://www.btp-ecosystem.com");
    const m = composerEmail({ objet: "x", texte: "y", marque: "BTP Ecosystem", site: null, jeton, signature: g, logoCid: "logo-btp" });
    expect(m.html).toContain('src="cid:logo-btp"');
    expect(m.html).not.toContain("icon-512.png");
  });

  it("annonce la pièce jointe au-dessus de la fiche", () => {
    const g = signatureMarque("BTP Ecosystem", "https://www.btp-ecosystem.com");
    const m = composerEmail({ objet: "x", texte: "y", marque: "BTP Ecosystem", site: null, jeton, signature: g, pieceJointe: "présentation (PDF)" });
    expect(m.html).toContain("Pièce jointe");
    expect(m.texte).toContain("Pièce jointe : présentation (PDF)");
    const sans = composerEmail({ objet: "x", texte: "y", marque: "BTP Ecosystem", site: null, jeton, signature: g });
    expect(sans.texte).not.toContain("Pièce jointe");
  });
});
