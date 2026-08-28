import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseUrl = process.env.HOME_PREVIEW_URL ?? "http://127.0.0.1:4173";
const outDir = process.env.HOME_PREVIEW_OUT ?? "artifacts/home-preview";

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [
    { width: 390, height: 844, name: "home-390x844.png" },
    { width: 430, height: 932, name: "home-430x932.png" },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      sessionStorage.setItem("crimon.started", "1");
    });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator(".crimon-home").waitFor({ state: "visible", timeout: 15000 });
    await page.screenshot({ path: `${outDir}/${viewport.name}`, fullPage: false });
    await context.close();
  }
} finally {
  await browser.close();
}
