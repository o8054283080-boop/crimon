/**
 * モンスターの2D絵を、ゲームに載る形へ整える。
 *
 *   node tools/prepareSprites.mjs [入力フォルダ] [出力フォルダ]
 *     既定: art/monsters-raw → src/web/assets/monsters
 *
 * ## なぜ道具にするのか
 *
 * 描く側に画素単位の規格を守らせるのは無理がある。実際、最初に届いた5枚は
 * **1枚1〜2MB / 縦横比もばらばら / 余白の量もばらばら**だった。
 * 90枚あるので、そのまま入れると150MB近くになりアプリとして配れない。
 *
 * ここが機械的に引き受ける:
 *   1. 透明部分を測って、絵の実体へぴったり切り抜く(余白のばらつきを消す)
 *   2. 長辺を 512px へ縮める(戦闘画面での実表示は120px前後。2倍で足りる)
 *   3. WebP へ変換する(PNGの3〜5分の1になる)
 *
 * 切り抜いたあとの**縦横比だけ**を残し、画面上の大きさは描画側が種族ごとの
 * 背丈で決める。ここで全部同じ高さに揃えてしまうと、
 * **スライムがゴーレムと同じ背丈になる。**
 *
 * ## 画像の加工に実ブラウザを使う理由
 *
 * この案件には画像処理のライブラリが入っていない(sharp も jimp も無い)。
 * 一方で Chromium は巡回のために既にあるので、canvas で切って縮めて焼く。
 * `tools/bakeArt.mjs` が背景を焼いているのと同じ考え方。
 */
import { chromium } from "playwright";
import { CHROMIUM_GL_ARGS, chromiumExecutablePath } from "./lib/chromium.mjs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const inDir = process.argv[2] ?? "art/monsters-raw";
const outDir = process.argv[3] ?? "src/web/assets/monsters";

/** 長辺の画素数。戦闘画面での実表示は120px前後なので、2倍でも余る */
const LONG_EDGE = 512;
/** 切り抜いたあとに足す余白の割合。0だと輪郭線が縁で欠ける */
const PADDING = 0.03;
/** これ未満の不透明度は「背景」とみなす。生成された絵は縁がうっすら残る */
const ALPHA_FLOOR = 12;
const WEBP_QUALITY = 0.9;

const log = (...args) => console.log(`[${new Date().toTimeString().slice(0, 8)}]`, ...args);

/**
 * ブラウザの中で1枚を整える。
 * 返すのは WebP のデータURLと、測った寸法。
 */
const PREPARE = `async (dataUrl, options) => {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("画像を読めない"));
    image.src = dataUrl;
  });

  const source = document.createElement("canvas");
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const sctx = source.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(image, 0, 0);
  const { data } = sctx.getImageData(0, 0, source.width, source.height);

  // 1. 不透明な画素の外接矩形を測る
  let minX = source.width, minY = source.height, maxX = -1, maxY = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (data[(y * source.width + x) * 4 + 3] < options.alphaFloor) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { error: "全部が透明。絵が入っていない" };

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  // 端で切れていないか。切れているものは道具では直せないので、報告して先へ進む
  const touches = [];
  if (minX <= 1) touches.push("左");
  if (maxX >= source.width - 2) touches.push("右");
  if (minY <= 1) touches.push("上");
  if (maxY >= source.height - 2) touches.push("下");

  // 2. 長辺を揃えて縮め、まわりに余白を足す
  const pad = Math.round(Math.max(cropW, cropH) * options.padding);
  const paddedW = cropW + pad * 2;
  const paddedH = cropH + pad * 2;
  const scale = options.longEdge / Math.max(paddedW, paddedH);
  const outW = Math.max(1, Math.round(paddedW * scale));
  const outH = Math.max(1, Math.round(paddedH * scale));

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(source, minX, minY, cropW, cropH,
    pad * scale, pad * scale, cropW * scale, cropH * scale);

  /*
   * 3. 体の主色(支配的な色相)を測る。
   *
   * **これが無いと、色替えが装備品まで染めてしまう。**
   * 経験ピッグの青い本、グレイヴナイトの銀の縁取り、ドラゴンの生成りの腹。
   * どれも「体の色」ではないので、属性が変わっても変えたくない。
   * 主色から色相が離れた画素を守るために、基準となる色相をここで出す。
   *
   * 彩度と面積で重みを付けた円平均を取る。単純な最頻値だと、
   * 面積の広い低彩度の陰(ほぼ無彩色)に引きずられる。
   */
  let sumSin = 0, sumCos = 0, weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const d = mx - mn;
    if (d < 0.06 || mx < 0.12) continue; // 無彩色と、潰れた暗部は数えない
    let h;
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    // 彩度が高いほど「その絵の色」を強く代表している
    const w = (d / mx) * mx;
    sumSin += Math.sin(h * Math.PI * 2) * w;
    sumCos += Math.cos(h * Math.PI * 2) * w;
    weight += w;
  }
  const bodyHue = weight > 0
    ? ((Math.atan2(sumSin, sumCos) / (Math.PI * 2)) + 1) % 1
    : -1; // 無彩色しかない絵(岩など)。守る色相が無いので -1 を返す

  return {
    dataUrl: out.toDataURL("image/webp", options.quality),
    width: outW,
    height: outH,
    sourceWidth: source.width,
    sourceHeight: source.height,
    touches,
    bodyHue: Math.round(bodyHue * 1000) / 1000,
    colorWeight: Math.round((weight / (source.width * source.height)) * 1000) / 1000,
  };
}`;

async function main() {
  let files;
  try {
    files = (await readdir(inDir)).filter((n) => /\.(png|webp|jpg|jpeg)$/i.test(n)).sort();
  } catch {
    console.error(`入力フォルダが無い: ${inDir}`);
    console.error("生の絵をそこへ置いてから、もう一度実行してください(docs/monster-2d-art.md)");
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`${inDir} に画像が1枚も無い`);
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });

  /*
   * 測った主色を書き出す先。**追記する。**
   * 一度に全部を通すとは限らない(届いた種族から順に処理する)ので、
   * 上書きすると前に測ったぶんが消える。
   */
  const manifestPath = path.join(outDir, "sprites.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: CHROMIUM_GL_ARGS });
  const page = await browser.newPage();
  await page.goto("about:blank");

  let failed = 0;
  for (const name of files) {
    const raw = await readFile(path.join(inDir, name));
    const ext = path.extname(name).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const dataUrl = `data:${mime};base64,${raw.toString("base64")}`;

    const result = await page.evaluate(
      ([expression, url, options]) => (0, eval)(`(${expression})`)(url, options),
      [PREPARE, dataUrl, { alphaFloor: ALPHA_FLOOR, padding: PADDING, longEdge: LONG_EDGE, quality: WEBP_QUALITY }],
    );

    if (result.error) {
      console.error(`  ✗ ${name}: ${result.error}`);
      failed += 1;
      continue;
    }

    const outName = `${path.basename(name, path.extname(name))}.webp`;
    const bytes = Buffer.from(result.dataUrl.split(",")[1], "base64");
    await writeFile(path.join(outDir, outName), bytes);

    manifest[path.basename(name, path.extname(name))] = {
      bodyHue: result.bodyHue,
      aspect: Math.round((result.width / result.height) * 1000) / 1000,
    };

    const before = (raw.length / 1024).toFixed(0);
    const after = (bytes.length / 1024).toFixed(0);
    const warn = result.touches.length > 0 ? `  ※ ${result.touches.join("・")}の端で切れている` : "";
    const hue = result.bodyHue < 0 ? "無彩色" : `主色 ${(result.bodyHue * 360).toFixed(0)}°`;
    log(`${outName}  ${result.width}x${result.height}  ${before}KB → ${after}KB  ${hue}${warn}`);
  }

  await browser.close();

  const ordered = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(manifestPath, `${JSON.stringify(ordered, null, 2)}\n`);

  console.log(`\n${files.length - failed}枚を ${outDir}/ へ書き出した`);
  console.log(`主色の一覧を ${manifestPath} へ書いた(${Object.keys(ordered).length}件)`);
  if (failed > 0) process.exit(1);
}

await main();
