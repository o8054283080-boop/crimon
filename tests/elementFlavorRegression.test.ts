/**
 * 属性補正を4パターンへ増やしても、**既存モンスターの能力値が1も動かないこと。**
 *
 * ## なぜこのテストが要るのか
 *
 * 型を選ぶ `elementFlavorIndexOf` は**個数で剰余を取る**。
 * 2つから4つへ増やした瞬間に、全モンスターの引く型が総入れ替えになる——
 * 引いて育てた個体の性能が、更新しただけで変わる。
 *
 * そこで自動選択の範囲は先頭2つに固定し、2番・3番は
 * `elementFlavorAssignment` で明示指定した新モンスターだけが使う。
 * ここはその約束が守られているかを、**実際の能力値で**突き合わせる。
 *
 * 期待値は**4パターンへ増やす前のmain(`bc40268`)で実測した値**。
 * 手で書き写すと写し間違いが混ざるので、`git show` から機械的に作った。
 */
import { describe, expect, it } from "vitest";
import { ELEMENTS } from "../src/core/element.js";
import { ALL_MONSTER_TEMPLATES } from "../src/data/monsters.js";
import { createMonsterVariant, elementStatFlavorOf } from "../src/core/monster.js";
import { readFileSync } from "node:fs";

const BASELINE_PATH = new URL("./fixtures/elementFlavorBaseline.json", import.meta.url);

describe("属性補正の拡張", () => {
  it("6属性とも4つの型を持つ", () => {
    for (const element of ELEMENTS) {
      // note だけを見る。apply の中身は下の実測で突き合わせる
      const notes = [0, 1, 2, 3].map((i) => elementStatFlavorOf("dummy", element, { [element]: i }).note);
      expect(new Set(notes).size, `${element} の型が重複している`).toBe(4);
    }
  });

  it("番号を指定しなければ、先頭2つからしか選ばない", () => {
    for (const element of ELEMENTS) {
      const first = elementStatFlavorOf("dummy", element, { [element]: 0 }).note;
      const second = elementStatFlavorOf("dummy", element, { [element]: 1 }).note;
      for (const template of ALL_MONSTER_TEMPLATES) {
        const auto = elementStatFlavorOf(template.templateId, element).note;
        expect([first, second], `${template.templateId}/${element} が3番目以降を引いた`).toContain(auto);
      }
    }
  });

  it("範囲外の番号を書いても落ちず、自動選択へ落ちる", () => {
    const auto = elementStatFlavorOf("slime", "FIRE").note;
    for (const bad of [-1, 4, 99, 1.5, NaN]) {
      expect(elementStatFlavorOf("slime", "FIRE", { FIRE: bad }).note).toBe(auto);
    }
  });

  /*
   * **本丸。**既存の全モンスター×全属性の能力値を、拡張前の実測と突き合わせる。
   * 1つでも違えば、引いて育てた個体の性能が変わったということ。
   */
  it("既存モンスターの能力値が拡張前と完全に一致する", () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Record<string, Record<string, number>>;
    const seen = new Set<string>();
    for (const template of ALL_MONSTER_TEMPLATES) {
      for (const element of ELEMENTS) {
        const variant = createMonsterVariant(template, element);
        const expected = baseline[variant.id];
        if (!expected) continue; // 今回足した新モンスターは対象外
        seen.add(variant.id);
        expect(variant.stats, `${variant.id} の能力値が変わった`).toEqual(expected);
      }
    }
    // 控えの全件を実際に突き合わせたか(取りこぼしがあると素通りする)
    expect(seen.size).toBe(Object.keys(baseline).length);
  });
});
