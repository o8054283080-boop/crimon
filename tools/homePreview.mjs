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

    // お詫び・ログイン報酬を受け取った後も、背景ステージが自然に伸びて
    // CURRENT PARTY や下部ナビとの間に空白が生まれないことを確認する。
    while (await page.locator(".reward-banner__close").count()) {
      await page.locator(".reward-banner__close").first().click();
      await page.waitForTimeout(80);
    }
    await page.screenshot({
      path: `${outDir}/${viewport.name.replace(".png", "-no-rewards.png")}`,
      fullPage: false,
    });

    // Playwright の通常コンテキストは iPhone の下部safe-areaが 0px になる。
    // 実機で編成パネルが固定ナビの裏へ潜らないことを、代表値 34px で確認する。
    await page.addStyleTag({
      content: "body:has(.crimon-home) { --home-safe-bottom: 34px !important; }",
    });
    await page.screenshot({
      path: `${outDir}/${viewport.name.replace(".png", "-no-rewards-safe-bottom.png")}`,
      fullPage: false,
    });

    // 実データで起こり得る最大級の所持数を入れ、生成フレーム内のアイコンと
    // 数値が重ならず、右端からもはみ出さないことを両サイズで確認する。
    await page.locator(".home-wallet__chip--crystal strong").evaluate((node) => {
      node.textContent = "11,300";
    });
    await page.locator(".home-wallet__chip--gold strong").evaluate((node) => {
      node.textContent = "2,136,000";
    });
    await page.locator(".home-wallet__chip--stamina strong").evaluate((node) => {
      node.textContent = "308";
    });
    await page.locator(".home-wallet__chip--stamina .home-wallet__suffix").evaluate((node) => {
      node.textContent = "/ 308";
    });
    await page.screenshot({
      path: `${outDir}/${viewport.name.replace(".png", "-no-rewards-safe-bottom-long-resources.png")}`,
      fullPage: false,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
