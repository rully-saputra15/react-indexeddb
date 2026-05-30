// Lightweight bundle-size guard. Builds (assumes already built) and reports
// minified + gzipped size of dist/index.js. Exits 1 if budget exceeded.
//
// Budget per the plan: <= 5 KB gzip for the core ESM bundle.

import { gzipSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const BUDGET_GZIP = 5 * 1024; // 5 KB

const entry = resolve(root, "dist/index.js");

try {
  statSync(entry);
} catch {
  console.error("dist/index.js not found. Run `npm run build` first.");
  process.exit(1);
}

const result = await build({
  entryPoints: [entry],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  external: ["react", "react-dom"],
  write: false,
  treeShaking: true,
});

const minified = result.outputFiles[0].contents;
const gzipped = gzipSync(minified);

const minKb = (minified.byteLength / 1024).toFixed(2);
const gzKb = (gzipped.byteLength / 1024).toFixed(2);

console.log(`dist/index.js  minified: ${minKb} KB  gzipped: ${gzKb} KB`);
console.log(`budget (gzip): ${(BUDGET_GZIP / 1024).toFixed(2)} KB`);

if (gzipped.byteLength > BUDGET_GZIP) {
  console.error(
    `Bundle exceeds budget by ${((gzipped.byteLength - BUDGET_GZIP) / 1024).toFixed(2)} KB`,
  );
  process.exit(1);
}

console.log("OK");
