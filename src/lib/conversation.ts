import { z } from "zod";

// Réponse à une conversation de prospection (LinkedIn, SMS, Messenger…) : le
// logiciel lit l'échange (texte collé ou capture d'écran) et écrit le PROCHAIN
// message, selon une méthode en cinq étapes. L'utilisateur l'envoie lui-même.
// Fonctions pures, testables.

export const ETAPES_CONVERSATION = ["ouverture", "diagnostic", "lien", "proposition", "sortie"] as const;
export type EtapeConversation = (typeof ETAPES_CONVERSATION)[number];

export const NOMS_ETAPES: Record<EtapeConversation, string> = {
  ouverture: "Ouverture",
  diagnostic: "Diagnostic",
  lien: "Lien avec son cas",
  proposition: "Proposition d'échange",
  sortie: "Sortie en douceur",
};

export const SYSTEME_CONVERSATION =
  "Tu es le conseiller commercial d'un fondateur de petite entreprise. Tu écris des messages courts, humains et honnêtes. Tu réponds uniquement en JSON valide.";

export function consigneConversation(p: { contexte: string | null; conversation: string; precisions?: string; avecCaptures?: boolean }) {
  return `Tu écris le PROCHAIN message d'une conversation de prospection par messagerie (LinkedIn le plus souvent). Le fondateur de la marque l'enverra lui-même.
${p.contexte ? `\nFiche de la marque (source de vérité, n'invente rien d'autre) :\n${p.contexte.slice(0, 5000)}\n` : ""}
Méthode en cinq étapes. Repère où en est la conversation et écris UNIQUEMENT le message de l'étape suivante :
1. ouverture (la personne vient d'accepter l'invitation, ou aucun échange) : un compliment précis tiré de son profil ou de ce qu'elle a écrit (jamais générique), puis UNE question ouverte sur son quotidien, sur le problème que la marque résout. Rien à vendre.
2. diagnostic : rebondis sur sa réponse en reprenant ses mots, puis une question qui lui fait mesurer le problème (temps passé par semaine, nombre de relances ou de devis, outil utilisé aujourd'hui).
3. lien : montre que tu as compris son cas (« toi, tu repasses dessus chaque semaine ») et relie UNE fonctionnalité réelle de la fiche à ce qu'elle vient de dire, sans promesse chiffrée.
4. proposition : propose un échange court (15 minutes au téléphone ou en visio), ou l'essai gratuit si la fiche en parle, avec « zéro pression, si ça colle pas on en reste là ».
5. sortie : si elle refuse, est pressée ou répond froidement, remercie, laisse la porte ouverte en une phrase et n'insiste jamais. Si elle demande à ne plus être contactée, confirme en une ligne.

Style : tutoiement si elle tutoie, sinon vouvoiement ; 2 à 5 phrases ; ton direct et chaleureux, comme un message écrit à la main ; une seule question par message ; aucune formule publicitaire ; pas d'emoji sauf si elle en met. Reprends ses mots.
Règles : n'invente aucun fait, chiffre, client, témoignage ni promesse. Ne prétends jamais avoir vécu quelque chose. Si elle demande si on parle à un robot ou à une IA, réponds honnêtement que le message est écrit par l'équipe avec l'aide d'un assistant IA.
${p.precisions?.trim() ? `\nPrécisions de l'utilisateur sur la personne : ${p.precisions.trim()}\n` : ""}
Conversation (du plus ancien au plus récent) :${p.avecCaptures ? "\n[Les captures d'écran jointes montrent la conversation : lis-les dans l'ordre.]" : ""}
${p.conversation.trim() ? p.conversation.trim().slice(-9000) : "(voir les captures)"}

Réponds UNIQUEMENT par un objet JSON valide :
{"etape": "ouverture, diagnostic, lien, proposition ou sortie", "message": "le texte exact à envoyer, prêt à copier", "pourquoi": "une phrase : pourquoi ce message à cette étape", "suite": "une phrase : quoi faire si elle répond oui, non ou ne répond pas"}`;
}

export type ReponseConversation = { etape: EtapeConversation; message: string; pourquoi: string; suite: string };

const texte = z.string().catch("").transform((x) => x.trim());
const schema = z.object({ etape: texte, message: texte, pourquoi: texte, suite: texte });

// Texte brut prêt à envoyer : pas de guillemets englobants ni de markdown.
export const nettoyerMessage = (m: string) =>
  m
    .replace(/^["«“]\s*|\s*["»”]$/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .trim();

export function lireReponseConversation(brut: string): ReponseConversation | null {
  const debut = brut.indexOf("{");
  const fin = brut.lastIndexOf("}");
  let lu: z.infer<typeof schema> | null = null;
  if (debut !== -1 && fin > debut) {
    try {
      lu = schema.parse(JSON.parse(brut.slice(debut, fin + 1)));
    } catch {
      lu = null;
    }
  }
  const message = nettoyerMessage(lu?.message || (debut === -1 ? brut : ""));
  if (message.length < 10) return null;
  const etape = ETAPES_CONVERSATION.find((e) => e === (lu?.etape ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")) ?? "diagnostic";
  return { etape, message, pourquoi: lu?.pourquoi ?? "", suite: lu?.suite ?? "" };
}
