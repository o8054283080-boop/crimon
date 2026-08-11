import { describe, expect, it } from "vitest";
import {
  EQUIP_MAX_LEVEL,
  MAX_SUB_STATS,
  SUBSTAT_POWERUP_LEVELS,
  canEnhanceEquipment,
  enhanceEquipment,
  enhanceEquipmentCost,
  generateEquipment,
} from "../src/core/equipment.js";
import {
  PlayerState,
  addEquipment,
  tryEnhanceEquipment,
} from "../src/game/playerState.js";

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

function makeState(): PlayerState {
  return {
    crystal: 0,
    gold: 1_000_000,
    monsters: [],
    partyIds: [],
    clearedStageIds: [],
    clearedDungeonFloors: [],
    clearedLevelDungeonTiers: [],
    equipment: [],
    dungeonPartyIds: [],
    summonScrolls: 0,
    fighterLevel: 1,
    fighterExp: 0,
    stamina: 150,
    maxStamina: 150,
    lastStaminaUpdateAt: Date.now(),
    fighterName: "ファイター",
    lastLoginBonusAt: null,
    loginBonusClaimCount: 0,
  };
}

describe("装備強化 (enhanceEquipment)", () => {
  it("最大レベル(15)までしか強化できない", () => {
    const rng = mulberry32(1);
    const eq = generateEquipment({ slot: 1, star: 1, subStatCount: 0, rng });
    for (let i = 0; i < EQUIP_MAX_LEVEL; i++) {
      expect(canEnhanceEquipment(eq)).toBe(true);
      expect(enhanceEquipment(eq, rng)).toBe(true);
    }
    expect(eq.level).toBe(EQUIP_MAX_LEVEL);
    expect(canEnhanceEquipment(eq)).toBe(false);
    expect(enhanceEquipment(eq, rng)).toBe(false);
    expect(eq.level).toBe(EQUIP_MAX_LEVEL);
  });

  it("レベルが上がるたびメインステータスの値が増える", () => {
    const rng = mulberry32(2);
    const eq = generateEquipment({ slot: 1, star: 1, subStatCount: 0, rng });
    let previous = eq.mainStat.value;
    for (let i = 0; i < EQUIP_MAX_LEVEL; i++) {
      enhanceEquipment(eq, rng);
      expect(eq.mainStat.value).toBeGreaterThan(previous);
      previous = eq.mainStat.value;
    }
  });

  it("15レベル到達時の上昇量は1〜14レベルの上昇量より大きい", () => {
    const rng = mulberry32(3);
    const eq = generateEquipment({ slot: 1, star: 1, subStatCount: 0, rng });
    const increments: number[] = [];
    let previous = eq.mainStat.value;
    for (let i = 0; i < EQUIP_MAX_LEVEL; i++) {
      enhanceEquipment(eq, rng);
      increments.push(eq.mainStat.value - previous);
      previous = eq.mainStat.value;
    }
    const level15Increment = increments[increments.length - 1];
    const earlierIncrements = increments.slice(0, -1);
    for (const inc of earlierIncrements) {
      expect(level15Increment).toBeGreaterThan(inc);
    }
  });

  it("3/6/9/12/15レベル到達時、サブが4個未満ならランダムで1個追加される", () => {
    const rng = mulberry32(4);
    const eq = generateEquipment({ slot: 1, star: 3, subStatCount: 0, rng });
    expect(eq.subStats).toHaveLength(0);

    enhanceEquipment(eq, rng); // lv1
    enhanceEquipment(eq, rng); // lv2
    expect(eq.subStats).toHaveLength(0);
    enhanceEquipment(eq, rng); // lv3 -> +1 sub
    expect(eq.subStats).toHaveLength(1);

    enhanceEquipment(eq, rng); // lv4
    enhanceEquipment(eq, rng); // lv5
    enhanceEquipment(eq, rng); // lv6 -> +1 sub
    expect(eq.subStats).toHaveLength(2);
  });

  it("サブが4個ある状態で強化レベルに到達すると、新規追加ではなく既存サブが強化される", () => {
    const rng = mulberry32(5);
    const eq = generateEquipment({ slot: 1, star: 3, subStatCount: 4, rng });
    expect(eq.subStats).toHaveLength(MAX_SUB_STATS);
    const before = eq.subStats.map((s) => s.value);

    for (let i = 0; i < 3; i++) enhanceEquipment(eq, rng); // reach level 3
    expect(eq.subStats).toHaveLength(MAX_SUB_STATS); // still 4, none added
    const after = eq.subStats.map((s) => s.value);
    // at least one substat should have increased in value
    expect(after.some((v, i) => v > before[i])).toBe(true);
  });

  it("サブの強化は3レベルごとにしか発生しない", () => {
    const rng = mulberry32(6);
    const eq = generateEquipment({ slot: 1, star: 2, subStatCount: 0, rng });
    for (let lvl = 1; lvl <= EQUIP_MAX_LEVEL; lvl++) {
      const before = eq.subStats.length;
      enhanceEquipment(eq, rng);
      if (SUBSTAT_POWERUP_LEVELS.includes(lvl)) {
        expect(eq.subStats.length).toBeGreaterThanOrEqual(before);
      } else {
        expect(eq.subStats.length).toBe(before);
      }
    }
  });
});

describe("星ごとのメイン初期値・成長率", () => {
  it("星1〜4の初期値は一定間隔で増える", () => {
    const rng = () => 0.5; // fix variance at midpoint
    const values = [1, 2, 3, 4].map((star) => generateEquipment({ slot: 1, star: star as 1 | 2 | 3 | 4, subStatCount: 0, rng }).mainStat.value);
    const diff1 = values[1] - values[0];
    const diff2 = values[2] - values[1];
    const diff3 = values[3] - values[2];
    expect(diff1).toBe(diff2);
    expect(diff2).toBe(diff3);
  });

  it("星5・6の初期値は星1〜4の間隔よりも大きく跳ね上がる", () => {
    const rng = () => 0.5;
    const v4 = generateEquipment({ slot: 1, star: 4, subStatCount: 0, rng }).mainStat.value;
    const v5 = generateEquipment({ slot: 1, star: 5, subStatCount: 0, rng }).mainStat.value;
    const v6 = generateEquipment({ slot: 1, star: 6, subStatCount: 0, rng }).mainStat.value;
    const v3 = generateEquipment({ slot: 1, star: 3, subStatCount: 0, rng }).mainStat.value;
    const smallStep = v4 - v3;
    expect(v5 - v4).toBeGreaterThan(smallStep);
    expect(v6 - v5).toBeGreaterThan(smallStep);
  });

  it("星5・6は星1〜4よりレベルアップ時の上昇量も大きい", () => {
    const rng = mulberry32(7);
    const low = generateEquipment({ slot: 1, star: 4, subStatCount: 0, rng });
    const high = generateEquipment({ slot: 1, star: 6, subStatCount: 0, rng });
    const lowBefore = low.mainStat.value;
    const highBefore = high.mainStat.value;
    enhanceEquipment(low, rng);
    enhanceEquipment(high, rng);
    const lowGain = low.mainStat.value - lowBefore;
    const highGain = high.mainStat.value - highBefore;
    expect(highGain).toBeGreaterThan(lowGain);
  });
});

describe("プレイヤー状態経由での強化 (tryEnhanceEquipment)", () => {
  it("ゴールドを消費して強化できる", () => {
    const state = makeState();
    const eq = generateEquipment({ slot: 1, star: 1, subStatCount: 0 });
    addEquipment(state, eq);
    const goldBefore = state.gold;

    const result = tryEnhanceEquipment(state, eq.id);

    expect(result.ok).toBe(true);
    expect(eq.level).toBe(1);
    expect(state.gold).toBeLessThan(goldBefore);
  });

  it("ゴールドが足りない場合は失敗し、レベルもゴールドも変化しない", () => {
    const state = makeState();
    state.gold = 0;
    const eq = generateEquipment({ slot: 1, star: 1, subStatCount: 0 });
    addEquipment(state, eq);

    const result = tryEnhanceEquipment(state, eq.id);

    expect(result.ok).toBe(false);
    expect(eq.level).toBe(0);
    expect(state.gold).toBe(0);
  });

  it("最大レベルの装備は強化できない", () => {
    const state = makeState();
    const eq = generateEquipment({ slot: 1, star: 1, subStatCount: 0 });
    addEquipment(state, eq);
    for (let i = 0; i < EQUIP_MAX_LEVEL; i++) enhanceEquipment(eq);

    const result = tryEnhanceEquipment(state, eq.id);

    expect(result.ok).toBe(false);
  });

  it("強化コストはレベル・星が上がるほど高くなる", () => {
    const low = generateEquipment({ slot: 1, star: 1, subStatCount: 0 });
    const highStar = generateEquipment({ slot: 1, star: 6, subStatCount: 0 });
    expect(enhanceEquipmentCost(highStar)).toBeGreaterThan(enhanceEquipmentCost(low));

    const leveled = generateEquipment({ slot: 1, star: 1, subStatCount: 0 });
    const costAt0 = enhanceEquipmentCost(leveled);
    enhanceEquipment(leveled);
    const costAt1 = enhanceEquipmentCost(leveled);
    expect(costAt1).toBeGreaterThan(costAt0);
  });
});
