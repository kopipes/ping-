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
const sizeMap: Record<string, string> = { small: "13px", normal: "15px", large: "18px" };
const savedSidebarSize = localStorage.getItem("pvc-font-sidebar") || "normal";
const savedChatSize = localStorage.getItem("pvc-font-chat") || "normal";
document.documentElement.style.setProperty("--sidebar-font-size", sizeMap[savedSidebarSize] || "15px");
document.documentElement.style.setProperty("--chat-font-size", sizeMap[savedChatSize] || "15px");

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