// Bluesky (AT Protocol) : pas de validation, pas de clé d'API. On se connecte
// avec l'identifiant et un « mot de passe d'application ». Partie pure, testable.

export const LIMITE_BLUESKY = 300; // caractères visibles (graphèmes)

const graphemes = (t: string) => [...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(t)].map((s) => s.segment);
const RE_LIEN = /https?:\/\/[^\s)\]]+[^\s.,;:!?)\]'"»]/g;

// Texte ≤ 300 caractères. S'il faut couper, on garde le début (jusqu'à la
// dernière phrase ou le dernier mot entier) et on remet le premier lien à la fin.
export function adapterTexteBluesky(texte: string) {
  const propre = texte.replace(/\*\*/g, "").trim();
  if (graphemes(propre).length <= LIMITE_BLUESKY) return propre;
  const lien = propre.match(RE_LIEN)?.[0];
  const suffixe = lien ? `\n${lien}` : "";
  const place = LIMITE_BLUESKY - graphemes(suffixe).length - 1;
  const sansLien = lien ? propre.replace(lien, "").replace(/\n{3,}/g, "\n\n").trim() : propre;
  const debut = graphemes(sansLien).slice(0, place).join("");
  const finPhrase = Math.max(debut.lastIndexOf(". "), debut.lastIndexOf("! "), debut.lastIndexOf("? "), debut.lastIndexOf("\n"));
  const coupe = finPhrase > place * 0.5 ? debut.slice(0, finPhrase + 1) : `${debut.slice(0, debut.lastIndexOf(" "))}…`;
  return `${coupe.trim()}${suffixe}`;
}

// Liens cliquables : Bluesky demande leur position en octets UTF-8.
export function facettesLiens(texte: string) {
  const enc = new TextEncoder();
  return [...texte.matchAll(RE_LIEN)].map((m) => {
    const byteStart = enc.encode(texte.slice(0, m.index)).length;
    return {
      index: { byteStart, byteEnd: byteStart + enc.encode(m[0]).length },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }],
    };
  });
}
