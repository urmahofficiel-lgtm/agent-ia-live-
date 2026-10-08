import { describe, expect, it } from "vitest";
import { nettoyerEmail, requeteOverpass } from "./osm";

describe("e-mails OpenStreetMap", () => {
  it("retire mailto: et garde la première adresse valide", () => {
    expect(nettoyerEmail("mailto:contact@majolice.com")).toBe("contact@majolice.com");
    expect(nettoyerEmail("a@b.fr;c@d.fr")).toBe("a@b.fr");
    expect(nettoyerEmail("Contact@Cabinet.FR")).toBe("contact@cabinet.fr");
    expect(nettoyerEmail("pas une adresse")).toBeNull();
    expect(nettoyerEmail(undefined)).toBeNull();
  });
});

describe("requête Overpass par pays", () => {
  it("garde la requête française, limite les autres pays à leur territoire", () => {
    expect(requeteOverpass("architecte", "Lyon", 10)).toContain('area["name"="Lyon"]');
    const be = requeteOverpass("architecte", "Bruxelles", 10, "BE");
    expect(be).toContain('area["ISO3166-1"="BE"]');
    expect(be).toContain('[~"^name(:fr)?$"~"^Bruxelles$",i]');
    expect(requeteOverpass("architecte", "Saint-Gilles (Bxl)", 10, "BE")).toContain("Saint-Gilles \\\\(Bxl\\\\)");
  });
});
