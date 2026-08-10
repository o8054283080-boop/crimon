import { describe, expect, it } from "vitest";
import { computeEffectiveStats } from "../src/core/rarity.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import {
  MONSTER_DEX,
  MONSTER_TEMPLATES,
  REINCARNATION_PIG,
  REINCARNATION_PIG_DEX,
  findMonster,
  findMonsterById,
} from "../src/data/monsters.js";
import { DUNGEON_FLOOR_STAR_WEIGHTS } from "../src/core/equipment.js";
import {
  EQUIPMENT_DUNGEON_FLOORS,
  REINCARNATION_PIG_DROP_FLOOR,
  REINCARNATION_PIG_DROP_RATE,
  SUMMON_SCROLL_DROP_RATE,
  rollDungeonReincarnationPig,
  rollDungeonSummonScroll,
} from "../src/data/equipmentDungeon.js";
import {
  MAX_DUNGEON_PARTY_SIZE,
  addSummonScrolls,
  createInitialState,
  toggleDungeonPartyMember,
  tryUseSummonScroll,
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

describe("転生ピッグ", () => {
  it("通常のガチャ・ステージ対象(MONSTER_TEMPLATES)には含まれない", () => {
    expect(MONSTER_TEMPLATES.some((t) => t.templateId === REINCARNATION_PIG.templateId)).toBe(false);
  });

  it("図鑑検索(findMonsterById/findMonster)では見つかる", () => {
    const dex = REINCARNATION_PIG_DEX[0];
    expect(findMonsterById(dex.id)).toBeDefined();
    expect(findMonster(REINCARNATION_PIG.templateId, dex.element)).toBeDefined();
    expect(MONSTER_DEX).toContain(dex);
  });

  it("6属性のバリエーションが存在する", () => {
    expect(REINCARNATION_PIG_DEX).toHaveLength(6);
  });

  it("同じ星・レベルの通常モンスターよりステータスがはるかに弱い", () => {
    const pigDex = REINCARNATION_PIG_DEX[0];
    const slimeDex = findMonster("slime", pigDex.element)!;
    const pigStats = computeEffectiveStats(pigDex.stats, 3, 30);
    const slimeStats = computeEffectiveStats(slimeDex.stats, 3, 30);
    expect(pigStats.hp).toBeLessThan(slimeStats.hp * 0.3);
    expect(pigStats.atk).toBeLessThan(slimeStats.atk * 0.3);
  });

  it("星3インスタンスとして生成すれば、星3ランクアップの素材条件(星が一致)を満たす", () => {
    const pig = createMonsterInstance(REINCARNATION_PIG_DEX[0].id, 3, 30);
    expect(pig.star).toBe(3);
  });
});

describe("装備ダンジョンのボーナスドロップ", () => {
  it("転生ピッグは10階でのみドロップし得る", () => {
    const rng = () => 0; // 必ずドロップ側に倒れる乱数
    for (const floor of EQUIPMENT_DUNGEON_FLOORS) {
      const result = rollDungeonReincarnationPig(floor, rng);
      if (floor.floor === REINCARNATION_PIG_DROP_FLOOR) {
        expect(result).not.toBeNull();
      } else {
        expect(result).toBeNull();
      }
    }
  });

  it("10階の転生ピッグドロップ率はおよそ10%(統計的検証)", () => {
    const rng = mulberry32(1);
    const floor = EQUIPMENT_DUNGEON_FLOORS[REINCARNATION_PIG_DROP_FLOOR - 1];
    const N = 4000;
    let count = 0;
    for (let i = 0; i < N; i++) {
      if (rollDungeonReincarnationPig(floor, rng)) count += 1;
    }
    const rate = count / N;
    expect(rate).toBeGreaterThan(REINCARNATION_PIG_DROP_RATE - 0.03);
    expect(rate).toBeLessThan(REINCARNATION_PIG_DROP_RATE + 0.03);
  });

  it("召喚の書のドロップ率はおよそ5%で、階層によらず一定(統計的検証)", () => {
    const rng = mulberry32(2);
    const N = 4000;
    let count = 0;
    for (let i = 0; i < N; i++) {
      if (rollDungeonSummonScroll(rng)) count += 1;
    }
    const rate = count / N;
    expect(rate).toBeGreaterThan(SUMMON_SCROLL_DROP_RATE - 0.02);
    expect(rate).toBeLessThan(SUMMON_SCROLL_DROP_RATE + 0.02);
  });
});

describe("星6ドロップ率の引き下げ", () => {
  it("7〜10階の星6排出重みは、以前の値(25/35/50/68)のおよそ半分になっている", () => {
    const previousStar6Weights: Record<number, number> = { 7: 25, 8: 35, 9: 50, 10: 68 };
    for (const [floorStr, prevWeight] of Object.entries(previousStar6Weights)) {
      const floor = Number(floorStr);
      const weights = DUNGEON_FLOOR_STAR_WEIGHTS[floor];
      const total = weights.reduce((sum, w) => sum + w.weight, 0);
      const star6 = weights.find((w) => w.value === 6)!;
      const star6Percent = (star6.weight / total) * 100;
      expect(star6Percent).toBeGreaterThan(prevWeight / 2 - 5);
      expect(star6Percent).toBeLessThan(prevWeight / 2 + 5);
    }
  });
});

describe("装備ダンジョン専用パーティ (dungeonPartyIds)", () => {
  it("最大5体まで編成できる", () => {
    const state = createInitialState();
    const ids = Array.from({ length: 7 }, (_, i) => `m${i}`);
    for (const id of ids) toggleDungeonPartyMember(state, id);
    expect(state.dungeonPartyIds).toHaveLength(MAX_DUNGEON_PARTY_SIZE);
  });

  it("同じIDを再度指定すると編成から外れる", () => {
    const state = createInitialState();
    toggleDungeonPartyMember(state, "m1");
    expect(state.dungeonPartyIds).toContain("m1");
    toggleDungeonPartyMember(state, "m1");
    expect(state.dungeonPartyIds).not.toContain("m1");
  });
});

describe("召喚の書 (summonScrolls)", () => {
  it("addSummonScrollsで加算、tryUseSummonScrollで消費できる", () => {
    const state = createInitialState();
    expect(state.summonScrolls).toBe(0);
    addSummonScrolls(state, 2);
    expect(state.summonScrolls).toBe(2);
    expect(tryUseSummonScroll(state)).toBe(true);
    expect(state.summonScrolls).toBe(1);
    expect(tryUseSummonScroll(state)).toBe(true);
    expect(state.summonScrolls).toBe(0);
    expect(tryUseSummonScroll(state)).toBe(false);
    expect(state.summonScrolls).toBe(0);
  });
});
