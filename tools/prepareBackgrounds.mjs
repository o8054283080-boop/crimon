/**
 * 戦闘背景の絵を、ゲームに載る形へ整える。
 *
 *   node tools/prepareBackgrounds.mjs [入力フォルダ] [出力フォルダ]
 *     既定: art/stages-raw → src/web/assets/stages
 *
 * ## モンスターの絵と何が違うか
 *
 * **切り抜かない。** 背景は画面いっぱいを埋めるので、透明部分が無い。
 * 余白を測る意味も無いし、測ろうとすると全画素が対象になって落ちる。
 *
 * やることは2つだけ。
 *
 *   1. 長辺を 1440px へ縮める(実機の縦は最大でも 932px。2倍で足りる)
 *   2. WebP へ変換する
 *
 * 縦横比は**変えない。** 画面に載せる側が cover で合わせるので、
 * ここで 1:2 へ引き伸ばすと絵が歪む。届いた 864x1821 も、
 * 1080x2160 も、そのままの比で入れてよい。
 *
 * ## 画像処理に実ブラウザを使う理由
 *
 * `tools/prepareSprites.mjs` と同じ。この案件には sharp も jimp も無く、
 * Chromium だけが巡回のために既にある。
 */
import { chromium } from "playwright";
import { CHROMIUM_GL_ARGS, chromiumExecutablePath } from "./lib/chromium.mjs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const inDir = process.argv[2] ?? "art/stages-raw";
const outDir = process.argv[3] ?? "src/web/assets/stages";

/**
 * 長辺の画素数。
 *
 * 実機で最も縦が長いのは iPhone 15 Pro Max の 932px。
 * その2倍を上限にしておけば、どの端末でも拡大されない。
 * これ以上は容量が増えるだけで、画面上は1画素も変わらない。
 */
const LONG_EDGE = 1440;
/**
 * WebPの品質。
 *
 * 背景は**面積が広く、モンスターの後ろへ回る**ので、
 * 圧縮の粗が出ても目に付きにくい。モンスターの 0.9 より落としてよい。
 * 0.82 で 1.3MB のPNGが 90KB 前後まで下がった。
 */
const WEBP_QUALITY = 0.82;

const log = (...args) => console.log(`[${new Date().toTimeString().slice(0, 8)}]`, ...args);

/** ブラウザの中で1枚を縮めて焼く。 */
const PREPARE = `async (dataUrl, options) => {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("画像を読めない"));
    image.src = dataUrl;
  });

  const scale = Math.min(1, options.longEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const outW = Math.max(1, Math.round(image.naturalWidth * scale));
  const outH = Math.max(1, Math.round(image.naturalHeight * scale));

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, outW, outH);

  /*
   * 明るさを測る。**背景が明るすぎるとモンスターが溶ける。**
   *
   * docs/battle-background-art.md で「明るくしすぎない」と頼んでいるが、
   * 守られたかどうかは目で見るしかない…わけではない。
   * モンスターが立つ帯(上から30〜88%)の平均の明るさだけは機械で読める。
   * ここが高いと、その上に立つ絵の輪郭が背景に埋もれる。
   */
  const bandTop = Math.floor(outH * 0.30);
  const bandBottom = Math.floor(outH * 0.88);
  const band = ctx.getImageData(0, bandTop, outW, bandBottom - bandTop).data;
  let sum = 0;
  for (let i = 0; i < band.length; i += 4) {
    sum += (band[i] * 0.299 + band[i + 1] * 0.587 + band[i + 2] * 0.114) / 255;
  }
  const floorLuma = sum / (band.length / 4);

  return {
    dataUrl: out.toDataURL("image/webp", options.quality),
    width: outW,
    height: outH,
    sourceWidth: image.naturalWidth,
    sourceHeight: image.naturalHeight,
    floorLuma: Math.round(floorLuma * 1000) / 1000,
  };
}`;

/**
 * 明るさの上限。これを超えたら、載せる側で暗く落とす必要がある。
 *
 * 届いた闘技場は砂色の床で明るい。0.62 は
 * 「そのままでもモンスターが読めた」実測から置いている。
 */
const LUMA_WARN = 0.62;

async function main() {
  let files;
  try {
    files = (await readdir(inDir)).filter((n) => /\.(png|webp|jpg|jpeg)$/i.test(n)).sort();
  } catch {
    console.error(`入力フォルダが無い: ${inDir}`);
    console.error("背景の絵をそこへ置いてから、もう一度実行してください(docs/battle-background-art.md)");
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`${inDir} に画像が1枚も無い`);
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: CHROMIUM_GL_ARGS });
  const page = await browser.newPage();
  await page.goto("about:blank");

  for (const name of files) {
    const raw = await readFile(path.join(inDir, name));
    const ext = path.extname(name).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const dataUrl = `data:${mime};base64,${raw.toString("base64")}`;

    const result = await page.evaluate(
      ([expression, url, options]) => (0, eval)(`(${expression})`)(url, options),
      [PREPARE, dataUrl, { longEdge: LONG_EDGE, quality: WEBP_QUALITY }],
    );

    const outName = `${path.basename(name, path.extname(name))}.webp`;
    const bytes = Buffer.from(result.dataUrl.split(",")[1], "base64");
    await writeFile(path.join(outDir, outName), bytes);

    const before = (raw.length / 1024).toFixed(0);
    const after = (bytes.length / 1024).toFixed(0);
    const ratio = (result.sourceWidth / result.sourceHeight).toFixed(3);
    const warn = result.floorLuma > LUMA_WARN
      ? `  ※ 床が明るい(${result.floorLuma})。モンスターが溶けていないか目で見ること`
      : "";
    log(`${outName}  ${result.width}x${result.height}  比 1:${(1 / ratio).toFixed(2)}  ${before}KB → ${after}KB${warn}`);
  }

  await browser.close();
  log(`${files.length}枚を ${outDir}/ へ書き出した`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
