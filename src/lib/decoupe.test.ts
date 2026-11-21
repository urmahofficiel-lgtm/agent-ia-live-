import { describe, expect, it } from "vitest";
import { compositionDecoupe, dureeDecoupe, sansPhotosAbsentes, type PlanDecoupe } from "./decoupe";
import { NOMS_ICONES_DECOUPE } from "./decoupe-icones";
import { consigneHistoire, estHistoire, lireHistoire, MARQUE_HISTOIRE, planFinal } from "./decoupe-script";

const plan = (n: number, duree = 3): PlanDecoupe => ({
  titre: `TITRE NUMÉRO ${n}`,
  extrait: `Extrait ${n} & « test »`,
  phrase: `Phrase *${n}* <b>`,
  icones: ["Landmark", "Clock"],
  duree,
});

describe("compositionDecoupe", () => {
  const plans = [plan(1), plan(2), { ...planFinal("BTP Ecosystem", "https://www.btp-ecosystem.com/", "ESSAI GRATUIT"), duree: 4 }];
  const html = compositionDecoupe({ plans, voix: "voix.wav", musique: "musique.m4a" });

  it("additionne les durées", () => {
    expect(dureeDecoupe({ plans })).toBe(10);
    expect(html).toContain('data-duration="10"');
  });
  it("cale chaque plan sur son temps de départ", () => {
    expect(html).toContain('id="p0-clip" class="clip sticker journal" data-start="0"');
    expect(html).toContain('id="p1-clip" class="clip sticker journal" data-start="3"');
    expect(html).toContain('id="p2-carte" class="clip sticker carte" data-start="6"');
  });
  it("échappe le texte et met le mot clé en évidence", () => {
    expect(html).toContain("Extrait 1 &amp; « test »");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain('<span class="cle">1</span>');
  });
  it("ne nomme la marque que sur la dernière image", () => {
    const avant = html.slice(0, html.indexOf('id="p2-carte"'));
    expect(avant.toLowerCase()).not.toContain("ecosystem");
    expect(html).toContain("btp-ecosystem.com");
  });
  it("bouge à 12 images par seconde : une pose toutes les 1/12 s", () => {
    expect(html).toContain('tl.set("#p0-clip", { x:');
    expect(html).toMatch(/tl\.set\("#grain", \{ attr: \{ seed: 1 \} \}, 0\)/);
    expect(html).toMatch(/tl\.set\("#grain", \{ attr: \{ seed: 2 \} \}, 0\.08\)/);
  });
  it("est reproductible", () => {
    expect(compositionDecoupe({ plans, voix: "voix.wav", musique: "musique.m4a" })).toBe(html);
  });
  it("branche la voix et la musique", () => {
    expect(html).toContain('<audio id="voix" src="voix.wav"');
    expect(html).toContain('<audio id="musique" src="musique.m4a"');
  });
  it("montre la photo détourée à la place des deux icônes", () => {
    const h = compositionDecoupe({ plans: [{ ...plan(1), photo: "photo0.png" }] });
    expect(h).toContain('<img src="photo0.png"');
    expect(h).toContain('id="p0-i0" class="clip sticker blob petit"');
    expect(h).not.toContain('id="p0-i1"');
  });
  it("retombe sur les icônes si la photo n'a pas pu être détourée", () => {
    const e = { plans: [{ ...plan(1), photo: "photo0.png" }, { ...plan(2), photo: "photo1.png" }, plan(3)] };
    const r = sansPhotosAbsentes(e, new Set(["photo1.png"]));
    expect(r.plans.map((p) => p.photo)).toEqual([undefined, "photo1.png", undefined]);
    const h = compositionDecoupe(r);
    expect(h).toContain('<img src="photo1.png"');
    expect(h).not.toContain("photo0.png");
    expect(h).toContain('id="p0-i1"');
  });
  it("garde une icône par défaut si le nom est inconnu", () => {
    const h = compositionDecoupe({ plans: [{ ...plan(1), icones: ["Inconnue"] }] });
    expect(h).toContain("<svg viewBox");
  });
});

const SOURCES = "La tour Eiffel devait être démontée après 20 ans. En 1903, le capitaine Ferrié propose une antenne de TSF. Construite en 1889.";
const bon = (titre = "LA RADIO LA SAUVE") => ({
  titre,
  extrait: "En 1903, une antenne de TSF change tout.",
  phrase: "En 1903, la *radio* sauve la tour.",
  icones: ["RadioTower", "Radio"],
});
const reponse = (plans: unknown[], legende = "Une histoire vraie. Et toi ? #construction #architecture #histoire") => JSON.stringify({ plans, legende });

describe("lireHistoire", () => {
  const cinq = [bon("UN"), bon("DEUX"), bon("TROIS"), bon("QUATRE"), bon("CINQ")];

  it("lit un script valide", () => {
    const s = lireHistoire(reponse(cinq), SOURCES, ["BTP Ecosystem"]);
    expect(s?.plans).toHaveLength(5);
    expect(s?.plans[0].icones).toEqual(["RadioTower", "Radio"]);
    expect(s?.legende).toContain("#construction");
  });
  it("écarte un fait chiffré absent des sources", () => {
    const faux = { ...bon("FAUX"), phrase: "Elle mesure *330* mètres." };
    expect(lireHistoire(reponse([...cinq, faux]), SOURCES)?.plans).toHaveLength(5);
    // trop peu de plans valides : script refusé
    expect(lireHistoire(reponse([faux, faux, faux, faux, faux]), SOURCES)).toBeNull();
  });
  it("écarte tout plan qui nomme la marque", () => {
    const marque = { ...bon("MARQUE"), phrase: "Utilise *BTP Ecosystem* pour ça." };
    expect(lireHistoire(reponse([...cinq, marque]), SOURCES, ["BTP Ecosystem"])?.plans).toHaveLength(5);
  });
  it("refuse les icônes inconnues et les promesses", () => {
    const sans = { ...bon("SANS"), icones: ["Inventee"] };
    const promesse = { ...bon("PROMESSE"), phrase: "Résultat *garanti* à 100 %." };
    expect(lireHistoire(reponse([...cinq, sans, promesse]), SOURCES)?.plans).toHaveLength(5);
  });
  it("vide la légende si elle invente un chiffre", () => {
    expect(lireHistoire(reponse(cinq, "Elle mesure 999 mètres #construction"), SOURCES)?.legende).toBe("");
  });
  it("refuse une réponse illisible", () => {
    expect(lireHistoire("pas du json", SOURCES)).toBeNull();
  });
  it("lit les mots-clés de photo (lettres et espaces seulement)", () => {
    const avec = { ...bon("PHOTO"), photo: "construction worker; <b>2</b>" };
    const s = lireHistoire(reponse([...cinq.slice(0, 4), avec]), SOURCES);
    expect(s?.plans[4].recherche_photo).toBe("construction worker bb");
    expect(s?.plans[0].recherche_photo).toBeUndefined();
  });
  it("coupe à 7 plans au plus", () => {
    expect(lireHistoire(reponse([...cinq, bon("SIX"), bon("SEPT"), bon("HUIT")]), SOURCES)?.plans).toHaveLength(7);
  });
});

describe("consigne et format", () => {
  it("reconnaît la marque du format dans la consigne", () => {
    expect(estHistoire(`Sujet : la tour Eiffel.\n${MARQUE_HISTOIRE}`)).toBe(true);
    expect(estHistoire("Sujet : devis")).toBe(false);
    expect(estHistoire(null)).toBe(false);
  });
  it("interdit de parler de la marque et liste les icônes permises", () => {
    const c = consigneHistoire("La tour Eiffel", [{ titre: "Page", url: "https://exemple.fr", texte: "Texte" }], "BTP Ecosystem");
    expect(c).toContain("Ne parle JAMAIS de « BTP Ecosystem »");
    for (const n of NOMS_ICONES_DECOUPE.slice(0, 3)) expect(c).toContain(n);
  });
  it("le plan final porte la marque, le site sans protocole et l'essai", () => {
    const f = planFinal("BTP Ecosystem", "https://www.btp-ecosystem.com/accueil", "14 JOURS GRATUITS");
    expect(f.carte).toEqual({ grand: "BTP Ecosystem", petits: ["DEVIS · FACTURES · SUIVI", "14 JOURS GRATUITS"], site: "btp-ecosystem.com" });
    expect(f.phrase).toContain("*BTP Ecosystem*");
  });
});

describe("présentation de la marque (même style)", () => {
  it("reconnaît le format et le distingue de l'histoire", async () => {
    const { estPresentation, estDecoupe, MARQUE_PRESENTATION, consignePresentation } = await import("./decoupe-script");
    expect(estPresentation(`Présente la marque.\n${MARQUE_PRESENTATION}`)).toBe(true);
    expect(estHistoire(`Présente la marque.\n${MARQUE_PRESENTATION}`)).toBe(false);
    expect(estDecoupe(MARQUE_PRESENTATION)).toBe(true);
    expect(estDecoupe(MARQUE_HISTOIRE)).toBe(true);
    expect(estDecoupe("rien")).toBe(false);
    const c = consignePresentation("Devis et factures", "Marque : BTP Ecosystem\nDevis IA par la voix.", "BTP Ecosystem");
    expect(c).toContain("SEULE source de vérité");
    expect(c).toContain("Devis IA par la voix.");
    expect(c).toContain("Lien en bio");
  });
  it("garde la marque dans le script d'une présentation", () => {
    const fiche = "Marque : BTP Ecosystem. Devis IA par la voix, factures Factur-X.";
    const p = (t: string) => ({ titre: t, extrait: "Le devis par la voix.", phrase: "Avec *BTP Ecosystem*, tu dictes ton devis.", icones: ["Hammer"], photo: "builder smartphone" });
    const s = lireHistoire(JSON.stringify({ plans: [p("UN"), p("DEUX"), p("TROIS"), p("QUATRE"), p("CINQ")], legende: "Lien en bio" }), fiche, []);
    expect(s?.plans).toHaveLength(5);
    expect(s?.plans[0].recherche_photo).toBe("builder smartphone");
  });
});

describe("coupures de journal propres (retours du 21/11)", () => {
  const fiche = "Marque : BTP Ecosystem. Devis IA par la voix.";
  const plan = (o: Record<string, unknown>) => ({ titre: "MARRE DE LA *PAPERASSE*", extrait: "Les devis du *soir* en retard.", phrase: "Tu en as *assez* ?", icones: ["Hammer"], ...o });
  it("retire les astérisques du titre et de l'extrait, pas de la phrase", () => {
    const s = lireHistoire(JSON.stringify({ plans: [plan({}), plan({}), plan({}), plan({}), plan({})], legende: "" }), fiche, []);
    expect(s?.plans[0].titre).toBe("MARRE DE LA PAPERASSE");
    expect(s?.plans[0].extrait).toBe("Les devis du soir en retard.");
    expect(s?.plans[0].phrase).toBe("Tu en as *assez* ?");
  });
  it("refuse une coupure recopiée en anglais", async () => {
    const { enAnglais } = await import("./decoupe-script");
    expect(enAnglais("Construction started on March, and the building opened")).toBe(true);
    expect(enAnglais("Le chantier démarre en mars et l'immeuble ouvre en mai.")).toBe(false);
    const anglais = plan({ extrait: "Planning begins during the Race to the Sky competition" });
    const s = lireHistoire(JSON.stringify({ plans: [plan({}), plan({}), plan({}), plan({}), plan({}), anglais], legende: "" }), fiche, []);
    expect(s?.plans).toHaveLength(5);
  });
});
