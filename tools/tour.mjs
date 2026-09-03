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
import { resolve } from "node:path";

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
/**
 * 画面の一覧。
 *
 * `tab` / `tile` は画面に埋めた `data-tour` の値で指す。
 * **文言で探すのはやめた。**ラベルを変えるたびに巡回が「移動できない」を出し、
 * 画面が崩れているのか導線が変わっただけなのか区別が付かなくなる
 * (実際に、タブの絵文字を外した回に10件の誤報が出た)。
 * `then` だけは、対応する目印がまだ無い画面のために文言で残している。
 */
const SCREENS = [
  // 下部タブから直接行ける5つ
  { name: "ホーム", tab: "HOME" },
  { name: "モンスター", tab: "MONSTERS" },
  { name: "装備", tab: "EQUIPMENT" },
  { name: "召喚", tab: "SUMMON" },
  { name: "ショップ", tab: "SHOP" },
  // ホームの世界(左右の縦列)から入るもの。
  // **目印は絵の名前から機械的に作られる**(menu-dex → tile:dex)ので、
  // ここの名前も絵に合わせること
  { name: "ステージ", tab: "HOME", tile: "adventure" },
  { name: "パーティ", tab: "HOME", tile: "party" },
  { name: "アリーナ", tab: "HOME", tile: "arena" },
  { name: "試練の塔", tab: "HOME", tile: "tower" },
  { name: "遊び方", tab: "HOME", tile: "help" },
  { name: "モンスター図鑑", tab: "HOME", tile: "dex" },
  // ダンジョンは1段深い。「ダンジョン」を押すと選択肢が開く
  { name: "装備ダンジョン", tab: "HOME", tile: "dungeon", tile2: "equipDungeon" },
  { name: "レベル上げダンジョン", tab: "HOME", tile: "dungeon", tile2: "trainDungeon" },
  { name: "ゴールドダンジョン", tab: "HOME", tile: "dungeon", tile2: "goldDungeon" },
  /*
   * アリーナは中でさらに6画面に分かれる。**巡回に入れていなかった。**
   *
   * 一番大きい追加なのに、見ていたのは入口のトップだけだった。
   * 対戦候補・防衛・ランキング・ショップ・防衛履歴・攻撃編成は、
   * どれも一覧と札が縦に伸びる作りで、いちばん崩れやすい形をしている。
   */
  { name: "アリーナ/対戦候補", tab: "HOME", tile: "arena", tour: "arena:opponents" },
  { name: "アリーナ/防衛編成", tab: "HOME", tile: "arena", tour: "arena:defense" },
  { name: "アリーナ/ランキング", tab: "HOME", tile: "arena", tour: "arena:ranking" },
  { name: "アリーナ/ショップ", tab: "HOME", tile: "arena", tour: "arena:shop" },
  { name: "アリーナ/防衛履歴", tab: "HOME", tile: "arena", tour: "arena:history" },
  { name: "アリーナ/攻撃編成", tab: "HOME", tile: "arena", then: "編成する" },
];

/*
 * 検査する画面の大きさ。**縦だけ。**
 *
 * このゲームは縦持ち専用になった(manifest の orientation: "portrait"、
 * ブラウザで横にされた時は `ui/portraitOnly.css` が縦へ戻すよう伝える)。
 * 横向きは「遊べる状態」ではないので、崩れを検査する意味が無い。
 *
 * 2Dのモンスターを左右2列で縦に並べる構図にしたため、横に倒すと
 * 5体を収める高さが無くなり、1チームぶんが画面上で重なる。
 * 縦横どちらでも成立させようとすると、どちらも中途半端になる。
 */
const SIZES = [
  { label: "縦(iPhone)", width: 390, height: 844 },
  /*
   * 大きい方の縦。**幅が広い方が安全とは限らない。**
   *
   * 390 で収まる並びが 430 では隙間だらけになり、逆に高さが増えたぶん
   * 「入りきらない時だけ出る」案内が出なくなって、下の要素が押し出される。
   * 実機の主流が2つに割れている以上、片方だけ見るのは片方だけ触るのと同じ。
   */
  { label: "縦(大)", width: 430, height: 932 },
];

/**
 * 画面から測れる異常。
 *
 * **目で見て分かる崩れのうち、数値で取れるものだけを検査する。**
 * 「格好いいか」は測れないが、「押せない」「はみ出す」「重なる」は測れる。
 */
import { INSPECT } from "./lib/inspect.mjs";

/**
 * 画面が動かせる状態になるまで待つ。
 *
 * 固定の待ち時間だけで進めていたため、手持ちが多い保存データでは
 * 描画が間に合わず「タブが無い」と誤って報告し、以降の画面が
 * 総崩れになることがあった。**準備できたことを確かめてから進む。**
 */
/**
 * 画面そのものが死んだかどうか。
 *
 * 常駐ブラウザは複数の作業で共有しているため、別の不具合(音の文脈を
 * 無限に作り直す等)で描画プロセスごと落ちることがある。
 * これを「ボタンが無い」と報告してしまうと、**触っていない画面の
 * 指摘が並んで、本物の崩れが埋もれる。** 死んでいる時は作り直す。
 */
function isPageDead(message) {
  return typeof message === "string" && /browser has been closed|context was destroyed|Target closed|Target page/.test(message);
}

async function revivePage(size) {
  await call("goto", { path: "/", fresh: true, width: size.width, height: size.height });
  return waitReady();
}

async function waitReady(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await call("eval", { expression: `document.querySelectorAll('.bottom-nav__btn').length` });
    if (res.ok && Number(res.value) > 0) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 300));
  }
}

/**
 * タイトル(START)を実際に押して、ホームを露出させる。
 *
 * **これが無いと巡回が嘘をつく。** タイトルは全面を覆う固定要素なので、
 * その裏にある下タブは `querySelector` でも `.click()` でも掴めてしまう
 * (プログラムからのクリックは覆われていても成功する)。
 * その結果「ホーム = 問題なし」と報告しながら、実際に見ていたのは
 * タイトル画面だった。ホームは巡回の一番目なので、丸ごと素通りしていた。
 */
async function pressStart() {
  const res = await call("eval", {
    expression: `(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const start = document.querySelector('[data-tour="start"]');
      if (start) { start.click(); await wait(500); }
      return document.querySelector(".title-screen") ? "タイトルが消えない" : "ok";
    })()`,
  });
  return res.ok ? res.value : `検査に失敗: ${res.error ?? "不明"}`;
}

async function goScreen(screen) {
  const clicked = await call("eval", {
    expression: `(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      /*
       * **まず今いる階層から出る。**
       *
       * 下タブを押せば戻る、という前提で組んでいたが、アリーナは
       * 中でさらに6画面に分かれていて、下タブを押してもう一度入ると
       * **さっき開いた中の画面がそのまま出る。** そのせいでトップの目印が
       * 見つからず、2つ目以降のアリーナ画面が丸ごと「目印が無い」になった。
       * 戻るボタンが消えるまで押して、必ず同じところから始める。
       */
      for (let i = 0; i < 4; i += 1) {
        const back = document.querySelector('.global-back');
        if (!back) break;
        back.click();
        await wait(200);
      }
      const tab = document.querySelector('[data-tour="tab:' + ${JSON.stringify(screen.tab)} + '"]');
      if (!tab) return 'タブが無い: ' + ${JSON.stringify(screen.tab)};
      tab.click();
      await wait(250);
      ${
        screen.tile
          ? `const tile = document.querySelector('[data-tour="tile:' + ${JSON.stringify(screen.tile)} + '"]');
             if (!tile) return '一覧の枠が無い: ' + ${JSON.stringify(screen.tile)};
             tile.click();
             await wait(350);`
          : ""
      }
      ${
        screen.tile2
          ? `const tile2 = document.querySelector('[data-tour="tile:' + ${JSON.stringify(screen.tile2)} + '"]');
             if (!tile2) return '2段目の枠が無い: ' + ${JSON.stringify(screen.tile2)};
             tile2.click();
             await wait(350);`
          : ""
      }
      ${
        /*
         * 3段目以降の目印。**`data-tour` の値をそのまま書く。**
         *
         * アリーナのように「絵 → 中の行き先」と2段入る画面があり、
         * `tile:` の接頭辞が付かない目印(`arena:opponents` など)を
         * 指せなかった。文言で探すと、ラベルを変えた回に一斉に誤報が出る。
         */
        screen.tour
          ? `const mark = document.querySelector('[data-tour=' + ${JSON.stringify(JSON.stringify(screen.tour))} + ']');
             if (!mark) return '目印が無い: ' + ${JSON.stringify(screen.tour)};
             mark.click();
             await wait(350);`
          : ""
      }
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
    const started = await pressStart();
    if (started !== "ok") {
      report.push({ 画面: "(タイトル)", 画面比: size.label, 結果: started });
      failures += 1;
      continue;
    }

    for (const screen of SCREENS) {
      let moved = await goScreen(screen);
      // 描画待ちで取りこぼした時のために一度だけやり直す。
      // 頁ごと落ちていた時は作り直してから測り直す
      if (moved !== "ok") {
        if (isPageDead(moved)) await revivePage(size);
        else await waitReady(4000);
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
        // 絶対パスで渡された時に cwd を前置しない(join だと /home/... の下へ潜り込む)
        /*
         * 画面名の `/` をそのまま使うと**階層ができる。**
         * 「アリーナ/対戦候補」が `.../390x844-アリーナ/対戦候補.png` になり、
         * CIの `artifacts/tour/*.png` に引っかからず、
         * **いちばん新しい画面の絵だけが成果物から抜け落ちていた。**
         */
        const safe = screen.name.replace(/[/\\]/g, "-");
        await call("shot", { path: resolve(shotDir, `${size.width}x${size.height}-${safe}.png`) });
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
