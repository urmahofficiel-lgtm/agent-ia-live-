import { describe, expect, it } from "vitest";
import { construireSeances, etapeDe, type EvenementBrut } from "./activite";

let id = 0;
const ev = (tache: string | null, niveau: EvenementBrut["niveau"], message: string, minute: number, image?: string): EvenementBrut => ({
  id: ++id,
  tache_id: tache,
  niveau,
  message,
  capture_url: image ?? null,
  created_at: new Date(Date.UTC(2026, 8, 27, 10, minute)).toISOString(),
});

describe("etapeDe", () => {
  it("reconnaît les étapes", () => {
    expect(etapeDe("✍️ Rédaction pour LinkedIn : « X »")).toBe("redaction");
    expect(etapeDe("🖼️ Génération de l'image (NVIDIA FLUX)…")).toBe("visuel");
    expect(etapeDe("🎬 Écriture du script vidéo : « X »")).toBe("video");
    expect(etapeDe("🚀 Publication en cours sur LinkedIn")).toBe("publication");
    expect(etapeDe("🔎 Analyse de votre niche et de votre marché…")).toBe("strategie");
    expect(etapeDe("✅ Terminé. Les publications sont prêtes à valider dans Publications.")).toBeNull();
    expect(etapeDe("✅ Publié : « Devis »")).toBe("publication");
  });
});

describe("construireSeances", () => {
  const maintenant = Date.UTC(2026, 8, 27, 12, 0);
  const evenements = [
    ev("t1", "action", "✍️ Rédaction pour LinkedIn : « Devis »", 0),
    ev("t1", "info", "Texte prêt : « Avec BTP Ecosystem… »", 1),
    ev("t1", "action", "🖼️ Génération de l'image (NVIDIA FLUX)…", 1),
    ev("t1", "erreur", "Visuel non créé : Création d'image impossible", 2),
    ev("t1", "info", "Prêt à valider : « Devis »", 2),
    ev("t2", "action", "🎬 Écriture du script vidéo : « RGPD »", 30),
    ev(null, "action", "🔎 Analyse de votre niche…", 40),
    ev(null, "info", "Stratégie prête : …", 41),
  ];

  it("regroupe par tâche, la plus récente en premier", () => {
    const s = construireSeances(evenements, maintenant);
    expect(s.map((x) => x.tacheId)).toEqual([null, "t2", "t1"]);
  });

  it("reconstitue l'état des étapes", () => {
    const [agent, video, devis] = construireSeances(evenements, maintenant);
    expect(devis.etapes).toEqual([
      { nom: "redaction", etat: "fait" },
      { nom: "visuel", etat: "echec" },
    ]);
    expect(devis.erreurs).toHaveLength(1);
    // Vidéo lancée il y a longtemps sans suite : échec implicite… sans erreur
    // enregistrée elle est considérée comme terminée.
    expect(video.active).toBe(false);
    expect(agent.etapes).toEqual([{ nom: "strategie", etat: "fait" }]);
  });

  it("marque active une séance dont la dernière action est récente", () => {
    const s = construireSeances([ev("t3", "action", "🎨 Conception du visuel…", 59)], Date.UTC(2026, 8, 27, 11, 0));
    expect(s[0].active).toBe(true);
    expect(s[0].etapes[0]).toEqual({ nom: "visuel", etat: "en_cours" });
  });
});
