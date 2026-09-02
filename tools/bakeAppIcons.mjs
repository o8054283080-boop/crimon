/**
 * ホーム画面用のアイコンを、SVGの紋章から焼き直す。
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
 * ## 元をSVGにしている理由
 *
 * SVGは文字なので、同じ壊れ方をしない。壊れたら差分で分かる。
 * 元が壊れていないことを、毎回目で確かめずに済む。
 */
import { chromium } from "playwright";
import { CHROMIUM_GL_ARGS, chromiumExecutablePath } from "./lib/chromium.mjs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE = "src/web/assets/crimon-emblem.svg";
const OUT_DIR = "public/icons";

/** 焼く大きさ。iOSのホーム画面は180、manifestは192と512 */
const SIZES = [
  { file: "apple-touch-icon.png", size: 180 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
];

/**
 * 背景の色。**透過にしない。**
 * iOSはホーム画面のアイコンを角丸で切り抜くだけで、透過部分は黒く残る。
 * 紋章だけを浮かせると、暗い壁紙では何が描いてあるのか読めない。
 */
const BACKGROUND = "#171826";
/** 紋章が占める割合。角丸で切られる縁に食い込ませない */
const INSET = 0.14;

const log = (...args) => console.log(`[${new Date().toTimeString().slice(0, 8)}]`, ...args);

async function main() {
  const svg = await readFile(SOURCE, "utf8");
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: CHROMIUM_GL_ARGS });
  const page = await browser.newPage();
  try {
    for (const { file, size } of SIZES) {
      const dataUrl = await page.evaluate(async ({ svg, size, background, inset }) => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, size, size);
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error("SVGを読み込めない"));
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        });
        const pad = Math.round(size * inset);
        ctx.drawImage(image, pad, pad, size - pad * 2, size - pad * 2);
        return canvas.toDataURL("image/png");
      }, { svg, size, background: BACKGROUND, inset: INSET });

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
