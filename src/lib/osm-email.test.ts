import { describe, expect, it } from "vitest";
import { nettoyerEmail } from "./osm";

describe("e-mails OpenStreetMap", () => {
  it("retire mailto: et garde la première adresse valide", () => {
    expect(nettoyerEmail("mailto:contact@majolice.com")).toBe("contact@majolice.com");
    expect(nettoyerEmail("a@b.fr;c@d.fr")).toBe("a@b.fr");
    expect(nettoyerEmail("Contact@Cabinet.FR")).toBe("contact@cabinet.fr");
    expect(nettoyerEmail("pas une adresse")).toBeNull();
    expect(nettoyerEmail(undefined)).toBeNull();
  });
});
