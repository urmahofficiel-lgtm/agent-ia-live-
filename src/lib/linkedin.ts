// LinkedIn, profil personnel en direct (produits gratuits « Sign In with
// LinkedIn using OpenID Connect » et « Share on LinkedIn »). Partie pure.

export const PERMISSIONS_LINKEDIN = ["openid", "profile", "w_member_social"];

export function urlDialogueLinkedin(p: { clientId: string; retour: string; etat: string }) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: p.clientId,
    redirect_uri: p.retour,
    state: p.etat,
    scope: PERMISSIONS_LINKEDIN.join(" "),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${q}`;
}

// Le texte d'un post LinkedIn est au format « little text » : certains
// caractères doivent être échappés, sinon le post est refusé ou coupé.
// Les hashtags deviennent de vrais hashtags cliquables.
export function texteLinkedin(texte: string) {
  const propre = texte.replace(/\*\*/g, "");
  let sortie = "";
  let i = 0;
  for (const m of propre.matchAll(/#([\p{L}\d_]+)/gu)) {
    sortie += echapper(propre.slice(i, m.index)) + `{hashtag|\\#|${m[1]}}`;
    i = m.index! + m[0].length;
  }
  return sortie + echapper(propre.slice(i));
}

const echapper = (t: string) => t.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
