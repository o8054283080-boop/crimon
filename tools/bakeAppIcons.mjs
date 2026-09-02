/**
 * ホーム画面用のアイコンを、元絵から焼き直す。
 *
 *   node tools/bakeAppIcons.mjs
 *
 * ## なぜ道具にするのか
 *
 * `public/icons/` のPNGは**5回続けて壊れた状態でコミットされている**
 * (`docs/ios-home-screen-icon.md` に経緯)。壊れ方はどれも同じで、
 * PNG署名とIHDRは正しいのに**画素データが途中で切れている**。
 * 「180×180のRGBだ」という確認は通ってしまうので、目でも気づけない。
 *
 * 原因は、バイナリを文字として扱う経路を通したこと。ここでは
 * **canvas が出した base64 を Buffer で書き出す**ので、途中に
 * 文字列としての加工が一切入らない。
 *
 * ## 元絵について
 *
 * `src/web/assets/app-icon.png` を縮めて使う。元絵は透過つきなので、
 * **必ず背景を敷いてから描く。** iOSはホーム画面のアイコンを角丸で
 * 切り抜くだけで、透過部分は黒く残る。透過のまま渡すと、
 * 暗い壁紙の上で何が描いてあるのか読めない。
 *
 * 元絵自体が壊れていないことは `tests/pngIntegrity.test.ts` が見張る
 * (`src/web/assets` も検査の対象に入っている)。
 */
import { chromium } from "playwright";
import { CHROMIUM_GL_ARGS, chromiumExecutablePath } from "./lib/chromium.mjs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE = "src/web/assets/app-icon.png";
const OUT_DIR = "public/icons";

/** 焼く大きさ。iOSのホーム画面は180、manifestは192と512 */
const SIZES = [
  { file: "apple-touch-icon.png", size: 180 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  // タブに出る小さいやつ。ここだけ別絵にすると、同じアプリに見えなくなる
  { file: "favicon-32.png", size: 32 },
];

/**
 * 背景の色。**透過にしない。**
 * iOSはホーム画面のアイコンを角丸で切り抜くだけで、透過部分は黒く残る。
 * 紋章だけを浮かせると、暗い壁紙では何が描いてあるのか読めない。
 */
const BACKGROUND = "#171826";
/**
 * 元絵が占める割合。
 *
 * **円の紋章なので、ほとんど余白を取らない。** 大きく余白を取ると
 * iOSの角丸の内側に小さな円が浮くだけになり、遠目で何か分からなくなる。
 * 円の縁が角丸に触れない程度(2%)だけ空ける。
 */
const INSET = 0.02;

const log = (...args) => console.log(`[${new Date().toTimeString().slice(0, 8)}]`, ...args);

async function main() {
  const source = `data:image/png;base64,${(await readFile(SOURCE)).toString("base64")}`;
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: CHROMIUM_GL_ARGS });
  const page = await browser.newPage();
  try {
    for (const { file, size } of SIZES) {
      const dataUrl = await page.evaluate(async ({ source, size, background, inset }) => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        // 縮める時のぼけを抑える。小さい favicon では特に効く
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, size, size);
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error("元絵を読み込めない"));
          image.src = source;
        });
        const pad = Math.round(size * inset);
        ctx.drawImage(image, pad, pad, size - pad * 2, size - pad * 2);
        return canvas.toDataURL("image/png");
      }, { source, size, background: BACKGROUND, inset: INSET });

      // **base64 から直接 Buffer を作る。** 文字列として加工する経路を通さない
      const binary = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
      const out = path.join(OUT_DIR, file);
      await writeFile(out, binary);
      log(`${file}  ${size}x${size}  ${binary.length}バイト`);
    }
  } finally {
    await browser.close();
  }
  log("焼き上がり。`npx vitest run tests/pngIntegrity.test.ts` で健全性を確かめること");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
