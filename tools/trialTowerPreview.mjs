import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseUrl = process.env.TOWER_PREVIEW_URL ?? "http://127.0.0.1:4174";
const outDir = process.env.TOWER_PREVIEW_OUT ?? "artifacts/trial-tower-preview";

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [
    { width: 390, height: 844, name: "390x844" },
    { width: 430, height: 932, name: "430x932" },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const open = async (query, expected) => {
      await page.goto(`${baseUrl}/preview.html?${query}`, { waitUntil: "networkidle" });
      await page.locator("html[data-crimon-preview-ready='1']").waitFor({ timeout: 15000 });
      await page.locator(expected).waitFor({ state: "visible", timeout: 15000 });

      const layout = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        modal: document.querySelector(".tower-modal__sheet")?.getBoundingClientRect().toJSON() ?? null,
      }));
      if (layout.pageWidth > layout.viewportWidth + 1) {
        throw new Error(`横スクロールを検出: page=${layout.pageWidth}, viewport=${layout.viewportWidth}`);
      }
      if (layout.modal && (layout.modal.left < -1 || layout.modal.right > layout.viewportWidth + 1)) {
        throw new Error(`モーダルの横はみ出しを検出: ${JSON.stringify(layout.modal)}`);
      }
      await page.locator(".tower-modal__sheet").evaluate((node) => { node.scrollTop = 0; }).catch(() => undefined);
    };

    await open("view=tower&floor=31", ".tower-screen");
    await page.locator("[data-tour='tower-rewards-open']").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${outDir}/tower-rewards-button-${viewport.name}.png`, fullPage: false });
    const upperBand = page.locator(".tower-band").nth(5);
    await upperBand.locator("summary").click();
    const floor60 = page.locator("[data-tour='tower-enemy-info-floor-60']");
    await floor60.scrollIntoViewIfNeeded();
    const floor60Hit = await floor60.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === node || (hit instanceof Node && node.contains(hit));
    });
    if (!floor60Hit) throw new Error("60階の敵情報ボタンが別の要素に覆われています");
    await page.screenshot({ path: `${outDir}/tower-locked-60-${viewport.name}.png`, fullPage: false });

    await open("view=tower&floor=31&panel=enemy&infoFloor=60", "[data-tour='tower-enemy-info']");
    await page.screenshot({ path: `${outDir}/enemy-locked-60-${viewport.name}.png`, fullPage: false });

    await open("view=tower&floor=100&panel=enemy", "[data-tour='tower-enemy-info']");
    await page.screenshot({ path: `${outDir}/enemy-100-top-${viewport.name}.png`, fullPage: false });
    await page.locator(".tower-modal__sheet").evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await page.screenshot({ path: `${outDir}/enemy-100-bottom-${viewport.name}.png`, fullPage: false });

    await open("view=tower&floor=100&panel=ranking", "[data-tour='tower-ranking']");
    await page.screenshot({ path: `${outDir}/ranking-100-${viewport.name}.png`, fullPage: false });

    await open("view=tower&floor=31&panel=rewards", "[data-tour='tower-rewards']");
    await page.screenshot({ path: `${outDir}/rewards-current-${viewport.name}.png`, fullPage: false });
    await page.locator(".tower-modal__sheet").evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await page.screenshot({ path: `${outDir}/rewards-bottom-${viewport.name}.png`, fullPage: false });

    await context.close();
  }
} finally {
  await browser.close();
}
