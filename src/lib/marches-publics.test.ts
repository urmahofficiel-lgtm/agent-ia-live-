import { describe, expect, it } from "vitest";
import { infosMarche, lireAttributions, lireEntreprise, urlAttributions, urlEntreprise } from "./marches-publics";

describe("prospection marchés publics", () => {
  it("demande les attributions de travaux depuis une date", () => {
    const u = decodeURIComponent(urlAttributions("2026-11-01").replace(/\+/g, " "));
    expect(u).toContain('nature="ATTRIBUTION"');
    expect(u).toContain('type_marche_facette="Travaux"');
    expect(u).toContain('dateparution >= "2026-11-01"');
  });

  it("garde les PME, écarte majors, groupements et doublons", () => {
    const l = lireAttributions({
      results: [
        { titulaire: ["SARL Martin Plomberie", "EIFFAGE CONSTRUCTION"], objet: "Rénovation école", nomacheteur: "Mairie de X", code_departement: ["33"], dateparution: "2026-11-04", url_avis: "https://x" },
        { titulaire: ["sarl martin plomberie", "Groupement ABC"], objet: "Autre", code_departement: ["33"], dateparution: "2026-11-03" },
        { titulaire: null, objet: "Vide" },
      ],
    });
    expect(l.map((a) => a.titulaire)).toEqual(["SARL Martin Plomberie"]);
    expect(l[0]).toMatchObject({ departement: "33", acheteur: "Mairie de X" });
    expect(lireAttributions(null)).toEqual([]);
  });

  it("trouve l'entreprise du bâtiment dans l'annuaire", () => {
    expect(urlEntreprise("Martin", "33")).toContain("departement=33");
    const e = lireEntreprise({
      results: [
        { nom_complet: "Martin Conseil", activite_principale: "70.22Z", siege: { siret: "1" } },
        { nom_complet: "Martin Plomberie", activite_principale: "43.22A", siege: { siret: "41266050800257", adresse: "3 rue X 33000 Bordeaux" }, date_creation: "1997-05-01" },
      ],
    });
    expect(e).toMatchObject({ siret: "41266050800257", creee: "1997" });
    expect(lireEntreprise({ results: [{ activite_principale: "70.22Z", siege: { siret: "1" } }] })).toBeNull();
  });

  it("résume le marché remporté pour le message", () => {
    const i = infosMarche({ titulaire: "X", objet: "Rénovation école", acheteur: "Mairie de X", departement: "33", date: "2026-11-04", lien: null }, "1997");
    expect(i).toBe("Marché public remporté (BOAMP, 04/11/2026) : « Rénovation école » pour Mairie de X · créée en 1997");
  });
});
