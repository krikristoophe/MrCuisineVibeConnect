import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  root: "src/client",
  publicDir: "public",
  plugins: [preact()],
  build: { outDir: "../../dist", emptyOutDir: true },
});
