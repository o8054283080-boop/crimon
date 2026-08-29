/**
 * 見た目・操作の確認を速くするための常駐サーバ。
 *
 * これまでは確認のたびに Vite と Chromium を起動し直しており、1回に2〜8分
 * かかっていた。UIやWebGLの不具合は型チェックもテストも素通りするため
 * 実ブラウザでの確認が必須で、そのたびに往復が発生していた。
 *
 * この道具は Vite とブラウザを立ち上げたまま保持し、確認の指示だけを
 * HTTPで受け取る。2回目以降の確認は数秒で終わる。
 *
 *   起動:  node tools/harness.mjs           (そのまま常駐する)
 *   利用:  node tools/probe.mjs <命令> ...   (別プロセスから叩く)
 *
 * 立ち上げっぱなしのブラウザは状態を持ち越すので、画面遷移をまたぐ確認では
 * /reset で読み込み直すこと。
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { CHROMIUM_GL_ARGS, chromiumExecutablePath } from "./lib/chromium.mjs";

const VITE_PORT = Number(process.env.HARNESS_VITE_PORT ?? 5310);
const CONTROL_PORT = Number(process.env.HARNESS_PORT ?? 5311);
const CHROMIUM = chromiumExecutablePath();

const log = (message) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${message}`);

const vite = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((resolve) => {
  vite.stdout.on("data", (chunk) => {
    if (String(chunk).includes("ready in") || String(chunk).includes("Local:")) resolve();
  });
  setTimeout(resolve, 12000);
});
log(`vite 起動 (${VITE_PORT})`);

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: CHROMIUM_GL_ARGS,
});
let page = await browser.newPage({ viewport: { width: 900, height: 430 }, deviceScaleFactor: 1 });

/** ブラウザ側の異常。型チェックが拾えない不具合はここに出る */
let problems = [];

/**
 * 毎回必ず出る無害な雑音。ここを放っておくと本物のエラーが埋もれて
 * 「problems が空でないこと」を見なくなるので、既知の分だけ落とす。
 * 増やす時は「本当に無害か」を確かめてから足すこと。
 */
const IGNORED = [/favicon\.ico/];

function watch(target) {
  const push = (line) => {
    if (IGNORED.some((pattern) => pattern.test(line))) return;
    problems.push(line);
  };
  target.on("pageerror", (error) => push(`[例外] ${String(error).slice(0, 400)}`));
  target.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // 読み込み失敗はどのURLか分からないと判断できないので、場所を添える
    const where = message.location?.().url ?? "";
    push(`[エラー] ${text.slice(0, 300)}${where ? ` (${where})` : ""}`);
  });
}
watch(page);
log(`chromium 起動 / 制御は ${CONTROL_PORT} 番で待ち受け`);

const readBody = (request) =>
  new Promise((resolve) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

async function handle(command, body) {
  switch (command) {
    case "health":
      return { ok: true, vitePort: VITE_PORT };

    case "size":
      await page.setViewportSize({ width: body.width ?? 900, height: body.height ?? 430 });
      return { ok: true, width: body.width, height: body.height };

    case "goto": {
      // 状態を持ち越したくない時のために、毎回まっさらな頁から始められるようにする
      if (body.fresh) {
        await page.close().catch(() => {});
        page = await browser.newPage({
          viewport: body.width ? { width: body.width, height: body.height ?? 430 } : { width: 900, height: 430 },
          deviceScaleFactor: 1,
        });
        watch(page);
      }
      problems = [];
      const path = body.path ?? "/";
      await page.goto(`http://127.0.0.1:${VITE_PORT}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (body.waitPreview) await page.waitForFunction(() => window.__crimonPreviewReady === true, null, { timeout: 60000 });
      await page.waitForTimeout(body.settle ?? 2000);
      return { ok: true, path, problems };
    }

    case "eval": {
      const value = await page.evaluate(body.expression);
      return { ok: true, value, problems };
    }

    case "wait":
      await page.waitForTimeout(body.ms ?? 500);
      return { ok: true };

    case "tap": {
      // 画面座標を直に叩く。3Dの当たり判定の確認に使う
      await page.mouse.move(body.x, body.y);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(body.settle ?? 400);
      return { ok: true, problems };
    }

    case "drag": {
      await page.mouse.move(body.x, body.y);
      await page.mouse.down();
      const steps = body.steps ?? 12;
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(body.x + ((body.dx ?? 0) * i) / steps, body.y + ((body.dy ?? 0) * i) / steps);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      await page.waitForTimeout(body.settle ?? 600);
      return { ok: true, problems };
    }

    case "shot": {
      const clip = body.selector
        ? await page.evaluate((sel) => {
            const node = document.querySelector(sel);
            if (!node) return null;
            const r = node.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          }, body.selector)
        : null;
      await page.screenshot({ path: body.path, clip: clip ?? undefined, timeout: 90000 });
      return { ok: true, path: body.path, problems };
    }

    case "problems":
      return { ok: true, problems };

    case "quit":
      setTimeout(async () => {
        await browser.close().catch(() => {});
        vite.kill("SIGKILL");
        process.exit(0);
      }, 50);
      return { ok: true };

    default:
      return { ok: false, error: `知らない命令: ${command}` };
  }
}

createServer(async (request, response) => {
  const command = (request.url ?? "/").replace(/^\//, "").split("?")[0];
  const body = await readBody(request);
  let result;
  try {
    result = await handle(command, body);
  } catch (error) {
    result = { ok: false, error: String(error).slice(0, 600) };
  }
  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(result));
}).listen(CONTROL_PORT, "127.0.0.1", () => log("待ち受け開始"));
