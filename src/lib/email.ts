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

// Fiche professionnelle placée sous chaque e-mail : identité de l'expéditeur,
// coordonnées, réseaux et mentions légales.
export type SignatureEmail = {
  nom: string;
  fonction: string;
  entreprise: string;
  logo: string | null;
  telephone: string | null;
  email: string | null;
  site: string | null;
  reseaux: { nom: string; url: string }[];
  mentions: string | null;
};

const SIGNATURE_BTP: SignatureEmail = {
  nom: "Younes Bekka",
  fonction: "Fondateur",
  entreprise: "BTP Ecosystem",
  logo: "https://www.btp-ecosystem.com/icon-512.png",
  telephone: "07 44 56 30 43",
  email: "contact@btp-ecosystem.com",
  site: "https://www.btp-ecosystem.com",
  reseaux: [
    { nom: "LinkedIn", url: "https://www.linkedin.com/in/btp-ecosystem-329158422" },
    { nom: "Facebook", url: "https://www.facebook.com/people/Btp-Ecosystem/61591925249449/" },
    { nom: "Instagram", url: "https://www.instagram.com/btpecosystem/" },
    { nom: "TikTok", url: "https://www.tiktok.com/@btpecosystem" },
  ],
  mentions: "BTP Ecosystem · 8 rue Jean Royer, 33300 Bordeaux · SIREN 930 526 579",
};

// Signature de la marque (réglée dans le code pour l'instant : BTP Ecosystem ;
// les autres marques n'ont qu'une signature simple, sans fiche).
export function signatureMarque(
  marque: string | null,
  site: string | null,
): SignatureEmail | null {
  const pourBtp =
    /btp[\s-]?ecosystem/i.test(marque ?? "") ||
    /btp-ecosystem\.com/i.test(site ?? "");
  return pourBtp ? SIGNATURE_BTP : null;
}

const telephoneLien = (t: string) => `tel:+33${t.replace(/\D/g, "").replace(/^0/, "")}`;

function signatureTexte(g: SignatureEmail): string {
  return [
    `${g.nom} — ${g.fonction}, ${g.entreprise}`,
    [g.telephone && `Tél. ${g.telephone}`, g.email, g.site]
      .filter(Boolean)
      .join(" · "),
    g.reseaux.map((r) => `${r.nom} : ${r.url}`).join("\n"),
    g.mentions,
  ]
    .filter(Boolean)
    .join("\n");
}

function signatureHtml(g: SignatureEmail): string {
  const lien = (url: string, texte: string, couleur = "#c2410c") =>
    `<a href="${echapper(url)}" style="color:${couleur};text-decoration:none">${echapper(texte)}</a>`;
  const contacts = [
    g.telephone && lien(telephoneLien(g.telephone), g.telephone, "#111111"),
    g.email && lien(`mailto:${g.email}`, g.email, "#111111"),
    g.site && lien(g.site, g.site.replace(/^https?:\/\/(www\.)?/, ""), "#111111"),
  ].filter(Boolean);
  const logo = g.logo
    ? `<td width="76" valign="top" style="padding-right:16px"><img src="${echapper(g.logo)}" width="64" height="64" alt="${echapper(g.entreprise)}" style="display:block;border-radius:14px;border:0" /></td>`
    : "";
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;border-top:3px solid #ea580c;padding-top:16px;font-family:Arial,Helvetica,sans-serif"><tr>${logo}<td valign="top" style="font-size:14px;line-height:21px;color:#111111">
<div style="font-size:16px;font-weight:bold">${echapper(g.nom)}</div>
<div style="color:#6b7280">${echapper(g.fonction)} · ${echapper(g.entreprise)}</div>
<div style="margin-top:6px">${contacts.join(' <span style="color:#d1d5db">|</span> ')}</div>
${g.reseaux.length ? `<div style="margin-top:6px;font-size:13px">${g.reseaux.map((r) => lien(r.url, r.nom)).join(' <span style="color:#d1d5db">·</span> ')}</div>` : ""}
</td></tr></table>${g.mentions ? `<p style="margin:10px 0 0 0;font-size:11px;line-height:16px;color:#6b7280">${echapper(g.mentions)}</p>` : ""}`;
}

// Document joint aux e-mails (choisi dans les réglages) : nom de fichier tiré
// de l'adresse, libellé affiché au-dessus de la fiche.
export type DocumentJoint = { filename: string; path: string; libelle: string };
export function documentJoint(
  url: string | null | undefined,
  nom: string | null | undefined,
): DocumentJoint | null {
  const adresse = url?.trim() ?? "";
  if (!/^https:\/\/\S+$/.test(adresse)) return null;
  let fichier = "";
  try {
    fichier = decodeURIComponent(new URL(adresse).pathname.split("/").pop() ?? "");
  } catch {
    return null;
  }
  // Sans le préfixe d'horodatage ajouté au dépôt (« 1759…-nom.pdf »).
  fichier = fichier.replace(/^\d{10,}-/, "").replace(/[^\w.\- ]/g, "_");
  if (!/\.pdf$/i.test(fichier)) fichier = `${fichier || "document"}.pdf`;
  return {
    filename: fichier,
    path: adresse,
    libelle: nom?.trim() || `${fichier.replace(/\.pdf$/i, "")} (PDF)`,
  };
}

// Avec la fiche professionnelle : retire de la fin du corps ce que l'IA a pu
// ajouter et qui ferait doublon (signature « Marque / site », mention STOP).
export function corpsSansDoublons(texte: string, noms: (string | null)[]): string {
  const connus = noms
    .filter((n): n is string => Boolean(n?.trim()))
    .map((n) => n.trim().toLowerCase());
  const ligneDeSignature = (l: string) => {
    const s = l.trim().replace(/^[—–-]+\s*/, "").toLowerCase();
    return (
      !s ||
      /^https?:\/\/\S+$/.test(s) ||
      /^(www\.)?[\w-]+(\.[\w-]+)+\/?$/.test(s) ||
      connus.some((n) => s === n || s === `l'équipe ${n}` || s === `l’équipe ${n}`)
    );
  };
  const paras = texte.trim().split(/\n{2,}/);
  while (paras.length > 1) {
    const dernier = paras[paras.length - 1];
    if (/\bSTOP\b/.test(dernier) || dernier.split("\n").every(ligneDeSignature))
      paras.pop();
    else break;
  }
  // « Cordialement,\nBTP Ecosystem » : garde la formule, retire la marque.
  const lignes = paras[paras.length - 1].split("\n");
  while (lignes.length > 1 && ligneDeSignature(lignes[lignes.length - 1]))
    lignes.pop();
  paras[paras.length - 1] = lignes.join("\n");
  return paras.join("\n\n");
}

export function composerEmail(p: {
  objet: string;
  texte: string;
  marque: string | null;
  site: string | null;
  jeton: string;
  signature?: SignatureEmail | null;
  // Logo intégré à l'e-mail (cid:…) plutôt que chargé depuis le site.
  logoCid?: string | null;
  // Pièce jointe annoncée au-dessus de la fiche (ex. « présentation (PDF) »).
  pieceJointe?: string | null;
}): EmailPret {
  const lien = lienDesinscription(p.jeton);
  const fiche = p.signature
    ? { ...p.signature, logo: p.logoCid ? `cid:${p.logoCid}` : p.signature.logo }
    : null;
  // Sans fiche : simple ligne « marque · site » comme avant.
  const signature = fiche ? "" : [p.marque, p.site].filter(Boolean).join(" · ");
  const mentionPj = p.pieceJointe ? `Pièce jointe : ${p.pieceJointe}` : "";
  const pied = [
    mentionPj,
    fiche ? signatureTexte(fiche) : signature,
    `Se désinscrire en 1 clic : ${lien}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const brut = fiche
    ? corpsSansDoublons(p.texte, [p.marque, p.site, fiche.nom, fiche.entreprise])
    : p.texte.trim();
  const texte = `${brut}\n\n${pied}`;
  const corps = echapper(brut)
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p style="margin:0 0 14px 0">${liens(para).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#111111">
${corps}
${p.pieceJointe ? `<p style="margin:22px 0 0 0;font-size:13px;line-height:19px;color:#374151">📎 <b>Pièce jointe</b> : ${echapper(p.pieceJointe)}</p>` : ""}
${fiche ? signatureHtml(fiche) : ""}
<p style="margin:24px 0 0 0;font-size:12px;line-height:18px;color:#6b7280">${signature ? `${liens(echapper(signature))}<br>` : ""}Vous ne souhaitez plus recevoir nos messages ? <a href="${lien}" style="color:#6b7280">Se désinscrire en 1 clic</a>.</p>
</td></tr></table></body></html>`;
  return {
    objet: p.objet.trim() || "Une idée pour votre activité",
    texte,
    html,
  };
}
