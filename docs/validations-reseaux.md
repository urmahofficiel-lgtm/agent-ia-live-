# Agent IA Live — dossiers de validation des réseaux

À déposer une fois le statut obtenu (auto-entrepreneur suffit, sauf LinkedIn page entreprise).
Chaque validation est **gratuite** et se fait **une seule fois** : ensuite, tous les clients peuvent connecter leurs comptes.

---

## 0. À préparer avant tout (une seule fois)

| Élément | Où / comment | État |
|---|---|---|
| Statut légal (SIRET) | autoentrepreneur.urssaf.fr — gratuit, en ligne | ⬜ à faire |
| E-mail pro sur un domaine | ex. contact@btp-ecosystem.com (LinkedIn refuse Gmail) | ⬜ à vérifier |
| Politique de confidentialité | https://agent-ia-live.vercel.app/confidentialite | ✅ en ligne |
| Conditions d'utilisation | https://agent-ia-live.vercel.app/conditions | ✅ en ligne |
| Suppression des données | https://agent-ia-live.vercel.app/suppression-donnees | ✅ en ligne |
| Icône de l'app 1024×1024 | je la génère sur demande | ⬜ |
| Enregistreur d'écran | Windows : touche Windows + Alt + R (Xbox Game Bar), ou OBS (gratuit) | ⬜ |

**Conseil** : un nom de domaine à soi (ex. agent-ia-live.fr, environ 7 € par an) facilite Google et TikTok, qui préfèrent un domaine vérifié à une adresse en .vercel.app. Ce n'est pas bloquant pour commencer.

---

## 1. Meta (Facebook + Instagram + Threads) — le plus important

**Où** : developers.facebook.com → ton app « Agent IA Live » → **Publier** / **Contrôle app**.

**Étapes**
1. **Paramètres de l'app → Général** : renseigner l'URL de la politique de confidentialité, l'URL des conditions, l'URL de suppression des données (ci-dessus), l'icône et la catégorie « Entreprise et pages ».
2. **Vérification de l'entreprise** (Meta Business Suite → Paramètres → Centre de sécurité) : nom légal, SIRET, adresse, justificatif (attestation Urssaf).
3. **Contrôle app** : pour chaque autorisation ci-dessous, coller le texte et joindre **la même vidéo**.

**Texte à coller (en anglais, les examinateurs lisent l'anglais)**

- `pages_show_list`, `pages_read_engagement` :
  > Agent IA Live lets a business owner connect the Facebook Pages they manage. We list their Pages so they can choose which Page the AI assistant publishes to, and we read post engagement to show which posts perform well.
- `pages_manage_posts` :
  > The user writes or reviews a post (text + image or video) in Agent IA Live, validates it, and schedules it. At the scheduled time we publish it to the Page the user selected. Nothing is published without the user's validation by default.
- `pages_manage_engagement` :
  > Comments received on the user's Page posts are shown in the Messages screen. The AI suggests a reply, the user edits and sends it from Agent IA Live.
- `instagram_basic`, `instagram_content_publish` :
  > The user links the Instagram professional account connected to their Page. Validated posts (image or Reel) are published to that account at the scheduled time.
- `instagram_manage_comments` :
  > Comments on the user's Instagram posts are displayed in Agent IA Live so the user can answer them with an AI-suggested reply.
- `business_management` :
  > Needed to list Pages and Instagram accounts owned through the user's business portfolio.

**Scénario de la vidéo (2 à 3 minutes, sans son, en anglais si possible)**
1. Ouvrir https://agent-ia-live.vercel.app et se connecter.
2. Page **Comptes** → **Connecter** Facebook → la fenêtre Facebook s'ouvre → accepter → cocher la page → revenir : Facebook « Connecté · direct ».
3. Page **Publications** → ouvrir une publication → **Modifier** → cocher Facebook → **Enregistrer** → **Publier maintenant**.
4. Ouvrir la page Facebook dans un autre onglet : montrer le post publié.
5. Même chose pour Instagram (post avec image).
6. Page **Messages** : montrer un commentaire, **Proposer une réponse**, **Envoyer**, puis la réponse visible sur Facebook.
7. Page **Comptes** → **Retirer** (montrer la déconnexion).

> ⚠️ Pour les étapes 6 et 7, je dois d'abord brancher les commentaires Facebook dans la page Messages (dis-moi quand tu veux déposer : je le fais avant).

**Délai** : 2 à 6 semaines. En attendant, tout marche déjà pour toi (mode développement).

---

## 2. TikTok

**Où** : developers.tiktok.com → Créer une app → produits **Login Kit** + **Content Posting API** (Direct Post).
**Autorisations** : `user.info.basic`, `video.publish`.
**Adresse de retour** : https://agent-ia-live.vercel.app/api/tiktok/retour

**Ce que TikTok vérifie à l'audit** (règles obligatoires) :
- avant chaque publication, afficher **le pseudo et la photo** du compte TikTok ;
- laisser l'utilisateur **choisir la visibilité** (public, amis, privé) — rien par défaut ;
- cases « contenu commercial / partenariat » et consentement explicite avant d'envoyer ;
- pas de filigrane ni de texte ajouté par l'app sur la vidéo.

> ⚠️ Avant l'audit, je dois construire le connecteur TikTok **avec cet écran de publication conforme**. En mode non audité, les vidéos restent privées (visibles par toi seul) : c'est suffisant pour enregistrer la vidéo de démo.

**Texte de la demande (anglais)**
> Agent IA Live is a marketing assistant for small businesses. It prepares short vertical videos (script, stock footage, voice-over) for the user's brand. The user previews each video, chooses the privacy level and commercial-content disclosure in our TikTok posting screen, and publishes it to their own TikTok account.

**Vidéo** : connexion TikTok → écran de publication (pseudo + photo, choix de visibilité, cases de divulgation) → publier → montrer la vidéo sur TikTok.
**Délai** : 2 à 4 semaines, souvent plusieurs allers-retours.

---

## 3. YouTube (Google)

**Où** : console.cloud.google.com → nouveau projet « Agent IA Live » → activer **YouTube Data API v3** → **Écran de consentement OAuth**.

**Étapes**
1. Écran de consentement : type **Externe**, nom, logo, e-mail d'assistance, domaine autorisé, liens confidentialité et conditions.
2. Autorisation demandée : `https://www.googleapis.com/auth/youtube.upload` (sensible → **validation Google** avec vidéo).
3. Identifiants → **ID client OAuth** (application Web), adresse de retour : https://agent-ia-live.vercel.app/api/youtube/retour
4. Après la validation Google : formulaire **YouTube API Services — Audit and Quota Extension** (sinon les vidéos restent privées).

**Texte (anglais)**
> Agent IA Live uploads short vertical videos (YouTube Shorts) that the user created and validated in our app to the user's own YouTube channel, at the time they scheduled. We only use the youtube.upload scope; we do not read or modify other channel data.

**Vidéo** : connexion Google (montrer l'écran de consentement avec l'URL visible) → créer une vidéo dans Publications → publier sur YouTube → montrer la vidéo sur la chaîne.
**Délai** : 3 à 8 semaines au total. Le connecteur YouTube est à coder (environ une demi-journée) : je le fais quand tu lances la démarche.

---

## 4. Pinterest

**Où** : developers.pinterest.com → **Connect app** → accès **Trial** (quelques jours), puis demande d'accès **Standard**.
**Autorisations** : `boards:read`, `pins:read`, `pins:write`, `user_accounts:read`.
**Adresse de retour** : https://agent-ia-live.vercel.app/api/pinterest/retour

**Texte (anglais)**
> Agent IA Live creates branded visuals for small businesses and publishes them as Pins to a board the user chooses, with the text and link the user validated.

**Vidéo (obligatoire, même pour un seul utilisateur)** : connexion Pinterest → choix du tableau → publier une épingle → la montrer sur Pinterest.
**Délai** : 1 à 3 semaines. Connecteur à coder (quelques heures).

---

## 5. Google Business Profile (fiche Google Maps)

**Prérequis** : fiche Google Business **vérifiée et active depuis 60 jours ou plus**, site web renseigné.
**Où** : formulaire de demande d'accès « Business Profile APIs » (support.google.com/business → Demande d'accès à l'API), avec le numéro du projet Google Cloud (le même que YouTube).
**Délai** : quelques jours à quelques semaines.

---

## 6. LinkedIn

- **Profil perso** : ✅ déjà codé, sans validation. Il suffit de créer l'app LinkedIn (voir plus bas) — 10 minutes.
- **Page entreprise en direct** : produit **Community Management API**. Réservé aux **sociétés enregistrées** (pas les auto-entrepreneurs sans structure), e-mail pro, vérification par un super-admin de la page. En attendant : **page via Zernio** (gratuit, déjà en place).

### Créer l'app LinkedIn (profil perso, maintenant)
1. linkedin.com/developers → **Create app** : nom « Agent IA Live », **page LinkedIn associée : BTP Ecosystem** (obligatoire), logo, accepter les conditions.
2. La page BTP Ecosystem reçoit une demande de vérification : l'accepter (tu es admin).
3. Onglet **Products** : ajouter **Sign In with LinkedIn using OpenID Connect** et **Share on LinkedIn** (accès immédiat).
4. Onglet **Auth** : **Authorized redirect URLs** → `https://agent-ia-live.vercel.app/api/linkedin/retour`
5. Copier **Client ID** et **Primary Client Secret** → Vercel → Settings → Environment Variables :
   - `LINKEDIN_CLIENT_ID`
   - `LINKEDIN_CLIENT_SECRET` (cocher **Sensitive**)
   puis **Redeploy**.
6. Page **Comptes** → LinkedIn → **Connecter** → accepter. Ta page BTP (via Zernio) reste celle qui publie ; tu choisis dans « Compte utilisé pour publier ».

---

## 7. X (Twitter)

Plus d'offre gratuite depuis février 2026 : environ 0,015 $ par post, 0,20 $ par post avec lien. Solution : **via Zernio** (place gratuite), sans validation.

---

## Ordre conseillé

1. **Maintenant** : LinkedIn perso (app à créer, 10 min), Bluesky, Telegram.
2. **Dès le statut obtenu** : vérification d'entreprise Meta + Contrôle app (le plus long, et le plus utile).
3. **En parallèle** : TikTok et YouTube (je code les connecteurs, tu enregistres les vidéos).
4. **Ensuite** : Pinterest, Google Business.
