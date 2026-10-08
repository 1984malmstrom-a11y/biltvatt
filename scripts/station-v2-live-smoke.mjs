// Private cookie arrives only on stdin. No real sales, staff names or token are logged.
import { chromium } from "@playwright/test";

let browser;
try {
  const input = JSON.parse(await new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  }));
  const origin = new URL(input.baseUrl);
  if (origin.protocol !== "https:" || origin.pathname !== "/" ||
      !/^[a-f0-9-]+$/.test(input.sessionCookie)) throw new Error("invalid smoke input");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([{
    name: "tvattligan_session", value: input.sessionCookie,
    url: `${origin.origin}/api/station/dashboard`, httpOnly: true,
    secure: true, sameSite: "Lax",
  }]);
  const page = await context.newPage();
  const seen = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) seen.push(path);
  });
  const pageResponse = await page.goto(`${origin.origin}/station`, { waitUntil: "networkidle", timeout: 30000 });
  if (pageResponse?.status() !== 200) throw new Error("dashboard page status");
  await page.getByRole("heading", { name: "PREEM TINGSRYD" }).waitFor({ timeout: 15000 });
  if (!seen.includes("/api/station/dashboard") || !seen.includes("/api/station/v2")) {
    throw new Error("dashboard API was not requested");
  }
  await page.waitForTimeout(1500);
  if (seen.some((path) => path === "/api/station/weather")) {
    throw new Error("automatic weather request detected");
  }
  process.stdout.write("Dashboarden laddades i webbläsare; båda dashboard-API:erna anropades och inget väderanrop gjordes.\n");
} catch (error) {
  const known = new Set([
    "invalid smoke input", "dashboard page status", "dashboard API was not requested",
    "automatic weather request detected",
  ]);
  process.stderr.write(`Webbläsarkontrollen misslyckades: ${known.has(error.message) ? error.message : error.name}.\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
