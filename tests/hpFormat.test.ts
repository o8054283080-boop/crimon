import { describe, expect, it } from "vitest";
import { formatHp, formatHpPair } from "../src/core/stats.js";

/**
 * 戦闘の札に出すHP。
 *
 * **4桁までしか想定していなかった。**★6Lv60に装備を積むとHPは5桁に届き、
 * 札の幅に「現在/最大」が収まらず左右が切れて、
 * `16317/23440` が `6317/2344` に化けていた。
 * 現在値が最大値より大きい、という有り得ない表示になっていた。
 */
describe("HPの表示", () => {
  it("4桁まではそのまま出す", () => {
    expect(formatHp(0)).toBe("0");
    expect(formatHp(1)).toBe("1");
    expect(formatHp(9999)).toBe("9999");
  });

  it("**5桁以上でも文字数が増えない**", () => {
    // ここが本題。桁が増えるたびに札からはみ出していた
    for (const value of [10_000, 17_866, 99_999, 178_668, 999_999]) {
      expect(formatHp(value).length, `${value} → ${formatHp(value)}`).toBeLessThanOrEqual(5);
    }
  });

  it("100万を超えても札に収まる", () => {
    expect(formatHp(1_234_567).length).toBeLessThanOrEqual(5);
    expect(formatHp(12_345_678).length).toBeLessThanOrEqual(6);
  });

  it("実測で出た値が正しく丸まる", () => {
    expect(formatHp(17_866)).toBe("1.8万");
    expect(formatHp(178_668)).toBe("17.9万");
  });

  it("負の値やNaNでも壊れない", () => {
    expect(formatHp(-500)).toBe("0");
    expect(formatHp(-0.4)).toBe("0");
  });

  it("**現在値が最大値を超えて見えることは無い**", () => {
    // 化けていた時の症状そのもの。同じ規則で丸めていれば起こらない
    for (const [cur, max] of [[16_317, 23_440], [7523, 178_668], [336, 17_205], [9999, 10_000]]) {
      const [left, right] = formatHpPair(cur, max).split("/");
      const num = (t: string) => (t.endsWith("万") ? Number(t.slice(0, -1)) * 10_000 : Number(t));
      expect(num(left), `${cur}/${max}`).toBeLessThanOrEqual(num(right));
    }
  });

  it("満タンなら左右が同じ表示になる", () => {
    expect(formatHpPair(178_668, 178_668)).toBe("17.9万/17.9万");
  });
});
