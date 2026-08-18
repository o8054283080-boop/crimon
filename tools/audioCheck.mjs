/**
 * 音が実際に鳴るかを、**本番と同じ制限のブラウザ**で確かめる。
 *
 * 常駐の確認用サーバ(harness.mjs)は Playwright の既定の起動引数を使うため、
 * 自動再生の制限が外れている。そのせいで「AudioContext を resume していない」
 * という致命的な不具合を素通りさせてしまった。
 * ここでは制限を明示的に有効にして起動する。
 *
 *   node tools/audioCheck.mjs [URL]
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:5370/";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: [
    "--no-sandbox",
    // 本番のブラウザと同じ条件にする。ここが要
    "--autoplay-policy=user-gesture-required",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const problems = [];
page.on("pageerror", (e) => problems.push(String(e)));
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);

const before = await page.evaluate(() => window.__crimonAudio?.contextState() ?? "窓口なし");

// 実際に画面を押して解錠されるかを見る
await page.mouse.click(195, 700);
await page.waitForTimeout(1200);
const after = await page.evaluate(() => window.__crimonAudio?.contextState() ?? "窓口なし");

const measured = await page.evaluate(async () => {
  const a = window.__crimonAudio;
  if (!a) return null;
  return { tap: await a.measure("tap", 600), heal: await a.measure("heal", 700) };
});

console.log(JSON.stringify({ 操作前の状態: before, 操作後の状態: after, 実測: measured, problems }, null, 1));
await browser.close();
