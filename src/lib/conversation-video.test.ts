import { describe, expect, it } from "vitest";
import {
  ECRAN,
  ZONE,
  bulles,
  conversationDeSecours,
  couper,
  lignesAccroche,
  defilement,
  lireConversation,
  minutage,
  nettoyer,
  scenarioPour,
  sousTitresConversation,
  tempsLecture,
} from "./conversation-video";
import { styleVideoPour } from "./styles";

const reponse = (o: object) => `Voici : ${JSON.stringify(o)}`;
const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ de: i % 2 ? "moi" : "lui", texte: `Message numéro ${i} un peu long pour voir comment il se coupe` }));

describe("script de la conversation", () => {
  it("lit la réponse de l'IA et complète ce qui manque", () => {
    const s = lireConversation(reponse({ accroche: "Il veut une remise 😤", messages: msgs(6), chute: "Fin", legende: "Légende #btp" }));
    expect(s?.accroche).toBe("Il veut une remise");
    expect(s?.contact).toBe("Client");
    expect(s?.question).toMatch(/\?$/);
    expect(s?.messages).toHaveLength(6);
  });

  it("refuse une conversation trop courte ou sans accroche", () => {
    expect(lireConversation(reponse({ accroche: "X", messages: msgs(3) }))).toBeNull();
    expect(lireConversation(reponse({ accroche: "", messages: msgs(6) }))).toBeNull();
    expect(lireConversation("pas de JSON")).toBeNull();
  });

  it("garde 10 messages au plus et retire ce qui casserait le montage", () => {
    const s = lireConversation(reponse({ accroche: "A", messages: [...msgs(15), { de: "lui", texte: "{\\pos(0,0)} pirate 👍" }] }));
    expect(s?.messages).toHaveLength(10);
    expect(nettoyer("{\\pos(0,0)} pirate 👍")).toBe("pos(0,0) pirate");
  });

  it("une situation par publication, toujours la même pour un identifiant", () => {
    expect(scenarioPour("abc")).toBe(scenarioPour("abc"));
    expect(new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(scenarioPour)).size).toBeGreaterThan(2);
  });
});

describe("minutage et mise en page", () => {
  it("chaque message a le temps d'être lu, la vidéo reste courte", () => {
    expect(tempsLecture("Ok")).toBe(1.3);
    expect(tempsLecture("x".repeat(200))).toBe(3.2);
    const { debuts, total } = minutage(conversationDeSecours("site").messages);
    expect(debuts[0]).toBeGreaterThan(1);
    expect(debuts).toEqual([...debuts].sort((a, b) => a - b));
    expect(total).toBeGreaterThan(15);
    expect(total).toBeLessThan(35);
  });

  it("coupe les messages sans dépasser la bulle", () => {
    const lignes = couper("Bonjour je voudrais savoir si vous pouvez faire un geste commercial sur la facture");
    expect(lignes.length).toBeGreaterThan(1);
    for (const l of lignes) expect(l.length).toBeLessThanOrEqual(24);
    expect(couper("anticonstitutionnellementtrèslongmotsansespace").every((l) => l.length <= 24)).toBe(true);
  });

  it("bulles dans l'écran, à gauche pour lui, à droite pour moi, sans chevauchement", () => {
    const b = bulles(msgs(10) as never);
    for (const x of b) {
      expect(x.x).toBeGreaterThanOrEqual(0);
      expect(x.x + x.l).toBeLessThanOrEqual(ECRAN.largeur);
    }
    expect(b[0].x).toBeLessThan(b[1].x);
    for (let i = 1; i < b.length; i++) expect(b[i].y).toBeGreaterThanOrEqual(b[i - 1].y + b[i - 1].h);
  });

  it("le dernier message reste visible au-dessus de la barre de saisie", () => {
    const b = bulles(msgs(10) as never);
    expect(defilement(b, 0)).toBe(0);
    for (let k = 0; k < b.length; k++) expect(b[k].y + b[k].h - defilement(b, k)).toBeLessThanOrEqual(ZONE.bas);
  });

  it("produit un fichier de sous-titres complet", () => {
    const ass = sousTitresConversation(conversationDeSecours("site"));
    expect(ass).toContain("[Events]");
    expect(ass).toContain("IL ME DEMANDE");
    expect(ass).toContain("écrit...");
    expect(ass).toContain("Vous auriez fait un");
  });

  it("l'accroche tient dans la bande du haut, même longue", () => {
    expect(lignesAccroche("Il veut une remise").taille).toBe(46);
    const longue = lignesAccroche("Mon fournisseur m'a fait le coup du siècle ce matin à six heures");
    expect(longue.lignes.length).toBeLessThanOrEqual(3);
    for (const l of longue.lignes) expect(l.length * longue.taille * 0.6).toBeLessThanOrEqual(660);
  });
});

describe("choix du style des vidéos automatiques", () => {
  it("une vidéo sur deux devient une conversation, selon la publication", () => {
    const styles = Array.from({ length: 40 }, (_, i) => styleVideoPour("tiktok", "classique", `tache-${i}`));
    const conv = styles.filter((s) => s === "conversation").length;
    expect(conv).toBeGreaterThan(10);
    expect(conv).toBeLessThan(30);
    expect(styles.every((s) => s === "conversation" || s === "ugc")).toBe(true);
  });
  it("respecte un style choisi par l'utilisateur et la série « journée »", () => {
    expect(styleVideoPour("tiktok", "top3", "x")).toBe("top3");
    expect(styleVideoPour("instagram", "journee", "x")).toBe("journee");
    expect(styleVideoPour("tiktok", "classique")).toBe("ugc");
  });
});
