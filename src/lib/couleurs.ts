// Couleurs des créations (vidéos, images) : couleur de la marque lue sur son
// site, conversions pour les sous-titres ASS. Fonctions pures, testables.

// Jaune vif : surlignage lisible sur toute image quand la marque n'a pas de couleur.
export const ACCENT_DEFAUT = "#FFD60A";

export function normaliserHex(x: string | null | undefined) {
  const m = (x ?? "").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toUpperCase()}`;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Luminance relative (0 = noir, 1 = blanc).
export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Couleur de marque utilisable comme accent : ni grise, ni presque noire ou
// blanche (sinon illisible en surlignage). Null si elle ne convient pas.
export function couleurAccent(x: string | null | undefined) {
  const hex = normaliserHex(x);
  if (!hex) return null;
  const [r, g, b] = rgb(hex);
  const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  const l = luminance(hex);
  return saturation >= 0.25 && l > 0.04 && l < 0.9 ? hex : null;
}

// Texte posé sur un aplat de cette couleur : noir ou blanc, le plus lisible.
export const texteSurCouleur = (hex: string) => (luminance(hex) > 0.35 ? "#111111" : "#FFFFFF");

// Même teinte, plus sombre (facteur 0 à 1).
export function assombrir(hex: string, facteur: number) {
  return `#${rgb(hex)
    .map((c) => Math.round(c * (1 - facteur)).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

// Couleur au format ASS : &HAABBGGRR (alpha 0 = opaque, 255 = transparent).
export function couleurAss(hex: string, alpha = 0) {
  const [r, g, b] = rgb(normaliserHex(hex) ?? "#FFFFFF");
  const h = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `&H${h(alpha)}${h(b)}${h(g)}${h(r)}`;
}

// Couleur de la marque déclarée par son site (<meta name="theme-color">).
export function couleurTheme(html: string) {
  for (const balise of html.matchAll(/<meta\b[^>]*>/gi)) {
    const b = balise[0];
    if (!/name=["'](theme-color|msapplication-TileColor)["']/i.test(b)) continue;
    const c = couleurAccent(b.match(/content=["']([^"']+)["']/i)?.[1]);
    if (c) return c;
  }
  return null;
}
