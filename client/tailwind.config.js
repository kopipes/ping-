/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Sidebar — Midnight Navy (exact from design system)
        sb:         "#1A2540",
        "sb-hover": "rgba(255,255,255,0.07)",
        "sb-active":"rgba(255,255,255,0.13)",
        "sb-text":  "rgba(255,255,255,0.62)",
        "sb-white": "#FFFFFF",
        // Main area — light surfaces
        appbg:      "#F8F9FC",
        "ch-bg":    "#FFFFFF",
        hover:      "#F1F2F6",
        border:     "#E5E7EF",
        // Text — warm slate
        textp:      "#14151F",
        texts:      "#6E7284",
        textm:      "#9A9FB0",
        // Brand — Signal Blue (exact from design system)
        primary:    "#2E46E0",
        primaryhover:"#2436B8",
        // Status
        success:    "#12B76A",
        warning:    "#F79009",
        danger:     "#F04438",
        unread:     "#F04438",
        online:     "#12B76A",
        // Message
        mention:    "#EEF1FE",
        "msg-hover":"#F1F2F6",
      },
      fontFamily: {
        sans: ["var(--font-app)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["'JetBrains Mono'", "SF Mono", "Consolas", "monospace"],
      },
      fontSize: {
        "msg":   ["15px", { lineHeight: "1.5" }],
        "msgmd": ["13px", { lineHeight: "1.4" }],
      },
      borderRadius: {
        sm:   "6px",
        md:   "10px",
        lg:   "16px",
        xl:   "18px",
        "2xl":"22px",
      },
      boxShadow: {
        sm: "0 1px 3px rgba(20,21,31,0.08), 0 1px 2px rgba(20,21,31,0.04)",
        md: "0 4px 12px rgba(20,21,31,0.08), 0 2px 4px rgba(20,21,31,0.04)",
        lg: "0 12px 32px rgba(20,21,31,0.14), 0 4px 8px rgba(20,21,31,0.06)",
      },
    },
  },
  plugins: [],
};
