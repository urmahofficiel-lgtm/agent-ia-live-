// Nettoyage d'un post rédigé par l'IA avant publication : les réseaux
// affichent le texte brut, donc pas de markdown ; et le titre interne de la
// publication ne doit pas apparaître en tête du post.
export function nettoyerPost(texte: string, titre?: string | null) {
  let t = texte
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/^#{1,6}\s+/gm, "") // titres markdown (les hashtags, collés au mot, sont gardés)
    .replace(/<(https?:\/\/[^>\s]+)>/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .trim();
  const cle = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (titre) {
    const [premiere, ...reste] = t.split("\n");
    if (cle(premiere) && cle(premiere) === cle(titre)) t = reste.join("\n").trim();
  }
  return t.replace(/\n{3,}/g, "\n\n");
}
