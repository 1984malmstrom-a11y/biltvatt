import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    ...(process.env.STATION_V2_E2E_ISOLATED === "1" ? [{
      name: "station-v2-e2e-vite-path",
      enforce: "pre" as const,
      configureServer(server: import("vite").ViteDevServer) {
        server.middlewares.use((request, _response, next) => {
          // Windows Chromium encodes Vite's internal @ prefix in this isolated
          // test setup. Cloudflare's SPA fallback otherwise serves HTML here.
          if (request.url) request.url = request.url.replace(/^\/%40(vite|id|fs)\//i, "/@$1/");
          next();
        });
      },
    }] : []),
    react(),
    cloudflare(),
  ],
});
