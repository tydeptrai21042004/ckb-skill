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
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@ckb-ccc")) return "vendor-ckb";
          if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
          if (id.includes("react-qr-code")) return "vendor-qr";
          return "vendor";
        },
      },
    },
  },
});
