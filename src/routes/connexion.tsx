import { Navigate, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Connexion } from "@/components/Connexion";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/connexion")({
  validateSearch: z.object({ mode: z.enum(["connexion", "inscription"]).optional() }),
  component: PageConnexion,
});

function PageConnexion() {
  const { session } = useAuth();
  const { mode } = Route.useSearch();
  if (session) return <Navigate to="/" />;
  return <Connexion key={mode} modeInitial={mode ?? "connexion"} />;
}
