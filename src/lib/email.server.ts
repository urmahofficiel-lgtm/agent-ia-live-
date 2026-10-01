import { clientMoteur } from "./supabase-serveur";
import {
  adresseValide,
  composerEmail,
  domaineAutorise,
  expediteur,
  lienDesinscription,
} from "./email";
import { redigerMessageProspect } from "./prospection.server";
import type { ProspectARediger } from "./prospection";

// Agent e-mail : rédaction (IA) et envoi par Resend (clé RESEND_API_KEY,
// envoi seul). Utilisé par le moteur (/api/agent/emails) et par le bouton
// « Envoyer l'e-mail » de la page Prospection.

export const emailConfigure = () => Boolean(process.env.RESEND_API_KEY);

type AEnvoyer = {
  email: string;
  objet: string | null;
  texte: string | null;
  genre: string | null;
  jeton: string;
  expediteur: string;
  reponse: string | null;
  marque: string | null;
  site: string | null;
};

async function envoyerResend(
  a: AEnvoyer,
  cleIdempotence: string,
): Promise<string> {
  const cle = process.env.RESEND_API_KEY;
  if (!cle)
    throw new Error("Envoi d'e-mails non configuré (clé Resend manquante).");
  if (
    !adresseValide(a.expediteur) ||
    !domaineAutorise(a.expediteur, process.env.EMAIL_DOMAINES)
  ) {
    throw new Error(
      "Adresse d'expédition non autorisée : elle doit appartenir à un domaine vérifié.",
    );
  }
  if (!adresseValide(a.email)) throw new Error("adresse e-mail invalide");
  const mail = composerEmail({
    objet: a.objet ?? "",
    texte: a.texte ?? "",
    marque: a.marque,
    site: a.site,
    jeton: a.jeton,
  });
  const desinscription = lienDesinscription(a.jeton);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cle}`,
      "Content-Type": "application/json",
      "Idempotency-Key": cleIdempotence,
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      from: expediteur(a.marque, a.expediteur),
      to: [a.email.trim()],
      reply_to: a.reponse && adresseValide(a.reponse) ? a.reponse : undefined,
      subject: mail.objet,
      text: mail.texte,
      html: mail.html,
      headers: {
        "List-Unsubscribe": `<${desinscription}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [{ name: "type", value: "prospection" }],
    }),
  });
  const json = (await r.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!r.ok || !json.id)
    throw new Error(
      `Resend a refusé l'envoi (${r.status}) : ${json.message ?? "erreur"}`,
    );
  return json.id;
}

// Envoie le brouillon e-mail d'un prospect et le marque « contacté ».
export async function envoyerEmailProspect(
  secret: string,
  userId: string,
  prospectId: string,
) {
  const sb = clientMoteur();
  const { data, error } = await sb.rpc("agent_email_a_envoyer", {
    p_secret: secret,
    p_user: userId,
    p_id: prospectId,
  });
  if (error) throw new Error(error.message);
  const a = data as AEnvoyer;
  const jour = new Date().toISOString().slice(0, 10);
  const id = await envoyerResend(
    a,
    `prospect-${prospectId}-${a.genre ?? "premier"}-${jour}`,
  );
  const { error: e2 } = await sb.rpc("agent_email_envoye", {
    p_secret: secret,
    p_user: userId,
    p_id: prospectId,
    p_contenu: `${a.objet ? `${a.objet}\n\n` : ""}${a.texte ?? ""}`,
    p_email_id: id,
  });
  if (e2) throw new Error(e2.message);
  return id;
}

type ATraiter = {
  prospect_id: string;
  user_id: string;
  relance: boolean;
  validation: boolean;
};

// Passage du moteur : rédige les e-mails du moment ; les envoie aussitôt si
// l'utilisateur n'a pas demandé à valider.
export async function traiterEmails(secret: string, echeance: number) {
  const sb = clientMoteur();
  const { data, error } = await sb.rpc("agent_emails_a_traiter", {
    p_secret: secret,
  });
  if (error) throw new Error(error.message);
  const bilan = { rediges: 0, envoyes: 0, erreurs: 0 };
  for (const t of (data ?? []) as ATraiter[]) {
    if (Date.now() > echeance) break;
    try {
      const { data: infos, error: e1 } = await sb.rpc(
        "agent_prospect_a_rediger",
        {
          p_secret: secret,
          p_user: t.user_id,
          p_id: t.prospect_id,
          p_relance: t.relance,
        },
      );
      if (e1) throw new Error(e1.message);
      const brouillon = await redigerMessageProspect(
        infos as ProspectARediger,
        "email",
      );
      const { error: e2 } = await sb.rpc(
        "agent_enregistrer_brouillon_prospect",
        {
          p_secret: secret,
          p_user: t.user_id,
          p_id: t.prospect_id,
          p_brouillon: brouillon,
        },
      );
      if (e2) throw new Error(e2.message);
      bilan.rediges++;
      if (!t.validation && emailConfigure()) {
        await envoyerEmailProspect(secret, t.user_id, t.prospect_id);
        bilan.envoyes++;
      }
    } catch (e) {
      bilan.erreurs++;
      console.warn(
        "Agent e-mail",
        t.prospect_id,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return bilan;
}
