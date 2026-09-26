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
