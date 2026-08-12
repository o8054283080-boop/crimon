/**
 * ゲーム本体(index.html)の各画面を撮る開発用ツール。
 * バトル画面だけを見る tools/shoot.mjs とは別に、
 * ホームや召喚などUI側の見た目を確認するために使う。
 *
 *   node tools/shootApp.mjs <出力ディレクトリ> [幅] [高さ]
 *
 * ボトムナビを順に押して各画面を撮る。ページがスクロールを必要としているかも
 * あわせて報告する(1画面に収まっているかの確認用)。
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outDir = process.argv[2] ?? "app-shots";
const width = Number(process.argv[3] ?? 430);
const height = Number(process.argv[4] ?? 932);
const PORT = Number(process.env.SHOOT_PORT ?? 5380);

const log = (...args) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);

function startDevServer() {
  const child = spawn("npx", ["vite", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("viteの起動がタイムアウトしました")), 60000);
    const onData = (buffer) => {
      const text = buffer.toString();
      if (text.includes("ready in") || text.includes("Local:")) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`viteが終了しました (code=${code})`));
    });
  });
}

async function shoot(page, name) {
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: document.documentElement.clientHeight,
  }));
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, timeout: 90000 });
  const overflow = info.scrollHeight - info.viewportHeight;
  log(`${name}: ${file} (スクロール量 ${overflow > 2 ? `+${overflow}px` : "なし"})`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = await startDevServer();
  await new Promise((r) => setTimeout(r, 1500));

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });

  try {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on("pageerror", (e) => log("PAGEERROR:", e.message));

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    await shoot(page, "home");

    // ボトムナビの各タブを順に開く。ラベルは実装に合わせて探す
    const tabs = await page.$$(".bottom-nav__btn");
    for (let i = 0; i < tabs.length; i++) {
      const buttons = await page.$$(".bottom-nav__btn");
      const button = buttons[i];
      if (!button) continue;
      const label = (await button.innerText()).replace(/\s+/g, "");
      await button.click();
      await shoot(page, `tab${i + 1}-${label || i + 1}`);
    }
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  log("失敗:", error.message);
  process.exit(1);
});
