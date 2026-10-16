import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";
import { codeValide, estRobot } from "@/lib/liens-suivis";

// Lien court d'une publication : compte le clic (sauf robots d'aperçu) puis
// redirige vers l'adresse d'origine.
export const Route = createFileRoute("/l/$code")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const code = params.code.toLowerCase();
        if (!codeValide(code)) return new Response("Lien introuvable", { status: 404 });
        const { data } = await clientMoteur().rpc("lien_suivi_ouvrir", {
          p_code: code,
          p_compter: !estRobot(request.headers.get("user-agent")),
        });
        if (typeof data !== "string" || !/^https?:\/\//.test(data)) return new Response("Lien introuvable", { status: 404 });
        return new Response(null, { status: 302, headers: { Location: data, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer-when-downgrade" } });
      },
    },
  },
});
