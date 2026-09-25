/**
 * 見出しと「戻る」を、全画面で1つの形にそろえる(U8)。
 *
 * ## 前はばらばらだった
 *
 * 見出しは6通り(中央の特大の題字、左の小さな題、題と右のボタン、帯の中の中央の題、
 * 詳細だけの「‹ 戻る」、題が絵の中にある召喚)、戻るは5通りあった。
 * 左上に `position: fixed` で浮いた「戻る」と、画面ごとの「◀ 階層選択に戻る」
 * 「閉じる」「‹ 一覧」が同じ画面に同時に出て、浮いた方は巻くと
 * 案内帯の「STEP 1」の上に乗っていた。
 *
 * ## いまの決まり
 *
 * - どの画面も、一番上は見出し帯(`screenHeader`)1本
 * - 戻るは帯の左端に1つだけ。**浮かせない**(帯は流れの中にあり、巻くと貼り付く)
 * - 画面の中に2つ目の戻り口を置かない。行き先が違うなら帯へ `onBack` を渡す
 * - 案内帯は見出し帯の下
 *
 * 見た目の崩れは型にもテストにも出ないので、字面で見張れるところを見張る。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(new URL(`../src/web/${path}`, import.meta.url), "utf8");

/** 画面の組み立て(views 以下の .ts)を全部読む */
function viewSources(): { file: string; source: string }[] {
  const root = new URL("../src/web/views/", import.meta.url).pathname;
  const out: { file: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".ts")) out.push({ file: path.slice(root.length), source: readFileSync(path, "utf8") });
    }
  };
  walk(root);
  return out;
}

describe("戻るは見出し帯の左端に1つだけ", () => {
  const css = read("ui/screenHead.css");

  it("浮いた「戻る」は、もう描かない", () => {
    const main = read("main.ts");
    expect(main).not.toContain("renderGlobalBackButton");
    expect(main).not.toContain("has-global-back");
    expect(read("style.css")).not.toMatch(/\.global-back \{/);
  });

  it("外側が差し込むのは、帯の中だけ。既に戻るを持つ帯には足さない", () => {
    const main = read("main.ts");
    expect(main).toContain("attachScreenBack(head, goBack)");
    const header = read("views/managementHeader.ts");
    expect(header).toContain('if (header.querySelector(".screen-head__back")) return false;');
  });

  /** **浮かせない。**浮かせた部品はこの案件で4回、下の何かを覆っている */
  it("帯は流れの中で貼り付くだけ。固定も絶対配置もしない", () => {
    const head = css.slice(css.indexOf(".screen-head {"), css.indexOf("}", css.indexOf(".screen-head {")));
    expect(head).toContain("position: sticky;");
    const back = css.slice(css.indexOf(".screen-head__back {"), css.indexOf("}", css.indexOf(".screen-head__back {")));
    expect(back).not.toMatch(/position:\s*(fixed|absolute)/);
  });

  /*
   * 帯の地は画面の端まで伸ばす。**影(box-shadow)で伸ばすと四方へ同じだけ伸び**、
   * 下を開けると真下の案内帯の題名に被さった(「最初の召喚」の上半分が隠れた)。
   * 下を切ると、巻いた時に真下の札の縁(案内帯の緑)が罫のすぐ下からのぞいた。
   * `border-image` の外へのはみ出しは描くだけで、巻物の大きさにも押す判定にも数えない。
   * 下へは8pxのぼかしだけを出す(地の色の塊を出さない)。
   */
  it("帯の地は横へは端まで、下へはぼかし8pxだけ", () => {
    expect(css).not.toContain("box-shadow: 0 0 0 100vmax");
    expect(css).toContain("border-image-outset: 0 100vmax 8px;");
    expect(css).toContain("rgba(11, 14, 32, 0) 100%");
  });

  it("画面の中に、2つ目の戻り口(◀ … に戻る / ‹ 一覧)を置かない", () => {
    /*
     * 「◀ 階層選択に戻る」「◀ アリーナに戻る」「‹ 一覧」「◀ 階層」の形を拾う。
     * 戦闘画面は見出し帯を持たない(戦場いっぱいの配置)ので、決着後の「◀ 戻る」が出口。
     * (札や引き出しを畳む「閉じる」は画面の出口ではないので、ここでは見ない)
     */
    const exits = viewSources()
      .filter(({ file }) => file !== "battleView.ts")
      .flatMap(({ file, source }) => [...source.matchAll(/\["([◀‹][^"]*)"\]/g)].map((m) => `${file}: ${m[1]}`));
    expect(exits).toEqual([]);
  });

  it("古い見出し(中央の特大の題字・題と右のボタン)を使う画面が残っていない", () => {
    const left = viewSources().filter(({ source }) => source.includes('className: "app-header'));
    expect(left.map(({ file }) => file)).toEqual([]);
  });
});

describe("案内帯は見出しの下。題名を切らない", () => {
  it("見出し帯の直後へ差し込む", () => {
    const main = read("main.ts");
    expect(main).toContain('content.querySelector<HTMLElement>(":scope > [data-screen-head]")');
    expect(main).toContain("if (head) head.after(node); else content.prepend(node);");
  });

  /*
   * 題・条件・ボタン2つを1行に並べていたため、390px幅では題の欄が100pxほどしか無く、
   * 「🎯 最初の召…」と全画面で切れていた。題は上の段を右端まで使う。
   */
  it("題は上の段を右端まで使い、折り返してよい", () => {
    const bar = read("ui/tutorialBar.css");
    expect(bar).toContain('"badge title title"');
    const title = bar.slice(bar.indexOf(".tutorial-bar[data-tutorial-bar] .tutorial-bar__title {"));
    const body = title.slice(0, title.indexOf("}"));
    expect(body).toContain("white-space: normal;");
  });

  /** 帯が2本とも貼り付くと、巻いた時に中身の見える幅が半分になる */
  it("案内帯は貼り付かない(貼り付くのは見出し帯だけ)", () => {
    const bar = read("ui/tutorialBar.css");
    const at = bar.indexOf(".screen > .tutorial-bar[data-tutorial-bar] {");
    const body = bar.slice(at, bar.indexOf("}", at));
    expect(body).not.toMatch(/position:\s*(sticky|fixed|absolute)/);
  });
});

describe("下のバーはどの画面でも同じ絵", () => {
  /*
   * 前はホームにいる時だけ金の装飾の絵で、他の画面は線画のアイコンの帯だった。
   * 下のタブで画面を移るたびに、バーそのものが別の物に入れ替わっていた。
   */
  it("金の装飾の絵をホームに限らない", () => {
    const pop = read("home-pop-design.css");
    expect(pop).toMatch(/body \.bottom-nav,\s*body \.crimon-bottom-nav \{[^}]*home-bottom-nav-frame-v5\.webp/);
    expect(pop).not.toContain("body:has(.crimon-home) .bottom-nav,");
  });

  /*
   * **今いるタブに印を付ける。**金の絵の上では文字の色が変わるだけで、
   * モンスター画面にいても「モンスター」が選ばれて見えなかった(判定役の指摘)。
   */
  it("今いるタブは枠で囲む", () => {
    const pop = read("home-pop-design.css");
    const at = pop.indexOf("body .bottom-nav__btn--active::after {");
    expect(at, "今いるタブの印が無い").toBeGreaterThan(-1);
    const body = pop.slice(at, pop.indexOf("}", at));
    expect(body).toMatch(/border: [\d.]+px solid/);
    expect(body).toContain("pointer-events: none;");
  });

  /*
   * 一度、絵を safe-area を除いた上の部分だけに敷いた。実機では絵が66pxに押し込まれて
   * 城や剣が横長に潰れ、下に無地の帯が残って「ぎゅっとしすぎ」になった(依頼主の実機)。
   * 絵はバー全体に敷き、高さは幅から決めた絵の高さを下回らない。文字は割合で絵の文字の段へ置く。
   */
  it("絵はバー全体に敷き、潰れる高さまで縮めない", () => {
    const pop = read("home-pop-design.css");
    const style = read("style.css");
    expect(pop).toContain('url("./assets/home/home-bottom-nav-frame-v5.webp") center / 100% 100% no-repeat');
    expect(pop).not.toContain("calc(100% - var(--nav-safe))");
    expect(style).toMatch(/--bottom-nav-art-h: clamp\(\d+px, calc\(100vw \/ 3\.\d\), \d+px\);/);
    // ホーム以外: safe-area 抜きの値に safe-area を足すと、ちょうど絵の高さになる
    expect(style).toContain("--bottom-nav-h: max(64px, calc(var(--bottom-nav-art-h) - env(safe-area-inset-bottom, 0px)));");
    // ホーム: safe-area 込みの値が、絵の高さを下回らない
    expect(pop).toContain("--bottom-nav-h: max(calc(var(--home-nav-base-h) + var(--home-safe-bottom)), var(--bottom-nav-art-h));");
    // 文字は px ではなく絵の高さに対する割合で置く(safe-area の有無で絵の中の位置がずれない)
    const at = pop.indexOf("body .bottom-nav__label {");
    expect(pop.slice(at, pop.indexOf("}", at))).toMatch(/bottom: \d+% !important;/);
  });

  /** ホーム以外の `--bottom-nav-h` は safe-area 抜き。バーの側で足さないと実機で沈む */
  it("ホーム以外でも下の safe-area を足す", () => {
    const pop = read("home-pop-design.css");
    expect(pop).toContain("height: calc(var(--bottom-nav-h) + var(--bottom-nav-safe, env(safe-area-inset-bottom, 0px))) !important;");
    expect(pop).toContain("--bottom-nav-safe: 0px;");
  });
});

/*
 * 編成の駒(`.party-current`)は `sticky` + `top` を書いていたが、後から読まれる
 * `.panel` の `position: relative` に負けて貼り付きは効かず、**`top` のぶん札が下へずれて**
 * 「所持モンスター」の見出しと「絞り込み」を覆っていた(見出し帯を入れた時に 16px → 58px)。
 */
describe("編成の駒は流れの中", () => {
  it("top で札をずらさない", () => {
    const css = read("style.css");
    const at = css.indexOf(".party-current {");
    const body = css.slice(at, css.indexOf("}", at));
    expect(body).not.toMatch(/(^|\s)top:/);
    expect(body).not.toContain("position: sticky");
  });
});
