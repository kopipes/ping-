/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Sidebar — Studio Ledger warm paper
        sb:         "#EDECE5",
        "sb-hover": "#EDECE5",
        "sb-active":"#EAF1EE",
        "sb-text":  "#8B8A7E",
        "sb-white": "#22221D",
        // Main area — Studio Ledger warm paper
        appbg:      "#F7F6F1",
        "ch-bg":    "#F7F6F1",
        hover:      "#EDECE5",
        border:     "#DEDCD2",
        // Text — Studio Ledger ink
        textp:      "#22221D",
        texts:      "#5C5B51",
        textm:      "#8B8A7E",
        // Brand — Studio Ledger accent teal
        primary:    "#3E7368",
        primaryhover:"#32615A",
        // Status
        success:    "#3E7368",
        warning:    "#A67C2E",
        danger:     "#A5484A",
        unread:     "#A5484A",
        online:     "#3E7368",
        // Message
        mention:    "#EEF1FE",
        "msg-hover":"#F1F2F6",
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
