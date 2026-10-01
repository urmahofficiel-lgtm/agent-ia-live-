// Agent e-mail : mise en forme des e-mails de prospection (texte + HTML),
// avec l'identité de l'expéditeur et le lien de désinscription en 1 clic.

export const URL_APP = "https://agent-ia-live.vercel.app";

export const lienDesinscription = (jeton: string) =>
  `${URL_APP}/desinscription/${jeton}`;

// Domaines d'envoi autorisés (vérifiés dans Resend). Variable
// EMAIL_DOMAINES : liste séparée par des virgules.
export function domaineAutorise(
  adresse: string,
  domaines: string | undefined,
): boolean {
  const liste = (domaines ?? "btp-ecosystem.com")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const domaine = adresse.split("@")[1]?.toLowerCase() ?? "";
  return liste.some((d) => domaine === d || domaine.endsWith(`.${d}`));
}

export const adresseValide = (e: string) =>
  /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,24}$/i.test(e.trim());

// « BTP Ecosystem <prospection@btp-ecosystem.com> » (sans caractère qui
// casserait l'en-tête).
export function expediteur(marque: string | null, adresse: string): string {
  const nom = (marque ?? "").replace(/[<>"\r\n]/g, "").trim();
  return nom ? `${nom} <${adresse}>` : adresse;
}

const echapper = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const liens = (s: string) =>
  s.replace(
    /https?:\/\/[^\s<]+[^\s<.,;:!?)]/g,
    (u) => `<a href="${u}" style="color:#2563eb">${u}</a>`,
  );

export type EmailPret = { objet: string; texte: string; html: string };

export function composerEmail(p: {
  objet: string;
  texte: string;
  marque: string | null;
  site: string | null;
  jeton: string;
}): EmailPret {
  const lien = lienDesinscription(p.jeton);
  const signature = [p.marque, p.site].filter(Boolean).join(" · ");
  const pied = [signature, `Se désinscrire en 1 clic : ${lien}`]
    .filter(Boolean)
    .join("\n");
  const texte = `${p.texte.trim()}\n\n${pied}`;
  const corps = echapper(p.texte.trim())
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p style="margin:0 0 14px 0">${liens(para).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#111111">
${corps}
<p style="margin:24px 0 0 0;font-size:12px;line-height:18px;color:#6b7280">${signature ? `${liens(echapper(signature))}<br>` : ""}Vous ne souhaitez plus recevoir nos messages ? <a href="${lien}" style="color:#6b7280">Se désinscrire en 1 clic</a>.</p>
</td></tr></table></body></html>`;
  return {
    objet: p.objet.trim() || "Une idée pour votre activité",
    texte,
    html,
  };
}
