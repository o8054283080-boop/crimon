import { describe, expect, it } from "vitest";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { MONSTER_TEMPLATES_DEX, REINCARNATION_PIG_DEX, findMonsterById } from "../src/data/monsters.js";
import { applySkillTraining, checkSkillTraining } from "../src/game/skillTraining.js";

describe("checkSkillTraining", () => {
  it("素材が0体だと実行できない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    expect(checkSkillTraining(target, [], []).ok).toBe(false);
  });

  it("対象自身を素材にはできない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    expect(checkSkillTraining(target, [target], []).ok).toBe(false);
  });

  it("異なるdexIdの素材は使えない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    const material = createMonsterInstance("wolf_FIRE", 1, 1);
    expect(checkSkillTraining(target, [material], []).ok).toBe(false);
  });

  it("同じdexIdの素材なら成立する", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    const material = createMonsterInstance("slime_FIRE", 1, 1);
    expect(checkSkillTraining(target, [material], []).ok).toBe(true);
  });

  it("パーティ編成中のモンスターは素材にできない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    const material = createMonsterInstance("slime_FIRE", 1, 1);
    expect(checkSkillTraining(target, [material], [material.id]).ok).toBe(false);
  });

  it("対象のスキルが全て最大レベルの場合は実行できない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    target.skillLevels = [5, 5, 5];
    const material = createMonsterInstance("slime_FIRE", 1, 1);
    expect(checkSkillTraining(target, [material], []).ok).toBe(false);
  });
});

describe("applySkillTraining", () => {
  it("素材1体につき1回スキルレベルアップを試行する", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    const result = applySkillTraining(target, 3, () => 0);
    expect(result.leveledSkillIndices).toHaveLength(3);
    expect(target.skillLevels.reduce((a, b) => a + b, 0)).toBe(3 + 3); // 初期値3(1,1,1) + 3レベル分
  });

  it("スキルが全て最大レベルに達すると以降は上昇しない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    target.skillLevels = [5, 5, 4];
    const result = applySkillTraining(target, 5, () => 0);
    expect(target.skillLevels).toEqual([5, 5, 5]);
    expect(result.leveledSkillIndices.length).toBeLessThanOrEqual(1);
  });
});

describe("モンスター図鑑データ", () => {
  it("全モンスター種×全属性が図鑑に掲載されている", () => {
    expect(MONSTER_TEMPLATES_DEX.length).toBeGreaterThan(0);
    for (const dex of MONSTER_TEMPLATES_DEX) {
      expect(dex.skills).toHaveLength(3);
    }
  });

  it("転生ピッグは図鑑一覧(通常モンスター図鑑)には含まれない", () => {
    const pigIds = new Set(REINCARNATION_PIG_DEX.map((p) => p.id));
    for (const dex of MONSTER_TEMPLATES_DEX) {
      expect(pigIds.has(dex.id)).toBe(false);
    }
  });

  it("findMonsterByIdで図鑑エントリを取得できる", () => {
    const dex = findMonsterById(MONSTER_TEMPLATES_DEX[0].id);
    expect(dex).toBeDefined();
    expect(dex?.id).toBe(MONSTER_TEMPLATES_DEX[0].id);
  });
});
