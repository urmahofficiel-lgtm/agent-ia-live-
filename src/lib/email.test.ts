import { describe, expect, it } from "vitest";
import {
  adresseValide,
  composerEmail,
  domaineAutorise,
  expediteur,
  lienDesinscription,
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
});
