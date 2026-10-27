import { nomPlateforme } from "./plateformes";
import { estEtranger, marcheDe } from "./marches";
import { formatImage, genererImage, promptImage, rediger, type Consigne } from "./ia.server";
import { composerVisuel, textesVisuel } from "./visuel.server";
import { ligneContexte } from "./visuel";
import { couleurDuSite } from "./site.server";
import { ACCENT_DEFAUT } from "./couleurs";
import { nomStyleImage, type StyleImage } from "./styles";

export const URL_SITE = "https://agent-ia-live.vercel.app";
export const urlVisuel = (id: string) => `${URL_SITE}/api/visuels/${id}`;

// Ce qu'il faut pour enregistrer l'avancement : fourni par le site (jeton de
// l'utilisateur) ou par le moteur (fonctions protégées par le secret).
export type Ecrivain = {
  journal: (niveau: "info" | "action" | "erreur", message: string, image?: string) => PromiseLike<unknown>;
  enregistrer: (resultat: Record<string, unknown>) => PromiseLike<unknown>;
  ajouterVisuel: (mime: string, base64: string, prompt: string) => Promise<string>;
};

// `style_visuel` : photo (par défaut), accroche, citation ou promo.
export type TacheAPreparer = Consigne & { brouillon?: string | null; visuel_url?: string | null; style_visuel?: StyleImage };

// Prépare une tâche étape par étape, en racontant chaque étape dans le
// journal « en direct » : rédaction, puis (pour une publication) visuel.
export async function preparer(t: TacheAPreparer, contexte: string | null, e: Ecrivain) {
  let brouillon = t.brouillon ?? null;
  // Marché étranger : son drapeau dans le journal (« pour Facebook 🇮🇹 »).
  const ou = t.plateforme ? ` pour ${nomPlateforme(t.plateforme)}${estEtranger(t.marche) ? ` ${marcheDe(t.marche).drapeau}` : ""}` : "";

  if (!brouillon) {
    await e.journal("action", `✍️ Rédaction${ou} : « ${t.titre} »${contexte ? " — selon votre stratégie" : ""}`);
    brouillon = await rediger(t, contexte);
    await e.enregistrer({ brouillon, genere_le: new Date().toISOString() });
    await e.journal("info", `Texte prêt : « ${brouillon.slice(0, 140)}${brouillon.length > 140 ? "…" : ""} »`);
  }

  let visuel_url = t.visuel_url ?? null;
  if (t.type === "publication" && !visuel_url) {
    try {
      const style = t.style_visuel ?? "photo";
      await e.journal("action", style === "photo" ? "🎨 Conception du visuel adapté au post…" : `🎨 Conception du visuel « ${nomStyleImage(style)} »…`);
      // Styles avec texte : textes et couleur de la marque préparés pendant
      // que l'image se crée (ces promesses ne lèvent jamais d'erreur).
      const site = ligneContexte(contexte, "Site / lien").split(/\s/)[0];
      const mettreEnPage = (s: Exclude<StyleImage, "photo">) =>
        Promise.all([
          textesVisuel(s, { titre: t.titre, brouillon }, contexte, t.marche),
          site ? couleurDuSite(site).catch(() => null) : Promise.resolve(null),
        ]);
      // Rendu final : le style demandé, ou le visuel aux couleurs de la marque
      // quand l'image IA n'a pas pu être créée.
      let rendu: Exclude<StyleImage, "photo"> | null = style === "photo" ? null : style;
      let miseEnPage = rendu ? mettreEnPage(rendu) : null;
      let prompt = "";
      let image: { mime: string; base64: string } | null = null;
      // Citation : fond sobre aux couleurs de la marque, pas de photo.
      if (style !== "citation") {
        prompt = await promptImage(brouillon, t.plateforme, contexte, t.marche);
        // Place laissée au texte incrusté.
        if (style !== "photo") prompt += " Keep the lower third simple and uncluttered.";
        await e.journal("info", `Idée de visuel : ${prompt.slice(0, 160)}`);
        await e.journal("action", "🖼️ Génération de l'image par IA…");
        try {
          const cree = await genererImage(prompt, t.plateforme);
          image = { mime: cree.mime, base64: cree.base64 };
          await e.journal("info", `Image créée (${cree.moteur}).`);
        } catch (err) {
          // Jamais de photo de banque d'images au hasard (hors sujet, pas au
          // niveau de la marque) : fond aux couleurs de la marque et titre du post.
          await e.journal("erreur", `Image IA indisponible (${err instanceof Error ? err.message.slice(0, 160) : "erreur"}) : visuel aux couleurs de la marque à la place.`);
          if (!rendu) {
            rendu = "citation";
            miseEnPage = mettreEnPage(rendu);
          }
        }
      }
      if (miseEnPage && rendu) {
        const [textes, couleur] = await miseEnPage;
        await e.journal("action", `🔤 Mise en page du texte : « ${textes.titre.slice(0, 80)} »`);
        try {
          const jpeg = await composerVisuel(
            rendu,
            image ? Buffer.from(image.base64, "base64") : null,
            textes,
            formatImage(t.plateforme),
            couleur ?? ACCENT_DEFAUT,
            ligneContexte(contexte, "Marque"),
          );
          if (rendu === "citation") prompt = `Visuel de marque : ${textes.titre}`;
          image = { mime: "image/jpeg", base64: jpeg.toString("base64") };
        } catch (err) {
          // Mise en page impossible : la photo seule reste utilisable.
          if (!image) throw err;
          await e.journal("erreur", `Texte non incrusté (${err instanceof Error ? err.message.slice(0, 120) : "erreur"}) : photo seule.`);
        }
      }
      if (!image) throw new Error("Aucune image créée.");
      const id = await e.ajouterVisuel(image.mime, image.base64, prompt);
      visuel_url = urlVisuel(id);
      await e.enregistrer({ visuel_id: id, visuel_url, visuel_prompt: prompt, visuel_style: rendu ?? style });
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
