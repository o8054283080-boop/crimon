import { describe, expect, it } from "vitest";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import {
  type Star,
  STAR_EARLY_TOTAL_EXP,
  STAR_MAX_LEVEL,
  STAR_MAX_TOTAL_EXP,
  requiredExpForStarLevel,
} from "../src/core/rarity.js";
import { EXP_PIG_DEX } from "../src/data/monsters.js";
import { feedExpValue } from "../src/game/monsterPowerUp.js";

function totalExpToMax(star: Star): number {
  let total = 0;
  for (let level = 1; level < STAR_MAX_LEVEL[star]; level += 1) {
    total += requiredExpForStarLevel(star, level);
  }
  return total;
}

describe("星別モンスター経験値カーブ", () => {
  it("各ランクのLv1→最大Lv合計が設計値と完全一致する", () => {
    const expected: Record<Star, number> = {
      1: 40_000,
      2: 80_000,
      3: 220_000,
      4: 420_000,
      5: 700_000,
      6: 2_100_000,
    };

    for (const star of [1, 2, 3, 4, 5, 6] as const) {
      expect(STAR_MAX_TOTAL_EXP[star]).toBe(expected[star]);
      expect(totalExpToMax(star)).toBe(expected[star]);
    }
  });

  it("★6はLv1→50が90万、Lv50→60が120万になる", () => {
    let early = 0;
    for (let level = 1; level < 50; level += 1) early += requiredExpForStarLevel(6, level);
    let late = 0;
    for (let level = 50; level < 60; level += 1) late += requiredExpForStarLevel(6, level);

    expect(STAR_EARLY_TOTAL_EXP[6]).toBe(900_000);
    expect(early).toBe(900_000);
    expect(late).toBe(1_200_000);
    expect(early + late).toBe(2_100_000);
  });

  it("各ランクの前半カーブはレベルが上がるほど必要EXPが増える", () => {
    for (const star of [1, 2, 3, 4, 5, 6] as const) {
      const earlyMax = star === 6 ? 50 : STAR_MAX_LEVEL[star];
      let previous = 0;
      for (let level = 1; level < earlyMax; level += 1) {
        const current = requiredExpForStarLevel(star, level);
        expect(current).toBeGreaterThan(previous);
        previous = current;
      }
    }
  });
});

describe("経験ピッグの固定強化EXP", () => {
  const expected: Record<3 | 4 | 5 | 6, number> = {
    3: 40_000,
    4: 80_000,
    5: 140_000,
    6: 300_000,
  };

  for (const star of [3, 4, 5, 6] as const) {
    it(`★${star}は通常${expected[star].toLocaleString()}、色一致は1.5倍`, () => {
      const material = createMonsterInstance(EXP_PIG_DEX[0].id, star, STAR_MAX_LEVEL[star]);
      const differentElementTarget = createMonsterInstance(EXP_PIG_DEX[1].id, star, 1);
      const sameElementTarget = createMonsterInstance(EXP_PIG_DEX[0].id, star, 1);

      expect(feedExpValue(differentElementTarget, material)).toBe(expected[star]);
      expect(feedExpValue(sameElementTarget, material)).toBe(expected[star] * 1.5);
    });
  }
});
