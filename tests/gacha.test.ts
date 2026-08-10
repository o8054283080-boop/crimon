import { describe, expect, it } from "vitest";
import { RARE_RATE, summonMany } from "../src/game/gacha.js";
import { findMonsterById } from "../src/data/monsters.js";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("ガチャ (summonMany)", () => {
  it("排出されたdexIdはすべて図鑑に存在する", () => {
    const rng = mulberry32(1);
    const results = summonMany(50, rng);
    for (const r of results) {
      expect(findMonsterById(r.dexId)).toBeDefined();
    }
  });

  it("レア(光/闇)排出率はおおよそ設定値に近い", () => {
    const rng = mulberry32(42);
    const results = summonMany(5000, rng);
    const rareCount = results.filter((r) => r.isRare).length;
    const rate = rareCount / results.length;
    expect(rate).toBeGreaterThan(RARE_RATE - 0.03);
    expect(rate).toBeLessThan(RARE_RATE + 0.03);
  });

  it("レア枠は光・闇属性のみ、通常枠は光・闇を含まない", () => {
    const rng = mulberry32(7);
    const results = summonMany(500, rng);
    for (const r of results) {
      const dex = findMonsterById(r.dexId);
      const isRareElement = dex?.element === "LIGHT" || dex?.element === "DARK";
      expect(isRareElement).toBe(r.isRare);
    }
  });

  it("10連ではレアが1体も出なければ天井で1体確定する", () => {
    // 常にレアを引かない(0.99)ような乱数でも、10連なら天井でレアが1体保証される
    const alwaysNormalRng = () => 0.99;
    const results = summonMany(10, alwaysNormalRng);
    expect(results.some((r) => r.isRare)).toBe(true);
  });

  it("単発(1回)には天井が適用されない", () => {
    const alwaysNormalRng = () => 0.99;
    const results = summonMany(1, alwaysNormalRng);
    expect(results.some((r) => r.isRare)).toBe(false);
  });
});
