import { describe, expect, it } from "vitest";
import {
  AWAKENING_DEPTH_FLOORS, findAwakeningDepthFloor, rollAwakeningDepthDrop,
} from "../src/data/awakeningDepths.js";
import {
  MATERIAL_EXCHANGES, deepestUnlockedFloor, exchangeMaterial, grantAwakeningDepthReward,
  isAwakeningDepthUnlocked, materialCount,
} from "../src/game/awakeningDepths.js";
import { createInitialState } from "../src/game/playerState.js";
import { CRYSTAL_SHOP_ITEMS } from "../src/data/crystalShop.js";
import { SHOP_AWAKENING_OFFERS } from "../src/game/shop.js";

/**
 * 目覚の深域。
 *
 * **最初から挑めて、1階ずつ開く。**才能覚醒は★6でしか開かないので、
 * 素材だけ先に貯められる形にしてある。
 */

describe("階の中身", () => {
  /*
   * スタミナは**どの階も10**。
   *
   * 階ごとに 6〜15 と変えていたが、深い階ほど高くすると
   * 「上の階を回るほど1周が高い」ことになり、下の階を回る動機が
   * ドロップではなく**燃費**で決まってしまう。同じ10なら、
   * どこを回るかは「どこまで安定して勝てるか」だけで決まる。
   */
  it("10階建て。スタミナはどの階も10", () => {
    expect(AWAKENING_DEPTH_FLOORS).toHaveLength(10);
    expect(AWAKENING_DEPTH_FLOORS.map((f) => f.stamina)).toEqual(Array(10).fill(10));
  });

  it("ボスの実効値は依頼の表どおり。**倍率ではなく実数で置く**", () => {
    const expected = [
      [35_000, 2_700, 1_300, 115], [45_000, 3_100, 1_500, 122], [58_000, 3_600, 1_750, 130],
      [72_000, 4_100, 2_000, 138], [88_000, 4_700, 2_300, 146], [105_000, 5_300, 2_600, 154],
      [125_000, 6_200, 3_000, 164], [145_000, 7_200, 3_400, 173], [162_000, 8_300, 3_700, 180],
      [180_000, 9_500, 4_000, 185],
    ];
    AWAKENING_DEPTH_FLOORS.forEach((floor, i) => {
      const boss = floor.enemies[0];
      expect(boss.fixedStats, `${floor.floor}階のボスに実数が無い`).toBeDefined();
      expect([boss.fixedStats!.hp, boss.fixedStats!.atk, boss.fixedStats!.def, boss.fixedStats!.spd])
        .toEqual(expected[i]);
      // 倍率は掛からない(1固定)
      expect(floor.powerScale).toBe(1);
      expect(floor.speedScale).toBe(1);
    });
  });

  it("お供は依頼どおり(1F無し / 2F攻 / 3F護 / 4F以降は両方)", () => {
    const names = (n: number) => findAwakeningDepthFloor(n)!.enemies.slice(1).map((e) => e.displayName);
    expect(names(1)).toEqual([]);
    expect(names(2)).toEqual(["才能晶・攻"]);
    expect(names(3)).toEqual(["才能晶・護"]);
    for (let f = 4; f <= 10; f += 1) expect(names(f)).toEqual(["才能晶・攻", "才能晶・護"]);
  });

  /*
   * 1〜4階は仕掛けを覚える帯。5階から反撃と適応が乗り、
   * 階が上がるほど反撃が早まり適応が深くなる。
   */
  it("反撃と才能適応は階ごとに決まっている", () => {
    const counter = (n: number) => findAwakeningDepthFloor(n)!.enemies[0].bossTraits?.counterAfterHits ?? 0;
    const adapt = (n: number) => findAwakeningDepthFloor(n)!.enemies[0].bossTraits?.talentAdaptation?.maxReduction ?? 0;
    expect([1, 2, 3, 4].map(counter)).toEqual([0, 0, 0, 0]);
    expect([5, 6].map(counter)).toEqual([8, 8]);
    expect(counter(7)).toBe(7);
    expect([8, 9].map(counter)).toEqual([6, 6]);
    expect(counter(10)).toBe(5);

    expect([1, 2, 3, 4].map(adapt)).toEqual([0, 0, 0, 0]);
    expect([5, 6, 7].map(adapt)).toEqual([0.10, 0.10, 0.10]);
    expect([8, 9].map(adapt)).toEqual([0.15, 0.15]);
    expect(adapt(10)).toBe(0.20);
  });

  it("反撃は**S2をそのまま撃つ**(単発を返すのとは意味が違う)", () => {
    for (let f = 5; f <= 10; f += 1) {
      expect(findAwakeningDepthFloor(f)!.enemies[0].bossTraits?.counterSkillIndex).toBe(1);
    }
  });

  it("お供を倒すと本体が変わる。**両方倒すと速度+20**", () => {
    const shards = findAwakeningDepthFloor(10)!.enemies.slice(1);
    const atk = shards.find((e) => e.displayName === "才能晶・攻")!;
    const def = shards.find((e) => e.displayName === "才能晶・護")!;
    expect(atk.bossTraits?.empowerBossOnDeathRatio?.defenseIgnoreRatio).toBe(0.20);
    expect(def.bossTraits?.empowerBossOnDeathRatio?.damageTakenMultiplier).toBeCloseTo(0.85, 5);
    const spd = (atk.bossTraits?.empowerBossOnDeath?.spd ?? 0) + (def.bossTraits?.empowerBossOnDeath?.spd ?? 0);
    expect(spd).toBe(20);
  });
});

describe("ドロップと初回報酬", () => {
  it("周回ドロップの範囲が依頼どおり", () => {
    const expected: [number, number, number, number, number][] = [
      // [階, 欠片min, 欠片max, 結晶min, 結晶max]
      [1, 3, 5, 0, 1], [2, 4, 6, 0, 1], [3, 5, 7, 1, 1], [4, 6, 8, 1, 2], [5, 7, 9, 1, 2],
      [6, 8, 10, 2, 3], [7, 9, 11, 2, 3], [8, 10, 12, 3, 4], [9, 11, 14, 3, 5], [10, 14, 18, 4, 6],
    ];
    for (const [floor, sMin, sMax, cMin, cMax] of expected) {
      const drop = findAwakeningDepthFloor(floor)!.drop;
      expect(drop.shards, `${floor}階の欠片`).toEqual([sMin, sMax]);
      expect(drop.crystals, `${floor}階の結晶`).toEqual([cMin, cMax]);
    }
  });

  it("奇石は7階から。階ごとに1/2/3/6%", () => {
    const chance = (n: number) => findAwakeningDepthFloor(n)!.drop.stoneChance;
    for (let f = 1; f <= 6; f += 1) expect(chance(f), `${f}階で奇石が落ちる`).toBe(0);
    expect(chance(7)).toBeCloseTo(0.01, 5);
    expect(chance(8)).toBeCloseTo(0.02, 5);
    expect(chance(9)).toBeCloseTo(0.03, 5);
    expect(chance(10)).toBeCloseTo(0.06, 5);
  });

  it("ドロップは範囲の両端を含む", () => {
    const floor = findAwakeningDepthFloor(1)!;
    // rng=0 で下限、1に限りなく近い値で上限
    expect(rollAwakeningDepthDrop(floor, () => 0).shards).toBe(3);
    expect(rollAwakeningDepthDrop(floor, () => 0.999999).shards).toBe(5);
  });

  it("初回報酬は依頼どおりで、**1回だけ**", () => {
    const state = createInitialState();
    const floor = findAwakeningDepthFloor(10)!;
    expect(floor.firstClear).toEqual({ shards: 150, crystals: 30, stones: 1 });

    /*
     * **rng は 0.5 で固定する。**0 にすると「奇石が必ず落ちる」側になり
     * (0 < 0.06)、初回報酬の1個と周回の1個が混ざって数が読めない。
     * 0.5 なら奇石は落ちず、欠片・結晶は範囲の中ほどになる。
     */
    const first = grantAwakeningDepthReward(state, floor, () => 0.5);
    expect(first.firstClear).toBe(true);
    expect(first.shards).toBe(150 + 16);
    expect(first.crystals).toBe(30 + 5);
    expect(first.stones).toBe(1);

    const second = grantAwakeningDepthReward(state, floor, () => 0.5);
    expect(second.firstClear).toBe(false);
    expect(second.shards).toBe(16);
    expect(second.crystals).toBe(5);
    expect(second.stones).toBe(0);
  });
});

describe("階の開放", () => {
  it("1階は最初から。**前の階をクリアして次が開く**", () => {
    const state = createInitialState();
    expect(isAwakeningDepthUnlocked(state, 1)).toBe(true);
    expect(isAwakeningDepthUnlocked(state, 2)).toBe(false);
    expect(deepestUnlockedFloor(state)).toBe(1);

    grantAwakeningDepthReward(state, findAwakeningDepthFloor(1)!, () => 0);
    expect(isAwakeningDepthUnlocked(state, 2)).toBe(true);
    expect(isAwakeningDepthUnlocked(state, 3)).toBe(false);
    expect(deepestUnlockedFloor(state)).toBe(2);
  });
});

describe("素材の交換", () => {
  it("欠片100→結晶10 / 結晶50→奇石1", () => {
    expect(MATERIAL_EXCHANGES.map((e) => [e.from.kind, e.from.count, e.to.kind, e.to.count])).toEqual([
      ["shards", 100, "crystals", 10],
      ["crystals", 50, "stones", 1],
    ]);
  });

  it("足りなければ何も動かない", () => {
    const state = createInitialState();
    state.awakeningShards = 99;
    expect(exchangeMaterial(state, "shards_to_crystals").ok).toBe(false);
    expect(materialCount(state, "shards")).toBe(99);
    expect(materialCount(state, "crystals")).toBe(0);

    state.awakeningShards = 250;
    expect(exchangeMaterial(state, "shards_to_crystals", 2).ok).toBe(true);
    expect(materialCount(state, "shards")).toBe(50);
    expect(materialCount(state, "crystals")).toBe(20);
  });
});

describe("ショップの値段", () => {
  it("ゴールドショップは依頼どおりの5品", () => {
    expect(SHOP_AWAKENING_OFFERS.map((o) => [o.material, o.count, o.price])).toEqual([
      ["shards", 20, 300_000],
      ["shards", 50, 650_000],
      ["crystals", 5, 500_000],
      ["crystals", 10, 900_000],
      ["stones", 1, 3_000_000],
    ]);
    // 奇石は**滅多に出ない**。重みが他より明確に小さい
    const stone = SHOP_AWAKENING_OFFERS.find((o) => o.material === "stones")!;
    for (const other of SHOP_AWAKENING_OFFERS.filter((o) => o.material !== "stones")) {
      expect(stone.weight).toBeLessThan(other.weight);
    }
  });

  it("ダイヤショップは依頼どおりの5品。どれも無制限", () => {
    const rows = CRYSTAL_SHOP_ITEMS.filter((i) => i.category === "TALENT")
      .map((i) => [i.kind, i.amount, i.price, i.period]);
    expect(rows).toEqual([
      ["AWAKENING_SHARD", 50, 300, "UNLIMITED"],
      ["AWAKENING_SHARD", 100, 550, "UNLIMITED"],
      ["AWAKENING_CRYSTAL", 10, 400, "UNLIMITED"],
      ["AWAKENING_CRYSTAL", 30, 1_000, "UNLIMITED"],
      ["AWAKENING_STONE", 1, 1_500, "UNLIMITED"],
    ]);
  });
});
