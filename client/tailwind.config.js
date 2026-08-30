/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Design system — Signal Blue + Midnight Navy
        // Sidebar
        sb:         "#1A2540",
        "sb-hover": "rgba(255,255,255,0.07)",
        "sb-active":"rgba(255,255,255,0.13)",
        "sb-text":  "rgba(255,255,255,0.65)",
        "sb-white": "#FFFFFF",
        // Main area
        appbg:      "#F4F6FA",
        "ch-bg":    "#FFFFFF",
        hover:      "#F0F4FA",
        border:     "#DDE2EE",
        // Text
        textp:      "#18243F",
        texts:      "#475470",
        textm:      "#8A96AE",
        // Brand — Signal Blue
        primary:    "#3B52F0",
        primaryhover:"#2A3FD9",
        // Status
        success:    "#12B76A",
        warning:    "#F79009",
        danger:     "#F04438",
        unread:     "#F04438",
        online:     "#12B76A",
        // Message
        mention:    "#EEF2FF",
        "msg-hover":"#F0F4FA",
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["'JetBrains Mono'", "SF Mono", "Consolas", "monospace"],
      },
      fontSize: {
        "msg":   ["15px", { lineHeight: "1.5" }],
        "msgmd": ["13px", { lineHeight: "1.4" }],
      },
      borderRadius: {
        sm:   "6px",
        md:   "10px",
        lg:   "14px",
        xl:   "18px",
        "2xl":"22px",
      },
      boxShadow: {
        sm: "0 1px 3px rgba(15,20,40,0.08), 0 1px 2px rgba(15,20,40,0.04)",
        md: "0 4px 12px rgba(15,20,40,0.10), 0 2px 4px rgba(15,20,40,0.06)",
        lg: "0 12px 28px rgba(15,20,40,0.14), 0 4px 8px rgba(15,20,40,0.08)",
      },
    },
  },
  plugins: [],
};
