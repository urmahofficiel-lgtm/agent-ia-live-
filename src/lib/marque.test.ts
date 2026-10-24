import { describe, expect, it } from "vitest";
import { marquesEtrangeres, marquesInterdites, nomDeLaMarque } from "./marque";
import { consigneMessage, type ProspectARediger } from "./prospection";

const CONTEXTE = [
  "Marque : BTP Ecosystem",
  "Autres marques à ne JAMAIS citer (anciennes fiches) : Agora, manifestation-organiser.vercel.app, BTP Ecosystem",
  "Site / lien à mettre dans les posts : https://www.btp-ecosystem.com/",
].join("\n");

describe("marque du compte", () => {
  it("lit le nom et les anciennes marques, jamais le nom actuel", () => {
    expect(nomDeLaMarque(CONTEXTE)).toBe("BTP Ecosystem");
    expect(marquesInterdites(CONTEXTE)).toEqual(["Agora", "manifestation-organiser.vercel.app"]);
    expect(marquesInterdites(null)).toEqual([]);
  });

  it("repère une ancienne marque citée, mot entier, sans tenir compte des majuscules", () => {
    expect(marquesEtrangeres("Découvrez comment AGORA simplifie vos équipes", CONTEXTE)).toEqual(["Agora"]);
    expect(marquesEtrangeres("Lien : https://manifestation-organiser.vercel.app/", CONTEXTE)).toEqual(["manifestation-organiser.vercel.app"]);
    expect(marquesEtrangeres("BTP Ecosystem simplifie vos devis", CONTEXTE)).toEqual([]);
    expect(marquesEtrangeres("Agoraphobie", CONTEXTE)).toEqual([]);
  });

  it("la consigne de prospection impose le nom de la marque", () => {
    const p = { nom: "Éclair elec", entreprise: "Éclair elec", genre: "premier", contexte: CONTEXTE } as ProspectARediger;
    expect(consigneMessage(p, "message")).toContain("Notre marque s'appelle « BTP Ecosystem » : c'est le seul nom de marque");
    expect(consigneMessage({ ...p, contexte: null }, "message")).not.toContain("Notre marque s'appelle");
  });
});
