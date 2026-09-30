import { createHash } from "node:crypto";
import { z } from "zod";
import { PLATEFORMES } from "./plateformes";
import { CATEGORIES } from "./osm";
import { liensContact, messageErreurProspect, type ProspectARediger } from "./prospection";
import { chercherEntreprises, redigerMessageProspect } from "./prospection.server";
import { clientMoteur } from "./supabase-serveur";

// Serveur MCP (Model Context Protocol) : permet de piloter son agent depuis
// Claude, ChatGPT ou tout client compatible. Transport « Streamable HTTP » en
// mode sans session : chaque requête POST contient un message JSON-RPC et
// reçoit sa réponse en JSON. L'utilisateur est identifié par la clé secrète
// présente dans l'adresse du connecteur (seule son empreinte est stockée).

export const empreinteCle = (cle: string) => createHash("sha256").update(cle).digest("hex");

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const RESEAUX = PLATEFORMES.filter((p) => p.categorie === "reseau" || p.categorie === "local").map((p) => p.id);
const STATUTS = ["a_valider", "en_attente", "a_partager", "en_cours", "terminee", "echouee", "annulee"] as const;
const STATUTS_PROSPECT = ["nouveau", "contacte", "relance", "a_repondu", "client", "refus", "ne_plus_contacter"] as const;
const MARQUES_PROSPECT = ["contacte", "a_repondu", "client", "refus", "ne_plus_contacter"] as const;
const CATEGORIES_ID = CATEGORIES.map((c) => c.id) as [string, ...string[]];

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
type Outil = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  schema: z.ZodTypeAny;
  executer: (args: never, appel: Appel) => Promise<unknown>;
};
type Appel = <T>(fonction: string, params: Record<string, unknown>) => Promise<T>;

const OUTILS: Outil[] = [
  {
    name: "agent_comptes",
    title: "Réseaux connectés",
    description: "Liste les réseaux sociaux connectés à l'agent (sur lesquels il peut publier).",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    schema: z.object({}),
    executer: (_a, appel) => appel("mcp_comptes", {}),
  },
  {
    name: "agent_publications",
    title: "Publications",
    description:
      "Liste les publications de l'agent, les plus récentes d'abord : texte, image, vidéo, réseau, statut et date prévue. " +
      "Statuts : a_valider (brouillon à valider), en_attente (planifiée), a_partager (Facebook perso, à partager depuis le téléphone), " +
      "en_cours, terminee (publiée), echouee, annulee.",
    inputSchema: {
      type: "object",
      properties: {
        statut: { type: "string", enum: STATUTS, description: "Filtrer par statut (facultatif)." },
        limite: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    schema: z.object({ statut: z.enum(STATUTS).optional(), limite: z.number().int().min(1).max(50).optional() }),
    executer: (a: { statut?: string; limite?: number }, appel) =>
      appel("mcp_publications", { p_statut: a.statut ?? null, p_limite: a.limite ?? 20 }),
  },
  {
    name: "agent_creer_publication",
    title: "Créer une publication",
    description:
      "Demande une nouvelle publication à l'agent (une par réseau). L'agent rédige le texte et crée l'image à son prochain passage " +
      "(toutes les 5 minutes) ; pour Facebook et Instagram il crée aussi un Reel. Par défaut la publication attend la validation " +
      "de l'utilisateur ; avec publier_directement, elle part seule à la date prévue (ou tout de suite si aucune date).",
    inputSchema: {
      type: "object",
      properties: {
        sujet: { type: "string", description: "Ce que doit dire la publication (consigne pour l'agent)." },
        titre: { type: "string", description: "Titre court, pour s'y retrouver (facultatif)." },
        reseaux: { type: "array", items: { type: "string", enum: RESEAUX }, minItems: 1, description: "Réseaux visés." },
        quand: { type: "string", format: "date-time", description: "Date et heure de publication, ISO 8601 avec fuseau (facultatif)." },
        publier_directement: { type: "boolean", default: false, description: "Sans validation de l'utilisateur." },
      },
      required: ["sujet", "reseaux"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    schema: z.object({
      sujet: z.string().min(3).max(4000),
      titre: z.string().max(200).optional(),
      reseaux: z.array(z.enum(RESEAUX as [string, ...string[]])).min(1).max(12),
      quand: z.string().datetime({ offset: true }).optional(),
      publier_directement: z.boolean().optional(),
    }),
    executer: (a: { sujet: string; titre?: string; reseaux: string[]; quand?: string; publier_directement?: boolean }, appel) =>
      appel("mcp_creer_publication", {
        p_titre: a.titre || a.sujet.slice(0, 80),
        p_consigne: a.sujet,
        p_reseaux: [...new Set(a.reseaux)],
        p_planifiee_pour: a.quand ?? null,
        p_valider: a.publier_directement ?? false,
      }),
  },
  {
    name: "agent_modifier_publication",
    title: "Agir sur une publication",
    description:
      "Actions sur une publication : valider (la planifier), publier_maintenant (l'agent la publie à son prochain passage, " +
      "sous 5 minutes), reprogrammer (nouvelle date dans « quand »), annuler, modifier_texte (nouveau texte dans « texte »).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Identifiant de la publication (voir agent_publications)." },
        action: { type: "string", enum: ["valider", "publier_maintenant", "reprogrammer", "annuler", "modifier_texte"] },
        quand: { type: "string", format: "date-time", description: "Pour reprogrammer." },
        texte: { type: "string", description: "Pour modifier_texte." },
      },
      required: ["id", "action"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    schema: z
      .object({
        id: z.string().uuid(),
        action: z.enum(["valider", "publier_maintenant", "reprogrammer", "annuler", "modifier_texte"]),
        quand: z.string().datetime({ offset: true }).optional(),
        texte: z.string().min(1).max(5000).optional(),
      })
      .refine((a) => a.action !== "reprogrammer" || a.quand, { message: "« quand » est requis pour reprogrammer." })
      .refine((a) => a.action !== "modifier_texte" || a.texte, { message: "« texte » est requis pour modifier_texte." }),
    executer: (a: { id: string; action: string; quand?: string; texte?: string }, appel) =>
      appel("mcp_modifier_publication", {
        p_id: a.id,
        p_action: a.action,
        p_planifiee_pour: a.quand ?? null,
        p_texte: a.texte ?? null,
      }),
  },
  {
    name: "agent_journal",
    title: "Journal en direct",
    description: "Ce que l'agent a fait récemment, étape par étape (rédaction, image, vidéo, publication, erreurs).",
    inputSchema: { type: "object", properties: { limite: { type: "integer", minimum: 1, maximum: 100, default: 20 } } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    schema: z.object({ limite: z.number().int().min(1).max(100).optional() }),
    executer: (a: { limite?: number }, appel) => appel("mcp_journal", { p_limite: a.limite ?? 20 }),
  },
  {
    name: "agent_prospects",
    title: "Prospects",
    description:
      "Liste les prospects (entreprises à démarcher) du mini-CRM, les plus récents d'abord : coordonnées publiques, métier, statut, " +
      "message à valider éventuel et indicateur a_relancer. Statuts : nouveau, contacte, relance, a_repondu, client, refus, " +
      "ne_plus_contacter (opposition : ne jamais recontacter). Filtres : a_valider (message rédigé à relire) ou a_relancer " +
      "(contacté sans réponse depuis le délai de relance). Indique aussi le nombre de contacts encore possibles aujourd'hui.",
    inputSchema: {
      type: "object",
      properties: {
        statut: { type: "string", enum: STATUTS_PROSPECT, description: "Filtrer par statut (facultatif)." },
        filtre: { type: "string", enum: ["a_valider", "a_relancer"], description: "Filtre de suivi (facultatif)." },
        limite: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    schema: z.object({
      statut: z.enum(STATUTS_PROSPECT).optional(),
      filtre: z.enum(["a_valider", "a_relancer"]).optional(),
      limite: z.number().int().min(1).max(100).optional(),
    }),
    executer: (a: { statut?: string; filtre?: string; limite?: number }, appel) =>
      appel("mcp_prospects", { p_statut: a.statut ?? null, p_filtre: a.filtre ?? null, p_limite: a.limite ?? 20 }),
  },
  {
    name: "agent_chercher_prospects",
    title: "Chercher des prospects",
    description:
      "Cherche des entreprises d'une activité dans une ville (données publiques OpenStreetMap) et les ajoute au CRM, sans doublon, " +
      "avec téléphone, site et e-mail quand ils sont renseignés. Ne contacte personne. Activités possibles : " +
      CATEGORIES.map((c) => `${c.id} (${c.nom})`).join(", ") +
      ".",
    inputSchema: {
      type: "object",
      properties: {
        categorie: { type: "string", enum: CATEGORIES_ID, description: "Activité recherchée." },
        ville: { type: "string", description: "Nom exact de la commune (ex. Lyon)." },
        max: { type: "integer", minimum: 1, maximum: 100, default: 30, description: "Nombre maximum d'entreprises." },
      },
      required: ["categorie", "ville"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    schema: z.object({
      categorie: z.enum(CATEGORIES_ID),
      ville: z.string().trim().min(2).max(80),
      max: z.number().int().min(1).max(100).optional(),
    }),
    executer: async (a: { categorie: string; ville: string; max?: number }, appel) => {
      const trouves = await chercherEntreprises(a.categorie, a.ville, a.max ?? 30);
      return appel("mcp_ajouter_prospects", {
        p_categorie: CATEGORIES.find((c) => c.id === a.categorie)!.nom,
        p_ville: a.ville,
        p_liste: trouves,
      });
    },
  },
  {
    name: "agent_rediger_message_prospect",
    title: "Rédiger un message de prospection",
    description:
      "L'IA rédige un message court et personnalisé (offre de la marque × métier du prospect) : premier contact, ou relance si le " +
      "prospect a déjà été contacté. Le message est enregistré « à valider » et N'EST PAS ENVOYÉ : l'utilisateur le relit puis " +
      "l'envoie lui-même avec les liens fournis (e-mail, WhatsApp, SMS), puis marque le prospect contacté (agent_marquer_prospect). " +
      "Une phrase permettant de s'opposer (répondre STOP) est ajoutée automatiquement. Refusé pour un prospect ne_plus_contacter.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Identifiant du prospect (voir agent_prospects)." },
        canal: { type: "string", enum: ["email", "message"], description: "email ou message (SMS/WhatsApp). Par défaut : e-mail s'il est connu." },
        relance: { type: "boolean", default: false, description: "Forcer une relance." },
      },
      required: ["id"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    schema: z.object({ id: z.string().uuid(), canal: z.enum(["email", "message"]).optional(), relance: z.boolean().optional() }),
    executer: async (a: { id: string; canal?: "email" | "message"; relance?: boolean }, appel) => {
      const infos = await appel<ProspectARediger>("mcp_prospect_a_rediger", { p_id: a.id, p_relance: a.relance ?? false });
      const brouillon = await redigerMessageProspect(infos, a.canal);
      await appel("mcp_enregistrer_brouillon_prospect", { p_id: a.id, p_brouillon: brouillon });
      return {
        prospect: { id: infos.id, nom: infos.nom, email: infos.email, telephone: infos.telephone },
        brouillon,
        envoyer_avec: liensContact(infos, brouillon),
        a_faire: "Relire et envoyer soi-même, puis agent_marquer_prospect avec statut « contacte ». Rien n'a été envoyé.",
      };
    },
  },
  {
    name: "agent_marquer_prospect",
    title: "Mettre à jour un prospect",
    description:
      "Change le statut d'un prospect : contacte (l'utilisateur a envoyé le message lui-même ; compte dans la limite de contacts du " +
      "jour, devient « relance » s'il avait déjà été contacté), a_repondu, client, refus, ne_plus_contacter (opposition définitive, " +
      "irréversible depuis le connecteur). N'envoie aucun message.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Identifiant du prospect." },
        statut: { type: "string", enum: MARQUES_PROSPECT },
        note: { type: "string", description: "Texte envoyé ou réponse reçue, pour l'historique (facultatif)." },
      },
      required: ["id", "statut"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    schema: z.object({ id: z.string().uuid(), statut: z.enum(MARQUES_PROSPECT), note: z.string().max(4000).optional() }),
    executer: (a: { id: string; statut: string; note?: string }, appel) =>
      appel("mcp_marquer_prospect", { p_id: a.id, p_statut: a.statut, p_contenu: a.note ?? null }),
  },
];

// Erreurs de la base traduites en consignes utiles pour l'IA qui appelle.
function messageErreur(brut: string) {
  if (/cle invalide/.test(brut)) return "Clé du connecteur invalide ou supprimée : recréez l'adresse dans Agent IA Live → Réglages.";
  const prospect = messageErreurProspect(brut);
  if (prospect) return prospect;
  if (/introuvable/.test(brut)) return "Publication introuvable : vérifiez l'identifiant avec agent_publications.";
  if (/deja publiee/.test(brut)) return "Cette publication est déjà publiée ou en cours : action impossible.";
  return `Erreur : ${brut}`;
}

export class CleInvalide extends Error {}

export function creerAppel(empreinte: string): Appel {
  return async <T>(fonction: string, params: Record<string, unknown>) => {
    const { data, error } = await clientMoteur().rpc(fonction, {
      p_secret: process.env.AGENT_TICK_SECRET ?? "",
      p_empreinte: empreinte,
      ...params,
    });
    if (error) {
      if (/cle invalide/.test(error.message)) throw new CleInvalide(messageErreur(error.message));
      throw new Error(messageErreur(error.message));
    }
    return data as T;
  };
}

const reponse = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0" as const, id: id ?? null, result });
const erreur = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } });

// Traite un message JSON-RPC ; null pour une notification (pas de réponse).
export async function traiterMessage(msg: Rpc, appel: Appel) {
  const notification = msg.id === undefined;
  switch (msg.method) {
    case "initialize": {
      const demandee = String(msg.params?.protocolVersion ?? "");
      await appel("mcp_comptes", {}); // vérifie la clé dès la connexion
      return reponse(msg.id, {
        protocolVersion: VERSIONS.includes(demandee) ? demandee : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "agent-ia-live", title: "Agent IA Live", version: "1.0.0" },
        instructions:
          "Agent IA Live prépare et publie des contenus sur les réseaux sociaux de l'utilisateur. " +
          "Pour publier : agent_creer_publication, puis suivre avec agent_publications ou agent_journal. " +
          "L'agent passe toutes les 5 minutes : le texte, l'image et la vidéo arrivent quelques minutes après la demande. " +
          "Prospection : agent_chercher_prospects trouve des entreprises (activité + ville), agent_rediger_message_prospect prépare " +
          "un message à valider, agent_prospects suit le CRM (filtre a_relancer pour les relances). L'agent n'envoie JAMAIS de message " +
          "de prospection : l'utilisateur l'envoie lui-même, puis agent_marquer_prospect (contacte). Ne recontactez jamais un " +
          "prospect ne_plus_contacter et respectez la limite de contacts du jour.",
      });
    }
    case "ping":
      return reponse(msg.id, {});
    case "tools/list":
      return reponse(msg.id, {
        tools: OUTILS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
      });
    case "tools/call": {
      const outil = OUTILS.find((o) => o.name === msg.params?.name);
      if (!outil) return erreur(msg.id, -32602, `Outil inconnu : ${String(msg.params?.name)}`);
      const args = outil.schema.safeParse(msg.params?.arguments ?? {});
      if (!args.success) {
        const detail = args.error.issues.map((i) => `${i.path.join(".") || "arguments"} : ${i.message}`).join(" ; ");
        return reponse(msg.id, { content: [{ type: "text", text: `Paramètres invalides — ${detail}` }], isError: true });
      }
      try {
        const resultat = await outil.executer(args.data as never, appel);
        return reponse(msg.id, {
          content: [{ type: "text", text: JSON.stringify(resultat, null, 2) }],
          structuredContent: Array.isArray(resultat) ? { resultats: resultat } : (resultat as object),
        });
      } catch (e) {
        if (e instanceof CleInvalide) throw e;
        return reponse(msg.id, { content: [{ type: "text", text: e instanceof Error ? e.message : "Erreur" }], isError: true });
      }
    }
    default:
      return notification ? null : erreur(msg.id, -32601, `Méthode non prise en charge : ${msg.method}`);
  }
}
