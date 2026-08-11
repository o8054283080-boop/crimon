/**
 * バトルステージのスクリーンショット撮影ツール(開発用)。
 *
 *   node tools/shoot.mjs <出力ディレクトリ> [--url-suffix "&turns=6"]
 *
 * viteの開発サーバを立ち上げ、プレビューページを複数の条件で撮影する。
 * 見た目のレビューを人間/レビュー用エージェントに渡すために使う。
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outDir = process.argv[2] ?? "shots";
// 複数の作業を並行させる時にポートが衝突しないよう、環境変数で変えられるようにする
const PORT = Number(process.env.SHOOT_PORT ?? 5199);
const BASE = `http://127.0.0.1:${PORT}/preview.html`;

/** 撮影する画面サイズ。実機で多い縦長と、横長の両方を押さえる */
const VIEWPORTS = [
  // ソフトウェアGL(swiftshader)で撮るため、dprは1に抑える(2にするとブルーム込みで描画が間に合わない)
  { name: "phone", width: 430, height: 932, dpr: 1 },
  { name: "tablet", width: 900, height: 1200, dpr: 1 },
];

/** バトルの進行度違い。序盤の整列と、戦闘中盤の荒れた画を両方撮る */
const SCENES = [
  { name: "opening", query: "seed=12345&paused=1" },
  { name: "midfight", query: "seed=12345&turns=7&paused=1" },
  { name: "action", query: "seed=777&turns=4" },
];

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

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = await startDevServer();
  // dev serverが実際にリクエストを受けられるまで少し待つ
  await new Promise((r) => setTimeout(r, 1500));

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });

  const errors = [];
  const written = [];

  try {
    for (const viewport of VIEWPORTS) {
      for (const scene of SCENES) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: viewport.dpr,
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(`[${viewport.name}/${scene.name}] ${error.message}`));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(`[${viewport.name}/${scene.name}] console: ${message.text()}`);
        });

        await page.goto(`${BASE}?${scene.query}`, { waitUntil: "networkidle", timeout: 45000 });
        // WebGLの初回描画とアニメーションの立ち上がりを待つ
        await page.waitForFunction(() => window.__crimonPreviewReady === true, null, { timeout: 20000 });
        await page.waitForTimeout(2600);

        const file = path.join(outDir, `${viewport.name}-${scene.name}.png`);
        await page.screenshot({ path: file, fullPage: false, timeout: 90000 });
        written.push(file);

        // ステージだけを切り出したカットも撮る(3D描画の粗を見やすくするため)。
        // 常時アニメーションしているためelementHandle.screenshotは安定待ちで固まる。
        // 座標を取ってclip指定で撮る。
        const box = await page.evaluate(() => {
          const node = document.querySelector(".battle-stage");
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        });
        if (box && box.width > 1 && box.height > 1) {
          const stageFile = path.join(outDir, `${viewport.name}-${scene.name}-stage.png`);
          await page.screenshot({ path: stageFile, clip: box, timeout: 90000 });
          written.push(stageFile);
        }

        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }

  await writeFile(path.join(outDir, "errors.txt"), errors.join("\n") || "(エラーなし)", "utf-8");
  console.log(written.join("\n"));
  if (errors.length > 0) {
    console.log("\n--- ページ内エラー ---");
    console.log(errors.join("\n"));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
