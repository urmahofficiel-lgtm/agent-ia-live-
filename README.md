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
| 2. Cerveau IA (NVIDIA NIM) : rédige le contenu d'une tâche | ✅ |
| 3. Connexion réelle des réseaux via **Zernio** (OAuth officiel de chaque réseau) | ✅ — nécessite `ZERNIO_API_KEY` |
| 4. Publication (bouton « Publier maintenant ») | ✅ |
| 5. Moteur 24 h/24 : pg_cron (toutes les 5 min) → `/api/agent/tick` → rédige + publie | ✅ |
| 6. Commande en langage courant (« Que doit faire l'agent ? ») + brouillons automatiques | ✅ |
| 7. Réponses aux commentaires / messages privés (page Messages, réponse proposée par l'IA) | ✅ |
| 8. Recherche de prospects (OpenStreetMap, par activité et ville) | ✅ |
| 9. Envoi d'e-mails de prospection + relances | à faire |
| 10. Contrôle d'écran PC / Android + vue écran en direct | à faire |

## Comment ça marche

1. **Comptes** → « Connecter » : le site demande à Zernio l'adresse d'autorisation du réseau, vous approuvez sur la page officielle (Facebook, LinkedIn…), puis vous revenez sur `/comptes` et les comptes sont synchronisés.
2. **Tâches** → vous créez une tâche, « Rédiger avec l'IA » (NVIDIA), puis « Publier maintenant » ou « Valider » (publication automatique à l'heure prévue).
3. **Moteur** : toutes les 5 minutes, Supabase (pg_cron) appelle `/api/agent/tick` avec un secret partagé (`AGENT_TICK_SECRET` côté Vercel, table `prive.secrets` côté base). Il traite les publications validées des agents démarrés.

## Variables Vercel

| Nom | Rôle |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | projet Supabase (public) |
| `agentialive` (ou `NVIDIA_API_KEY`) | clé NVIDIA NIM |
| `ZERNIO_API_KEY` | clé Zernio (zernio.com → API keys) |
| `AGENT_TICK_SECRET` | secret du moteur (identique à `prive.secrets`) |
| `GEMINI_API_KEY` | voix off des vidéos (facultatif, Google AI Studio gratuit) |
| `PEXELS_API_KEY` | vraies séquences filmées dans les vidéos + photo de secours (facultatif, gratuit) |

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
