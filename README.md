# Agent IA Live

Agent IA personnel qui travaille **en continu** (même la nuit) et qu'on peut **regarder travailler en direct** :

- **Réseaux sociaux** : crée des publications (texte, images, vidéos), les publie, répond aux commentaires et aux messages.
  Facebook, Instagram, LinkedIn, TikTok, X, YouTube, Google Business Profile, Threads, Pinterest, Bluesky, Reddit, Snapchat, WhatsApp Business, Telegram, Messenger, Gmail, Outlook.
- **Prospection** : trouve des clients potentiels (entreprises et particuliers), récupère leurs coordonnées, les contacte, relance, suit les réponses (mini-CRM).
- **Appareils** : agit sur PC (Windows, Mac) et téléphone (Android, iPhone) — à travers les comptes connectés (API officielles) **et** en pilotant l'écran.

Usage personnel pour l'instant ; tout est cloisonné par utilisateur pour pouvoir l'ouvrir au public (payant) plus tard.

## Où on en est

| Étape | État |
|---|---|
| 1. Bases : site web, connexion, schéma Supabase, tâches, vue en direct, comptes, CRM, réglages | ✅ |
| 2. Cerveau IA (Gemini / NVIDIA) : transformer une consigne en plan d'actions | à faire |
| 3. Connexion réelle des comptes (OAuth de chaque réseau, jetons dans Supabase Vault) | à faire |
| 4. Exécuteur 24 h/24 : worker qui prend les tâches et les exécute | à faire |
| 5. Contrôle d'écran PC / Android + vue écran en direct | à faire |
| 6. Recherche de prospects (Google Maps, annuaires…) | à faire |

## Garde-fous

- **Validation avant envoi** activée par défaut (réglable).
- **Mode prudent** par défaut (accès officiels, rythme humain) ; le mode agressif existe mais peut faire bloquer les comptes.
- **RGPD** : la base refuse tout message sortant vers un particulier sans consentement, ou vers quelqu'un marqué « ne plus contacter ».
- Limite de contacts par jour réglable.

## Développement

```bash
cp .env.example .env   # renseigner la clé publishable du projet Supabase
npm install
npm run dev
```

Vérifications : `npm run typecheck`, `npm run test`, `npm run build`.

Base de données : `supabase/migrations/` (projet Supabase `idabdhnsciymoauyogmj`).
