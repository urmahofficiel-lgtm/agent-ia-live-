// Veille du marché et mise à jour de la fiche, ajoutées au contexte de
// rédaction tant que la fiche enregistrée n'a pas été ré-analysée depuis le site.
// Propre à BTP Ecosystem (détecté par le nom de la marque dans la fiche).

export const VEILLE_BTP = `Mise à jour du site btp-ecosystem.com (5 octobre 2026, prioritaire sur le reste de la fiche) :
- Fonctionnalités réelles : devis IA (voix, photo, texte) et métré IA ; factures au format Factur-X ; planning Gantt et gestion d'équipe ; suivi de chantier (journal, photos, documents, messagerie, pointage, géolocalisation) ; réserves sur plans ; comptes rendus de réunion par IA ; rapport client hebdomadaire avec photos ; demandes d'avis Google automatiques ; tableau de trésorerie ; export comptable FEC ; multi-établissements ; interface en 7 langues.
- Pour tous les corps d'état (maçon, électricien, plombier, peintre, couvreur, carreleur, plaquiste, menuisier, chauffagiste…) ET les architectes, maîtres d'œuvre et bureaux d'études : tout le monde travaille au même endroit, sur le même chantier. C'est notre différence : parle de COLLABORATION entre métiers.
- Prix : Starter gratuit ; Pro 39 €/mois (31 €/mois en paiement annuel) ; Business 129 €/mois (103 €/mois en paiement annuel). Toujours préciser « en paiement annuel » avec les prix réduits.
- Essai gratuit de 14 jours sans carte bancaire, puis retour automatique au plan gratuit.
- Facture électronique : la réception est obligatoire pour toutes les entreprises depuis le 1er septembre 2026 ; l'émission devient obligatoire pour les artisans, TPE et PME du bâtiment le 1er septembre 2027, via une plateforme agréée. BTP Ecosystem produit des factures au format Factur-X ; le raccordement direct à une plateforme agréée est PRÉVU avant septembre 2027. Ne dis donc JAMAIS « 100 % conforme à la réforme » ni « conformité garantie » : dis « factures au format Factur-X ».
- Mode hors ligne : en cours de déploiement (ne le présente pas comme disponible).
- Il n'y a PAS d'avis clients ni de statistiques d'usage affichés : n'invente aucun témoignage, note ou nombre de clients.
- Édité par Younes Bekka, société créée en juillet 2026 à Bordeaux : produit récent, ton honnête et humble (« on cherche des architectes pour l'essayer sur de vrais chantiers »).
- Marché : les concurrents (ne jamais les citer) misent sur le support humain, les bibliothèques de prix et les avis Google ; presque aucun ne montre le devis à la voix. L'IA passe du test à la production dans la construction. Angle fort : « il vous reste un an pour préparer la facture électronique ».
- Formats qui marchent dans le secteur : POV et humour de chantier, avant/après, tutoriels de 30 s, vidéo verticale sous-titrée, coulisses du fondateur.`;

export function avecVeille(contexte: string | null): string | null {
  if (!contexte || !/btp[\s-]?ecosystem/i.test(contexte)) return contexte;
  if (contexte.includes("Mise à jour du site btp-ecosystem.com")) return contexte;
  return `${contexte}\n\n${VEILLE_BTP}`;
}
