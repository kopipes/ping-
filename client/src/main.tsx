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
const sizeMap: Record<string, string> = { xs: "11px", small: "13px", normal: "15px", medium: "17px", large: "19px", xl: "21px", xxl: "24px" };
const savedChatSize = localStorage.getItem("pvc-font-chat") || "normal";
const savedSidebarSize = localStorage.getItem("pvc-font-sidebar") || "normal";
document.documentElement.style.fontSize = sizeMap[savedChatSize] || "15px";
document.documentElement.style.setProperty("--sidebar-font-size", sizeMap[savedSidebarSize] || "15px");

// Apply saved font family on boot
const savedFont = localStorage.getItem("pvc-font-family") || "jakarta";
const fontStackMap: Record<string, string> = {
  jakarta: "'Plus Jakarta Sans', sans-serif",
  lato:    "Lato, sans-serif",
};
const fontStack = fontStackMap[savedFont] || "'Plus Jakarta Sans', sans-serif";
const fontStyle = document.createElement("style");
fontStyle.id = "pvc-font-override";
fontStyle.textContent = `* { font-family: ${fontStack} !important; }`;
document.head.appendChild(fontStyle);

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