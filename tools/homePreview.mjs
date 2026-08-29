import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseUrl = process.env.HOME_PREVIEW_URL ?? "http://127.0.0.1:4173";
const outDir = process.env.HOME_PREVIEW_OUT ?? "artifacts/home-preview";

await fs.mkdir(outDir, { recursive: true });

async function installFarmPreview(page) {
  await page.evaluate(() => {
    if (document.querySelector('[data-floating-panel="background-farm"]')) return;

    const panel = document.createElement("section");
    panel.className = "floating-panel floating-panel--background-farm";
    panel.dataset.floatingPanel = "background-farm";
    panel.dataset.displayState = "expanded";
    panel.dataset.dockSide = "left";
    panel.style.left = "8px";
    panel.style.top = `${Math.max(8, Math.round(window.innerHeight * 0.29))}px`;
    panel.innerHTML = `
      <div class="floating-panel__body">
        <div class="background-farm-status">
          <div class="background-farm-status__summary">オフライン周回 3 / 10</div>
          <div class="background-farm-status__detail">冒険を周回中</div>
          <button type="button">周回を終了</button>
        </div>
      </div>
      <button type="button" class="floating-panel__compact" hidden>3 / 10</button>
      <button type="button" class="floating-panel__docked" hidden>3/10 ‹</button>
    `;
    document.body.append(panel);
  });
  await page.waitForTimeout(150);
}

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

    if (viewport.width === 390) {
      await installFarmPreview(page);
      const panel = page.locator('[data-floating-panel="background-farm"]');
      await panel.waitFor({ state: "visible", timeout: 5000 });
      await page.screenshot({ path: `${outDir}/farm-expanded-390x844.png`, fullPage: false });

      const quickDock = panel.locator(".floating-panel__quick-dock");
      await quickDock.waitFor({ state: "visible", timeout: 5000 });
      await quickDock.click();
      await page.waitForTimeout(100);
      await page.screenshot({ path: `${outDir}/farm-docked-390x844.png`, fullPage: false });
    }

    await context.close();
  }
} finally {
  await browser.close();
}
