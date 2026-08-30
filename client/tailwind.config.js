/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Navy theme — cohesive dark navy sidebar + blue accents
        // Sidebar
        sb:         "#1B2A4A",   // sidebar bg (dark navy)
        "sb-hover": "#243660",   // sidebar item hover
        "sb-active":"#2D4A8A",   // sidebar item active
        "sb-text":  "#A8B8D8",   // sidebar muted text
        "sb-white": "#FFFFFF",   // sidebar active text
        // Main area
        appbg:      "#F5F7FA",   // slightly off-white for contrast
        "ch-bg":    "#FFFFFF",   // channel bg
        hover:      "#F0F4F9",   // message hover
        border:     "#DDE3ED",
        // Text
        textp:      "#1D2B45",   // primary text (navy tint)
        texts:      "#4A5A78",   // secondary text
        textm:      "#7A8BAA",   // muted text
        // Brand
        primary:    "#2563EB",   // blue (matches navy sidebar)
        primaryhover:"#1D4ED8",
        // Status / utility
        success:    "#10B981",
        warning:    "#F59E0B",
        danger:     "#EF4444",
        unread:     "#EF4444",
        online:     "#10B981",
        // Message highlights
        mention:    "#EFF6FF",   // light blue for @mention
        "msg-hover":"#F0F4F9",
      },
      fontFamily: {
        sans: ["Lato", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        "msg":   ["15px", { lineHeight: "1.46668" }],
        "msgmd": ["13px", { lineHeight: "1.38462" }],
      },
    },
  },
  plugins: [],
};
