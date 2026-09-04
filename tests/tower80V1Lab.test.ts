import { describe, expect, it } from "vitest";
import { TOWER80_ENEMIES_V1, TOWER80_FOCUS } from "../tools/battleLab/scenarios/tower80v1.js";
import { TOWER80_ENEMIES_V2 } from "../tools/battleLab/scenarios/tower80v2.js";

/*
 * 試練の塔80階の**仮**盤面(第1回)。
 *
 * ## 計測はここに置かない
 *
 * 元は「TYPICAL 1000戦×5攻略順」という `it` があり、12秒をCIが毎回払っていた。
 * 確かめていたのは `expect(rows).toHaveLength(5)` だけで、数字は
 * `console.log` へ流すだけ。**測定はテストではない。**
 *
 * ## V1を残す理由
 *
 * V2との**差分を測るための基準**として残してある。
 * V1の実測値(勝率1.2〜15.8%)は `tools/battleLab/tower80/measure.ts` の
 * 比較表に控えてあり、V2の結果と並べて出る。
 * ここでは「V1→V2で何を変えたのか」が数字として残っていることだけを見張る。
 */

describe("80階V1: V2との差分の基準として固定する", () => {
  it("V1のお供はATKが高くSPDが速い(ここがV2との唯一の違い)", () => {
    expect(TOWER80_ENEMIES_V1.map((enemy) => [enemy.label, enemy.stats?.atk, enemy.stats?.spd])).toEqual([
      ["古代聖竜", 9_500, 185],
      ["古代の護晶", 7_500, 180],
      ["古代の鼓舞晶", 6_900, 172],
      ["古代の破邪獣", 9_800, 190],
      ["古代の呪獣", 8_500, 165],
    ]);
  });

  it("V1→V2で下げたのはお供のATKとSPDだけ。ボスとHPは据え置き", () => {
    /*
     * **2つ同時に動かした**ので、どちらがどれだけ効いたのかは
     * V1↔V2の比較だけでは分からない。切り分けは
     * `measure.ts --ablate` で1軸ずつ振って測ってある
     */
    const v1 = TOWER80_ENEMIES_V1;
    const v2 = TOWER80_ENEMIES_V2;
    expect(v1).toHaveLength(v2.length);
    // ボスは1文字も変えていない
    expect(v1[0].stats).toEqual(v2[0].stats);
    for (let i = 1; i < v1.length; i += 1) {
      expect(v2[i].stats?.hp, `${v1[i].label} のHP`).toBe(v1[i].stats?.hp);
      expect(v2[i].stats?.def, `${v1[i].label} のDEF`).toBe(v1[i].stats?.def);
      expect(v2[i].stats?.atk!, `${v1[i].label} のATK`).toBeLessThan(v1[i].stats?.atk!);
      expect(v2[i].stats?.spd!, `${v1[i].label} のSPD`).toBe(v1[i].stats?.spd! - 10);
    }
  });

  it("攻略順の5パターンはV1・V2で同じ(線の差だけを比べるため)", () => {
    expect(TOWER80_FOCUS.map((focus) => focus.name)).toEqual([
      "破邪獣→護晶→ボス",
      "護晶→破邪獣→ボス",
      "鼓舞晶→護晶→破邪獣→ボス",
      "呪獣→護晶→破邪獣→ボス",
      "ボス集中",
    ]);
  });
});
