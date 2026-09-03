import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "logo.png", "favicon-192x192.png", "badge-96x96.png"],
      manifest: {
        name: "Ping!",
        short_name: "Ping!",
        description: "Ping! — Internal Company Chat App",
        theme_color: "#3E7368",
        background_color: "#F7F6F1",
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
            src: "/favicon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        importScripts: ["sw-push.js"],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
});