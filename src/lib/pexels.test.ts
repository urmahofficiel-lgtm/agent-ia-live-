import { describe, expect, it } from "vitest";
import { choisirFichierVertical, choisirVideo } from "./pexels";

const video = (id: number, duration: number, files: [number, number][]) => ({
  id,
  duration,
  video_files: files.map(([width, height]) => ({ link: `https://x/${id}-${width}.mp4`, width, height, file_type: "video/mp4" })),
});

describe("pexels", () => {
  it("prend le plus léger fichier vertical d'au moins 720 px de large", () => {
    const f = choisirFichierVertical(video(1, 10, [[1080, 1920], [720, 1280], [540, 960], [1920, 1080]]));
    expect(f?.width).toBe(720);
  });
  it("ignore les vidéos horizontales ou trop courtes", () => {
    const choix = choisirVideo([video(1, 2, [[720, 1280]]), video(2, 12, [[1920, 1080]]), video(3, 9, [[1080, 1920]])], 5);
    expect(choix?.id).toBe(3);
  });
});

describe("pexels : variété", () => {
  it("écarte les vidéos déjà utilisées", () => {
    const l = [video(1, 10, [[720, 1280]]), video(2, 10, [[720, 1280]])];
    expect(choisirVideo(l, 5, new Set([1]))?.id).toBe(2);
  });
  it("cherche en français quand les mots-clés sont français", async () => {
    const { langueRecherche } = await import("./pexels");
    expect(langueRecherche("artisan sur un chantier")).toBe("fr-FR");
    expect(langueRecherche("construction worker smartphone")).toBe("en-US");
  });
});
