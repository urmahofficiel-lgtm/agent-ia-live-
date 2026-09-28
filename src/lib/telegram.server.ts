import type { Media } from "./zernio.server";

// Telegram : un bot (créé gratuitement avec @BotFather) publie dans un canal
// ou un groupe dont il est administrateur. Aucune validation nécessaire.
export type IdentifiantsTelegram = { token: string; chat: string };

async function bot<T>(token: string, methode: string, params: Record<string, unknown>): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${token.trim()}/${methode}`, {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!json.ok) {
    if (r.status === 401 || r.status === 404) throw new Error("Telegram : jeton du bot invalide.");
    throw new Error(`Telegram : ${json.description ?? `erreur ${r.status}`}`);
  }
  return json.result as T;
}

// « @moncanal », « t.me/moncanal » ou un identifiant numérique.
export function normaliserChat(chat: string) {
  const c = chat.trim().replace(/^(https?:\/\/)?t\.me\//, "").replace(/\/$/, "");
  return /^-?\d+$/.test(c) ? c : `@${c.replace(/^@/, "")}`;
}

// Vérifie le bot et son accès au canal ; renvoie le nom à afficher.
export async function verifierTelegram(c: IdentifiantsTelegram) {
  const moi = await bot<{ username: string }>(c.token, "getMe", {});
  const chat = await bot<{ id: number; title?: string; username?: string }>(c.token, "getChat", { chat_id: normaliserChat(c.chat) }).catch(
    () => {
      throw new Error("Telegram : canal introuvable. Ajoutez le bot comme administrateur du canal, puis réessayez.");
    },
  );
  const membre = await bot<{ status: string }>(c.token, "getChatMember", { chat_id: chat.id, user_id: Number(c.token.split(":")[0]) });
  if (!["administrator", "creator"].includes(membre.status)) {
    throw new Error(`Telegram : le bot @${moi.username} doit être administrateur du canal pour publier.`);
  }
  return { chatId: String(chat.id), nom: chat.title ?? chat.username ?? String(chat.id) };
}

const LEGENDE_MAX = 1024;

// Texte seul, photo ou vidéo. Une légende trop longue part en message séparé.
export async function publierTelegram(c: IdentifiantsTelegram, texte: string, media: Media | null) {
  const chat_id = normaliserChat(c.chat);
  const propre = texte.replace(/\*\*/g, "");
  if (!media) return String((await bot<{ message_id: number }>(c.token, "sendMessage", { chat_id, text: propre })).message_id);
  const courte = propre.length <= LEGENDE_MAX;
  const envoi = await bot<{ message_id: number }>(c.token, media.type === "video" ? "sendVideo" : "sendPhoto", {
    chat_id,
    [media.type === "video" ? "video" : "photo"]: media.url,
    ...(courte ? { caption: propre } : {}),
  });
  if (!courte) await bot(c.token, "sendMessage", { chat_id, text: propre });
  return String(envoi.message_id);
}
