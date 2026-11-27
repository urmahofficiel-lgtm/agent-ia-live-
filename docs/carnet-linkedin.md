# Carnet LinkedIn : devenir la référence « IA × BTP »

Tenu par Claude (3 fois par semaine, lundi, mercredi et vendredi). Objectif de
Younes (12/11/2026) : devenir tendance dans ce domaine, et s'améliorer à chaque
post. Règle : on ne change qu'UNE chose à la fois, pour savoir ce qui marche.

## Point de départ (12/11/2026, 30 jours)
- LinkedIn : 62 publications, 472 vues au total (environ 8 vues par post), 8 j'aime, 22 commentaires.
- TikTok : 101 publications, 31 934 vues (environ 230 par post, pics à 1 082 et 1 297).
- Constat : sur LinkedIn l'audience est presque nulle. Le format « guide gratuit » seul ne suffira pas ; il faut aussi de l'audience (connexions, abonnés) et utiliser le même format là où il y a de la portée (TikTok, Instagram).

## Les posts « guide gratuit » (publiés par l'agent, texte et image fournis)
| Post | Id | Prévu | Mot | Cadeau |
|---|---|---|---|---|
| Guide IA dans le BTP | ce210186-1de0-40b9-9562-3cc542f953a1 | 13/11 08:40 | GUIDE | /media/guide-ia-btp.pdf |
| Appels d'offres | 242384cd-1d66-45c3-afdc-7c64cc0aa05a | 16/11 08:40 | AO | analyse gratuite |
| Modèles de devis | fd8571e9-58b2-4394-aa38-4221f930a9b1 | 18/11 08:40 | MODELE | /modele-devis |

Fichiers sources : visuels dans `public/linkedin/`, générateur dans le carnet de session (grille de 8 tuiles, 1080 × 1350).

## Objectifs de départ (à réviser avec les chiffres)
- 4 semaines : 50 vues par post en moyenne sur LinkedIn, 5 commentaires-mot par post.
- Un post « guide gratuit » qui dépasse 3 fois la moyenne devient le modèle des suivants.

## Journal des contrôles
| Date | Post | Vues | J'aime | Commentaires (dont mot) | Réponses et lien en 1er commentaire OK ? | Enseignement | Changement à tester ensuite |
|---|---|---|---|---|---|---|---|
| 2026-11-16 | Guide IA (LinkedIn 13/11) + carrousel TikTok 13/11 + Instagram | LinkedIn 11 · TikTok 658 · Insta n/d | LinkedIn 0 · TikTok 12 (3 partages) · Insta 0 | LinkedIn 1 comm., 0 mot GUIDE · TikTok 0 · Insta 0 | Lien en 1er commentaire LinkedIn publié OK ; aucune réponse à envoyer | Le carrousel guide fait ~60x le LinkedIn (658 vs 11 vues) : le format cadeau marche surtout sur TikTok, LinkedIn reste minuscule | Sur le prochain carrousel TikTok, ajouter « commente GUIDE » dans la 1re diapo et vérifier le lien en bio |
| 2026-11-18 | Appels d'offres (LinkedIn 16/11) + guide TikTok | LinkedIn AO 9 · guide 11 · TikTok 682 | 0 j'aime LinkedIn · TikTok 12 | 1 comm. par post LinkedIn (le nôtre, lien), 0 mot AO/GUIDE | Lien en 1er commentaire OK sur les 2 posts | LinkedIn reste à ~10 vues sans réaction, la moyenne n'a pas bougé ; TikTok est 60x plus vu | Sur LinkedIn, tester un post sans cadeau mais avec une question courte et un avis de métier pour provoquer des réactions |
| 2026-11-20 | Modèles de devis (LinkedIn 18/11) + AO + guide + TikTok | Modèles 5 · AO 11 · guide 11 · TikTok guide 703 | 0 j'aime LinkedIn · TikTok 12 | 1 comm. (le nôtre, lien) par post LinkedIn, 0 mot MODELE/AO/GUIDE | Lien en 1er commentaire publié sur les 3 posts | 3 posts LinkedIn à 5-11 vues et 0 réaction : le format cadeau ne prend pas sur cette audience ; TikTok 703 vues | Prochain post LinkedIn : question courte du métier sans cadeau (changement déjà noté le 18/11) |
| 2026-11-23 | Posts LinkedIn récents (agent) | « Analyse IA des appels d'offres » 54 · Facturation 2026 11 · 4 erreurs 10 · Architectes 5 | 1 j'aime (AO) · 0 ailleurs | AO 4 comm. · 4 erreurs 3 · Facturation 1 | Pas de nouveau post « guide gratuit » depuis le 20/11 | Le post « nouveauté produit » (analyse IA des appels d'offres) fait 5 fois la moyenne (54 contre ~10) avec 4 commentaires : une vraie nouveauté concrète parle plus qu'un cadeau | Prendre ce post comme modèle : annoncer une fonction concrète, avec une capture, et une question de métier à la fin |

## Modèle en place (23/11/2026, accord de Younes)
Le format « annonce d'une fonction concrète » est maintenant la règle LinkedIn de l'agent (src/lib/texte.ts, reglesReseau) :
1. la douleur du métier ;
2. UNE fonction réelle avec 3-4 tirets ;
3. le bénéfice et l'essai ;
4. une question de métier.
Il remplace les posts « guide gratuit ».
| 2026-11-25 | « Chiffrage : pose de 40 m² de carrelage 80x80 » (24/11, FR + langue en plus) | 9 · 6 | 0 · 0 | 1 · 0 | Pas de post « guide gratuit » | Le texte suit le nouveau format, mais le sujet (un chiffrage) n'est pas l'annonce d'une fonction : retour à ~8 vues. C'est le sujet qui fait la portée, pas seulement la forme | Faire choisir à l'agent, pour LinkedIn, un sujet « fonction concrète » (analyse d'appels d'offres, devis dicté, suivi de chantier photo), à mesurer vendredi |
| 2026-11-27 | « Audit Qualibat : 5 réflexes » (26/11, FR + NL) | 3 · 2 | 0 · 0 | 1 · 0 | Pas de post « guide gratuit » | Encore un sujet « conseils », pas une fonction : 3 vues, le plus bas. Le sujet compte plus que la forme | Même changement, en attente de l'accord de Younes : le sujet LinkedIn est toujours une fonction concrète de l'outil |

Accord de Younes, 27/11/2026 : sur LinkedIn, quel que soit le sujet du jour, le post annonce toujours UNE fonction réelle de l'outil. Le sujet ne sert que de point de départ (règle dans src/lib/texte.ts).
