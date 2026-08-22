/**
 * 音が実際に鳴るかを、**本番と同じ制限のブラウザ**で確かめる。
 *
 * 常駐の確認用サーバ(harness.mjs)は Playwright の既定の起動引数を使うため、
 * 自動再生の制限が外れている。そのせいで「AudioContext を resume していない」
 * という致命的な不具合を素通りさせてしまった。
 * ここでは制限を明示的に有効にして起動する。
 *
 * 測るのは3つ。
 *
 * 1. 操作の前後で音声文脈が "running" になるか(解錠できているか)
 * 2. 効果音の `純音らしさ`(高いほど発振器の音に近い = 安っぽい)
 * 3. BGMのループが本当に閉じているか(復号後の余白と継ぎ目の跳び)
 *
 * 3が要る理由: ogg の復号は符号化の都合で前後に余白が付くことがある。
 * 余白が残るとループのたびにそこだけ無音になり、**焼く側でどれだけ丁寧に
 * 周期を閉じても意味がなくなる。** 耳では「なんとなく変」としか分からない。
 *
 *   node tools/audioCheck.mjs [URL]
 */
import { chromium } from "playwright";

// 既定は常駐サーバ(harness.mjs)の Vite と同じ番号にしておくこと。
// ここがずれていると、道具を素直に呼んだ人が「音が確かめられない」で止まる
const url = process.argv[2] ?? `http://127.0.0.1:${process.env.HARNESS_VITE_PORT ?? 5310}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: [
    "--no-sandbox",
    // 本番のブラウザと同じ条件にする。ここが要
    "--autoplay-policy=user-gesture-required",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const problems = [];
page.on("pageerror", (e) => problems.push(String(e)));
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);

const before = await page.evaluate(() => window.__crimonAudio?.contextState() ?? "窓口なし");

// 実際に画面を押して解錠されるかを見る
await page.mouse.click(195, 700);
await page.waitForTimeout(1200);
const after = await page.evaluate(() => window.__crimonAudio?.contextState() ?? "窓口なし");

const 効果音 = await page.evaluate(async () => {
  const a = window.__crimonAudio;
  if (!a) return null;
  const out = {};
  // 繰り返し鳴るもの(tap/select/手番)と、共振に頼りやすいもの(heal/shield/victory)を見る
  for (const name of ["tap", "select", "turnAlly", "turnEnemy", "heal", "shield", "charge", "victory"]) {
    out[name] = await a.measure(name, 500);
  }
  // 着弾は芯と属性の重なりなので、単体ではなく重ねた状態で測る
  out["着弾(炎/斬)"] = await a.measureHit({ hitStyle: "slash", element: "FIRE" }, 500);
  out["着弾(闇/打)"] = await a.measureHit({ hitStyle: "blunt", element: "DARK" }, 500);
  return out;
});

const BGM = await page.evaluate(async () => {
  const a = window.__crimonAudio;
  if (!a?.measureBgm) return null;
  const loops = { home: await a.measureBgm("home"), battle: await a.measureBgm("battle") };
  // 実際に場面を敷いて、鳴り始めるかを見る
  a.bgm("battle");
  await new Promise((r) => setTimeout(r, 2500));
  const 鳴っている場面 = a.bgmScene();
  a.bgm(null);
  return { ...loops, 鳴っている場面 };
});

console.log(JSON.stringify({ 操作前の状態: before, 操作後の状態: after, 効果音, BGM, problems }, null, 1));
await browser.close();
