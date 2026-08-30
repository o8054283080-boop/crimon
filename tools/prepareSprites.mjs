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

/*
 * 透過を持たずに届いた絵の、背景を抜く時の許容差(0〜255)。
 *
 * `KEY_INNER` 以下は完全に背景。`KEY_OUTER` 以上は完全に絵。
 * 間はなだらかに繋いで、輪郭のぼかしを残す。
 * 生成された絵の白背景は真っ白ではなく 242〜254 で揺れていたので、
 * 内側を 0 にはできない。
 */
const KEY_INNER = 20;
const KEY_OUTER = 96;

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
  const imageData = sctx.getImageData(0, 0, source.width, source.height);
  const { data } = imageData;

  /*
   * 0. 透過を持たずに届いた絵から、背景を抜く。
   *
   * 「古代の魔人」だけが**全画素 α=255 の白背景**で届いた。
   * 外接矩形は当然「四辺いっぱい」になるので、道具は
   * 「四辺で切れている」と報告する。**これは誤診だった。**
   * 切れているのではなく、抜くべき背景が残っている。
   *
   * 色で一律に抜くと、絵の中の白(魔人の銀のたてがみ、経験ピッグの白目)まで
   * 消える。**縁から繋がっている部分だけ**を塗り広げて抜く。
   * 中の白は輪郭線で囲まれているので、そこまで届かない。
   */
  let keyedOut = false;
  if (isOpaque(data)) {
    keyedOut = true;
    keyOutBackground(imageData, options.keyInner, options.keyOuter);
    sctx.putImageData(imageData, 0, 0);
  }

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
  /*
   * 同時に、**その絵の彩度と明度の「ふつう」**も測る。
   *
   * 色替えの守り判定は「彩度が低いものは守る/明るいものは守る」という形だが、
   * その境目を全部の絵で同じ値にしていたら、**淡い絵が丸ごと守られた。**
   * フェアリーは薄荷色の淡い絵で、体のほとんどが彩度0.15・明度0.93。
   * 固定のしきい値(彩度0.07〜0.26、明部0.86〜)では守りが2重に掛かり、
   * 実際に染まった量が2割しかなく、6属性が全部同じ色に見えていた。
   *
   * 平均ではなく**中央値**を取る。平均は、面積の広い淡い陰や
   * 一点だけ極端に濃い宝石に引きずられる。
   */
  const satHist = new Uint32Array(101);
  const valHist = new Uint32Array(101);
  let bodyCount = 0;

  let sumSin = 0, sumCos = 0, weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const d = mx - mn;
    if (d < 0.06 || mx < 0.12) continue; // 無彩色と、潰れた暗部は数えない
    satHist[Math.round((d / mx) * 100)]++;
    valHist[Math.round(mx * 100)]++;
    bodyCount++;
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

  const median = (hist) => {
    if (bodyCount === 0) return -1;
    let seen = 0;
    for (let i = 0; i < hist.length; i++) {
      seen += hist[i];
      if (seen * 2 >= bodyCount) return i / 100;
    }
    return -1;
  };
  const bodySat = median(satHist);
  const bodyVal = median(valHist);

  return {
    dataUrl: out.toDataURL("image/webp", options.quality),
    width: outW,
    height: outH,
    sourceWidth: source.width,
    sourceHeight: source.height,
    touches,
    keyedOut,
    bodyHue: Math.round(bodyHue * 1000) / 1000,
    bodySat: Math.round(bodySat * 1000) / 1000,
    bodyVal: Math.round(bodyVal * 1000) / 1000,
    colorWeight: Math.round((weight / (source.width * source.height)) * 1000) / 1000,
  };

  function isOpaque(px) {
    // 透過を持つ絵は必ず縁が透けている。1画素でも半透明があれば透過付きとみなす
    for (let i = 3; i < px.length; i += 4) {
      if (px[i] < 250) return false;
    }
    return true;
  }

  /**
   * 縁から繋がっている「地の色」を透明にする。
   *
   * 塗り広げ(flood fill)なので、**絵の中に閉じた白があっても消えない。**
   * 縁の画素を平均して地の色を決め、そこからの色差で不透明度を作る。
   * 差が小さいほど透明、\`keyOuter\` 以上で完全に不透明。
   */
  function keyOutBackground(img, keyInner, keyOuter) {
    const { width: w, height: h, data: px } = img;

    // 地の色 = 四辺の画素の平均。角だけだと絵が角に掛かっていた時に外す
    let br = 0, bg = 0, bb = 0, n = 0;
    const sample = (x, y) => {
      const i = (y * w + x) * 4;
      br += px[i]; bg += px[i + 1]; bb += px[i + 2]; n++;
    };
    for (let x = 0; x < w; x++) { sample(x, 0); sample(x, h - 1); }
    for (let y = 0; y < h; y++) { sample(0, y); sample(w - 1, y); }
    br /= n; bg /= n; bb /= n;

    const dist = (i) => Math.max(
      Math.abs(px[i] - br), Math.abs(px[i + 1] - bg), Math.abs(px[i + 2] - bb),
    );

    /*
     * 塗り広げ。**再帰にすると1254x1254で必ずスタックが尽きる**ので、
     * 自前の待ち行列で回す。Uint32Array の輪番待ち行列にして、
     * push/shift の配列操作を避ける(150万画素あるので効く)。
     */
    const seen = new Uint8Array(w * h);
    const queue = new Uint32Array(w * h);
    let head = 0, tail = 0;
    const push = (p) => {
      if (seen[p]) return;
      // keyOuter を超えて違う色は絵。そこで塗り広げを止める
      if (dist(p * 4) >= keyOuter) return;
      seen[p] = 1;
      queue[tail++] = p;
    };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (head < tail) {
      const p = queue[head++];
      const x = p % w, y = (p - x) / w;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }

    /*
     * 抜いた部分の不透明度を作る。
     *
     * 縁のぼかしは「地の色と線の色を混ぜた色」なので、
     * 不透明度を下げるだけだと**混ざっていた地の色が残って白く縁取られる。**
     * 混色を解いて元の線の色へ戻す(c = a*fg + (1-a)*bg を fg について解く)。
     */
    for (let p = 0; p < w * h; p++) {
      if (!seen[p]) continue;
      const i = p * 4;
      const d = dist(i);
      const a = d <= keyInner ? 0 : Math.min(1, (d - keyInner) / (keyOuter - keyInner));
      if (a <= 0) { px[i + 3] = 0; continue; }
      px[i] = Math.max(0, Math.min(255, (px[i] - (1 - a) * br) / a));
      px[i + 1] = Math.max(0, Math.min(255, (px[i + 1] - (1 - a) * bg) / a));
      px[i + 2] = Math.max(0, Math.min(255, (px[i + 2] - (1 - a) * bb) / a));
      px[i + 3] = Math.round(a * 255);
    }
  }
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
      [PREPARE, dataUrl, {
        alphaFloor: ALPHA_FLOOR, padding: PADDING, longEdge: LONG_EDGE, quality: WEBP_QUALITY,
        keyInner: KEY_INNER, keyOuter: KEY_OUTER,
      }],
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
      // その絵の彩度・明度の「ふつう」。色替えの守り判定の境目をここから作る
      bodySat: result.bodySat,
      bodyVal: result.bodyVal,
      aspect: Math.round((result.width / result.height) * 1000) / 1000,
    };

    const before = (raw.length / 1024).toFixed(0);
    const after = (bytes.length / 1024).toFixed(0);
    const warn = result.touches.length > 0 ? `  ※ ${result.touches.join("・")}の端で切れている` : "";
    const keyed = result.keyedOut ? "  (透過が無かったので地の色を抜いた)" : "";
    const hue = result.bodyHue < 0 ? "無彩色" : `主色 ${(result.bodyHue * 360).toFixed(0)}° 彩${result.bodySat.toFixed(2)} 明${result.bodyVal.toFixed(2)}`;
    log(`${outName}  ${result.width}x${result.height}  ${before}KB → ${after}KB  ${hue}${keyed}${warn}`);
  }

  await browser.close();

  const ordered = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(manifestPath, `${JSON.stringify(ordered, null, 2)}\n`);

  console.log(`\n${files.length - failed}枚を ${outDir}/ へ書き出した`);
  console.log(`主色の一覧を ${manifestPath} へ書いた(${Object.keys(ordered).length}件)`);
  if (failed > 0) process.exit(1);
}

await main();
