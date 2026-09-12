import { describe, expect, it } from "vitest";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { EXP_PIG_DEX, SKILL_PIG_DEX } from "../src/data/monsters.js";
import { applyRankUp, checkRankUp } from "../src/game/progression.js";

describe("ランクアップ判定 (checkRankUp)", () => {
  it("最大レベルでない対象はランクアップできない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 10);
    const sac = createMonsterInstance("wolf_WATER", 1, 1);
    const result = checkRankUp(target, [sac], []);
    expect(result.ok).toBe(false);
  });

  it("星1→2は素材1体で成立する", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 15);
    const sac = createMonsterInstance("wolf_WATER", 1, 1);
    const result = checkRankUp(target, [sac], []);
    expect(result.ok).toBe(true);
    expect(result.requiredCount).toBe(1);
  });

  it("星2→3は素材2体必要(1体では不足)", () => {
    const target = createMonsterInstance("slime_FIRE", 2, 20);
    const sac = createMonsterInstance("wolf_WATER", 2, 1);
    const result = checkRankUp(target, [sac], []);
    expect(result.ok).toBe(false);
    expect(result.requiredCount).toBe(2);
  });

  it("星2→3は同じ星の素材2体で成立する", () => {
    const target = createMonsterInstance("slime_FIRE", 2, 20);
    const sac1 = createMonsterInstance("wolf_WATER", 2, 1);
    const sac2 = createMonsterInstance("golem_ELECTRIC", 2, 5);
    const result = checkRankUp(target, [sac1, sac2], []);
    expect(result.ok).toBe(true);
  });

  it("星が異なる素材は使えない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 15);
    const sac = createMonsterInstance("wolf_WATER", 2, 1);
    const result = checkRankUp(target, [sac], []);
    expect(result.ok).toBe(false);
  });

  it("対象自身を素材にはできない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 15);
    const result = checkRankUp(target, [target], []);
    expect(result.ok).toBe(false);
  });

  it("パーティ編成中のモンスターは素材にできない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 15);
    const sac = createMonsterInstance("wolf_WATER", 1, 1);
    const result = checkRankUp(target, [sac], [sac.id]);
    expect(result.ok).toBe(false);
  });

  it("星5→6は素材5体で成立する(星6が上限)", () => {
    const target = createMonsterInstance("slime_FIRE", 5, 50);
    const sacrifices = Array.from({ length: 5 }, () => createMonsterInstance("wolf_WATER", 5, 1));
    const result = checkRankUp(target, sacrifices, []);
    expect(result.ok).toBe(true);
    expect(result.requiredCount).toBe(5);
  });

  it("星6は最大レベルでもランクアップできない(素材0体でも失敗)", () => {
    const target = createMonsterInstance("slime_FIRE", 6, 60);
    const result = checkRankUp(target, [], []);
    expect(result.ok).toBe(false);
  });

  it("経験ピッグは素材にできない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 15);
    const sac = createMonsterInstance(EXP_PIG_DEX[0].id, 1, 1);
    const result = checkRankUp(target, [sac], []);
    expect(result.ok).toBe(false);
  });
});

describe("ランクアップの適用 (applyRankUp)", () => {
  it("星が1つ上がり、レベルと経験値がリセットされる", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 15);
    target.exp = 999;
    const sac = createMonsterInstance("wolf_WATER", 1, 1);
    applyRankUp(target, [sac]);
    expect(target.star).toBe(2);
    expect(target.level).toBe(1);
    expect(target.exp).toBe(0);
  });

  it("同じ種族(属性違い)の素材1体につき1回スキルレベルアップを試行する", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 15);
    const sacrifices = [createMonsterInstance("slime_WATER", 1, 1)];

    const result = applyRankUp(target, sacrifices, () => 0);

    expect(result.leveledSkillIndices).toHaveLength(1);
  });

  it("★5スキルピッグを★5→★6ランクアップ素材に使うとスキルレベルが1上がる", () => {
    const target = createMonsterInstance("slime_FIRE", 5, 50);
    const skillPig = createMonsterInstance(SKILL_PIG_DEX[0].id, 5, 1);
    const others = Array.from({ length: 4 }, () => createMonsterInstance("wolf_WATER", 5, 1));
    const sacrifices = [skillPig, ...others];

    expect(checkRankUp(target, sacrifices, []).ok).toBe(true);
    const before = target.skillLevels.reduce((sum, level) => sum + level, 0);
    const result = applyRankUp(target, sacrifices, () => 0);

    expect(target.star).toBe(6);
    expect(result.leveledSkillIndices).toHaveLength(1);
    expect(target.skillLevels.reduce((sum, level) => sum + level, 0)).toBe(before + 1);
  });

  it("スキルピッグと同種族素材が混在した場合、それぞれ1回ずつスキルレベルアップを試行する", () => {
    const target = createMonsterInstance("slime_FIRE", 5, 50);
    const sacrifices = [
      createMonsterInstance(SKILL_PIG_DEX[0].id, 5, 1),
      createMonsterInstance("slime_WATER", 5, 1),
      createMonsterInstance("wolf_WATER", 5, 1),
      createMonsterInstance("golem_FIRE", 5, 1),
      createMonsterInstance("fairy_GRASS", 5, 1),
    ];

    const result = applyRankUp(target, sacrifices, () => 0);

    expect(result.leveledSkillIndices).toHaveLength(2);
  });

  it("異なる種族の素材ではスキルレベルは上がらない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 15);
    const sacrifices = [createMonsterInstance("wolf_WATER", 1, 1)];

    const result = applyRankUp(target, sacrifices, () => 0);

    expect(result.leveledSkillIndices).toHaveLength(0);
  });
});
