import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./i18n";
import "./index.css";
import App from "./App";
import { ModalProvider } from "./components/Modal";

// Force-clear stale service worker caches on every load.
// Old SWs cached assets with immutable headers — this ensures the new SW
// takes control immediately without waiting for all tabs to close.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => {
      reg.update(); // trigger SW update check immediately
    });
  });
}

registerSW({ immediate: true });

// Apply saved font sizes on boot
const zoomMap: Record<string, string> = { xs: "0.733", small: "0.867", normal: "1", medium: "1.133", large: "1.267", xl: "1.4", xxl: "1.6" };
const savedSidebarSize = localStorage.getItem("pvc-font-sidebar") || "normal";
const savedChatSize = localStorage.getItem("pvc-font-chat") || "normal";
document.documentElement.style.setProperty("--sidebar-zoom", zoomMap[savedSidebarSize] || "1");
document.documentElement.style.setProperty("--chat-zoom", zoomMap[savedChatSize] || "1");

// Apply saved avatar shape on boot
const shapeMap: Record<string, string> = { circle: "50%", rounded: "8px", square: "0px" };
const savedShape = localStorage.getItem("pvc-avatar-shape") || "rounded";
document.documentElement.style.setProperty("--avatar-radius", shapeMap[savedShape] || "8px");

// Apply saved chat background color on boot
const savedChatBg = localStorage.getItem("pvc-chat-bg") || "#FFFFFF";
document.documentElement.style.setProperty("--chat-bg", savedChatBg);

// Apply saved color theme on boot
const savedTheme = localStorage.getItem("pvc-theme") || "navy";
document.documentElement.setAttribute("data-theme", savedTheme);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ModalProvider>
      <App />
    </ModalProvider>
  </React.StrictMode>
);