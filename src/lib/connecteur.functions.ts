import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { empreinteCle } from "./mcp.server";
import { URL_SITE } from "./preparation.server";
import { utilisateurDepuisJeton } from "./supabase-serveur";

// Nouvelle adresse de connecteur (Claude, ChatGPT…). La clé n'est montrée
// qu'une fois : seule son empreinte est enregistrée.
export const creerCleConnecteur = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ nom: z.string().min(1).max(40), jeton: z.string().min(10) }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true; url: string } | { ok: false; erreur: string }> => {
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      const cle = `ail_${randomBytes(32).toString("base64url")}`;
      const { error } = await sb.from("cles_connecteur").insert({ user_id: user.id, empreinte: empreinteCle(cle), nom: data.nom });
      if (error) return { ok: false, erreur: error.message };
      return { ok: true, url: `${URL_SITE}/api/mcp/${cle}` };
    } catch (e) {
      return { ok: false, erreur: e instanceof Error ? e.message : "Erreur" };
    }
  });
