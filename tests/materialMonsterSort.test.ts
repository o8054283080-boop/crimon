import { describe, expect, it } from "vitest";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { sortMaterialMonsters } from "../src/game/materialMonsterSort.js";

describe("素材モンスター優先ソート", () => {
  const normalA = createMonsterInstance("slime_FIRE", 3, 1);
  const reincarnationA = createMonsterInstance("reincarnation_pig_FIRE", 3, 1);
  const expA = createMonsterInstance("exp_pig_WATER", 3, 1);
  const normalB = createMonsterInstance("wolf_DARK", 3, 1);
  const expB = createMonsterInstance("exp_pig_LIGHT", 3, 1);
  const reincarnationB = createMonsterInstance("reincarnation_pig_GRASS", 3, 1);
  const mixed = [normalA, reincarnationA, expA, normalB, expB, reincarnationB];

  it("経験ピッグだけを先頭へ移し、両グループ内の元順序を維持する", () => {
    expect(sortMaterialMonsters(mixed, "EXP_PIG_FIRST")).toEqual([
      expA,
      expB,
      normalA,
      reincarnationA,
      normalB,
      reincarnationB,
    ]);
  });

  it("転生ピッグだけを先頭へ移し、両グループ内の元順序を維持する", () => {
    expect(sortMaterialMonsters(mixed, "REINCARNATION_PIG_FIRST")).toEqual([
      reincarnationA,
      reincarnationB,
      normalA,
      expA,
      normalB,
      expB,
    ]);
  });

  it("通常順では元配列を変更せず同じ順序のコピーを返す", () => {
    const sorted = sortMaterialMonsters(mixed, "DEFAULT");
    expect(sorted).toEqual(mixed);
    expect(sorted).not.toBe(mixed);
    expect(mixed).toEqual([normalA, reincarnationA, expA, normalB, expB, reincarnationB]);
  });
});
