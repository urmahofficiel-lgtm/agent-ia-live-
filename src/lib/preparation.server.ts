import { nomPlateforme } from "./plateformes";
import { genererImage, promptImage, rediger, type Consigne } from "./ia.server";

export const URL_SITE = "https://agent-ia-live.vercel.app";
export const urlVisuel = (id: string) => `${URL_SITE}/api/visuels/${id}`;

// Ce qu'il faut pour enregistrer l'avancement : fourni par le site (jeton de
// l'utilisateur) ou par le moteur (fonctions protégées par le secret).
export type Ecrivain = {
  journal: (niveau: "info" | "action" | "erreur", message: string, image?: string) => PromiseLike<unknown>;
  enregistrer: (resultat: Record<string, unknown>) => PromiseLike<unknown>;
  ajouterVisuel: (mime: string, base64: string, prompt: string) => Promise<string>;
};

export type TacheAPreparer = Consigne & { brouillon?: string | null; visuel_url?: string | null };

// Prépare une tâche étape par étape, en racontant chaque étape dans le
// journal « en direct » : rédaction, puis (pour une publication) visuel.
export async function preparer(t: TacheAPreparer, contexte: string | null, e: Ecrivain) {
  let brouillon = t.brouillon ?? null;
  const ou = t.plateforme ? ` pour ${nomPlateforme(t.plateforme)}` : "";

  if (!brouillon) {
    await e.journal("action", `✍️ Rédaction${ou} : « ${t.titre} »${contexte ? " — selon votre stratégie" : ""}`);
    brouillon = await rediger(t, contexte);
    await e.enregistrer({ brouillon, genere_le: new Date().toISOString() });
    await e.journal("info", `Texte prêt : « ${brouillon.slice(0, 140)}${brouillon.length > 140 ? "…" : ""} »`);
  }

  let visuel_url = t.visuel_url ?? null;
  if (t.type === "publication" && !visuel_url) {
    try {
      await e.journal("action", "🎨 Conception du visuel adapté au post…");
      const prompt = await promptImage(brouillon, t.plateforme, contexte);
      await e.journal("info", `Idée de visuel : ${prompt.slice(0, 160)}`);
      await e.journal("action", "🖼️ Génération de l'image (NVIDIA FLUX)…");
      const image = await genererImage(prompt, t.plateforme);
      const id = await e.ajouterVisuel(image.mime, image.base64, prompt);
      visuel_url = urlVisuel(id);
      await e.enregistrer({ visuel_id: id, visuel_url, visuel_prompt: prompt });
      await e.journal("info", "Image prête.", visuel_url);
    } catch (err) {
      // Pas d'image : la publication reste possible en texte seul. On note
      // l'échec pour que le moteur ne réessaie pas en boucle.
      await e.enregistrer({ visuel_echec: true });
      await e.journal("erreur", `Visuel non créé : ${err instanceof Error ? err.message : "erreur"}`);
    }
  }

  return { brouillon, visuel_url };
}
