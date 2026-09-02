import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
 * アリーナの中の行き先が「見ている場所」として扱われているか。
 *
 * ## なぜ要るのか
 *
 * アリーナは1つの画面(`screen === "ARENA"`)の中で、さらに6つに分かれる
 * (対戦候補・防衛編成・ランキング・ショップ・防衛履歴・攻撃編成)。
 * この分岐は `state.arenaView` が持っているのに、
 * **戻る履歴(`ROUTE_FIELDS`)にも `navigate` の畳み込みにも入っていなかった。**
 *
 * そのせいで、実機で2つ壊れていた:
 *
 *   1. 中の画面で「戻る」を押すと、アリーナのトップを飛ばしてホームまで戻る
 *      → トップから対戦候補へ移っても「見ている場所」が変わったことにならず、
 *        履歴が1つも積まれないため
 *   2. ホームから入り直しても、前に開いた中の画面がそのまま出る
 *      → `navigate` が畳んでいないため
 *
 * どちらも型チェックもテストも素通りした。巡回をアリーナの**中まで**
 * 広げてはじめて「目印が無い」として出てきた
 * (`tools/tour.mjs` の「アリーナ/対戦候補」以下6件)。
 *
 * ## なぜ本文を読む形で書くのか
 *
 * `main.ts` は起動時に画面を組み立てるので、テストから読み込めない。
 * 画面を動かす代わりに、**約束が本文に書かれていること**を見張る。
 * 消されたら落ちる。それがここで欲しい唯一のことになる。
 */

const main = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");

/** `const ROUTE_FIELDS = [ ... ]` の中身 */
function routeFieldsBlock(): string {
  const at = main.indexOf("const ROUTE_FIELDS = [");
  expect(at, "ROUTE_FIELDS が無い").toBeGreaterThan(-1);
  const end = main.indexOf("]", at);
  return main.slice(at, end);
}

/** `function navigate(...) { ... }` の中身 */
function navigateBody(): string {
  const at = main.indexOf("function navigate(screen: ScreenName): void {");
  expect(at, "navigate が無い").toBeGreaterThan(-1);
  const end = main.indexOf("\n}", at);
  return main.slice(at, end);
}

describe("アリーナの中の行き先が、戻ると入り直しで正しく扱われること", () => {
  it("arenaView が戻る履歴の対象に入っている", () => {
    // 入っていないと、中の移動が履歴に積まれず、戻るとホームまで飛ぶ
    expect(routeFieldsBlock()).toContain('"arenaView"');
  });

  it("開いている相手と検分中の1体も履歴の対象に入っている", () => {
    /*
     * 相手の詳細・1体の検分も同じ `screen` の中の分岐。
     * ここが抜けていると、詳細から戻った時に一覧ではなく手前まで飛ぶ。
     */
    const block = routeFieldsBlock();
    expect(block).toContain('"arenaDetailIndex"');
    expect(block).toContain('"arenaUnitIndex"');
  });

  it("navigate がアリーナの中の行き先を畳む", () => {
    // 畳まないと、ホームから入り直しても前に開いた中の画面が出る
    const body = navigateBody();
    expect(body).toContain('state.arenaView = "TOP"');
    expect(body).toContain("state.arenaDetailIndex = null");
    expect(body).toContain("state.arenaUnitIndex = 0");
  });

  it("画面をまたいだ案内文を持ち越さない", () => {
    // 前の画面の言葉が残ると、そこに無いことを言う札になる
    expect(navigateBody()).toContain("state.arenaNotice = null");
  });
});

describe("巡回がアリーナの中まで届いていること", () => {
  const tour = readFileSync(new URL("../tools/tour.mjs", import.meta.url), "utf8");

  it("アリーナの6画面が巡回の一覧にある", () => {
    /*
     * いちばん大きい追加なのに、見ていたのは入口のトップだけだった。
     * 一覧・札が縦に伸びる作りは、この案件でいちばん崩れている。
     */
    for (const name of ["対戦候補", "防衛編成", "ランキング", "ショップ", "防衛履歴", "攻撃編成"]) {
      expect(tour, `アリーナ/${name} が巡回に無い`).toContain(`アリーナ/${name}`);
    }
  });

  it("画面の大きさを2つ見ている", () => {
    // 実機の主流が2つに割れている。片方だけ見るのは片方だけ触るのと同じ
    expect(tour).toContain("width: 390, height: 844");
    expect(tour).toContain("width: 430, height: 932");
  });

  it("画面名の / を画像の階層にしない", () => {
    /*
     * 「アリーナ/対戦候補」がそのままだと `390x844-アリーナ/対戦候補.png` になり、
     * CIの `artifacts/tour/*.png` から漏れる。新しい画面の絵だけが残らない。
     */
    expect(tour).toContain('replace(/[/\\\\]/g, "-")');
  });
});
