import { describe, expect, it } from "vitest";
import { summonMany } from "../src/game/gacha.js";
import { GACHA_STAR3_TEMPLATES, GACHA_STAR4_TEMPLATES, GACHA_STAR5_TEMPLATES, findMonsterById } from "../src/data/monsters.js";

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

  it("レア(光/闇)排出率はおおよそ設定重み(3+1.35+0.65)/(75+5)=6.25%に近い", () => {
    const rng = mulberry32(42);
    const results = summonMany(5000, rng);
    const rareCount = results.filter((r) => r.isRare).length;
    const rate = rareCount / results.length;
    expect(rate).toBeGreaterThan(0.0625 - 0.015);
    expect(rate).toBeLessThan(0.0625 + 0.015);
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

  it("星ごとの抽選プールから出る(属性のレア度とは独立)", () => {
    /*
     * **星の抽選比率(GACHA_TABLE)と、その星の顔ぶれ(プール)は別のもの。**
     * モンスターを足すとプールだけが増える。ここではプールの中身を
     * `GACHA_STAR*_TEMPLATES` から引いて見るので、追加のたびに書き換えなくてよい。
     */
    const rng = mulberry32(11);
    const results = summonMany(4000, rng);
    const idsOf = (pool: { templateId: string }[]) => new Set(pool.map((t) => t.templateId));
    const star3 = idsOf(GACHA_STAR3_TEMPLATES);
    const star4 = idsOf(GACHA_STAR4_TEMPLATES);
    const star5 = idsOf(GACHA_STAR5_TEMPLATES);
    for (const r of results) {
      const templateId = findMonsterById(r.dexId)!.templateId;
      const pool = r.star === 3 ? star3 : r.star === 4 ? star4 : star5;
      expect(pool.has(templateId), `${r.star}★ の ${templateId}`).toBe(true);
    }
    // 通常枠(火水電草)でもセラフ/ネメシスが、レア枠(光闇)でもグリフォン/ドラゴンが出ることを確認する
    expect(results.some((r) => !r.isRare && r.dexId.startsWith("seraph_"))).toBe(true);
    expect(results.some((r) => !r.isRare && r.dexId.startsWith("nemesis_"))).toBe(true);
    expect(results.some((r) => r.isRare && r.dexId.startsWith("griffon_"))).toBe(true);
    expect(results.some((r) => r.isRare && r.dexId.startsWith("dragon_"))).toBe(true);
  });

  it("10連では星4以上が1体も出なければ天井で1体確定する", () => {
    // 常に星3しか引かないrngでも、10連なら天井で星4以上が1体保証される
    const alwaysLowRng = () => 0.5;
    const results = summonMany(10, alwaysLowRng);
    expect(results.some((r) => r.star >= 4)).toBe(true);
  });

  it("天井はレア枠(光闇)を保証しない。光闇の価値を保つため、保証するのは星の高さだけ", () => {
    // 星3しか出ないrngで何度引いても、天井で差し替わるのは星であって属性ではない。
    // レア枠が必ず付いてくるのであれば、この呼び出しは毎回レアを含むはずである
    const alwaysLowRng = () => 0.5;
    let rareRuns = 0;
    for (let i = 0; i < 20; i++) {
      if (summonMany(10, alwaysLowRng).some((r) => r.isRare)) rareRuns += 1;
    }
    expect(rareRuns).toBeLessThan(20);
  });

  it("10回未満(天井の対象外)には天井が適用されない", () => {
    const alwaysLowRng = () => 0.5;
    const results = summonMany(5, alwaysLowRng);
    expect(results.some((r) => r.star >= 4)).toBe(false);
  });
});
