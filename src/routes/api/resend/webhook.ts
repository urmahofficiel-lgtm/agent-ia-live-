import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { clientMoteur } from "@/lib/supabase-serveur";

// Événements Resend (signés, format Svix) : adresse en erreur ou plainte pour
// spam sur un e-mail de prospection. Secret : RESEND_WEBHOOK_SECRET.
function signatureValide(corps: string, h: Headers, secret: string) {
  const id = h.get("svix-id");
  const horodatage = h.get("svix-timestamp");
  const signatures = h.get("svix-signature");
  if (!id || !horodatage || !signatures) return false;
  if (Math.abs(Date.now() / 1000 - Number(horodatage)) > 300) return false;
  const cle = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const attendue = createHmac("sha256", cle)
    .update(`${id}.${horodatage}.${corps}`)
    .digest();
  return signatures.split(" ").some((s) => {
    const [version, valeur] = s.split(",");
    if (version !== "v1" || !valeur) return false;
    const recue = Buffer.from(valeur, "base64");
    return recue.length === attendue.length && timingSafeEqual(recue, attendue);
  });
}

export const Route = createFileRoute("/api/resend/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
        const corps = await request.text();
        if (!secret || !signatureValide(corps, request.headers, secret))
          return new Response("Signature invalide", { status: 401 });
        const evt = JSON.parse(corps) as {
          type?: string;
          data?: { email_id?: string };
        };
        if (
          (evt.type === "email.bounced" || evt.type === "email.complained") &&
          evt.data?.email_id
        ) {
          const { error } = await clientMoteur().rpc("agent_email_evenement", {
            p_secret: process.env.AGENT_TICK_SECRET ?? "",
            p_email_id: evt.data.email_id,
            p_type: evt.type,
          });
          if (error) {
            console.error("webhook resend", error.message);
            return new Response("Erreur", { status: 500 });
          }
        }
        return new Response("ok");
      },
    },
  },
});
