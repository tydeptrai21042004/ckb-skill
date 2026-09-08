import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const apiOrigin = process.env.SKILLPASS_API_ORIGIN || "http://127.0.0.1:8787";
const workspacePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    strictPort: true,
    fs: {
      // Keep the dev server's readable filesystem limited to the web app and
      // the workspace packages that are imported by the browser bundle.
      allow: [
        workspacePath("."),
        workspacePath("../../packages/ckb-client"),
        workspacePath("../../packages/capability-codec"),
        workspacePath("../../packages/service-gateway"),
        workspacePath("../../packages/delegation"),
      ],
      deny: [".env", ".env.*", "*.{crt,pem,key}", "**/.secrets/**", "**/.runtime/**"],
    },
    proxy: {
      "/api": apiOrigin,
      "/health": apiOrigin,
      "/readyz": apiOrigin,
      "/.well-known": apiOrigin,
    },
  },
  build: {
    // Public production bundles should not publish source maps by default.
    // Set SKILLPASS_BUILD_SOURCEMAPS=true only for a controlled debugging build.
    sourcemap: process.env.SKILLPASS_BUILD_SOURCEMAPS === "true",
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
