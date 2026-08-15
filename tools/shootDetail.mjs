/**
 * ステージ詳細・モンスター詳細・図鑑まで潜って撮る開発用ツール。
 * tools/shootApp.mjs はボトムナビの各タブしか撮れないため、そこから
 * 「カードを押した先」の画面を確認するためにこちらを使う。
 *
 *   node tools/shootDetail.mjs <出力ディレクトリ> [幅] [高さ]
 *
 * セーブデータを差し込んでから開くので、クリア済みステージ・星やレベルの
 * ばらけたモンスター・装備ありといった、実際に遊んだ後の見え方を確認できる。
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outDir = process.argv[2] ?? "detail-shots";
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

/** ある程度遊んだ後のセーブデータ。詳細画面の見え方を現実的な状態で確認するため */
function buildSave() {
  const mon = (i, dexId, star, level, skillLevels, equipment = {}) => ({
    id: `mon_seed_${i}`,
    dexId,
    star,
    level,
    exp: 120,
    equipment,
    skillLevels,
  });

  const equipment = [
    { id: "eq1", slot: 1, star: 5, level: 9, set: "CRIT", mainStat: { type: "ATK_FLAT", value: 88 }, subStats: [{ type: "CRIT_RATE", value: 0.11 }, { type: "SPD", value: 7 }, { type: "HP_PERCENT", value: 0.08 }] },
    { id: "eq2", slot: 2, star: 5, level: 6, set: "CRIT", mainStat: { type: "SPD", value: 21 }, subStats: [{ type: "ATK_PERCENT", value: 0.09 }, { type: "CRIT_DMG", value: 0.14 }] },
    { id: "eq3", slot: 3, star: 4, level: 3, set: "POWER", mainStat: { type: "DEF_FLAT", value: 42 }, subStats: [{ type: "DEF_PERCENT", value: 0.07 }] },
    { id: "eq4", slot: 4, star: 5, level: 12, set: "POWER", mainStat: { type: "CRIT_DMG", value: 0.33 }, subStats: [{ type: "ATK_FLAT", value: 24 }, { type: "ACCURACY", value: 0.1 }] },
  ];

  const monsters = [
    mon(1, "dragon_FIRE", 5, 42, [5, 4, 3], { 1: "eq1", 2: "eq2", 3: "eq3", 4: "eq4" }),
    mon(2, "wolf_WATER", 4, 31, [3, 2, 1]),
    mon(3, "golem_ELECTRIC", 3, 25, [2, 1, 1]),
    mon(4, "fairy_GRASS", 4, 18, [1, 1, 1]),
    mon(5, "slime_FIRE", 2, 12, [1, 1, 1]),
    mon(6, "slime_WATER", 1, 8, [1, 1, 1]),
    mon(7, "seraph_LIGHT", 5, 50, [5, 5, 5]),
    mon(8, "nemesis_DARK", 6, 55, [5, 5, 4]),
    mon(9, "griffon_ELECTRIC", 4, 22, [2, 2, 1]),
    mon(10, "wolf_FIRE", 2, 14, [1, 1, 1]),
  ];

  return {
    crystal: 1240,
    gold: 38400,
    monsters,
    partyIds: [monsters[0].id, monsters[1].id, monsters[6].id, monsters[7].id],
    // チャプター1は全クリア、チャプター2は途中、ハードも少しだけ触っている状態
    clearedStageIds: ["1-1", "1-2", "1-3", "1-4", "1-5", "2-1", "2-2", "1-1::HARD", "1-2::HARD", "1-1::HELL"],
    clearedDungeonFloors: [1, 2],
    clearedLevelDungeonTiers: [],
    equipment,
    dungeonPartyIds: [],
    summonScrolls: 3,
    fighterLevel: 12,
    fighterExp: 300,
    stamina: 96,
    maxStamina: 260,
    lastStaminaUpdateAt: Date.now(),
    fighterName: "テスター",
    lastLoginBonusAt: Date.now(),
    loginBonusClaimCount: 4,
    goldDungeonChallengesToday: 0,
    lastGoldDungeonResetAt: Date.now(),
  };
}

async function shoot(page, name) {
  await page.waitForTimeout(700);
  const info = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: document.documentElement.clientHeight,
    bodyWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, timeout: 90000 });
  const overflow = info.scrollHeight - info.viewportHeight;
  const hOverflow = info.bodyWidth - info.viewportWidth;
  log(
    `${name}: ${file} (縦スクロール ${overflow > 2 ? `+${overflow}px` : "なし"}` +
      `${hOverflow > 2 ? ` / 横はみ出し +${hOverflow}px` : ""})`,
  );
}

/** 表示文字で要素を探して押す */
async function clickByText(page, selector, text) {
  const handles = await page.$$(selector);
  for (const handle of handles) {
    const label = (await handle.innerText()).replace(/\s+/g, "");
    if (label.includes(text)) {
      await handle.click();
      await page.waitForTimeout(400);
      return true;
    }
  }
  log(`  (見つからず: ${selector} "${text}")`);
  return false;
}

async function openTab(page, label) {
  const buttons = await page.$$(".bottom-nav__btn");
  for (const button of buttons) {
    const text = (await button.innerText()).replace(/\s+/g, "");
    if (text.includes(label)) {
      await button.click();
      await page.waitForTimeout(500);
      return true;
    }
  }
  return false;
}

async function clickNth(page, selector, index) {
  const handles = await page.$$(selector);
  if (!handles[index]) {
    log(`  (見つからず: ${selector}[${index}])`);
    return false;
  }
  await handles[index].click();
  await page.waitForTimeout(400);
  return true;
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
    const save = buildSave();
    await context.addInitScript((data) => {
      localStorage.setItem("crimon_save_v1", JSON.stringify(data));
    }, save);

    const page = await context.newPage();
    page.on("pageerror", (e) => log("PAGEERROR:", e.message));

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2000);

    // --- ステージ ---
    await openTab(page, "ステージ");
    await shoot(page, "stages-list");
    // 最初の未クリアステージ(2-3)あたりを開く
    await clickNth(page, ".stage-card", 7);
    await shoot(page, "stage-detail");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shoot(page, "stage-detail-bottom");
    await clickByText(page, "button", "ステージ選択に戻る");
    // ボスのいる最終ステージ
    await clickNth(page, ".stage-card", 4);
    await shoot(page, "stage-detail-boss");
    await clickByText(page, "button", "ステージ選択に戻る");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shoot(page, "stages-list-bottom");

    // --- モンスター詳細 ---
    await openTab(page, "モンスター");
    await shoot(page, "monsters-list");
    await clickNth(page, ".mcard", 0);
    await shoot(page, "monster-detail");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shoot(page, "monster-detail-bottom");
    await clickByText(page, "button", "一覧に戻る");

    // --- 図鑑 ---
    await clickByText(page, "button", "図鑑");
    await shoot(page, "dex-list");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shoot(page, "dex-list-bottom");
    await page.evaluate(() => window.scrollTo(0, 0));
    await clickNth(page, ".mcard", 0);
    await shoot(page, "dex-detail");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shoot(page, "dex-detail-bottom");
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  log("失敗:", error.message);
  process.exit(1);
});
