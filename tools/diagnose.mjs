/**
 * バトルステージの描画不具合を調べる開発用ツール。
 * スクリーンショットを撮らずに、シーン内のユニットの位置・可視状態・
 * 画面上への投影座標・実際のピクセル色を数値で吐き出す。
 *
 *   node tools/diagnose.mjs
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = Number(process.env.SHOOT_PORT ?? 5320);
const BASE = `http://127.0.0.1:${PORT}/preview.html`;

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
  const server = await startDevServer();
  await new Promise((r) => setTimeout(r, 1500));

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });

  try {
    // 描画負荷を下げるため小さめのビューポートで調べる
    const context = await browser.newContext({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    page.on("console", (m) => {
      if (m.type() === "error") console.log("CONSOLE ERROR:", m.text());
    });

    await page.goto(`${BASE}?seed=12345&paused=1`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForFunction(() => window.__crimonPreviewReady === true, null, { timeout: 20000 });
    await page.waitForTimeout(2500);

    const report = await page.evaluate(() => {
      const stage = window.__crimonStage;
      if (!stage) return { error: "__crimonStage が見つかりません" };

      const THREE = stage.scene.constructor;
      const camera = stage.camera;
      const rect = stage.element.getBoundingClientRect();

      const out = { canvas: { width: rect.width, height: rect.height }, camera: {}, units: [], sceneChildren: 0 };
      out.camera = {
        position: camera.position.toArray().map((v) => +v.toFixed(2)),
        fov: +camera.fov.toFixed(2),
        near: camera.near,
        far: camera.far,
      };
      out.sceneChildren = stage.scene.children.length;

      const frustum = new (Object.getPrototypeOf(stage.scene).constructor === Object ? Object : Object)();

      for (const [id, avatar] of stage.avatars) {
        const rootPos = avatar.root.position;
        let meshCount = 0;
        let visibleAll = true;
        let minY = Infinity;
        let maxY = -Infinity;
        const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

        avatar.root.updateWorldMatrix(true, true);
        avatar.root.traverse((node) => {
          if (node.isMesh) {
            meshCount++;
            if (!node.visible) visibleAll = false;
            const p = node.getWorldPosition(new (rootPos.constructor)());
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
            box.min[0] = Math.min(box.min[0], p.x);
            box.min[1] = Math.min(box.min[1], p.y);
            box.min[2] = Math.min(box.min[2], p.z);
            box.max[0] = Math.max(box.max[0], p.x);
            box.max[1] = Math.max(box.max[1], p.y);
            box.max[2] = Math.max(box.max[2], p.z);
          }
        });

        const anchor = avatar.getAnchorWorldPosition(new (rootPos.constructor)());
        const projected = anchor.clone().project(camera);

        out.units.push({
          id,
          rootPos: rootPos.toArray().map((v) => +v.toFixed(2)),
          rootVisible: avatar.root.visible,
          inScene: !!avatar.root.parent,
          meshCount,
          allMeshesVisible: visibleAll,
          worldY: [+minY.toFixed(2), +maxY.toFixed(2)],
          worldBoxMin: box.min.map((v) => +v.toFixed(2)),
          worldBoxMax: box.max.map((v) => +v.toFixed(2)),
          screen: [
            +((projected.x * 0.5 + 0.5) * rect.width).toFixed(0),
            +((-projected.y * 0.5 + 0.5) * rect.height).toFixed(0),
          ],
          ndcZ: +projected.z.toFixed(3),
        });
      }
      return out;
    });

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
