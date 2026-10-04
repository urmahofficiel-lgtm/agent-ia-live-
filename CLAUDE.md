# CLAUDE.md — Agent IA Live

## Séparation stricte
Ce dépôt est **indépendant de BTP Ecosystem** (`artisan-wise-ai`). Ne jamais réutiliser ses clés, son projet
Supabase (`askcenqglrxwjraxupwf`) ni son projet Vercel. Le projet Supabase de ce dépôt est `idabdhnsciymoauyogmj`.

## Stack
TanStack Start (React 19 + Vite) — pas Next.js. Supabase (auth, Postgres, realtime). Déploiement Vercel.
Vérifs avant commit : `npm run typecheck`, `npm run test`, `npm run build`.

## Règles
- Code et interface en français, comme le reste du projet.
- Aucun secret dans le code : clés IA (Gemini, NVIDIA) et jetons des réseaux → variables d'environnement / Supabase Vault.
- Toute nouvelle table : `user_id` + RLS « propriétaire ».

## Langue
- Toujours répondre à l'utilisateur **en français**, avec des mots simples, sans jargon technique.
- Tout sous-agent lancé doit recevoir la consigne : « Réponds et rédige ton rapport en français. »

## Vidéos de présentation (skill /brag)
- Skills `brag` et `brag-slim` (latent-spaces/brag, licence MIT) : transforment le projet ou une URL en vidéo de lancement courte (musique, animations, texte de partage). Rendu par Hyperframes (Apache-2.0), sans carte graphique ni quota.
- Prérequis sur la machine : `ffmpeg` + `ffprobe` dans le PATH, `npx hyperframes browser ensure` (Chrome).
- Les vidéos générées vont dans `brag-output/` (ignoré par git) ; rien n'est publié sans validation de l'utilisateur.
