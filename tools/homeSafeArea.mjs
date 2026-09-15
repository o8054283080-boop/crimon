/**
 * ホームを、実機のセーフエリアを入れた状態で測る。
 *
 * ## なぜ要るのか
 *
 * **確認用ブラウザには safe-area が無い。**`env(safe-area-inset-top)` も
 * `bottom` も 0 で返るので、ノッチとホームインジケーターのぶん
 * (iPhone 15 Pro Max で 59px + 34px)が画面から引かれない。
 *
 * そのせいで「3サイズとも scrollTop は0でした」と報告しながら、
 * 依頼主の実機では**身分証が上で切れ、プレゼントが下タブの裏に沈んでいた**。
 * 93px ぶんの居場所を、一度も測らずに「収まっている」と言っていたことになる。
 *
 * `--home-safe-top` / `--home-safe-bottom` は、そのために用意された変数。
 * **`env()` を直に書かず必ずこの2つを通すこと。**通っていれば、ここから
 * 注入して実機相当を再現できる。
 *
 * ## 使い方
 *
 *   node tools/harness.mjs &
 *   HARNESS_PORT=<port> node tools/homeSafeArea.mjs
 *
 * ホーム画面を開いた状態で走らせる(タイトル画面のままだと測れない)。
 */
const PORT = process.env.HARNESS_PORT ?? "7784";

async function probe(command, body) {
  const response = await fetch(`http://127.0.0.1:${PORT}/${command}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

const CASES = [
  { name: "iPhone 15 Pro Max", w: 430, h: 932, top: 59, bottom: 34 },
  { name: "iPhone 15", w: 393, h: 852, top: 59, bottom: 34 },
  { name: "iPhone 14", w: 390, h: 844, top: 47, bottom: 34 },
  { name: "iPhone 13 mini", w: 375, h: 812, top: 50, bottom: 34 },
  { name: "iPhone SE", w: 375, h: 667, top: 20, bottom: 0 },
  { name: "セーフエリア無し", w: 390, h: 844, top: 0, bottom: 0 },
];

const MEASURE = `(() => {
  const d = document.scrollingElement;
  d.scrollTop = 9999; const scrolled = d.scrollTop; d.scrollTop = 0;
  const world = document.querySelector(".home-world").getBoundingClientRect();
  const nav = document.querySelector(".bottom-nav").getBoundingClientRect();
  const buttons = [...document.querySelectorAll(".world-actions--left .world-action, .world-actions--right .world-action")];
  const hidden = buttons.filter((button) => {
    const box = button.getBoundingClientRect();
    const top = document.elementFromPoint(Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2));
    return !(button === top || button.contains(top));
  }).map((button) => (button.getAttribute("aria-label") || button.textContent || "").trim().slice(0, 8));
  const small = buttons.filter((button) => button.getBoundingClientRect().height < 44)
    .map((button) => (button.getAttribute("aria-label") || button.textContent || "").trim().slice(0, 8));
  const step = Math.round(buttons[0].getBoundingClientRect().height);
  return { scrolled, hidden, small, step, world: Math.round(world.height), gap: Math.round(nav.top - world.bottom) };
})()`;

for (const c of CASES) {
  await probe("size", { width: c.w, height: c.h });
  await new Promise((r) => setTimeout(r, 400));
  await probe("eval", {
    expression: `(() => { for (const el of [document.documentElement, document.body]) { el.style.setProperty("--home-safe-top","${c.top}px"); el.style.setProperty("--home-safe-bottom","${c.bottom}px"); } return "ok"; })()`,
  });
  await new Promise((r) => setTimeout(r, 400));
  const result = await probe("eval", { expression: MEASURE });
  const v = result.value;
  if (!v) { console.log(`${c.name.padEnd(18)} 測れず: ${JSON.stringify(result).slice(0, 120)}`); continue; }
  const marks = [
    v.scrolled === 0 ? "スクロール0" : `スクロール${v.scrolled}px`,
    v.hidden.length === 0 ? "全部押せる" : `押せない: ${v.hidden.join("/")}`,
    v.small.length === 0 ? "44px以上" : `小さい: ${v.small.join("/")}`,
  ];
  console.log(`${c.name.padEnd(18)} ${String(c.w)}x${c.h} 安全域${c.top}/${c.bottom}  世界${v.world}px 段${v.step}px 下余白${v.gap}px  ${marks.join(" / ")}`);
}
