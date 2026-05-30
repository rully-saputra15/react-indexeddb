import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Base path for GitHub Pages. Set BASE_PATH at build time, e.g.
//   BASE_PATH=/react-indexeddb/ vite build
// Defaults to "/" so `vite dev` and local `vite preview` Just Work.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      // Resolve `react-indexeddb` to the source so the example works
      // without publishing. Vite bundles the inlined library code.
      "react-indexeddb": fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
    },
  },
});
