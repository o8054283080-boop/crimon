import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

/*
 * 自動周回の進捗を、浮かせずに画面の流れの中へ置く。
 *
 * ## 何が起きていたか
 *
 * ここはドラッグと「左端へ収納」まで持つ浮遊パネルだった。実機のホームでは
 * 幅176pxで左に貼り付き、収納ボタンのぶん左を40px空けるので文字の入る幅が
 * 130px弱しか残らない。`overflow-wrap: anywhere` と合わさって
 * **「ステ / ージ / 3- / 5 0 / 5周 / 行中」と1〜3文字ずつ折り返していた。**
 * 同時に「お知らせ」のボタンと世界の絵も覆っていた。
 *
 * 型もテストも通っていた。バイナリやCSSと同じで、**重なりと折り返しは
 * 実物を見るまで分からない。** ここで見張れるのは「もう浮かせていないか」だけ。
 */

const main = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");

describe("自動周回の進捗は浮かせない", () => {
  it("共通フローティングパネルそのものを消してある", () => {
    // 部品が残っている限り、次に誰かが「ここに浮かせればいい」と使う
    expect(existsSync(new URL("../src/web/floatingPanel.ts", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../src/web/home-floating-ux.ts", import.meta.url))).toBe(false);
    expect(main).not.toContain("createFloatingPanel");
    expect(main).not.toContain("data-floating-panel");
  });

  it("position を持つCSSが残っていない", () => {
    for (const file of ["../src/web/style.css", "../src/web/home-tutorial-bar.css", "../src/web/crimon-visual-system.css"]) {
      const css = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(css, `${file} に浮遊パネルのCSSが残っている`).not.toContain(".floating-panel");
    }
  });

  it("共通の帯(.tutorial-bar)を使い、画面の流れの中へ差し込む", () => {
    expect(main).toContain('className: `tutorial-bar tutorial-bar--farm');
    expect(main).toContain("world.before(farm)");
    expect(main).toContain("content.prepend(farm)");
  });

  it("ホームでは世界の枠と同じ親に入れ、高さを申告する", () => {
    /*
     * ホームは `100dvh` を分け合う縦並び。外側へ足すと画面からはみ出し、
     * 高さを申告しないと `.home-world` が黙って潰れて「試練の塔」が消える。
     */
    const css = readFileSync(new URL("../src/web/crimon-visual-system.css", import.meta.url), "utf8");
    expect(css).toContain(".crimon-home:has(.tutorial-bar--farm){--home-farm-h:");
    expect(css).toContain("var(--home-farm-h, 0px))");
  });

  it("戦闘中は出さない", () => {
    // 戦闘画面は自前の全画面配置で、帯を差し込む場所が無い
    expect(main).toMatch(/function buildFarmBar\(\)[\s\S]{0,200}BATTLE_SCREENS\.has\(state\.screen\)\) return null;/);
  });

  it("進捗の数字は差分更新で、前景画面を描き直さない", () => {
    expect(main).toContain('root.querySelector<HTMLElement>("[data-background-farm-bar]")');
  });

  it("止める的と結果を見る的が、どちらも残っている", () => {
    expect(main).toContain('finishBackgroundFarm(job, "STOPPED")');
    expect(main).toContain('state.screen = "AUTO_FARM_RESULT"');
  });

  it("狭い端末でも周回の中身は畳まない", () => {
    /*
     * 初心者ミッションは条件文を畳んでよい(タイトルだけで用が足りる)。
     * 周回は畳むと**進捗そのものが消える**ので、文字を小さくして収める。
     * 9pxを下回らせない(`tests/cssReadability.test.ts` が落とす)。
     */
    const css = readFileSync(new URL("../src/web/ui/tutorialBar.css", import.meta.url), "utf8");
    expect(css).toContain(".tutorial-bar--farm .tutorial-bar__cond > span:first-child");
    expect(css).toContain("display: block;");
  });
});
