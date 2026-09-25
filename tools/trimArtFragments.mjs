/**
 * 絵の縁に残った「隣の絵の切れ端」を消す。
 *
 * ホームの右の縦列(冒険・ダンジョン・闘技場・試練の塔)の絵は、1枚の大きな絵から
 * 切り出されている。切り出しが雑で、**隣の札のリボンの赤や、上の札の下端の飾りが
 * 数pxずつ写り込んでいた**(依頼主の実機の画面で「雑な画像をカットした部分」と指摘)。
 *
 * 2種類の切れ端がある:
 *   - 本体と離れた小さな塊(ダンジョン・試練の塔の左端の赤) … 一番大きな塊だけ残して消す
 *   - 本体の上端にくっついた飾り(闘技場・試練の塔の上の数行) … `--top N` で上N行を消す
 *   - 左端の赤い切れ端は、薄い画素(アルファが小さい縁)で本体とつながっていて
 *     塊の分け方では離れない … `--left N` で左N列を消す(本体は10列目から始まる)
 *
 * ## 使い方
 *
 *   node tools/trimArtFragments.mjs <webpファイル> [--top N] [--left N]
 *
 * 書き出しは同じファイルへ、webp の最高画質で上書きする。
 */
import { chromium } from "playwright";
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("使い方: node tools/trimArtFragments.mjs <webpファイル> [--top N] [--left N]");
  process.exit(1);
}
const topAt = process.argv.indexOf("--top");
const topRows = topAt > 0 ? Number(process.argv[topAt + 1]) : 0;
const leftAt = process.argv.indexOf("--left");
const leftCols = leftAt > 0 ? Number(process.argv[leftAt + 1]) : 0;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage();
const b64 = fs.readFileSync(file).toString("base64");
await page.setContent(`<img id=i src="data:image/webp;base64,${b64}">`);
await page.waitForFunction(() => document.getElementById("i").complete);
const result = await page.evaluate(([top, left]) => {
  const img = document.getElementById("i");
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  const image = x.getImageData(0, 0, W, H);
  const d = image.data;
  // 上の N 行は、本体につながっていても消す(上の札の下端の飾り)
  for (let y = 0; y < Math.min(top, H); y++) for (let xx = 0; xx < W; xx++) d[(y * W + xx) * 4 + 3] = 0;
  // 左の N 列も同じ(隣の札のリボンの赤)
  for (let y = 0; y < H; y++) for (let xx = 0; xx < Math.min(left, W); xx++) d[(y * W + xx) * 4 + 3] = 0;
  // 薄い縁も含めて塊を分ける(アルファ 1 以上をつながりとみなす)
  const label = new Int32Array(W * H).fill(-1);
  const sizes = [];
  for (let i = 0; i < W * H; i++) {
    if (label[i] >= 0 || d[i * 4 + 3] === 0) continue;
    const id = sizes.length;
    let n = 0;
    const stack = [i];
    label[i] = id;
    while (stack.length) {
      const p = stack.pop();
      n++;
      const px = p % W, py = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = px + dx, qy = py + dy;
        if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
        const q = qy * W + qx;
        if (label[q] < 0 && d[q * 4 + 3] > 0) { label[q] = id; stack.push(q); }
      }
    }
    sizes.push(n);
  }
  const keep = sizes.indexOf(Math.max(...sizes));
  let removed = 0;
  for (let i = 0; i < W * H; i++) {
    if (label[i] >= 0 && label[i] !== keep) { d[i * 4 + 3] = 0; removed++; }
  }
  x.putImageData(image, 0, 0);
  return { W, H, pieces: sizes.length, removed, url: c.toDataURL("image/webp", 1) };
}, [topRows, leftCols]);
await browser.close();
fs.writeFileSync(file, Buffer.from(result.url.split(",")[1], "base64"));
console.log(`${file}: ${result.W}x${result.H} 塊${result.pieces}個 → 1個、消した画素 ${result.removed}、上 ${topRows} 行・左 ${leftCols} 列を消去`);
