// Connexion directe à Facebook et Instagram (API officielle Meta, gratuite),
// sans passer par Zernio. Partie sans secret, testable.
export const VERSION_GRAPH = "v23.0";

// Droits demandés : lister ses pages, y publier, publier sur le compte
// Instagram professionnel relié à la page.
export const PERMISSIONS_META = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
  // Pas de pages_manage_engagement / instagram_manage_comments : tant que ces
  // droits ne sont pas activés dans l'app Meta, Facebook refuse toute la
  // connexion. pages_read_engagement suffit pour lire les commentaires.
];

export type PageMeta = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};

export type CompteMeta = { plateforme: "facebook" | "instagram"; externe_id: string; nom: string; jeton: string };

// Une page Facebook donne un compte Facebook, plus un compte Instagram s'il y
// est relié (le jeton de la page sert pour les deux).
export function comptesDepuisPages(pages: PageMeta[]): CompteMeta[] {
  return pages.flatMap((p) => {
    const fb: CompteMeta = { plateforme: "facebook", externe_id: p.id, nom: p.name, jeton: p.access_token };
    const ig = p.instagram_business_account;
    return ig ? [fb, { plateforme: "instagram", externe_id: ig.id, nom: ig.username ?? p.name, jeton: p.access_token }] : [fb];
  });
}

// Droit facultatif demandé à part (bouton « Autoriser la lecture des vues ») :
// s'il n'est pas activé dans l'app Meta, seule cette demande échoue, la
// connexion déjà en place reste intacte.
export const DROIT_VUES_META = "read_insights";

export function urlDialogue(p: { appId: string; retour: string; etat: string; configId?: string; droitsEnPlus?: string[] }) {
  const q = new URLSearchParams({ client_id: p.appId, redirect_uri: p.retour, state: p.etat, response_type: "code" });
  // « Facebook Login for Business » : les droits viennent d'une configuration.
  // Avec une configuration, Meta renvoie un jeton par défaut : il faut
  // demander explicitement un code.
  if (p.configId) {
    q.set("config_id", p.configId);
    q.set("override_default_response_type", "true");
  }
  else q.set("scope", [...PERMISSIONS_META, ...(p.droitsEnPlus ?? [])].join(","));
  // Redemande un droit déjà refusé une fois.
  if (p.droitsEnPlus?.length) q.set("auth_type", "rerequest");
  return `https://www.facebook.com/${VERSION_GRAPH}/dialog/oauth?${q}`;
}

// --- Connexion Instagram directe (compte pro, sans page Facebook) -----------

export const PERMISSIONS_INSTAGRAM = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
];

export function urlDialogueInstagram(p: { appId: string; retour: string; etat: string }) {
  const q = new URLSearchParams({
    client_id: p.appId,
    redirect_uri: p.retour,
    response_type: "code",
    scope: PERMISSIONS_INSTAGRAM.join(","),
    state: p.etat,
    enable_fb_login: "0",
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

// Le jeton court arrive soit à plat, soit dans `data[0]` selon les versions.
export function lireJetonInstagram(json: unknown): { jeton: string; userId: string } | null {
  const j = json as { access_token?: string; user_id?: string | number; data?: { access_token?: string; user_id?: string | number }[] };
  const d = j?.access_token ? j : j?.data?.[0];
  return d?.access_token && d.user_id != null ? { jeton: d.access_token, userId: String(d.user_id) } : null;
}

// --- Commentaires (page Messages) ------------------------------------------------

export type CommentaireMeta = { id: string; postId: string; auteur: string; texte: string; date?: string; lien?: string | null; contexte?: string };

type PostFacebook = {
  id: string;
  message?: string;
  permalink_url?: string;
  comments?: { data?: { id: string; from?: { id?: string; name?: string }; message?: string; created_time?: string; permalink_url?: string }[] };
};

// Commentaires sous les derniers posts d'une page, sans ceux de la page elle-même.
export function commentairesDePostsFacebook(pageId: string, posts: PostFacebook[]): CommentaireMeta[] {
  return posts.flatMap((p) =>
    (p.comments?.data ?? [])
      .filter((c) => c.message && c.from?.id !== pageId)
      .map((c) => ({
        id: c.id,
        postId: p.id,
        auteur: c.from?.name ?? "Quelqu'un",
        texte: c.message ?? "",
        date: c.created_time,
        lien: c.permalink_url ?? p.permalink_url ?? null,
        contexte: p.message?.slice(0, 120),
      })),
  );
}

type MediaInstagram = {
  id: string;
  caption?: string;
  permalink?: string;
  comments?: { data?: { id: string; username?: string; text?: string; timestamp?: string }[] };
};

export function commentairesDeMediasInstagram(monPseudo: string | null, medias: MediaInstagram[]): CommentaireMeta[] {
  return medias.flatMap((m) =>
    (m.comments?.data ?? [])
      .filter((c) => c.text && (!monPseudo || c.username !== monPseudo.replace(/^@/, "")))
      .map((c) => ({
        id: c.id,
        postId: m.id,
        auteur: c.username ?? "Quelqu'un",
        texte: c.text ?? "",
        date: c.timestamp,
        lien: m.permalink ?? null,
        contexte: m.caption?.slice(0, 120),
      })),
  );
}
