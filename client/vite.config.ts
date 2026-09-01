import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "logo.png", "favicon-192x192.png"],
      manifest: {
        name: "Ping!",
        short_name: "Ping!",
        description: "Ping! — Internal Company Chat App",
        theme_color: "#2563EB",
        background_color: "#FFFFFF",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/favicon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "any",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        importScripts: ["sw-push.js"],
        additionalManifestEntries: [{ url: "/index.html", revision: Date.now().toString() }],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
});