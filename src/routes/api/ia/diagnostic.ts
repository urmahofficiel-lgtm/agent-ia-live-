import { createFileRoute } from "@tanstack/react-router";
import { listerGemini } from "@/lib/ia.server";

// Indique quels fournisseurs d'IA sont configurés et quels modèles Gemini
// seront utilisés (aucune clé n'est renvoyée).
export const Route = createFileRoute("/api/ia/diagnostic")({
  server: {
    handlers: {
      GET: async () => {
        const cleG = process.env.GEMINI_API_KEY ?? "";
        let gemini: string[] | string = "absente";
        if (cleG) gemini = await listerGemini(cleG).catch((e: unknown) => (e instanceof Error ? e.message : "erreur"));
        return Response.json({
          nvidia: Boolean(process.env.NVIDIA_API_KEY || process.env.agentialive),
          gemini,
        });
      },
    },
  },
});
