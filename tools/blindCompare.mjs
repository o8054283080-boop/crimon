/**
 * 2つのスクリーンショット群を、**どちらがどちらか分からない形で**並べた比較画像を作る。
 *
 *   node tools/blindCompare.mjs <A のディレクトリ> <B のディレクトリ> <出力先>
 *
 * 「良くなったか」を自分で判定すると、直した本人はほぼ必ず「良くなった」と答える。
 * 左右のどちらが新しい版かを伏せて並べ、別の担当に「どちらが優れて見えるか」だけを
 * 答えさせるためのもの。答え合わせの鍵は `key.json` に書き出すが、
 * **判定する側は key.json を開いてはいけない。**
 *
 * 対応する画像は同じファイル名どうしで突き合わせる(shoot.mjs が同じ名前で吐くため)。
 * 左右のどちらにどちらを置くかはファイルごとに乱数で決まるので、
 * 「常に左が新しい」といった当てずっぽうが効かない。
 */
import { chromium } from "playwright";
import { chromiumExecutablePath } from "./lib/chromium.mjs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [dirA, dirB, outDir = "blind-compare"] = process.argv.slice(2);

if (!dirA || !dirB) {
  console.error("使い方: node tools/blindCompare.mjs <Aのディレクトリ> <Bのディレクトリ> [出力先]");
  process.exit(1);
}

const log = (...args) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);

async function pngNames(dir) {
  const entries = await readdir(dir);
  return entries.filter((f) => f.endsWith(".png")).sort();
}

async function dataUri(file) {
  const buffer = await readFile(file);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const [namesA, namesB] = await Promise.all([pngNames(dirA), pngNames(dirB)]);
  const shared = namesA.filter((n) => namesB.includes(n));
  if (shared.length === 0) {
    console.error("同じ名前の画像が両方のディレクトリに見つかりません");
    process.exit(1);
  }
  log(`${shared.length}組を比較します`);

  const browser = await chromium.launch({
    executablePath: chromiumExecutablePath(),
    args: ["--no-sandbox"],
  });

  /** どの比較画像の左右がどちらだったかの答え。判定側には見せない */
  const key = {};

  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    for (const name of shared) {
      // 左右の割り当てをファイルごとに振り直す。常に同じ側だと当てずっぽうが効いてしまう
      const aOnLeft = Math.random() < 0.5;
      const leftFile = path.join(aOnLeft ? dirA : dirB, name);
      const rightFile = path.join(aOnLeft ? dirB : dirA, name);
      key[name] = { 左: aOnLeft ? dirA : dirB, 右: aOnLeft ? dirB : dirA };

      const [leftUri, rightUri] = await Promise.all([dataUri(leftFile), dataUri(rightFile)]);

      await page.setContent(`
        <style>
          html,body { margin:0; background:#101014; }
          .row { display:flex; gap:12px; padding:12px; align-items:flex-start; }
          .cell { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; }
          img { max-width:100%; height:auto; display:block; box-shadow:0 0 0 1px #333; }
          .tag { font:700 20px/1 sans-serif; color:#ddd; letter-spacing:.1em; }
        </style>
        <div class="row">
          <div class="cell"><span class="tag">左</span><img src="${leftUri}"></div>
          <div class="cell"><span class="tag">右</span><img src="${rightUri}"></div>
        </div>
      `);
      await page.waitForTimeout(120);

      const file = path.join(outDir, name);
      const box = await page.locator(".row").boundingBox();
      await page.screenshot({ path: file, clip: box ?? undefined });
      log(`  ${name}`);
    }
  } finally {
    await browser.close();
  }

  await writeFile(path.join(outDir, "key.json"), JSON.stringify(key, null, 2), "utf8");
  log(`完了: ${outDir}`);
  log("判定する人は key.json を開かないこと。左右のどちらが優れて見えるかだけを答えること。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
