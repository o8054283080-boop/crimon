/**
 * 市松模様が**絵として焼き込まれた**画像から、市松だけを抜いて透過PNGにする。
 *
 *   node tools/removeCheckerboard.mjs 入力.png 出力.png [確認用の接頭辞]
 *     確認用の接頭辞を渡すと、暗い地・明るい地・赤い地に重ねた3枚も書き出す
 *
 * 出力は `art/monsters-raw/` へ置き、`tools/prepareSprites.mjs` で webp にする。
 *
 * ## なぜ別の道具なのか
 *
 * `prepareSprites.mjs` の背景抜きは**単色の地**を前提にしている。
 * 市松は明暗2色が交互に並ぶので、平均色からの差では「半分だけ絵」に見えてしまう。
 *
 * ## 何をするか(守護の遺跡の霊獣で決めた手順)
 *
 * 1. 縁の画素から市松の明暗2色を測り、**縁から繋がっている**無彩色の2色を塗り広げて抜く
 *    (絵の中の白い毛は輪郭線に囲まれているので届かない)
 * 2. 絵に囲まれて縁と繋がらない市松は、**明暗の両方を含む塊**だけを抜く
 *    (絵の中の灰色は片方の明るさしか持たない)
 * 3. 半透明のもやが乗った市松は、背景から一定の距離までだけ、条件を緩めて抜く
 * 4. 小さな取り残し(市松の破片)を消し、境目の1〜2pxを薄くする
 *
 * ## 限界
 *
 * **もやの下に透けていた市松は、完全には消えない**(明るい地に重ねると薄く格子が見える)。
 * 生成された市松は升の位置が1〜2pxずつ揺れていて、升の明暗から逆算することもできない。
 * 透過PNGを描き直してもらえるなら、その方が必ずきれいになる(docs/handoff.md)。
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { chromiumExecutablePath } from "./lib/chromium.mjs";

const [input, output, previewPrefix] = process.argv.slice(2);
if (!input || !output) {
  console.error("使い方: node tools/removeCheckerboard.mjs 入力.png 出力.png [確認用の接頭辞]");
  process.exit(1);
}
const browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
const page = await browser.newPage();
const url = `data:image/png;base64,${readFileSync(input).toString("base64")}`;
const r = await page.evaluate(async (url) => {
  const img = new Image();
  await new Promise((ok) => { img.onload = ok; img.src = url; });
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const id = x.getImageData(0, 0, w, h); const d = id.data;

  // 市松の2色を縁から測る(明るい方と暗い方)
  const edge = [];
  for (let X = 0; X < w; X += 3) { edge.push(X, (h - 1) * w + X); }
  for (let Y = 0; Y < h; Y += 3) { edge.push(Y * w, Y * w + w - 1); }
  const vals = edge.map((p) => (d[p * 4] + d[p * 4 + 1] + d[p * 4 + 2]) / 3).sort((a, b) => a - b);
  const lo = vals[Math.floor(vals.length * 0.25)], hi = vals[Math.floor(vals.length * 0.75)];

  const TOL = 26;
  const isBg = (p) => {
    const i = p * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn > 14) return false;                 // 色が付いている = 絵
    const v = (r + g + b) / 3;
    return Math.abs(v - hi) <= TOL || Math.abs(v - lo) <= TOL;
  };

  // 縁から塗り広げ
  const bg = new Uint8Array(w * h);
  const q = new Uint32Array(w * h); let head = 0, tail = 0;
  const push = (p) => { if (bg[p] || !isBg(p)) return; bg[p] = 1; q[tail++] = p; };
  for (let X = 0; X < w; X++) { push(X); push((h - 1) * w + X); }
  for (let Y = 0; Y < h; Y++) { push(Y * w); push(Y * w + w - 1); }
  while (head < tail) {
    const p = q[head++], X = p % w, Y = (p - X) / w;
    if (X > 0) push(p - 1); if (X < w - 1) push(p + 1);
    if (Y > 0) push(p - w); if (Y < h - 1) push(p + w);
  }

  // 絵に囲まれて縁と繋がらない市松: 候補画素の塊が明暗2色を両方含んでいれば背景
  {
    const seen = new Uint8Array(w * h);
    let enclosed = 0;
    for (let p0 = 0; p0 < w * h; p0++) {
      if (bg[p0] || seen[p0] || !isBg(p0)) continue;
      head = 0; tail = 0; seen[p0] = 1; q[tail++] = p0;
      let nLo = 0, nHi = 0;
      while (head < tail) {
        const p = q[head++], i = p * 4, v = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (Math.abs(v - lo) <= TOL) nLo++; else nHi++;
        const X = p % w, Y = (p - X) / w;
        for (const t of [X > 0 ? p - 1 : -1, X < w - 1 ? p + 1 : -1, Y > 0 ? p - w : -1, Y < h - 1 ? p + w : -1]) {
          if (t >= 0 && !seen[t] && !bg[t] && isBg(t)) { seen[t] = 1; q[tail++] = t; }
        }
      }
      if (nLo >= 40 && nHi >= 40) {
        for (let k = 0; k < tail; k++) bg[q[k]] = 1;
        enclosed++;
      }
    }
    window.__enclosed = enclosed;
  }

  // 2段目: もやが薄く乗った市松。背景から一定の距離までだけ、条件を緩めて塗り広げる
  {
    const LOOSE_SAT = 34, REACH = 36;
    const isLoose = (p) => {
      const i = p * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx - mn > LOOSE_SAT) return false;
      const v = (r + g + b) / 3;
      return v >= lo - 28 && v <= hi + 22;
    };
    const reach = new Uint16Array(w * h).fill(65535);
    head = 0; tail = 0;
    for (let p = 0; p < w * h; p++) if (bg[p]) { reach[p] = 0; q[tail++] = p; }
    let added = 0;
    while (head < tail) {
      const p = q[head++], X = p % w, Y = (p - X) / w, nd = reach[p] + 1;
      if (nd > REACH) continue;
      for (const t of [X > 0 ? p - 1 : -1, X < w - 1 ? p + 1 : -1, Y > 0 ? p - w : -1, Y < h - 1 ? p + w : -1]) {
        if (t < 0 || reach[t] <= nd || bg[t]) continue;
        if (!isLoose(t)) continue;
        reach[t] = nd; bg[t] = 1; added++; q[tail++] = t;
      }
    }
    window.__loose = added;
  }

  // 残った画素の連結成分のうち、小さい塊(市松の破片)は背景にする
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  for (let p0 = 0; p0 < w * h; p0++) {
    if (bg[p0] || label[p0] >= 0) continue;
    const L = sizes.length; let n = 0; head = 0; tail = 0;
    label[p0] = L; q[tail++] = p0;
    while (head < tail) {
      const p = q[head++]; n++;
      const X = p % w, Y = (p - X) / w;
      const nb = [X > 0 ? p - 1 : -1, X < w - 1 ? p + 1 : -1, Y > 0 ? p - w : -1, Y < h - 1 ? p + w : -1];
      for (const t of nb) if (t >= 0 && !bg[t] && label[t] < 0) { label[t] = L; q[tail++] = t; }
    }
    sizes.push(n);
  }
  const MIN = 1500;
  let removedBlobs = 0;
  for (let p = 0; p < w * h; p++) if (!bg[p] && sizes[label[p]] < MIN) { bg[p] = 1; }
  for (const s of sizes) if (s < MIN) removedBlobs++;

  // 境目: 背景に接する絵の画素を、背景からの距離で薄くする(2px)
  const dist = new Uint8Array(w * h).fill(255);
  head = 0; tail = 0;
  for (let p = 0; p < w * h; p++) if (bg[p]) { dist[p] = 0; q[tail++] = p; }
  while (head < tail) {
    const p = q[head++], X = p % w, Y = (p - X) / w, nd = dist[p] + 1;
    if (nd > 3) continue;
    for (const t of [X > 0 ? p - 1 : -1, X < w - 1 ? p + 1 : -1, Y > 0 ? p - w : -1, Y < h - 1 ? p + w : -1]) {
      if (t >= 0 && dist[t] > nd) { dist[t] = nd; q[tail++] = t; }
    }
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (bg[p]) { d[i + 3] = 0; continue; }
    // 縁の1px目は混色(市松と毛)なので、低彩度なら薄くする
    if (dist[p] === 1) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
      d[i + 3] = mx - mn < 20 ? 90 : 200;
    } else if (dist[p] === 2) d[i + 3] = 235;
  }
  x.putImageData(id, 0, 0);
  const out = c.toDataURL("image/png");

  // 確認用: 暗い地・明るい地・赤い地に重ねる
  const previews = {};
  for (const [name, fill] of [["dark", "#101018"], ["light", "#e8e4d8"], ["red", "#5a1d1d"]]) {
    const pc = document.createElement("canvas"); pc.width = w; pc.height = h;
    const px = pc.getContext("2d"); px.fillStyle = fill; px.fillRect(0, 0, w, h); px.drawImage(c, 0, 0);
    previews[name] = pc.toDataURL("image/png");
  }
  let bgCount = 0; for (let p = 0; p < w * h; p++) bgCount += bg[p];
  return { loose: window.__loose, enclosed: window.__enclosed, out, previews, lo, hi, bgRatio: bgCount / (w * h), removedBlobs, components: sizes.length };
}, url);
writeFileSync(output, Buffer.from(r.out.split(",")[1], "base64"));
if (previewPrefix) for (const [k, v] of Object.entries(r.previews)) writeFileSync(`${previewPrefix}-${k}.png`, Buffer.from(v.split(",")[1], "base64"));
console.log({ loose: r.loose, enclosed: r.enclosed, lo: r.lo, hi: r.hi, bgRatio: r.bgRatio.toFixed(3), removedBlobs: r.removedBlobs, components: r.components });
await browser.close();
