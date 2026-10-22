import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Il sito usa lo stesso motore del simulatore (../src): niente copie del codice.
export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [preact()],
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
  worker: { format: "es" },
  server: { fs: { allow: [".."] } },
});
