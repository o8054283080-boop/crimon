import { describe, expect, it } from "vitest";
import {
  EQUIP_SLOTS,
  SLOT_MAIN_STAT_OPTIONS,
  applyEquipmentToStats,
  enhanceEquipment,
  equipmentSellPrice,
  generateEquipment,
  generateThemedStageEquipment,
} from "../src/core/equipment.js";
import { Stats } from "../src/core/stats.js";

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

const BASE_STATS: Stats = { hp: 1000, atk: 100, def: 50, spd: 100, criRate: 0.1, criDmg: 1.5, resistance: 0.1, accuracy: 0.1 };

describe("装備生成 (generateEquipment)", () => {
  it("メインステータスはスロットごとの候補に含まれる", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const slot = EQUIP_SLOTS[i % EQUIP_SLOTS.length];
      const eq = generateEquipment({ slot, star: 3, subStatCount: 2, rng });
      expect(SLOT_MAIN_STAT_OPTIONS[slot]).toContain(eq.mainStat.type);
    }
  });

  it("スロット1/3/5は固定ステータスのみ(ATK+/DEF+/HP+)", () => {
    const rng = mulberry32(2);
    for (let i = 0; i < 30; i++) {
      expect(generateEquipment({ slot: 1, star: 3, subStatCount: 0, rng }).mainStat.type).toBe("ATK_FLAT");
      expect(generateEquipment({ slot: 3, star: 3, subStatCount: 0, rng }).mainStat.type).toBe("DEF_FLAT");
      expect(generateEquipment({ slot: 5, star: 3, subStatCount: 0, rng }).mainStat.type).toBe("HP_FLAT");
    }
  });

  it("サブステータスはメインと重複せず、互いにも重複しない", () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 100; i++) {
      const eq = generateEquipment({ slot: 6, star: 4, subStatCount: 4, rng });
      const types = eq.subStats.map((s) => s.type);
      expect(types).not.toContain(eq.mainStat.type);
      expect(new Set(types).size).toBe(types.length);
    }
  });

  it("subStatCountの指定数だけサブステータスが付く(0-4にクランプ)", () => {
    const rng = mulberry32(4);
    expect(generateEquipment({ slot: 1, star: 1, subStatCount: 0, rng }).subStats).toHaveLength(0);
    expect(generateEquipment({ slot: 1, star: 1, subStatCount: 4, rng }).subStats).toHaveLength(4);
    expect(generateEquipment({ slot: 1, star: 1, subStatCount: 10, rng }).subStats).toHaveLength(4);
    expect(generateEquipment({ slot: 1, star: 1, subStatCount: -1, rng }).subStats).toHaveLength(0);
  });

  it("星が高いほどメインステータスの値が大きくなる傾向がある", () => {
    const rng = mulberry32(5);
    const low = generateEquipment({ slot: 1, star: 1, subStatCount: 0, rng }).mainStat.value;
    const high = generateEquipment({ slot: 1, star: 6, subStatCount: 0, rng }).mainStat.value;
    expect(high).toBeGreaterThan(low);
  });
});

describe("装備込みステータス計算 (applyEquipmentToStats)", () => {
  it("実数値は加算、%は基礎値に対して乗算で加わる", () => {
    const equipment = [
      generateEquipment({ slot: 1, star: 1, subStatCount: 0, rng: () => 0 }), // ATK+ 最小ロール
    ];
    const result = applyEquipmentToStats(BASE_STATS, equipment);
    // ATK_FLATのみなのでATKは base + flat、他ステータスは不変
    expect(result.atk).toBeGreaterThan(BASE_STATS.atk);
    expect(result.def).toBe(BASE_STATS.def);
    expect(result.hp).toBe(BASE_STATS.hp);
  });

  it("装備なしなら基礎ステータスと完全一致する", () => {
    const result = applyEquipmentToStats(BASE_STATS, []);
    expect(result).toEqual(BASE_STATS);
  });

  it("クリ率・効果抵抗などは100%を超えない", () => {
    const highRoll = () => 0.999;
    const many = Array.from({ length: 10 }, () => generateEquipment({ slot: 4, star: 6, subStatCount: 4, rng: highRoll }));
    const result = applyEquipmentToStats({ ...BASE_STATS, criRate: 0.9, resistance: 0.9 }, many);
    expect(result.criRate).toBeLessThanOrEqual(1);
    expect(result.resistance).toBeLessThanOrEqual(1);
  });
});

describe("装備売却価格 (equipmentSellPrice)", () => {
  it("星が高いほど売却価格が高い", () => {
    const rng = mulberry32(8);
    const low = generateEquipment({ slot: 1, star: 1, subStatCount: 0, rng });
    const high = generateEquipment({ slot: 1, star: 6, subStatCount: 0, rng });
    expect(equipmentSellPrice(high)).toBeGreaterThan(equipmentSellPrice(low));
  });

  it("強化レベルが高いほど売却価格が高い", () => {
    const rng = mulberry32(9);
    const eq = generateEquipment({ slot: 1, star: 3, subStatCount: 0, rng });
    const priceBefore = equipmentSellPrice(eq);
    enhanceEquipment(eq, rng);
    const priceAfter = equipmentSellPrice(eq);
    expect(priceAfter).toBeGreaterThan(priceBefore);
  });

  it("サブステータスが多いほど売却価格が高い", () => {
    const rng = mulberry32(10);
    const noSub = generateEquipment({ slot: 6, star: 3, subStatCount: 0, rng });
    const withSub = generateEquipment({ slot: 6, star: 3, subStatCount: 4, rng });
    expect(equipmentSellPrice(withSub)).toBeGreaterThan(equipmentSellPrice(noSub));
  });
});

/*
 * **サブは0〜2個・付きにくい、という前提はもう無い。**
 *
 * 初期サブ数が装備のレア度になったので、通常ステージでも4個(エピック)まで出る
 * (`core/equipmentRarity.ts` の `NORMAL_STAGE_INITIAL_SUB_WEIGHTS`)。
 * 以前ここにあった「0〜2個のみ」「サブ付きは55%未満」は旧仕様の確認だったので、
 * 新しい重みに沿った確認へ差し替えてある。
 */
describe("チャプターテーマ装備ドロップ (generateThemedStageEquipment)", () => {
  it("星は必ず1、シリーズは指定したものになり、サブは0〜4個", () => {
    const rng = mulberry32(6);
    for (let i = 0; i < 500; i++) {
      const eq = generateThemedStageEquipment("CRIT", rng);
      expect(eq.star).toBe(1);
      expect(eq.set).toBe("CRIT");
      expect(eq.subStats.length).toBeLessThanOrEqual(4);
      // 引けた数ではなく、頼まれた数が焼かれる
      expect(eq.initialSubStatCount).toBe(eq.subStats.length);
    }
  });

  it("初期サブ数の出方が通常ステージの重み(20/30/30/15/5)に沿う", () => {
    const rng = mulberry32(7);
    const N = 20000;
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      counts[generateThemedStageEquipment("POWER", rng).initialSubStatCount ?? 0] += 1;
    }
    const expected = [0.2, 0.3, 0.3, 0.15, 0.05];
    for (let sub = 0; sub < expected.length; sub += 1) {
      expect(counts[sub] / N, `初期サブ${sub}個`).toBeCloseTo(expected[sub], 1);
    }
  });
});
