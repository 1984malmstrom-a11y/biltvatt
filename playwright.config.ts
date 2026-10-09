import { defineConfig } from "@playwright/test";
const isolated = process.env.STATION_V2_E2E_ISOLATED === "1";
const port = Number(process.env.STATION_V2_E2E_PORT ?? 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Ogiltig lokal Playwright-port.");
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || (process.platform === "linux" ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: isolated
      ? `node node_modules/wrangler/wrangler-dist/cli.js dev --local --ip 127.0.0.1 --port ${port}`
      : `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/api/staff`,
    reuseExistingServer: !isolated && !process.env.CI,
    timeout: 60000,
  },
});
