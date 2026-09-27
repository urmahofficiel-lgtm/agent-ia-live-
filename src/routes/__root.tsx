import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { Coquille } from "@/components/Coquille";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Agent IA Live · l'agent IA qui publie sur vos réseaux sociaux" },
      {
        name: "description",
        content:
          "Un agent IA qui analyse votre site, rédige vos publications, crée images et vidéos et publie sur vos réseaux sociaux. Vous suivez chaque étape en direct.",
      },
      { name: "theme-color", content: "#0c1624" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  component: () => (
    <Document>
      <AuthProvider>
        <Coquille>
          <Outlet />
        </Coquille>
      </AuthProvider>
    </Document>
  ),
});

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
