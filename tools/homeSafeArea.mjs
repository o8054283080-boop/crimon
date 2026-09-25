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
 * **ホームは自分で開く。**以前は「開いた状態で走らせること」と書いてあったが、
 * サイズを変えるたびに `goto` からやり直す必要があるので、毎回タイトル画面に
 * 戻ってしまい `getBoundingClientRect of null` で測れなかった。
 *
 * **下のバーの余白も注入する。**`mobile-ux.css` が `.bottom-nav` へ
 * `env()` を直に書いているので、変数を差し替えてもバーの高さだけが
 * 実機と合わない(CLAUDE.md が禁じている書き方が残っている)。
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
  const worldEl = document.querySelector(".home-world");
  if (!worldEl) return null;
  const world = worldEl.getBoundingClientRect();
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
  /*
   * **プレゼントは左の縦列の一番下。**実機で下のバーに沈んだのがここなので、
   * バーの上端との隙間を数字で出す。40px を切ったら危ない。
   */
  const gift = document.querySelector('[data-tour="tile:giftBox"]');
  const giftGap = gift ? Math.round(nav.top - gift.getBoundingClientRect().bottom) : null;
  return {
    scrolled, hidden, small, step, giftGap,
    world: Math.round(world.height),
    gap: Math.round(nav.top - world.bottom),
    nav: Math.round(nav.height),
  };
})()`;

/** タイトル画面を押してホームへ入る。safe-area も注入する */
async function openHome(c) {
  await probe("goto", { path: "/", width: c.w, height: c.h });
  await probe("size", { width: c.w, height: c.h });
  await new Promise((r) => setTimeout(r, 500));
  /*
   * 変数の差し替えは**ホームへ入る前に**。`.crimon-home` が現れた瞬間から
   * 高さの計算に使われるので、後から入れると一度ずれた姿で組まれる。
   *
   * 下のバーは、絵をバー全体(safe-area 込み)に敷いて下の余白を持たない形にした
   * (`home-pop-design.css` の `body .bottom-nav`)。高さは `--home-safe-bottom` を通る
   * `--bottom-nav-h` で決まるので、変数の差し替えだけで実機相当になる。
   */
  await probe("eval", {
    expression: `(() => {
      for (const el of [document.documentElement, document.body]) {
        el.style.setProperty("--home-safe-top", "${c.top}px");
        el.style.setProperty("--home-safe-bottom", "${c.bottom}px");
      }
      const start = document.querySelector('[data-tour="start"]');
      if (start) start.click();
      return "ok";
    })()`,
  });
  await new Promise((r) => setTimeout(r, 900));
}

for (const c of CASES) {
  await openHome(c);
  const result = await probe("eval", { expression: MEASURE });
  const v = result.value;
  if (!v) { console.log(`${c.name.padEnd(18)} 測れず: ${JSON.stringify(result).slice(0, 120)}`); continue; }
  const marks = [
    v.scrolled === 0 ? "スクロール0" : `スクロール${v.scrolled}px`,
    v.hidden.length === 0 ? "全部押せる" : `押せない: ${v.hidden.join("/")}`,
    v.small.length === 0 ? "44px以上" : `小さい: ${v.small.join("/")}`,
    v.giftGap === null ? "プレゼント無し" : `プレゼント下${v.giftGap}px`,
  ];
  console.log(`${c.name.padEnd(18)} ${String(c.w)}x${c.h} 安全域${c.top}/${c.bottom}  バー${v.nav}px 世界${v.world}px 段${v.step}px 下余白${v.gap}px  ${marks.join(" / ")}`);
}
