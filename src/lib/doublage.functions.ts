import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { utilisateurDepuisJeton } from "./supabase-serveur";
import { voixElevenDisponibles } from "./doublage.server";

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };
const jeton = z.string().min(10);
const message = (e: unknown) => (e instanceof Error ? e.message : "Erreur inattendue.");

// Voix du doublage : ElevenLabs si la clé est branchée, sinon Gemini.
export const etatDoublage = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ elevenlabs: boolean }>> => {
    try {
      await utilisateurDepuisJeton(data.jeton);
      return { ok: true, elevenlabs: voixElevenDisponibles() };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });
