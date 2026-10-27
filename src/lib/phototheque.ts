// Photothèque : images préparées à l'avance (Canva…) que l'agent reprend
// pour ses publications quand l'une d'elles va avec le post.

export type PhotoStockee = { id: string; url: string; description: string; derniere_utilisation: string | null };

// Une photo n'est pas reprise moins de 10 jours après son dernier usage.
export const DELAI_REPRISE_JOURS = 10;

export function photosDisponibles(photos: PhotoStockee[], maintenant = Date.now()) {
  const limite = maintenant - DELAI_REPRISE_JOURS * 86_400_000;
  return photos.filter((p) => !p.derniere_utilisation || Date.parse(p.derniere_utilisation) < limite);
}

export function consigneChoixPhoto(post: string, photos: PhotoStockee[]) {
  return [
    "Choisis l'image qui illustre le mieux ce post pour les réseaux sociaux d'une entreprise du bâtiment.",
    "Elle doit correspondre au sujet (même métier ou même situation). Si aucune ne va vraiment, réponds 0 : une image créée exprès sera faite à la place.",
    "",
    "Post :",
    post.slice(0, 1200),
    "",
    "Images :",
    ...photos.map((p, i) => `${i + 1}. ${p.description}`),
    "",
    'Réponds uniquement en JSON : {"image": <numéro, ou 0>}',
  ].join("\n");
}

export function lireChoixPhoto(reponse: string, photos: PhotoStockee[]): PhotoStockee | null {
  const m = reponse.match(/"image"\s*:\s*(\d+)/);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= photos.length ? photos[n - 1] : null;
}
