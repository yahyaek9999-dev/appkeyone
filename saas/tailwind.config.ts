import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand accent ──────────────────────────────────────────────
        // 2026 rebuild: refined muted iris/indigo (Linear/Stripe/Attio register).
        // The `brand-*` name is kept so the entire app re-skins through the token.
        brand: {
          50: "#eef0fb",
          100: "#dfe2f8",
          200: "#c4c8f1",
          300: "#a2a9e8",
          400: "#828bdd",
          500: "#6872d4",
          600: "#5460c4",
          700: "#4650a8",
          800: "#3a4188",
          900: "#31366e",
          // Premium solid accent for badges, dividers, subtle highlights
          soft: "rgba(104,114,212,0.15)",
          border: "rgba(104,114,212,0.25)",
          glow: "rgba(104,114,212,0.08)",
        },
        // True-neutral canvas scale — premium near-black, no color cast.
        canvas: {
          DEFAULT: "#0a0a0c",
          deep: "#08080a",
          raised: "#101013",
          overlay: "rgba(10,10,12,0.92)",
        },
        // Semantic surface tokens for consistent layered panels
        surface: {
          DEFAULT: "rgba(255,255,255,0.030)",
          alt: "rgba(255,255,255,0.014)",
          hover: "rgba(255,255,255,0.055)",
          elevated: "rgba(255,255,255,0.04)",
        },
      },
      fontFamily: {
        // Arabic primary — kept as-is
        sans: ["Cairo", "system-ui", "sans-serif"],
        // English content — system stack (no Cairo bleed-through)
        en: ["-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "sans-serif"],
      },
      // Extended spacing steps
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
      },
      // Named shadow tokens — flat 2026 register: tight, low-spread, no glow.
      // Depth comes from hairline borders + subtle elevation, not large blur.
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.20)",
        nav: "0 1px 0 rgba(255,255,255,0.03)",
        btn: "0 1px 2px rgba(0,0,0,0.18)",
        // Elevations — for popovers/command palette/menus only.
        elevated:
          "0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 12px -2px rgba(0,0,0,0.45)",
        float:
          "0 1px 0 rgba(255,255,255,0.05) inset, 0 12px 32px -8px rgba(0,0,0,0.60)",
        // `glow` retained as a name (legacy call sites) but neutralised to a
        // soft iris ring — no neon bloom.
        glow: "0 0 0 1px rgba(104,114,212,0.22)",
      },
      borderRadius: {
        // Tighter, more intentional radii than the old blanket rounded-2xl.
        lg: "0.625rem",
        xl: "0.75rem",
        "2xl": "0.875rem",
      },
      // Refined letter-spacing scale — tighter for premium headings
      letterSpacing: {
        tighter: "-0.035em",
        tight: "-0.02em",
        widest: "0.12em",
      },
      // Display type scale — for cinematic hero/section headings
      fontSize: {
        display: ["clamp(2.5rem, 6vw, 4.5rem)", { lineHeight: "1.04", letterSpacing: "-0.045em" }],
        "display-sm": ["clamp(2rem, 4.5vw, 3.25rem)", { lineHeight: "1.08", letterSpacing: "-0.035em" }],
      },
      // Calm, expensive easing tokens
      transitionTimingFunction: {
        premium: "cubic-bezier(0.21, 0.47, 0.32, 0.98)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.6s ease-out",
        "light-sweep": "lightSweep 7s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        lightSweep: {
          "0%": { transform: "translateX(-100%) skewX(-18deg)" },
          "30%": { transform: "translateX(200%) skewX(-18deg)" },
          "100%": { transform: "translateX(200%) skewX(-18deg)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
