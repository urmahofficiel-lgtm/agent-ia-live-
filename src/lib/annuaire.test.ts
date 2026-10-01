import { describe, expect, it } from "vitest";
import { cleNom, fusionner, lireAnnuaire, urlAnnuaire } from "./annuaire";

const reponse = {
  results: [
    {
      nom_complet: "OUVRIERS LYONNAIS",
      statut_diffusion: "O",
      date_creation: "1997-06-18",
      complements: { est_rge: true },
      matching_etablissements: [
        {
          siret: "41266050800999",
          code_postal: "75011",
          etat_administratif: "A",
          statut_diffusion_etablissement: "O",
        },
        {
          siret: "41266050800257",
          adresse: "6 RUE DE L'ABONDANCE 69003 LYON",
          code_postal: "69003",
          etat_administratif: "A",
          statut_diffusion_etablissement: "O",
          tranche_effectif_salarie: "11",
        },
      ],
    },
    // Diffusion restreinte : écartée (opposition à la prospection).
    {
      nom_complet: "DISCRET",
      statut_diffusion: "P",
      matching_etablissements: [
        { siret: "11111111111111", code_postal: "69003" },
      ],
    },
    {
      nom_complet: "FERMEE",
      matching_etablissements: [
        {
          siret: "22222222222222",
          code_postal: "69003",
          etat_administratif: "F",
        },
      ],
    },
  ],
};

describe("annuaire des entreprises", () => {
  it("construit la recherche par codes NAF et codes postaux", () => {
    const url = urlAnnuaire("plombier", ["69003", "69007"]);
    expect(url).toContain("activite_principale=43.22A");
    expect(url).toContain("code_postal=69003%2C69007");
    expect(url).toContain("etat_administratif=A");
    expect(urlAnnuaire("inconnu", ["69003"])).toBeNull();
    expect(urlAnnuaire("plombier", [])).toBeNull();
  });

  it("garde l'établissement de la ville, écarte les diffusions restreintes et les fermés", () => {
    const r = lireAnnuaire(reponse, ["69003"]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      nom: "Ouvriers Lyonnais",
      siret: "41266050800257",
      adresse: "6 Rue De L'Abondance 69003 Lyon",
    });
    expect(r[0].infos).toBe(
      "SIRET 412 660 508 00257 · créée en 1997 · 10 à 19 salariés · certifiée RGE",
    );
    expect(lireAnnuaire({ erreur: true }, [])).toEqual([]);
  });

  it("enrichit les fiches OpenStreetMap et complète avec l'annuaire", () => {
    const annuaire = lireAnnuaire(reponse, ["69003"]);
    const osm = [
      {
        nom: "Ouvriers Lyonnais SARL",
        email: null,
        telephone: "04 00 00 00 00",
        site: null,
        adresse: null,
        osm_id: "node/1",
      },
    ];
    const f = fusionner(osm, annuaire, 10);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      telephone: "04 00 00 00 00",
      siret: "41266050800257",
      origine: "osm",
      adresse: "6 Rue De L'Abondance 69003 Lyon",
    });
    const seul = fusionner([], annuaire, 10);
    expect(seul[0]).toMatchObject({ origine: "annuaire", osm_id: null });
    expect(fusionner([], annuaire, 0)).toHaveLength(0);
  });

  it("compare les noms sans forme juridique ni accents", () => {
    expect(cleNom("Électricité Martin SARL")).toBe(
      cleNom("ELECTRICITE MARTIN"),
    );
  });
});
