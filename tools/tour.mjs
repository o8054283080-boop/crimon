/**
 * 全画面を自動で巡回して、崩れているところを機械的に見つける。
 *
 * これまで画面の確認は「常駐サーバを起動 → goto → 座標を調べる →
 * スクリーンショット → 切り出して拡大 → 目で見る」という手作業で、
 * 1画面あたり数分かかっていた。そのせいで**確認したのは触った画面だけ**になり、
 * 別の画面の崩れ(縦画面での文字の重なり、画面外へ出たボタン)を
 * 何度も見落として、依頼主に指摘されてから気付いていた。
 *
 * ここでは目視に頼らず、DOMから測れる異常だけを機械的に検査する。
 *
 *   node tools/tour.mjs             # 縦横それぞれで全画面を検査
 *   node tools/tour.mjs --shots out # 併せて画面ごとのPNGも保存
 *
 * 常駐サーバ(harness.mjs)が要る。HARNESS_PORT で待ち受け先を変えられる。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.HARNESS_PORT ?? 5311);

async function call(command, body = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}/${command}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * 画面の一覧。`open` は、その画面へ移動するために画面上で行う操作。
 * 下部タブから行けるものはタブ名、そうでないものはボタンの文言で指定する。
 */
const SCREENS = [
  { name: "ホーム", tab: "ホーム" },
  { name: "召喚", tab: "召喚" },
  { name: "モンスター", tab: "モンスター" },
  { name: "装備", tab: "装備" },
  { name: "パーティ", tab: "パーティ" },
  { name: "ショップ", tab: "ショップ" },
  { name: "ステージ", tab: "ステージ" },
  // ホームのタイルは文言が変わりやすいので、先頭の絵文字で拾う
  { name: "装備ダンジョン", tab: "ホーム", then: "🛡装備" },
  { name: "レベル上げダンジョン", tab: "ホーム", then: "📈育成" },
  { name: "ゴールドダンジョン", tab: "ホーム", then: "🪙ゴールド" },
  { name: "モンスター図鑑", tab: "モンスター", then: "📖 図鑑" },
];

const SIZES = [
  { label: "縦(iPhone)", width: 390, height: 844 },
  { label: "横", width: 844, height: 390 },
];

/**
 * 画面から測れる異常。
 *
 * **目で見て分かる崩れのうち、数値で取れるものだけを検査する。**
 * 「格好いいか」は測れないが、「押せない」「はみ出す」「重なる」は測れる。
 */
const INSPECT = `(() => {
  const problems = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 1. 横スクロール。縦画面で最も起きやすく、起きると全体が窮屈になる
  if (document.documentElement.scrollWidth > vw + 1) {
    problems.push('横にはみ出している (' + document.documentElement.scrollWidth + ' > ' + vw + ')');
  }

  const nav = document.querySelector('.bottom-nav');
  const navTop = nav ? nav.getBoundingClientRect().top : vh;

  // 2. 押せないボタン。他の要素が上に乗っている/画面外にある
  const buttons = [...document.querySelectorAll('button:not([disabled]), a[href]')];
  for (const b of buttons) {
    const r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // 画面の外(下タブの裏に隠れているものを含む)
    if (r.left < -2 || r.right > vw + 2) {
      problems.push('画面の外にあるボタン: ' + (b.textContent || '').trim().slice(0, 16));
      continue;
    }
    // 見えている位置にあるのに、最前面が自分でない
    const cx = Math.min(vw - 2, Math.max(2, r.x + r.width / 2));
    const cy = Math.min(vh - 2, Math.max(2, r.y + r.height / 2));
    if (cy > navTop - 2) continue; // 下タブの下は判定しない
    if (r.bottom < 0 || r.top > vh) continue; // 画面外(スクロールすれば見える)は許す
    const top = document.elementFromPoint(cx, cy);
    if (top && !b.contains(top) && top !== b && !b.closest('.bottom-nav')) {
      problems.push('押せないボタン「' + (b.textContent || '').trim().slice(0, 14) + '」の手前に ' + (top.className || top.tagName));
    }
  }

  // 3. 極端に小さい文字。実機で読めない
  for (const el of document.querySelectorAll('p, span, div, button')) {
    if (!el.textContent || el.children.length > 0) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size > 0 && size < 9) {
      problems.push('文字が小さすぎる (' + size.toFixed(1) + 'px): ' + el.textContent.trim().slice(0, 14));
      break;
    }
  }

  // 4. 見出しと重なっている要素(上帯の文字の重なりを何度も出しているため)
  const header = document.querySelector('.app-header h1, .battle-topbar__title');
  if (header) {
    const hr = header.getBoundingClientRect();
    for (const el of document.querySelectorAll('.battle-logstrip, .shop-notice, .app-subtitle')) {
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      const overlap = !(r.bottom <= hr.top || r.top >= hr.bottom || r.right <= hr.left || r.left >= hr.right);
      if (overlap) problems.push('見出しと重なっている: ' + el.className);
    }
  }

  return { problems, ボタン数: buttons.length, 高さ: document.documentElement.scrollHeight };
})()`;

/**
 * 画面が動かせる状態になるまで待つ。
 *
 * 固定の待ち時間だけで進めていたため、手持ちが多い保存データでは
 * 描画が間に合わず「タブが無い」と誤って報告し、以降の画面が
 * 総崩れになることがあった。**準備できたことを確かめてから進む。**
 */
async function waitReady(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await call("eval", { expression: `document.querySelectorAll('.bottom-nav__btn').length` });
    if (res.ok && Number(res.value) > 0) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function goScreen(screen) {
  const clicked = await call("eval", {
    expression: `(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const tab = [...document.querySelectorAll('.bottom-nav__btn')].find(b => b.textContent.includes(${JSON.stringify(screen.tab)}));
      if (!tab) return 'タブが無い: ' + ${JSON.stringify(screen.tab)};
      tab.click();
      await wait(250);
      ${
        screen.then
          ? `const want = ${JSON.stringify(screen.then)};
             const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(want)) 
                      || [...document.querySelectorAll('button')].find(b => b.textContent.includes(want));
             if (!btn) return 'ボタンが無い: ' + ${JSON.stringify(screen.then)};
             btn.click();
             await wait(350);`
          : ""
      }
      return 'ok';
    })()`,
  });
  // 失敗の理由を握り潰すと「undefined」としか出ず、原因を追えない
  return clicked.ok ? clicked.value : `検査に失敗: ${clicked.error ?? "不明"}`;
}

async function main() {
  const shotIndex = process.argv.indexOf("--shots");
  const shotDir = shotIndex >= 0 ? process.argv[shotIndex + 1] : null;
  if (shotDir) mkdirSync(shotDir, { recursive: true });

  const health = await call("health").catch(() => null);
  if (!health?.ok) {
    console.error("常駐サーバへ繋がりません。先に `node tools/harness.mjs` を起動してください。");
    process.exit(1);
  }

  const report = [];
  let failures = 0;

  for (const size of SIZES) {
    // fresh:true は頁を作り直すので、**画面の大きさもここで渡さないと既定値へ戻る**。
    // これを渡し忘れていたため、「縦(iPhone)」と名乗りながら実際には
    // 900x430(横)を2回検査しており、縦画面の崩れを1件も拾えていなかった。
    await call("size", { width: size.width, height: size.height });
    await call("goto", { path: "/", fresh: true, width: size.width, height: size.height });
    if (!(await waitReady())) {
      report.push({ 画面: "(起動)", 画面比: size.label, 結果: "下タブが出てこない。画面が開けていない" });
      failures += 1;
      continue;
    }

    for (const screen of SCREENS) {
      let moved = await goScreen(screen);
      // 描画待ちで取りこぼした時のために一度だけやり直す
      if (moved !== "ok") {
        await waitReady(4000);
        moved = await goScreen(screen);
      }
      if (moved !== "ok") {
        report.push({ 画面: screen.name, 画面比: size.label, 結果: `移動できない: ${moved}` });
        failures += 1;
        continue;
      }
      await new Promise((r) => setTimeout(r, 250));

      const inspected = await call("eval", { expression: INSPECT });
      const runtime = (await call("problems")).problems ?? [];
      const found = [...(inspected.value?.problems ?? []), ...runtime];

      if (shotDir) {
        await call("shot", { path: join(process.cwd(), shotDir, `${size.width}x${size.height}-${screen.name}.png`) });
      }

      if (found.length > 0) failures += found.length;
      report.push({ 画面: screen.name, 画面比: size.label, 結果: found.length === 0 ? "問題なし" : found.join(" / ") });
    }
  }

  const lines = report.map((r) => `${r.結果 === "問題なし" ? "  " : "！ "}${r.画面比} ${r.画面.padEnd(12)} ${r.結果}`);
  console.log(lines.join("\n"));
  console.log(`\n${report.length}画面を確認 / 指摘 ${failures}件`);
  if (shotDir) console.log(`画像: ${shotDir}/`);
  process.exit(failures > 0 ? 2 : 0);
}

main();
