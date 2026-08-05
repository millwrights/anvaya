import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/ — tuned so the same config serves the browser build
// and the Tauri desktop shell.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Tauri expects a fixed port and its own console output.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  // Don't obscure Rust errors; only bundle for the webviews Tauri targets.
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: false,
  },
});
