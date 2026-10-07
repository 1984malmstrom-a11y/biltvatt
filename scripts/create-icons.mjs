// Reproducible rasterisation of our OWN SVG, not a downloaded/corporate logo.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const svg = readFileSync(
  new URL("../public/icons/tvattligan.svg", import.meta.url),
  "utf8",
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  for (const [size, name] of [
    [192, "tvattligan-192.png"],
    [512, "tvattligan-512.png"],
    [512, "tvattligan-maskable-512.png"],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;width:100%;height:100%;}svg{width:100%;height:100%;display:block}</style>${svg}`,
    );
    await page.screenshot({
      path: new URL("../public/icons/" + name, import.meta.url).pathname,
    });
  }
} finally {
  await browser.close();
}
