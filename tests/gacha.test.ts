import { describe, expect, it } from "vitest";
import { summonMany } from "../src/game/gacha.js";
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

  it("星3未満は排出されない", () => {
    const rng = mulberry32(2);
    const results = summonMany(500, rng);
    for (const r of results) {
      expect(r.star).toBeGreaterThanOrEqual(3);
    }
  });

  it("レア(光/闇)排出率はおおよそ設定値(12+7+3=22%)に近い", () => {
    const rng = mulberry32(42);
    const results = summonMany(5000, rng);
    const rareCount = results.filter((r) => r.isRare).length;
    const rate = rareCount / results.length;
    expect(rate).toBeGreaterThan(0.22 - 0.03);
    expect(rate).toBeLessThan(0.22 + 0.03);
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

  it("通常枠の星4はグリフォン、星5はドラゴンが排出される", () => {
    const rng = mulberry32(11);
    const results = summonMany(2000, rng);
    for (const r of results) {
      if (r.isRare) continue;
      if (r.star === 4) expect(r.dexId.startsWith("griffon_")).toBe(true);
      if (r.star === 5) expect(r.dexId.startsWith("dragon_")).toBe(true);
    }
    expect(results.some((r) => !r.isRare && r.star === 4)).toBe(true);
    expect(results.some((r) => !r.isRare && r.star === 5)).toBe(true);
  });

  it("レア枠の星4はセラフ、星5はネメシスが排出される", () => {
    const rng = mulberry32(13);
    const results = summonMany(3000, rng);
    for (const r of results) {
      if (!r.isRare) continue;
      if (r.star === 4) expect(r.dexId.startsWith("seraph_")).toBe(true);
      if (r.star === 5) expect(r.dexId.startsWith("nemesis_")).toBe(true);
    }
    expect(results.some((r) => r.isRare && r.star === 4)).toBe(true);
    expect(results.some((r) => r.isRare && r.star === 5)).toBe(true);
  });

  it("10連ではレアが1体も出なければ天井で1体確定する", () => {
    // 常に通常枠(星3)しか引かないrngでも、10連なら天井でレアが1体保証される
    const alwaysCommonRng = () => 0.5;
    const results = summonMany(10, alwaysCommonRng);
    expect(results.some((r) => r.isRare)).toBe(true);
  });

  it("10回未満(天井の対象外)には天井が適用されない", () => {
    const alwaysCommonRng = () => 0.5;
    const results = summonMany(5, alwaysCommonRng);
    expect(results.some((r) => r.isRare)).toBe(false);
  });
});
