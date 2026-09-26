import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";

// Sert une image générée. Le lien (UUID) n'est pas devinable ; il doit être
// public pour que les réseaux sociaux puissent télécharger l'image.
export const Route = createFileRoute("/api/visuels/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id.replace(/\.(jpe?g|png)$/, "");
        if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Introuvable", { status: 404 });
        const { data } = await clientMoteur().rpc("visuel_lire", { p_id: id });
        const v = (data as { mime: string; donnees: string }[] | null)?.[0];
        if (!v) return new Response("Introuvable", { status: 404 });
        return new Response(Buffer.from(v.donnees, "base64"), {
          headers: {
            "Content-Type": v.mime,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
