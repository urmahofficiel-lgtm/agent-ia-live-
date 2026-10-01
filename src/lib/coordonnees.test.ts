import { describe, expect, it } from "vitest";
import {
  estAnnuaire,
  extraireEmails,
  extraireTelephones,
  lienContact,
  lireProposition,
  normaliserTelephone,
  numeroPresent,
  texteDePage,
} from "./coordonnees";

describe("coordonnées des prospects", () => {
  it("normalise les numéros français", () => {
    expect(normaliserTelephone("+33 (0)4 78.12.34.56")).toBe("04 78 12 34 56");
    expect(normaliserTelephone("0478123456")).toBe("04 78 12 34 56");
    expect(normaliserTelephone("12345")).toBeNull();
  });

  it("extrait les numéros d'une page, sans surtaxés ni doublons", () => {
    const html =
      '<p>Tél : 04 78 12 34 56</p><a href="tel:+33478123456">Appeler</a><p>0899 12 34 56</p><p>06-12-34-56-78</p>';
    expect(extraireTelephones(texteDePage(html))).toEqual([
      "04 78 12 34 56",
      "06 12 34 56 78",
    ]);
  });

  it("vérifie qu'un numéro figure bien sur la page", () => {
    expect(numeroPresent("04 78 12 34 56", "Contact : 04.78.12.34.56")).toBe(
      true,
    );
    expect(numeroPresent("04 78 12 34 56", "Contact : 04 78 12 34 57")).toBe(
      false,
    );
  });

  it("extrait les e-mails utiles", () => {
    expect(
      extraireEmails("contact@plomberie-martin.fr logo@2x.png votre@email.com"),
    ).toEqual(["contact@plomberie-martin.fr"]);
  });

  it("trouve la page contact du même site", () => {
    expect(
      lienContact('<a href="/nous-contacter">x</a>', "https://exemple.fr/"),
    ).toBe("https://exemple.fr/nous-contacter");
    expect(
      lienContact(
        '<a href="https://autre.fr/contact">x</a>',
        "https://exemple.fr/",
      ),
    ).toBeNull();
  });

  it("lit la réponse de la recherche et écarte les annuaires", () => {
    expect(
      lireProposition(
        '```json\n{"telephone": "04 78 12 34 56", "site": "plomberie-martin.fr"}\n```',
      ),
    ).toEqual({
      telephone: "04 78 12 34 56",
      site: "https://plomberie-martin.fr/",
    });
    expect(
      lireProposition(
        '{"telephone": null, "site": "https://www.pagesjaunes.fr/pros/123"}',
      ),
    ).toEqual({ telephone: null, site: null });
    expect(lireProposition("rien")).toEqual({ telephone: null, site: null });
    expect(estAnnuaire("https://www.societe.com/x")).toBe(true);
  });
});
