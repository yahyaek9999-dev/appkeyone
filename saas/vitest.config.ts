import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // tsconfig sets jsx:"preserve" for Next.js, which the transformer cannot
  // handle — any test importing a .tsx module (e.g. nav-items) failed to parse.
  // Override it here so component modules are loadable under vitest.
  // Vite 8 transforms with oxc; `esbuild` is kept for older toolchains.
  oxc: { jsx: { runtime: "automatic" } },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    globals: true,
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
