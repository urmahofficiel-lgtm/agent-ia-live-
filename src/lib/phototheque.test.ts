import { describe, expect, it } from "vitest";
import { consigneChoixPhoto, lireChoixPhoto, photosDisponibles, type PhotoStockee } from "./phototheque";

const photo = (id: string, derniere_utilisation: string | null = null): PhotoStockee => ({
  id,
  url: `https://exemple.fr/${id}.jpg`,
  description: `Photo ${id}`,
  derniere_utilisation,
});

describe("photothèque", () => {
  it("écarte les photos utilisées il y a moins de 10 jours", () => {
    const maintenant = Date.parse("2026-10-27T12:00:00Z");
    const photos = [photo("a"), photo("b", "2026-10-25T10:00:00Z"), photo("c", "2026-10-10T10:00:00Z")];
    expect(photosDisponibles(photos, maintenant).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("numérote les photos et lit le choix de l'IA, 0 = aucune", () => {
    const photos = [photo("a"), photo("b")];
    expect(consigneChoixPhoto("Un post", photos)).toContain("2. Photo b");
    expect(lireChoixPhoto('{"image": 2}', photos)?.id).toBe("b");
    expect(lireChoixPhoto('{"image": 0}', photos)).toBeNull();
    expect(lireChoixPhoto('{"image": 7}', photos)).toBeNull();
    expect(lireChoixPhoto("rien", photos)).toBeNull();
  });
});
