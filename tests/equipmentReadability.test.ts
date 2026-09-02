import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
 * 装備の札が読めること。
 *
 * ## 何が読めなかったか
 *
 * ### 装備変更(スロットの入れ替え)
 *
 * 枠(`.equip-card`)の**外**に、差分の文字列と画面幅いっぱいの金色の
 * 強化ボタンを積んでいた。実機ではこうなっていた:
 *
 *   - 差分は「攻撃力+ 36 → 37 (+1)」を色付きの小文字で並べただけなので、
 *     折り返しの途中から次の項目が始まる。**5行の色の帯**になって、
 *     どれが1項目なのか目で切れない
 *   - 強化ボタンが札より目立つ。ここは装備を**選ぶ**画面で、
 *     強化はついでにできる操作でしかない
 *   - 枠の外に2つ積むので、**どこまでが1つの装備か**分からない
 *
 * ### 一覧
 *
 * サブは `formatStatValue` が返す「攻撃力%3.8%」の1文字列だった。
 * どこまでが名前でどこからが数値か目で切れない。
 *
 * 型もテストもCSSの重なりは見ないので、ここで見張れるのは
 * 「組み立てがその形になっているか」まで。実物は必ず目で見る。
 */

const view = readFileSync(new URL("../src/web/views/equipment.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/web/ui/equipmentList.css", import.meta.url), "utf8");

describe("装備の札", () => {
  it("サブは名前と数値を分けて出す", () => {
    expect(view).toContain("equip-card__sub-label");
    expect(view).toContain("equip-card__sub-value");
    // 名前と数値をつなげて返す関数を、札の中で使わない
    expect(view).not.toMatch(/equip-card__sub-line" \}, \[formatStatValue/);
  });

  it("サブの数値は右端で揃える", () => {
    // 列が縦に揃わないと、札をまたいで大小を見比べられない
    expect(css).toMatch(/\.equip-card__sub-value \{[^}]*margin-left: auto;/);
    expect(css).toMatch(/\.equip-card__sub-value \{[^}]*font-variant-numeric: tabular-nums;/);
  });

  it("装備変更では、札・差分・強化を1つの枠に収める", () => {
    expect(view).toContain("equip-picker-card--framed");
    expect(view).toContain('className: "equip-picker-card__foot"');
    // 等級の色は data-star で決まる。枠を移した先にも同じ印を持たせる
    expect(view).toMatch(/equip-picker-card--framed[\s\S]{0,240}"data-star": String\(eq\.star\)/);
    expect(css).toMatch(/\.equip-picker-card--framed \{[^}]*border: 1px solid/);
    // 中の札は枠を持たない(二重の縁にしない)
    expect(css).toMatch(/\.equip-picker-card--framed > \.equip-card \{[^}]*border: 0;/);
  });

  it("差分は1項目1行の表で、差は必ず右端", () => {
    expect(view).toContain("equip-cmp__label");
    expect(view).toContain("equip-cmp__move");
    expect(view).toContain("equip-cmp__delta");
    expect(css).toMatch(/\.equip-cmp__row \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto auto;/);
    expect(css).toMatch(/\.equip-cmp__delta \{[^}]*text-align: right;/);
    // 増減は色でも分ける。数字の符号だけだと見落とす
    expect(css).toContain(".is-up .equip-cmp__delta");
    expect(css).toContain(".is-down .equip-cmp__delta");
  });

  it("強化は右下の小さな札。札本体より目立たせない", () => {
    /*
     * ここは装備を**選ぶ**画面。強化はついでにできる操作でしかない。
     * 画面幅いっぱいの金色のボタンだと、選ぶ相手より強く見える。
     */
    expect(css).toMatch(/\.equip-picker-card__foot \{[^}]*justify-content: flex-end;/);
    expect(css).toMatch(/\.equip-picker-card__enhance \{[^}]*display: inline-flex;/);
    expect(css).not.toMatch(/\.equip-picker-card__enhance \{[^}]*width: 100%;/);
  });

  it("押す的は36pxを下回らせない", () => {
    // 小さくするのは見た目だけ。指で押せる大きさは守る(巡回が拾う下限)
    expect(css).toMatch(/\.equip-picker-card__enhance \{[^}]*min-height: 36px;/);
  });

  it("強化は札本体と別の要素のまま(誤って装着させない)", () => {
    /*
     * 札本体を押す操作は「装着」。強化を札の中に入れると入れ子のボタンになり、
     * 押した先が装着へ流れる。兄弟に分けたうえで、伝播も止める。
     */
    expect(view).toContain("event.stopPropagation();");
    expect(view).toMatch(/equip-picker-card__enhance[\s\S]{0,600}event\.stopPropagation\(\);/);
  });

  it("強化の札は、何段へ上がるかを字で言う", () => {
    // 「+1」だけだと、札の右上に出ている現在の強化段階「+0」と紛れる
    expect(view).toContain("`強化+${eq.level + 1}`");
  });
});
