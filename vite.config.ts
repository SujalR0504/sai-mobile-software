import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { erpApiPlugin } from "./src/server/api/vitePlugin";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.PORT || env.VITE_PORT || 8080);
  const host = env.HOST || "0.0.0.0";

  return {
    server: {
      host,
      port,
    },
    resolve: {
      alias: {
        "@": "/home/subh/Downloads/stock-to-sale-hero-main/src",
        "@frontend": "/home/subh/Downloads/stock-to-sale-hero-main/frontend/src",
        "@backend": "/home/subh/Downloads/stock-to-sale-hero-main/backend/src",
        "@database": "/home/subh/Downloads/stock-to-sale-hero-main/database",
        "@shared": "/home/subh/Downloads/stock-to-sale-hero-main/shared",
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins: [
      erpApiPlugin(),
      tailwindcss(),
      tsconfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        server: { entry: "server" },
      }),
      ...(command === "build" ? [nitro({ defaultPreset: "cloudflare-module" })] : []),
      viteReact(),
    ],
  };
});

// Vite configuration updated for mobile shop ERP dashboard

