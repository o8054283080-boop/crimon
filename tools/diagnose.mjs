/**
 * バトルステージの描画不具合を調べる開発用ツール。
 * スクリーンショットを撮らずに、シーン内のユニットの位置・可視状態・
 * 画面上への投影座標を数値で吐き出す。
 *
 *   node tools/diagnose.mjs [出力JSONパス]
 *
 * 進捗を随時 stdout に出すので、途中で止まってもどこで詰まったか分かる。
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const outFile = process.argv[2] ?? "diagnose.json";
// 調べたい場面をクエリで切り替える(例: "seed=777&turns=4" で進行中のバトル)
const query = process.argv[3] ?? "seed=12345&paused=1";
// 画面比によって構図もエフェクトの大きさも変わるため、指定できるようにする
const vpWidth = Number(process.argv[4] ?? 640);
const vpHeight = Number(process.argv[5] ?? 640);
// 進行中のバトルは撮る瞬間で絵が大きく変わる。1枚では判断できないので
// 少し間隔を空けて複数枚撮り、傾向で見られるようにする
const frames = Number(process.argv[6] ?? 1);
const PORT = Number(process.env.SHOOT_PORT ?? 5320);
const BASE = `http://127.0.0.1:${PORT}/preview.html`;

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

/** ページ内で実行する調査本体。stage の中身を数値化して返す */
function collect() {
  const stage = window.__crimonStage;
  if (!stage) return { error: "__crimonStage が見つかりません" };

  const camera = stage.camera;
  const rect = stage.element.getBoundingClientRect();
  const out = {
    canvas: { width: Math.round(rect.width), height: Math.round(rect.height) },
    camera: {
      position: camera.position.toArray().map((v) => +v.toFixed(2)),
      fov: +camera.fov.toFixed(2),
    },
    sceneChildren: stage.scene.children.length,
    // 描画が破綻した時に、エフェクトの出しっぱなしを疑うための計測値
    vfx: (() => {
      const info = {
        rootChildren: stage.vfx.root.children.length,
        auraUnits: stage.vfx.auras ? stage.vfx.auras.size : null,
        auraTotal: stage.vfx.auras
          ? [...stage.vfx.auras.values()].reduce((sum, byKind) => sum + byKind.size, 0)
          : null,
      };
      // どのサブシステムが画面を埋めているかを切り分けるための実数
      try {
        const v = stage.vfx;
        info.liveBillboards = v.billboards?.items?.length ?? null;
        info.billboardMaxScale = v.billboards?.maxScale ?? null;
        info.biggestBillboard = v.billboards?.items
          ? Math.max(0, ...v.billboards.items.map((i) => i.mesh.scale.x))
          : null;
        info.liveStrips = v.strips?.items?.length ?? null;
        info.liveParticlesAdditive = v.particles?.additive?.liveCount ?? null;
        info.liveParticlesAlpha = v.particles?.alpha?.liveCount ?? null;
      } catch (e) {
        info.probeError = String(e);
      }
      // 粒子がカメラの手前/背後に来ると gl_PointSize が発散して画面を覆う。
      // 実際にそうなっている粒があるかを、ビュー空間の奥行きで数える。
      const field = stage.vfx.particles;
      if (field && field.geometry) {
        const pos = field.geometry.getAttribute("position");
        const alpha = field.geometry.getAttribute("aAlpha") ?? field.geometry.getAttribute("aLife");
        const size = field.geometry.getAttribute("aSize");
        const mv = camera.matrixWorldInverse;
        let live = 0;
        let danger = 0;
        let worstSize = 0;
        let worstDepth = Infinity;
        for (let i = 0; i < pos.count; i++) {
          const a = alpha ? alpha.getX(i) : 1;
          if (a <= 0.002) continue;
          live++;
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          // ビュー空間 z(負が前方)。-z が 0 に近いほど点が巨大化する
          const vz = mv.elements[2] * x + mv.elements[6] * y + mv.elements[10] * z + mv.elements[14];
          const depth = -vz;
          const px = (size ? size.getX(i) : 1) * (300 / Math.max(0.001, depth));
          if (depth < 1) danger++;
          if (px > worstSize) { worstSize = px; worstDepth = depth; }
        }
        info.liveParticles = live;
        info.nearCameraParticles = danger;
        info.worstPointSizePx = +worstSize.toFixed(1);
        info.worstDepth = +worstDepth.toFixed(3);
      }
      return info;
    })(),
    units: [],
  };

  for (const [id, avatar] of stage.avatars) {
    avatar.root.updateWorldMatrix(true, true);

    let meshCount = 0;
    let hiddenMeshes = 0;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const scratch = camera.position.clone();

    avatar.root.traverse((node) => {
      if (!node.isMesh) return;
      meshCount++;
      // 自分か祖先に visible=false があれば、そのメッシュは描画されない
      let visible = true;
      for (let n = node; n; n = n.parent) {
        if (!n.visible) {
          visible = false;
          break;
        }
      }
      if (!visible) hiddenMeshes++;
      node.getWorldPosition(scratch);
      for (let i = 0; i < 3; i++) {
        const v = scratch.getComponent(i);
        if (v < min[i]) min[i] = v;
        if (v > max[i]) max[i] = v;
      }
    });

    const anchor = avatar.getAnchorWorldPosition(scratch.clone());
    const ndc = anchor.clone().project(camera);

    out.units.push({
      id,
      rootPos: avatar.root.position.toArray().map((v) => +v.toFixed(2)),
      rootScale: avatar.root.scale.toArray().map((v) => +v.toFixed(3)),
      rootRotY: +avatar.root.rotation.y.toFixed(2),
      inScene: !!avatar.root.parent,
      meshCount,
      hiddenMeshes,
      worldMin: min.map((v) => (Number.isFinite(v) ? +v.toFixed(2) : null)),
      worldMax: max.map((v) => (Number.isFinite(v) ? +v.toFixed(2) : null)),
      anchorWorld: anchor.toArray().map((v) => +v.toFixed(2)),
      screen: [Math.round((ndc.x * 0.5 + 0.5) * rect.width), Math.round((-ndc.y * 0.5 + 0.5) * rect.height)],
      ndcZ: +ndc.z.toFixed(3),
    });
  }
  return out;
}

async function main() {
  log("vite を起動中...");
  const server = await startDevServer();
  await new Promise((r) => setTimeout(r, 1200));
  log("vite 起動完了");

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  log("chromium 起動完了");

  try {
    // 描画負荷を下げるため小さめのビューポートで調べる
    const context = await browser.newContext({ viewport: { width: vpWidth, height: vpHeight }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on("pageerror", (e) => log("PAGEERROR:", e.message));
    page.on("console", (m) => {
      if (m.type() === "error") log("CONSOLE ERROR:", m.text());
    });

    // networkidle は vite の HMR WebSocket が開いたままだと成立しないことがある
    await page.goto(`${BASE}?${query}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    log("ページ読み込み完了、初期化待ち...");
    await page.waitForFunction(() => window.__crimonPreviewReady === true, null, { timeout: 60000 });
    log("プレビュー初期化完了、描画待ち...");
    await page.waitForTimeout(3000);

    log("シーンを調査中...");
    const report = await page.evaluate(collect);
    const json = JSON.stringify(report, null, 2);
    await writeFile(outFile, json, "utf-8");
    log(`結果を ${outFile} に書き出しました`);

    // 数値と見た目を突き合わせられるよう、同じ状態のステージ画像も残す。
    // 投影座標(units[].screen)は、この画像のピクセル座標と一致する。
    const box = await page.evaluate(() => {
      const node = document.querySelector(".battle-stage");
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    if (box && box.width > 1) {
      const base = outFile.replace(/\.json$/, "");
      for (let i = 0; i < frames; i++) {
        const shot = frames > 1 ? `${base}-stage-${i + 1}.png` : `${base}-stage.png`;
        await page.screenshot({ path: shot, clip: box, timeout: 90000 });
        log(`ステージ画像を ${shot} に保存しました`);
        if (i < frames - 1) await page.waitForTimeout(500);
      }
    }

    console.log(json);
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}

main().catch(async (error) => {
  log("失敗:", error.message);
  process.exit(1);
});
