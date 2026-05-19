import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fdf6",
          100: "#dcfce9",
          200: "#bbf7d3",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        // Semantic surface tokens for consistent glass surfaces
        surface: {
          DEFAULT: "rgba(255,255,255,0.038)",
          alt: "rgba(255,255,255,0.016)",
          hover: "rgba(255,255,255,0.06)",
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
      // Named shadow tokens — more natural than ad-hoc shadow-[...]
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.04)",
        nav: "0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.18)",
        btn: "0 1px 2px rgba(0,0,0,0.14)",
      },
      // Refined letter-spacing scale — tighter for premium headings
      letterSpacing: {
        tighter: "-0.035em",
        tight: "-0.02em",
        widest: "0.12em",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.6s ease-out",
        blob: "blob 8s infinite",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        blob: {
          "0%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(30px,-50px) scale(1.1)" },
          "66%": { transform: "translate(-20px,20px) scale(0.9)" },
          "100%": { transform: "translate(0,0) scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
