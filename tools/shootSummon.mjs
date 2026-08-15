/**
 * 召喚(ガチャ)画面の演出を撮る開発用ツール。
 * tools/shootApp.mjs をもとに、召喚タブを開いて実際にボタンを押し、
 * 「溜め → 閃光 → 出現」の各段階を時間差で撮る。
 *
 *   node tools/shootSummon.mjs <出力ディレクトリ> [幅] [高さ]
 *
 * 抽選は Math.random を差し替えて固定するので、
 * 低レア/最高レア/10連 のそれぞれを毎回同じ条件で見比べられる。
 * スクロールが要る状態になっていないかも各カットで報告する。
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outDir = process.argv[2] ?? "summon-shots";
const width = Number(process.argv[3] ?? 430);
const height = Number(process.argv[4] ?? 932);
const PORT = Number(process.env.SHOOT_PORT ?? 5401);

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
  const info = await page.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, timeout: 90000 });
  const overY = info.scrollH - info.clientH;
  const overX = info.scrollW - info.clientW;
  log(`${name}: ${file} (縦 ${overY > 2 ? `+${overY}px` : "0"} / 横 ${overX > 2 ? `+${overX}px` : "0"})`);
}

/** 抽選値を固定する。3つで1体分(段位・属性・テンプレート)を消費する */
async function stubRandom(page, values) {
  await page.evaluate((vals) => {
    let i = 0;
    Math.random = () => vals[i++ % vals.length];
  }, values);
}

async function openSummon(page) {
  const buttons = await page.$$(".bottom-nav__btn");
  for (const b of buttons) {
    const label = (await b.innerText()).replace(/\s+/g, "");
    if (label.includes("召喚")) {
      await b.click();
      await page.waitForTimeout(500);
      return;
    }
  }
  throw new Error("召喚タブが見つかりません");
}

/** 所持ダイヤを増やしてから召喚画面を開く(毎回同じ条件で始める) */
async function reset(page) {
  await page.evaluate(() => {
    const raw = localStorage.getItem("crimon_save_v1");
    if (!raw) return;
    const save = JSON.parse(raw);
    save.crystal = 999999;
    save.summonScrolls = 5;
    localStorage.setItem("crimon_save_v1", JSON.stringify(save));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await openSummon(page);
}

/** 抽選値の並びを作る。tiers は段位の値(0-1)の配列 */
function seq(tiers) {
  return tiers.flatMap((t, i) => [t, (i * 0.37) % 1, (i * 0.61) % 1]);
}

/** 召喚を実行し、押した時刻を基準に「何ms後に撮るか」で指定できるようにする */
async function pull(page, selector) {
  await page.click(selector);
  const started = Date.now();
  return async (name, ms) => {
    const wait = ms - (Date.now() - started);
    if (wait > 0) await page.waitForTimeout(wait);
    await shoot(page, name);
  };
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
    await page.waitForTimeout(2000);

    // --- 引く前 ---
    await reset(page);
    await page.waitForTimeout(900);
    await shoot(page, "01-idle");

    // --- 単発・低レア(星3通常): 溜め620ms ---
    await stubRandom(page, seq([0.2]));
    let cut = await pull(page, ".summon-cta__btn--single");
    await cut("02-low-charge", 300);
    await cut("03-low-burst", 700);
    await cut("04-low-reveal", 1300);

    // --- 単発・SR(星4通常): 溜め1300ms、紫まで上がる ---
    await reset(page);
    await stubRandom(page, seq([0.6]));
    cut = await pull(page, ".summon-cta__btn--single");
    await cut("05-sr-charge-purple", 900);
    await cut("06-sr-reveal", 2000);

    // --- 単発・最高レア(星5レア枠): 溜め2900ms、虹まで上がる ---
    await reset(page);
    await stubRandom(page, seq([0.99]));
    cut = await pull(page, ".summon-cta__btn--single");
    await cut("07-ssr-charge-blue", 400);
    await cut("08-ssr-charge-gold", 1700);
    await cut("09-ssr-charge-rainbow", 2550);
    await cut("10-ssr-burst", 3050);
    await cut("11-ssr-reveal", 3900);

    // --- 10連(星5レア枠が最後に出る並び) ---
    await reset(page);
    await stubRandom(page, seq([0.2, 0.3, 0.45, 0.6, 0.85, 0.1, 0.4, 0.75, 0.55, 0.99]));
    cut = await pull(page, ".summon-cta__btn--ten");
    await cut("12-ten-charge-gold", 1700);
    await cut("13-ten-burst", 3050);
    await cut("14-ten-reveal-mid", 3600);
    await cut("15-ten-final", 5200);

    // --- スキップ(溜めの途中で飛ばす) ---
    await reset(page);
    await stubRandom(page, seq([0.2, 0.3, 0.45, 0.6, 0.85, 0.1, 0.4, 0.75, 0.55, 0.99]));
    await pull(page, ".summon-cta__btn--ten");
    await page.waitForTimeout(400);
    await page.click(".summon-skip");
    await page.waitForTimeout(700);
    await shoot(page, "16-ten-skipped");
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  log("失敗:", error.message);
  process.exit(1);
});
