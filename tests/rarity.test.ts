import { describe, expect, it } from "vitest";
import { STAR_MAX_LEVEL, canRankUp, computeEffectiveStats, requiredExpForLevel, starMultiplier } from "../src/core/rarity.js";

const BASE_STATS = { hp: 1000, atk: 100, def: 50, spd: 100, criRate: 0.1, criDmg: 1.5, resistance: 0.1, accuracy: 0.1 };

describe("星ランクによるステータス倍率", () => {
  it("星1の倍率は1倍", () => {
    expect(starMultiplier(1)).toBeCloseTo(1.0);
  });

  it("星が上がるごとに1.2倍ずつ複利で上昇する", () => {
    expect(starMultiplier(2)).toBeCloseTo(1.2);
    expect(starMultiplier(3)).toBeCloseTo(1.44);
    expect(starMultiplier(4)).toBeCloseTo(1.728);
    expect(starMultiplier(5)).toBeCloseTo(2.0736);
  });
});

describe("最大レベル", () => {
  it("星1から星5まで段階的に最大レベルが上がる", () => {
    expect(STAR_MAX_LEVEL[1]).toBe(15);
    expect(STAR_MAX_LEVEL[2]).toBe(20);
    expect(STAR_MAX_LEVEL[3]).toBe(30);
    expect(STAR_MAX_LEVEL[4]).toBe(40);
    expect(STAR_MAX_LEVEL[5]).toBe(50);
  });
});

describe("実効ステータス計算", () => {
  it("星1レベル1は基礎ステータスと同じ", () => {
    const stats = computeEffectiveStats(BASE_STATS, 1, 1);
    expect(stats.hp).toBe(1000);
    expect(stats.atk).toBe(100);
  });

  it("同じ星ならレベルが上がるほどステータスも上がる", () => {
    const low = computeEffectiveStats(BASE_STATS, 1, 1);
    const high = computeEffectiveStats(BASE_STATS, 1, 15);
    expect(high.hp).toBeGreaterThan(low.hp);
    expect(high.atk).toBeGreaterThan(low.atk);
  });

  it("同じレベルなら星が上がるほどステータスも上がる(ランクアップ直後のLv1同士で比較)", () => {
    const star1 = computeEffectiveStats(BASE_STATS, 1, 1);
    const star2 = computeEffectiveStats(BASE_STATS, 2, 1);
    expect(star2.hp).toBeGreaterThan(star1.hp);
    expect(star2.atk).toBeGreaterThan(star1.atk);
  });
});

describe("経験値カーブとランクアップ判定", () => {
  it("必要経験値はレベルが上がるほど増える", () => {
    expect(requiredExpForLevel(2)).toBeGreaterThan(requiredExpForLevel(1));
    expect(requiredExpForLevel(10)).toBeGreaterThan(requiredExpForLevel(5));
  });

  it("最大レベル未満はランクアップ不可", () => {
    expect(canRankUp(1, 14)).toBe(false);
  });

  it("最大レベルに到達するとランクアップ可能", () => {
    expect(canRankUp(1, 15)).toBe(true);
  });

  it("星5は最大レベルでもランクアップ不可", () => {
    expect(canRankUp(5, 50)).toBe(false);
  });
});
