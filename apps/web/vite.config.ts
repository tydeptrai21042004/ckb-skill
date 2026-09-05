import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const apiOrigin = process.env.SKILLPASS_API_ORIGIN || "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
    proxy: {
      "/api": apiOrigin,
      "/health": apiOrigin,
      "/readyz": apiOrigin,
      "/.well-known": apiOrigin,
    },
  },
  build: { sourcemap: true },
});
