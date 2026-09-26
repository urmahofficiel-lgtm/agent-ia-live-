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
