// Vite + TanStack Start, déployé sur Vercel (preset Nitro `vercel`).
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    // 300 s : le moteur rédige et crée des images, ce qui dépasse la durée par défaut.
    ...(command === "build"
      ? [nitro({ preset: process.env.NITRO_BUILD_PRESET || "vercel", vercel: { functions: { maxDuration: 300 } } })]
      : []),
    viteReact(),
  ],
  test: { exclude: ["node_modules", "dist", ".output"] },
}));
