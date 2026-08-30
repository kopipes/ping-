import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
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
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // Inject custom push SW so it shares the same service worker scope
        importScripts: ["sw-push.js"],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
});