// Zernio : service qui détient les autorisations des réseaux sociaux et
// publie à notre place. Doc : https://docs.zernio.com
const BASE = "https://zernio.com/api/v1";

export function zernioConfigure() {
  return Boolean(process.env.ZERNIO_API_KEY);
}

async function appel<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  const cle = process.env.ZERNIO_API_KEY;
  if (!cle) throw new Error("Clé ZERNIO_API_KEY absente des variables Vercel.");
  const r = await fetch(`${BASE}${chemin}`, {
    ...init,
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json", ...init.headers },
  });
  const texte = await r.text();
  const json = texte ? JSON.parse(texte) : {};
  if (!r.ok) throw new Error(json.error || `Zernio ${r.status}`);
  return json as T;
}

export async function creerProfil(nom: string) {
  const r = await appel<{ profile: { _id: string } }>("/profiles", {
    method: "POST",
    body: JSON.stringify({ name: nom }),
  });
  return r.profile._id;
}

export async function urlAutorisation(plateforme: string, profileId: string, retour: string) {
  const q = new URLSearchParams({ profileId, redirect_url: retour });
  const r = await appel<{ authUrl: string }>(`/connect/${plateforme}?${q}`);
  return r.authUrl;
}

export type CompteZernio = {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  isActive?: boolean;
  profileId?: string | { _id: string };
};

export async function listerComptes(profileId: string) {
  const r = await appel<{ accounts: CompteZernio[] }>(`/accounts?${new URLSearchParams({ profileId })}`);
  // Filtre défensif : ne garder que les comptes de ce profil.
  return r.accounts.filter((a) => {
    const p = typeof a.profileId === "object" ? a.profileId?._id : a.profileId;
    return !p || p === profileId;
  });
}

export async function publier(plateforme: string, accountId: string, contenu: string) {
  const r = await appel<{ post: { _id: string; status: string } }>("/posts", {
    method: "POST",
    body: JSON.stringify({
      content: contenu,
      publishNow: true,
      platforms: [{ platform: plateforme, accountId }],
    }),
  });
  return r.post;
}

// --- Boîte de réception (commentaires et messages privés) --------------------

export type Conversation = {
  id: string;
  platform: string;
  accountId: string;
  participantName?: string;
  lastMessage?: string;
  updatedTime?: string;
  unreadCount?: number | null;
  url?: string | null;
};

export async function listerConversations(profileId: string) {
  const q = new URLSearchParams({ profileId, limit: "30", status: "active" });
  const r = await appel<{ data: Conversation[] }>(`/inbox/conversations?${q}`);
  return r.data ?? [];
}

type PostCommente = { id: string; platform: string; accountId: string; content?: string; commentCount?: number };

export type Commentaire = {
  id: string;
  message: string;
  createdTime?: string;
  from?: { name?: string; username?: string; isOwner?: boolean };
  canReply?: boolean;
  replies?: { from?: { isOwner?: boolean } }[];
  url?: string | null;
};

// Commentaires récents des tiers sur nos publications, auxquels on n'a pas
// encore répondu.
export async function listerCommentaires(profileId: string) {
  const q = new URLSearchParams({ profileId, minComments: "1", limit: "8" });
  const posts = (await appel<{ data: PostCommente[] }>(`/inbox/comments?${q}`)).data ?? [];
  const resultats: (Commentaire & { postId: string; accountId: string; platform: string; post: string })[] = [];
  for (const p of posts.slice(0, 6)) {
    try {
      const r = await appel<{ comments: Commentaire[] }>(
        `/inbox/comments/${encodeURIComponent(p.id)}?${new URLSearchParams({ accountId: p.accountId, limit: "20" })}`,
      );
      for (const c of r.comments ?? []) {
        const dejaRepondu = c.replies?.some((x) => x.from?.isOwner);
        if (c.from?.isOwner || dejaRepondu || c.canReply === false) continue;
        resultats.push({ ...c, postId: p.id, accountId: p.accountId, platform: p.platform, post: (p.content ?? "").slice(0, 120) });
      }
    } catch (e) {
      console.warn("commentaires", p.id, e);
    }
  }
  return resultats;
}

export async function repondreCommentaire(postId: string, accountId: string, commentId: string, texte: string) {
  await appel(`/inbox/comments/${encodeURIComponent(postId)}`, {
    method: "POST",
    body: JSON.stringify({ accountId, commentId, message: texte }),
  });
}

export async function envoyerMessage(conversationId: string, accountId: string, texte: string) {
  await appel(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ accountId, message: texte }),
  });
}
