import { describe, expect, it } from "vitest";
import { ABILITY_POINT_VALUES } from "../src/core/monsterDevelopment.js";
import { RARITY_POOLS, TYPE_PROPOSAL, addAbilityPoints, buildReport, statsWithTypeProposal } from "../tools/statBalance.js";

describe("ステータスバランス再計算", () => {
  it("初期レアリティ3区分を空でない母集団として集計する", () => {
    expect(Object.values(RARITY_POOLS).every((pool) => pool.length > 0)).toBe(true);
    expect(buildReport()).toContain("初期★3 → ★6 Lv60");
    expect(buildReport()).toContain("理論装備");
  });

  it("能力ポイント候補を0/25/50/100ptで線形に再計算できる", () => {
    const base = { hp: 10000, atk: 1000, def: 1000, spd: 100 };
    for (const stat of ["hp", "atk", "def", "spd"] as const) {
      expect(addAbilityPoints(base, stat, 100)[stat] - base[stat]).toBe(Math.floor(100 * ABILITY_POINT_VALUES[stat]));
    }
  });

  it("タイプ候補は得意能力と引き換えに不得意能力を持つ", () => {
    const base = { hp: 1000, atk: 100, def: 100, spd: 100 };
    expect(statsWithTypeProposal(base, 3, 1, "ATTACK").atk).toBeGreaterThan(statsWithTypeProposal(base, 3, 1, "HP").atk);
    expect(statsWithTypeProposal(base, 3, 1, "ATTACK").hp).toBeLessThan(statsWithTypeProposal(base, 3, 1, "HP").hp);
    expect(Object.values(TYPE_PROPOSAL).every(({ base: b }) => Object.values(b).some((v) => v < 1))).toBe(true);
  });
});
