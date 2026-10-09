import type { Config } from "tailwindcss";

// Design tokens ported 1:1 from design/tradewood_defi_dapp.html
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        obsidian: "#050807",
        forestDark: "#0B120E",
        panelBg: "#111A14",
        panelCard: "#18241D",
        panelHover: "#203027",
        emeraldGlow: "#10B981",
        neonGreen: "#00E676",
        sherwoodGold: "#F59E0B",
        goldLight: "#FCD34D",
        robinRed: "#FF3B30",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Outfit", "sans-serif"],
        mono: ["Space Grotesk", "monospace"],
      },
      boxShadow: {
        "emerald-glow": "0 0 20px rgba(16, 185, 129, 0.25)",
        "gold-glow": "0 0 20px rgba(245, 158, 11, 0.3)",
        "neon-lg": "0 0 30px rgba(0, 230, 118, 0.4)",
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.45)",
      },
      animation: {
        "pulse-slow": "pulseGlow 3s infinite ease-in-out",
        float: "float 4s ease-in-out infinite",
        marquee: "marquee 30s linear infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 15px rgba(16, 185, 129, 0.2)" },
          "50%": { boxShadow: "0 0 30px rgba(0, 230, 118, 0.55)" },
        },
        float: { "0%, 100%": { transform: "translateY(0px)" }, "50%": { transform: "translateY(-6px)" } },
        marquee: { "0%": { transform: "translateX(0%)" }, "100%": { transform: "translateX(-50%)" } },
      },
    },
  },
  plugins: [],
};
export default config;
