import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Base path for GitHub Pages. Set BASE_PATH at build time, e.g.
//   BASE_PATH=/react-idb-hooks/ vite build
// Defaults to "/" so `vite dev` and local `vite preview` Just Work.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      // Resolve `react-idb-hooks` to the source so the example works
      // without publishing. Vite bundles the inlined library code.
      "react-idb-hooks": fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
    },
  },
});
