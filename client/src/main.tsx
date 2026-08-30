import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./i18n";
import "./index.css";
import App from "./App";
import { ModalProvider } from "./components/Modal";

registerSW({ immediate: true });

// Apply saved font size on boot
const savedSize = localStorage.getItem("pvc-font-size") || "normal";
const sizeMap: Record<string, string> = { small: "13px", normal: "15px", large: "18px" };
document.documentElement.style.setProperty("--app-font-size", sizeMap[savedSize] || "15px");

// Apply saved chat background color on boot
const savedChatBg = localStorage.getItem("pvc-chat-bg") || "#FFFFFF";
document.documentElement.style.setProperty("--chat-bg", savedChatBg);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ModalProvider>
      <App />
    </ModalProvider>
  </React.StrictMode>
);