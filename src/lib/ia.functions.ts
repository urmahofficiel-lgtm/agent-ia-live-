import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { nomPlateforme } from "./plateformes";

// Cerveau de l'agent : NVIDIA NIM (API compatible OpenAI).
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODELE_DEFAUT = "meta/llama-3.3-70b-instruct";

// Lue au moment de la requête : une variable « Sensible » Vercel n'existe pas
// pendant le build. `agentialive` est le nom sous lequel la clé a été
// enregistrée dans Vercel ; NVIDIA_API_KEY reste le nom recommandé.
function cleNvidia() {
  return process.env.NVIDIA_API_KEY || process.env.agentialive || "";
}

function supabaseUtilisateur(jeton: string) {
  const url = process.env.VITE_SUPABASE_URL || "https://idabdhnsciymoauyogmj.supabase.co";
  const cle = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_VvarkoTJdJPMo9CIdSuZOw_o6p_kiff";
  // Le client agit AVEC le jeton de l'utilisateur : les règles RLS
  // s'appliquent, il ne peut toucher qu'à ses propres tâches.
  return createClient(url, cle, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const CONSIGNES_TYPE: Record<string, string> = {
  publication:
    "Rédige une publication prête à poster. Adapte la longueur, le ton et les hashtags à la plateforme. Propose aussi, sur une ligne séparée commençant par « Visuel : », une description de l'image idéale.",
  reponse:
    "Rédige une réponse courte, polie et utile à un commentaire ou un message. Reste naturel, sans ton robotique.",
  prospection:
    "Rédige un premier message de prospection court et personnalisé : une accroche, la valeur proposée, une question ouverte. Pas de formule agressive.",
  relance:
    "Rédige une relance courte et courtoise, qui rappelle le premier message sans insister lourdement.",
  appareil:
    "Décris, étape par étape, les actions précises à effectuer sur l'appareil pour accomplir la consigne.",
  autre: "Accomplis la consigne de la façon la plus utile possible.",
};

export const genererBrouillon = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ tacheId: z.string().uuid(), jeton: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = supabaseUtilisateur(data.jeton);
    const { data: u, error: errAuth } = await sb.auth.getUser(data.jeton);
    if (errAuth || !u.user) return { ok: false as const, erreur: "Session expirée, reconnectez-vous." };

    const { data: tache, error } = await sb
      .from("taches")
      .select("id, type, plateforme, titre, consigne")
      .eq("id", data.tacheId)
      .single();
    if (error || !tache) return { ok: false as const, erreur: "Tâche introuvable." };

    const cle = cleNvidia();
    if (!cle) return { ok: false as const, erreur: "Clé NVIDIA absente des variables Vercel." };

    const journal = (niveau: "info" | "action" | "erreur", message: string) =>
      sb.from("evenements_taches").insert({ tache_id: tache.id, user_id: u.user.id, niveau, message });

    await journal("action", `Rédaction en cours : « ${tache.titre} »`);

    const reponse = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.NVIDIA_MODELE || MODELE_DEFAUT,
        temperature: 0.7,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content:
              "Tu es l'assistant marketing et commercial d'un entrepreneur français. Tu écris en français, de façon naturelle et concrète. Tu ne réponds qu'avec le contenu demandé, sans commentaire autour.",
          },
          {
            role: "user",
            content: [
              CONSIGNES_TYPE[tache.type] ?? CONSIGNES_TYPE.autre,
              tache.plateforme ? `Plateforme : ${nomPlateforme(tache.plateforme)}.` : "",
              `Titre : ${tache.titre}`,
              tache.consigne ? `Consigne : ${tache.consigne}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      }),
    });

    if (!reponse.ok) {
      const detail = (await reponse.text()).slice(0, 300);
      await journal("erreur", `L'IA NVIDIA a refusé la demande (${reponse.status}).`);
      console.error("NVIDIA", reponse.status, detail);
      return { ok: false as const, erreur: `Erreur NVIDIA ${reponse.status} : ${detail}` };
    }

    const json = (await reponse.json()) as { choices?: { message?: { content?: string } }[] };
    const texte = json.choices?.[0]?.message?.content?.trim();
    if (!texte) return { ok: false as const, erreur: "Réponse vide de l'IA." };

    await sb
      .from("taches")
      .update({ resultat: { brouillon: texte, genere_le: new Date().toISOString() } })
      .eq("id", tache.id);
    await journal("info", `Brouillon prêt pour « ${tache.titre} » — à valider.`);

    return { ok: true as const, brouillon: texte };
  });
