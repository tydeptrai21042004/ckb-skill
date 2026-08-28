import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
    proxy: { "/api": "http://127.0.0.1:8787", "/health": "http://127.0.0.1:8787" },
  },
  build: { sourcemap: true },
});
