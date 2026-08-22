import { describe, expect, it } from "vitest";
import { formatStatValue, STAT_TYPES, StatRoll } from "../src/core/equipment.js";

/**
 * 表示の整形は画面ごとに書くと必ずずれる。実際に、ショップだけ生の値を出していて
 * 「クリ率% +0.106」「速度+ +19」と表示され、桁が1/100に見え、記号も重なっていた。
 */
describe("ステータス表示の整形", () => {
  it("割合の項目は100倍して%を付ける(0.106 なら 10.6%)", () => {
    const roll: StatRoll = { type: "CRIT_RATE", value: 0.106 };
    expect(formatStatValue(roll)).toContain("10.6%");
    expect(formatStatValue(roll)).not.toContain("0.106");
  });

  it("HP%も同じ(0.216 なら 21.6%)", () => {
    expect(formatStatValue({ type: "HP_PERCENT", value: 0.216 })).toContain("21.6%");
  });

  it("実数の項目はそのまま出し、%を付けない", () => {
    const text = formatStatValue({ type: "SPD", value: 19 });
    expect(text).toContain("19");
    expect(text).not.toContain("%");
  });

  it("記号が重ならない(「速度+ +19」のようにならない)", () => {
    expect(formatStatValue({ type: "SPD", value: 19 })).not.toContain("+ +");
    expect(formatStatValue({ type: "ATK_FLAT", value: 51 })).not.toContain("+ +");
  });

  it("割合の項目はすべて%表記になる(生の小数が出ない)", () => {
    // 実数の項目(攻撃力+など)は整数しか入らないので、ここでは割合だけを見る
    const percentTypes = STAT_TYPES.filter(
      (t) => t !== "ATK_FLAT" && t !== "DEF_FLAT" && t !== "HP_FLAT" && t !== "SPD",
    );
    expect(percentTypes.length).toBeGreaterThan(0);
    for (const type of percentTypes) {
      const text = formatStatValue({ type, value: 0.123 });
      expect(text).not.toContain("0.123");
      expect(text).toContain("%");
    }
  });
});
