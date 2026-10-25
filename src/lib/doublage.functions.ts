import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { utilisateurDepuisJeton } from "./supabase-serveur";
import { voixAzureDisponibles, voixElevenDisponibles } from "./doublage.server";

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };
const jeton = z.string().min(10);
const message = (e: unknown) => (e instanceof Error ? e.message : "Erreur inattendue.");

// Voix du doublage : ElevenLabs, sinon Azure Speech, sinon Gemini (selon les clés branchées).
export const etatDoublage = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ elevenlabs: boolean; azure: boolean }>> => {
    try {
      await utilisateurDepuisJeton(data.jeton);
      return { ok: true, elevenlabs: voixElevenDisponibles(), azure: voixAzureDisponibles() };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });
