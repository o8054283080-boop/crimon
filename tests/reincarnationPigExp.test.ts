import { describe, expect, it } from "vitest";
import { addExp, createMonsterInstance, requiredExpForMonsterLevel } from "../src/core/monsterInstance.js";
import { STAR_MAX_LEVEL, requiredExpForStarLevel } from "../src/core/rarity.js";

describe("転生ピッグの育成特性", () => {
  it("レベルアップに必要な経験値が通常の3分の1になる", () => {
    const normal = createMonsterInstance("slime_FIRE", 3, 1);
    const pig = createMonsterInstance("reincarnation_pig_FIRE", 3, 1);
    const normalRequired = requiredExpForStarLevel(3, 1);
    const pigRequired = Math.ceil(normalRequired / 3);

    expect(requiredExpForMonsterLevel(normal)).toBe(normalRequired);
    expect(requiredExpForMonsterLevel(pig)).toBe(pigRequired);
    expect(addExp(pig, pigRequired - 1, STAR_MAX_LEVEL[3])).toBe(0);
    expect(pig.level).toBe(1);
    expect(addExp(pig, 1, STAR_MAX_LEVEL[3])).toBe(1);
    expect(pig.level).toBe(2);
    expect(addExp(normal, pigRequired, STAR_MAX_LEVEL[3])).toBe(0);
    expect(normal.level).toBe(1);
  });
});
