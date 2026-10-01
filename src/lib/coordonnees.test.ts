import { describe, expect, it } from "vitest";
import {
  confirmeEntreprise,
  estAnnuaire,
  extraireEmails,
  extraireTelephones,
  lienContact,
  normaliserTelephone,
  numeroPresent,
  requeteRecherche,
  telephoneProche,
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

  it("confirme l'entreprise par son nom et son code postal", () => {
    expect(
      confirmeEntreprise(
        "Rakor Plomberie, 42 rue Antonin Perrin, 69100 Villeurbanne",
        "Rakor Plomberie",
        "42 Rue Antonin Perrin 69100 Villeurbanne",
      ),
    ).toBe(true);
    expect(
      confirmeEntreprise(
        "Rakor Plomberie, 75011 Paris",
        "Rakor Plomberie",
        "42 Rue Antonin Perrin 69100 Villeurbanne",
      ),
    ).toBe(false);
    expect(
      confirmeEntreprise(
        "Autre entreprise 69100",
        "Rakor Plomberie",
        "69100 Villeurbanne",
      ),
    ).toBe(false);
    expect(estAnnuaire("https://www.societe.com/x")).toBe(true);
  });

  it("prend le numéro le plus proche du nom sur une page d'annuaire", () => {
    const texte =
      "Plomberie Dupont 01 23 45 67 80 ... Rakor Plomberie, 69100 Villeurbanne, tél. 04 78 11 22 33";
    expect(telephoneProche(texte, "Rakor Plomberie")).toBe("04 78 11 22 33");
  });

  it("construit la requête de recherche", () => {
    expect(
      requeteRecherche({
        nom: "Rakor Plomberie",
        adresse: "42 Rue Antonin Perrin 69100 Villeurbanne",
      }),
    ).toBe('"Rakor Plomberie" Villeurbanne téléphone');
  });
});
