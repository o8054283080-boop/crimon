import { describe, expect, it } from "vitest";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";

const rarity = (templateId: string) => ["griffon", "seraph"].includes(templateId) ? 4 : ["dragon", "nemesis"].includes(templateId) ? 5 : 3;

describe("⑧-2 クリティカル最終平準化", () => {
  it("全プレイヤー72体が属性補正後もCR15～23%、CD150～170%に入る", () => {
    expect(ALL_DISPLAYABLE_MONSTERS_DEX).toHaveLength(72);
    for (const monster of ALL_DISPLAYABLE_MONSTERS_DEX) {
      expect(monster.stats.criRate, monster.id).toBeGreaterThanOrEqual(.15);
      expect(monster.stats.criRate, monster.id).toBeLessThanOrEqual(.23);
      expect(monster.stats.criDmg, monster.id).toBeGreaterThanOrEqual(1.5);
      expect(monster.stats.criDmg, monster.id).toBeLessThanOrEqual(1.7);
    }
  });

  it("レアリティ平均差はCR 5pt未満・CD 10pt未満", () => {
    const averages = [3, 4, 5].map((star) => {
      const group = ALL_DISPLAYABLE_MONSTERS_DEX.filter((monster) => rarity(monster.templateId) === star);
      return ["criRate", "criDmg"].map((stat) => group.reduce((sum, monster) => sum + monster.stats[stat as "criRate" | "criDmg"], 0) / group.length);
    });
    for (const index of [0, 1]) {
      const values = averages.map((entry) => entry[index]);
      expect(Math.max(...values) - Math.min(...values)).toBeLessThan(index === 0 ? .05 : .1);
    }
  });
});
