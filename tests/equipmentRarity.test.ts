import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_RARITY_LABEL,
  DUNGEON_FLOOR_INITIAL_SUB_WEIGHTS,
  DUNGEON_RARITY_FLOORS,
  NORMAL_STAGE_INITIAL_SUB_WEIGHTS,
  clampInitialSubStatCount,
  dungeonFloorInitialSubWeights,
  dungeonFloorRarityRates,
  equipmentInitialSubStatCount,
  equipmentRarityRank,
  getEquipmentRarity,
  getEquipmentRarityClass,
  getEquipmentRarityLabel,
  pickInitialSubStatCount,
} from "../src/core/equipmentRarity.js";
import {
  EQUIP_MAX_LEVEL,
  Equipment,
  enhanceEquipment,
  generateDungeonEquipment,
  generateEquipment,
  generateThemedStageEquipment,
} from "../src/core/equipment.js";
import { normalizeLoadedState } from "../src/game/playerState.js";

/** 種を固定した乱数。他のテストと同じ実装をそのまま使う */
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

/*
 * 装備のレア度は**★数とは別の軸**で、生成時の初期サブ数だけで決まる。
 *
 * ここで見張っているのは主に2つ:
 *
 *   1. **強化してもレア度が動かないこと。**
 *      今のサブ数から出すと、+15まで鍛えた装備が全部エピックになる。
 *      これは「レア度」ではなく「育てたかどうか」の表示になってしまう。
 *   2. **★とレア度が連動しないこと。**
 *      通常ステージは★によらず一律。ダンジョンは階だけで決まる。
 *      連動させると「★6＝エピック」という誤解がそのまま仕様になる。
 */

describe("装備レア度の判定", () => {
  it("初期サブ0〜4がノーマル/レア/ヒーロー/レジェンド/エピックに対応する", () => {
    const rng = mulberry32(1);
    const expected = ["NORMAL", "RARE", "HERO", "LEGEND", "EPIC"] as const;
    for (let sub = 0; sub <= 4; sub += 1) {
      const eq = generateEquipment({ slot: 1, star: 3, subStatCount: sub, rng });
      expect(eq.initialSubStatCount, `初期サブ${sub}個が焼かれている`).toBe(sub);
      expect(getEquipmentRarity(eq), `初期サブ${sub}個`).toBe(expected[sub]);
    }
  });

  it("画面に出す名前と、CSSへ渡す印がそろっている", () => {
    const rng = mulberry32(2);
    const label = ["ノーマル", "レア", "ヒーロー", "レジェンド", "エピック"];
    const css = ["normal", "rare", "hero", "legend", "epic"];
    for (let sub = 0; sub <= 4; sub += 1) {
      const eq = generateEquipment({ slot: 1, star: 6, subStatCount: sub, rng });
      expect(getEquipmentRarityLabel(eq)).toBe(label[sub]);
      expect(getEquipmentRarityClass(eq)).toBe(css[sub]);
    }
    expect(EQUIPMENT_RARITY_LABEL.EPIC).toBe("エピック");
  });

  it("★数とレア度は独立していて、★6ノーマルも★1エピックも作れる", () => {
    const rng = mulberry32(3);
    const sixNormal = generateEquipment({ slot: 1, star: 6, subStatCount: 0, rng });
    const oneEpic = generateEquipment({ slot: 1, star: 1, subStatCount: 4, rng });
    expect(getEquipmentRarity(sixNormal)).toBe("NORMAL");
    expect(getEquipmentRarity(oneEpic)).toBe("EPIC");
  });

  it("並び替えの順位はエピックが一番上", () => {
    expect(equipmentRarityRank("EPIC")).toBeGreaterThan(equipmentRarityRank("LEGEND"));
    expect(equipmentRarityRank("LEGEND")).toBeGreaterThan(equipmentRarityRank("HERO"));
    expect(equipmentRarityRank("HERO")).toBeGreaterThan(equipmentRarityRank("RARE"));
    expect(equipmentRarityRank("RARE")).toBeGreaterThan(equipmentRarityRank("NORMAL"));
  });

  it("0〜4の外は端へ丸める", () => {
    expect(clampInitialSubStatCount(-3)).toBe(0);
    expect(clampInitialSubStatCount(9)).toBe(4);
    expect(clampInitialSubStatCount(Number.NaN)).toBe(0);
    expect(clampInitialSubStatCount(2.7)).toBe(2);
  });
});

describe("強化してもレア度は動かない", () => {
  it("初期サブ1個のレア装備は、サブが4個になってもレアのまま", () => {
    const rng = mulberry32(11);
    const eq = generateEquipment({ slot: 6, star: 6, subStatCount: 1, rng });
    expect(getEquipmentRarity(eq)).toBe("RARE");

    for (let i = 0; i < EQUIP_MAX_LEVEL; i += 1) enhanceEquipment(eq, rng);

    expect(eq.level).toBe(EQUIP_MAX_LEVEL);
    expect(eq.subStats.length, "強化でサブは4個まで増える").toBe(4);
    expect(eq.initialSubStatCount, "初期サブ数は動かない").toBe(1);
    expect(getEquipmentRarity(eq), "レア度も動かない").toBe("RARE");
  });

  it("初期サブ0個のノーマルも、+15まで鍛えてノーマルのまま", () => {
    const rng = mulberry32(12);
    const eq = generateEquipment({ slot: 2, star: 5, subStatCount: 0, rng });
    for (let i = 0; i < EQUIP_MAX_LEVEL; i += 1) enhanceEquipment(eq, rng);
    expect(eq.subStats.length).toBeGreaterThan(0);
    expect(getEquipmentRarity(eq)).toBe("NORMAL");
  });

  it("強化の節目を全部通しても、どの段階でもレア度が変わらない", () => {
    const rng = mulberry32(13);
    const eq = generateEquipment({ slot: 4, star: 4, subStatCount: 2, rng });
    for (let i = 0; i < EQUIP_MAX_LEVEL; i += 1) {
      enhanceEquipment(eq, rng);
      expect(getEquipmentRarity(eq), `+${eq.level} の時点`).toBe("HERO");
    }
  });
});

describe("通常ステージの出方", () => {
  it("★数を変えても同じ重み(20/30/30/15/5)が使われる", () => {
    const N = 20000;
    const expected = [0.2, 0.3, 0.3, 0.15, 0.05];
    // starBonus 0(★1) と 5(★6) の両方で測る。★で変わってはいけない
    for (const starBonus of [0, 5]) {
      const rng = mulberry32(100 + starBonus);
      const counts = [0, 0, 0, 0, 0];
      for (let i = 0; i < N; i += 1) {
        counts[generateThemedStageEquipment("SWIFT", rng, starBonus).initialSubStatCount ?? 0] += 1;
      }
      for (let sub = 0; sub <= 4; sub += 1) {
        expect(counts[sub] / N, `★ボーナス${starBonus} / 初期サブ${sub}個`).toBeCloseTo(expected[sub], 1);
      }
    }
  });

  it("重みの合計は100で、そのまま%として読める", () => {
    expect(NORMAL_STAGE_INITIAL_SUB_WEIGHTS.reduce((a, b) => a + b, 0)).toBe(100);
    expect([...NORMAL_STAGE_INITIAL_SUB_WEIGHTS]).toEqual([20, 30, 30, 15, 5]);
  });
});

describe("装備ダンジョンの階層別の出方", () => {
  it("1〜12階の表が依頼どおりで、各行の合計が100", () => {
    const table: Record<number, number[]> = {
      1: [25, 35, 25, 12, 3],
      2: [23, 34, 27, 13, 3],
      3: [20, 33, 28, 15, 4],
      4: [17, 31, 30, 17, 5],
      5: [14, 29, 31, 20, 6],
      6: [11, 27, 32, 22, 8],
      7: [8, 24, 34, 24, 10],
      8: [5, 20, 35, 27, 13],
      9: [2, 16, 35, 31, 16],
      10: [0, 10, 35, 35, 20],
      11: [0, 6, 30, 38, 26],
      12: [0, 3, 25, 40, 32],
    };
    for (const [floor, weights] of Object.entries(table)) {
      const actual = DUNGEON_FLOOR_INITIAL_SUB_WEIGHTS[Number(floor)];
      expect([...actual], `${floor}階`).toEqual(weights);
      expect(weights.reduce((a, b) => a + b, 0), `${floor}階の合計`).toBe(100);
    }
  });

  it("1〜10階で、実際にその階の確率が使われている", () => {
    const N = 20000;
    for (const floor of [1, 5, 10]) {
      const rng = mulberry32(500 + floor);
      const counts = [0, 0, 0, 0, 0];
      for (let i = 0; i < N; i += 1) {
        counts[generateDungeonEquipment(floor, rng).initialSubStatCount ?? 0] += 1;
      }
      const weights = DUNGEON_FLOOR_INITIAL_SUB_WEIGHTS[floor];
      for (let sub = 0; sub <= 4; sub += 1) {
        expect(counts[sub] / N, `${floor}階 / 初期サブ${sub}個`).toBeCloseTo(weights[sub] / 100, 1);
      }
    }
  });

  it("10階ではノーマルが出ない(重み0)", () => {
    const rng = mulberry32(777);
    for (let i = 0; i < 3000; i += 1) {
      expect(generateDungeonEquipment(10, rng).initialSubStatCount).toBeGreaterThan(0);
    }
  });

  it("階が上がるほどエピックが出やすく、ノーマルは出にくくなる", () => {
    for (let floor = 2; floor <= 12; floor += 1) {
      const prev = DUNGEON_FLOOR_INITIAL_SUB_WEIGHTS[floor - 1];
      const now = DUNGEON_FLOOR_INITIAL_SUB_WEIGHTS[floor];
      expect(now[4], `${floor}階のエピック`).toBeGreaterThanOrEqual(prev[4]);
      expect(now[0], `${floor}階のノーマル`).toBeLessThanOrEqual(prev[0]);
    }
  });

  /*
   * 11F・12Fはまだ実装されていない階。**表だけ先に持っている。**
   * 階を足した時にそのまま使えることをここで担保する。
   */
  it("まだ無い11階・12階の設定が、階を足せばそのまま使える", () => {
    expect(dungeonFloorInitialSubWeights(11)).toBe(DUNGEON_FLOOR_INITIAL_SUB_WEIGHTS[11]);
    expect(dungeonFloorInitialSubWeights(12)).toBe(DUNGEON_FLOOR_INITIAL_SUB_WEIGHTS[12]);

    const rng = mulberry32(888);
    const N = 20000;
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < N; i += 1) {
      counts[generateDungeonEquipment(12, rng).initialSubStatCount ?? 0] += 1;
    }
    expect(counts[4] / N, "12階のエピック").toBeCloseTo(0.32, 1);
    expect(counts[0], "12階でノーマルは出ない").toBe(0);
  });

  it("階数を10で決め打ちせず、表に無い階も端へ寄せて必ず引ける", () => {
    expect(DUNGEON_RARITY_FLOORS[0]).toBe(1);
    expect(DUNGEON_RARITY_FLOORS[DUNGEON_RARITY_FLOORS.length - 1]).toBe(12);
    // 表より下も上も落ちない
    expect(dungeonFloorInitialSubWeights(0)).toBe(DUNGEON_FLOOR_INITIAL_SUB_WEIGHTS[1]);
    expect(dungeonFloorInitialSubWeights(99)).toBe(DUNGEON_FLOOR_INITIAL_SUB_WEIGHTS[12]);
    const rng = mulberry32(999);
    expect(() => generateDungeonEquipment(99, rng)).not.toThrow();
  });

  it("画面へ出す%は、抽選に使う表と同じところから作られる", () => {
    const rates = dungeonFloorRarityRates(8);
    expect(rates.map((r) => r.rarity)).toEqual(["NORMAL", "RARE", "HERO", "LEGEND", "EPIC"]);
    expect(rates.map((r) => r.percent)).toEqual([5, 20, 35, 27, 13]);
  });

  it("重み0のレア度は絶対に引かれない", () => {
    const rng = mulberry32(4242);
    for (let i = 0; i < 5000; i += 1) {
      expect(pickInitialSubStatCount([0, 0, 0, 0, 100], rng)).toBe(4);
    }
  });
});

describe("旧セーブとの互換", () => {
  /** 旧セーブの装備を模す(initialSubStatCount が無い) */
  function legacyEquipment(subStatCount: number, level: number): Equipment {
    const eq = generateEquipment({ slot: 1, star: 5, subStatCount, rng: mulberry32(subStatCount + level) });
    eq.level = level;
    delete eq.initialSubStatCount;
    return eq;
  }

  it("initialSubStatCount が無くても落ちず、今のサブ数から読める", () => {
    for (let sub = 0; sub <= 4; sub += 1) {
      const eq = legacyEquipment(sub, 0);
      expect(() => getEquipmentRarity(eq)).not.toThrow();
      expect(equipmentInitialSubStatCount(eq)).toBe(sub);
    }
  });

  it("読み込みの正規化で一度だけ補われ、読み直しても変わらない", () => {
    const legacy = legacyEquipment(2, 9);
    const state = {
      ...JSON.parse(JSON.stringify({ equipment: [] })),
      equipment: [legacy],
      monsters: [],
    } as never;

    const first = normalizeLoadedState(state);
    const filled = first.equipment[0].initialSubStatCount;
    expect(filled, "今のサブ数から補われる").toBe(legacy.subStats.length);

    // 補った後にさらに強化してから読み直しても、初期値は動かない
    const rng = mulberry32(31);
    enhanceEquipment(first.equipment[0], rng);
    enhanceEquipment(first.equipment[0], rng);
    enhanceEquipment(first.equipment[0], rng);
    const second = normalizeLoadedState(first);
    expect(second.equipment[0].initialSubStatCount, "読み直しても変わらない").toBe(filled);
  });

  it("壊れた値が入っていても0〜4に収める", () => {
    const eq = legacyEquipment(1, 0);
    (eq as { initialSubStatCount?: number }).initialSubStatCount = 99;
    const state = { equipment: [eq], monsters: [] } as never;
    expect(normalizeLoadedState(state).equipment[0].initialSubStatCount).toBe(4);
  });
});
