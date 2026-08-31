/**
 * コマ送りの待機アニメ(スプライトシート)を、ゲームに載る形へ整える。
 *
 *   node tools/prepareSpriteSheets.mjs [入力フォルダ] [出力フォルダ] [列] [行]
 *     既定: art/sheets-raw → src/web/assets/monsters  6列 6行
 *
 * 入力は `<種族>-idle.png` のような名前の、格子状に並んだ透過PNG。
 *
 * ## なぜ道具にするのか
 *
 * 届いたシートは **5760×5760(1コマ960×960)** だった。
 * 画面での表示は80px前後なので、**そのまま入れると容量の無駄が桁で違う。**
 * 1コマを128pxへ落として並べ直すと、6×6で768×768。WebPにして数十KBになる。
 *
 * ## 何を測るか
 *
 * コマ送りは**中心と足元が揃っていること**が命。ずれていると、
 * 再生するたびに絵が跳ねて「アニメーション」ではなく「ちらつき」になる。
 * 生成側(FrameSprite)は揃えてくれるが、**揃っている保証は無い**ので毎回測る。
 *
 * 動きの量も測る。硬い造形(鎧・岩)は生成側がほとんど動かしてくれず、
 * 縮小すると数pxしか変わらない。**その場合はシートを使わず、
 * 従来のシェーダ変形(呼吸・遅れ・頷き)に任せた方が動いて見える。**
 */
import { chromium } from "playwright";
import { CHROMIUM_GL_ARGS, chromiumExecutablePath } from "./lib/chromium.mjs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const inDir = process.argv[2] ?? "art/sheets-raw";
const outDir = process.argv[3] ?? "src/web/assets/monsters";
const COLS = Number(process.argv[4] ?? "6");
const ROWS = Number(process.argv[5] ?? "6");

/**
 * 1コマの画素数。
 *
 * 戦闘画面での実表示は80px前後。1.6倍あれば拡大されない。
 * ここを大きくしても画面上は1画素も変わらず、容量だけが増える。
 */
const CELL = 128;
const WEBP_QUALITY = 0.85;

/**
 * 「動いている」と認める、**コマ間の画素差**。
 *
 * ## 外接矩形の変化で測って間違えた
 *
 * 最初は「体の外接矩形がどれだけ伸び縮みするか」で測っていた。
 * その基準ではネメシスが4.4%、スライムが24%となり、
 * **ネメシスを「ほとんど動いていない」と切り捨てた。**
 *
 * 依頼主の指摘で測り直したら逆だった。
 *
 *   ネメシス … 輪郭の変化 4.4% / **コマ間の画素差 22.1**
 *   スライム … 輪郭の変化 24%  / コマ間の画素差 32.7
 *
 * ネメシスは**輪郭がほとんど変わらないまま、中身が動いていた。**
 * マントの揺れ、鎌の微動、目の光の明滅。外接矩形はそれを1つも拾わない。
 * 鎧や岩のように輪郭が硬い造形ほど、この測り方だと過小評価される。
 *
 * 0〜255のスケールで、不透明な画素だけの平均。完全な静止画なら0になる。
 * 6は「隣のコマと見比べて違いが分かる」下限。
 */
const MOTION_FLOOR = 6;

const log = (...args) => console.log(`[${new Date().toTimeString().slice(0, 8)}]`, ...args);

const PREPARE = `async (dataUrl, options) => {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("画像を読めない"));
    image.src = dataUrl;
  });

  const { cols, rows, cell } = options;
  const srcW = Math.floor(image.naturalWidth / cols);
  const srcH = Math.floor(image.naturalHeight / rows);

  const probe = document.createElement("canvas");
  probe.width = image.naturalWidth;
  probe.height = image.naturalHeight;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  pctx.drawImage(image, 0, 0);
  const { data } = pctx.getImageData(0, 0, probe.width, probe.height);

  /*
   * コマごとに、中身の外接矩形を測る。
   * 中心と足元がコマ間で動いていないかを見るため。
   */
  const boxes = [];
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      let minX = srcW, minY = srcH, maxX = -1, maxY = -1;
      for (let y = 0; y < srcH; y++) {
        for (let x = 0; x < srcW; x++) {
          const i = ((ry * srcH + y) * probe.width + (rx * srcW + x)) * 4;
          if (data[i + 3] < 24) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      boxes.push(maxX < 0 ? null : { minX, minY, maxX, maxY });
    }
  }
  const filled = boxes.filter(Boolean);
  if (filled.length === 0) return { error: "全部が透明。コマが入っていない" };

  /*
   * コマ間の画素差。**縮小した後の解像度で測る。**
   * 元の960pxのまま測ると、画面に出ない細部のノイズまで「動き」に数える。
   */
  const probeCell = 128;
  const fc = document.createElement("canvas");
  fc.width = probeCell;
  fc.height = probeCell;
  const fctx = fc.getContext("2d", { willReadFrequently: true });
  fctx.imageSmoothingQuality = "high";
  const small = [];
  for (let i = 0; i < cols * rows; i++) {
    const rx = i % cols, ry = Math.floor(i / cols);
    fctx.clearRect(0, 0, probeCell, probeCell);
    fctx.drawImage(image, rx * srcW, ry * srcH, srcW, srcH, 0, 0, probeCell, probeCell);
    small.push(fctx.getImageData(0, 0, probeCell, probeCell).data);
  }
  let diffSum = 0;
  let diffPairs = 0;
  for (let i = 0; i < small.length; i++) {
    const a = small[i];
    const b = small[(i + 1) % small.length];
    let diff = 0;
    let n = 0;
    for (let p = 0; p < a.length; p += 4) {
      // どちらも透明な場所は数えない。背景の広さで薄まってしまう
      if (a[p + 3] < 40 && b[p + 3] < 40) continue;
      const rgb = (Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2])) / 3;
      diff += Math.max(rgb, Math.abs(a[p + 3] - b[p + 3]));
      n++;
    }
    if (n > 0) {
      diffSum += diff / n;
      diffPairs++;
    }
  }
  const pixelMotion = diffPairs > 0 ? diffSum / diffPairs : 0;

  const centers = filled.map((b) => (b.minX + b.maxX) / 2);
  const feet = filled.map((b) => b.maxY);
  const widths = filled.map((b) => b.maxX - b.minX + 1);
  const heights = filled.map((b) => b.maxY - b.minY + 1);
  const spread = (v) => Math.max(...v) - Math.min(...v);

  /*
   * 全コマをまとめて囲む矩形。**コマごとに切り抜かない。**
   * コマ単位で詰めると、体の大きさが変わるたびに絵が拡大縮小されて、
   * せっかく揃っている中心と足元がずれる。
   */
  const allMinX = Math.min(...filled.map((b) => b.minX));
  const allMaxX = Math.max(...filled.map((b) => b.maxX));
  const allMinY = Math.min(...filled.map((b) => b.minY));
  const allMaxY = Math.max(...filled.map((b) => b.maxY));
  const pad = Math.round(Math.max(allMaxX - allMinX, allMaxY - allMinY) * 0.03);
  const cropX = Math.max(0, allMinX - pad);
  const cropY = Math.max(0, allMinY - pad);
  const cropW = Math.min(srcW - cropX, allMaxX - allMinX + 1 + pad * 2);
  const cropH = Math.min(srcH - cropY, allMaxY - allMinY + 1 + pad * 2);

  // 縦横比を保ったまま、1コマを cell へ収める
  const scale = cell / Math.max(cropW, cropH);
  const drawW = Math.round(cropW * scale);
  const drawH = Math.round(cropH * scale);
  const offX = Math.round((cell - drawW) / 2);
  // 足元を下端へ寄せる。中央に置くと、背の低いコマが宙に浮く
  const offY = cell - drawH;

  const out = document.createElement("canvas");
  out.width = cell * cols;
  out.height = cell * rows;
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      octx.drawImage(
        image,
        rx * srcW + cropX, ry * srcH + cropY, cropW, cropH,
        rx * cell + offX, ry * cell + offY, drawW, drawH,
      );
    }
  }

  return {
    dataUrl: out.toDataURL("image/webp", options.quality),
    width: out.width,
    height: out.height,
    frames: filled.length,
    // 揃っているか(コマ間のブレ。元画像の画素で)
    centerSpread: Math.round(spread(centers)),
    footSpread: Math.round(spread(feet)),
    // どれだけ動くか。**輪郭と中身は別々に測る**(片方だけでは見落とす)
    widthMotion: Math.round((spread(widths) / srcW) * 1000) / 1000,
    heightMotion: Math.round((spread(heights) / srcH) * 1000) / 1000,
    pixelMotion: Math.round(pixelMotion * 100) / 100,
    aspect: Math.round((drawW / drawH) * 1000) / 1000,
  };
}`;

async function main() {
  let files;
  try {
    files = (await readdir(inDir)).filter((n) => /\.(png|webp)$/i.test(n)).sort();
  } catch {
    console.error(`入力フォルダが無い: ${inDir}`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`${inDir} に画像が1枚も無い`);
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });
  const manifestPath = path.join(outDir, "sprites.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: CHROMIUM_GL_ARGS });
  const page = await browser.newPage();
  await page.goto("about:blank");

  let failed = 0;
  for (const name of files) {
    const raw = await readFile(path.join(inDir, name));
    const ext = path.extname(name).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : "image/webp";
    const dataUrl = `data:${mime};base64,${raw.toString("base64")}`;

    const result = await page.evaluate(
      ([expression, url, options]) => (0, eval)(`(${expression})`)(url, options),
      [PREPARE, dataUrl, { cols: COLS, rows: ROWS, cell: CELL, quality: WEBP_QUALITY }],
    );

    if (result.error) {
      console.error(`  ✗ ${name}: ${result.error}`);
      failed += 1;
      continue;
    }

    const base = path.basename(name, path.extname(name));
    const bytes = Buffer.from(result.dataUrl.split(",")[1], "base64");
    await writeFile(path.join(outDir, `${base}.webp`), bytes);

    manifest[base] = {
      ...(manifest[base] ?? {}),
      sheet: { cols: COLS, rows: ROWS, frames: result.frames },
      aspect: result.aspect,
    };

    const before = (raw.length / 1024).toFixed(0);
    const after = (bytes.length / 1024).toFixed(0);
    const warn = [];
    // ずれは元画像の画素で見る。20pxを超えると再生時に跳ねて見える
    if (result.centerSpread > 20) warn.push(`中心が${result.centerSpread}pxずれている`);
    if (result.footSpread > 20) warn.push(`足元が${result.footSpread}pxずれている`);
    const outline = Math.max(result.widthMotion, result.heightMotion);
    if (result.pixelMotion < MOTION_FLOOR) {
      warn.push(`ほとんど動いていない(画素差${result.pixelMotion})。シェーダ変形に任せた方がよい`);
    }
    log(
      `${base}.webp  ${result.width}x${result.height}  ${result.frames}コマ  ` +
      `${before}KB → ${after}KB  ` +
      `動き 中身${result.pixelMotion} / 輪郭${(outline * 100).toFixed(1)}%` +
      (warn.length > 0 ? `  ※ ${warn.join(" / ")}` : ""),
    );
  }

  await browser.close();

  const ordered = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(manifestPath, `${JSON.stringify(ordered, null, 2)}\n`);
  log(`${files.length - failed}枚を ${outDir}/ へ書き出した`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
