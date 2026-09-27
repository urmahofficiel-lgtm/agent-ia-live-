import { createFileRoute } from "@tanstack/react-router";
import { existsSync } from "node:fs";
import { cheminFfmpeg } from "@/lib/video.server";

export const Route = createFileRoute("/api/sante-video")({
  server: { handlers: { GET: async () => Response.json({ ffmpeg: cheminFfmpeg(), present: existsSync(cheminFfmpeg()) }) } },
});
