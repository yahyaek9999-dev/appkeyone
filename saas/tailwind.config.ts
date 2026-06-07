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
        // HOR brand: deep emerald green anchored at #01433E (brand-700).
        // The `brand-*` name is kept so the entire app re-skins through the token.
        // Iris/indigo purple fully removed.
        brand: {
          50: "#e9f4f1",
          100: "#c9e6df",
          200: "#9bd0c4",
          300: "#66b3a4",
          400: "#2f9384",
          500: "#0c7a6c",
          600: "#046055",
          700: "#01433E", // HOR primary
          800: "#013833",
          900: "#012a26",
          // Premium solid accent for badges, dividers, subtle highlights
          soft: "rgba(12,122,108,0.15)",
          border: "rgba(12,122,108,0.28)",
          glow: "rgba(12,122,108,0.12)",
        },
        // ── Luxury gold secondary ─────────────────────────────────────
        // Champagne gold #C9A24B (gold-500): premium edges, dividers,
        // counters, eyebrows, badges, CTA highlights on the dark canvas.
        gold: {
          50: "#faf6ec",
          100: "#f4e9cd",
          200: "#ead4a0",
          300: "#ddbf75",
          400: "#d0ad57",
          500: "#C9A24B",
          600: "#a98238",
          700: "#84642c",
          800: "#614a22",
          900: "#423318",
          soft: "rgba(201,162,75,0.14)",
          border: "rgba(201,162,75,0.30)",
          glow: "rgba(201,162,75,0.16)",
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
        // `glow` retained as a name (legacy call sites) — now a soft emerald ring.
        glow: "0 0 0 1px rgba(12,122,108,0.30)",
        // Luxury elevation + accent glows for premium cards, CTAs, counters.
        lux: "0 1px 0 rgba(255,255,255,0.05) inset, 0 18px 40px -14px rgba(0,0,0,0.7)",
        "glow-emerald": "0 0 32px -8px rgba(12,122,108,0.45)",
        "glow-gold": "0 0 28px -8px rgba(201,162,75,0.40)",
        "gold-ring": "0 0 0 1px rgba(201,162,75,0.35)",
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
        "pulse-glow": "pulseGlow 3s ease-in-out infinite",
        "shimmer": "shimmer 2.5s linear infinite",
        "float-up": "floatUp 6s ease-in-out infinite",
        "gradient-x": "gradientX 5s ease infinite",
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
        pulseGlow: {
          "0%, 100%": { opacity: "0.3", transform: "scale(0.95)" },
          "50%": { opacity: "0.6", transform: "scale(1.05)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        floatUp: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        gradientX: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
