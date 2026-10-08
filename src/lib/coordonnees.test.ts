import { describe, expect, it } from "vitest";
import {
  confirmeEntreprise,
  estAnnuaire,
  extraireEmails,
  extraireTelephones,
  lienContact,
  meilleurEmail,
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

  it("normalise les numéros belges au format international", () => {
    expect(normaliserTelephone("02 502 01 08", "BE")).toBe("+32 2 502 01 08");
    expect(normaliserTelephone("+32 (0)4 229 70 00", "BE")).toBe(
      "+32 4 229 70 00",
    );
    expect(normaliserTelephone("069/25.15.70", "BE")).toBe("+32 69 25 15 70");
    expect(normaliserTelephone("0496 79 94 95", "BE")).toBe("+32 496 79 94 95");
    expect(normaliserTelephone("0032 496 79 94 95", "BE")).toBe(
      "+32 496 79 94 95",
    );
    expect(normaliserTelephone("0412 34 56 78", "BE")).toBeNull();
  });

  it("extrait les numéros belges, sans numéro d'entreprise ni surtaxé", () => {
    const html =
      '<p>Tél. 02 502 01 08 – GSM 0496 79 94 95</p><p>TVA BE 0456.789.123</p><p>0456.789.124</p><p>0903 12 345</p><a href="tel:+3269251570">x</a>';
    expect(extraireTelephones(texteDePage(html), "BE")).toEqual([
      "+32 2 502 01 08",
      "+32 496 79 94 95",
      "+32 69 25 15 70",
    ]);
    // Un portable belge n'est pas pris pour un numéro français.
    expect(extraireTelephones("GSM 0496 79 94 95", "BE")).not.toContain(
      "04 96 79 94 95",
    );
  });

  it("confirme une entreprise belge par son code postal à 4 chiffres", () => {
    expect(
      confirmeEntreprise(
        "Atelier DSH, Mont Saint-Martin 61, 4000 Liège",
        "Atelier DSH",
        "61 Mont Saint-Martin, 4000 Liège",
        "BE",
      ),
    ).toBe(true);
    expect(
      confirmeEntreprise(
        "Atelier DSH, 1000 Bruxelles",
        "Atelier DSH",
        "61 Mont Saint-Martin, 4000 Liège",
        "BE",
      ),
    ).toBe(false);
  });

  it("construit la requête de recherche en Belgique", () => {
    expect(
      requeteRecherche(
        { nom: "Atelier DSH", adresse: "61 Mont Saint-Martin, 4000 Liège" },
        "BE",
      ),
    ).toBe('"Atelier DSH" Liège téléphone');
    expect(requeteRecherche({ nom: "Quattro", adresse: "Namur" }, "BE")).toBe(
      '"Quattro" Namur téléphone',
    );
    expect(requeteRecherche({ nom: "Quattro", adresse: null }, "BE")).toBe(
      '"Quattro" Belgique téléphone',
    );
  });

  it("garde l'e-mail du domaine, impersonnel d'abord en Belgique", () => {
    const emails = ["jean@agence-web.be", "j.dupont@rya.be", "atelier@rya.be"];
    expect(meilleurEmail(emails, "https://rya.be/", "BE")).toBe(
      "atelier@rya.be",
    );
    expect(meilleurEmail(emails, "https://www.rya.be", "FR")).toBe(
      "j.dupont@rya.be",
    );
    expect(meilleurEmail([], null)).toBeNull();
  });
});
