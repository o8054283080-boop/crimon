import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { EQUIP_SLOTS, EquipStar, generateEquipment } from "../src/core/equipment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { addEquipment, createInitialState, equipToMonster, PlayerState } from "../src/game/playerState.js";
import { setupDungeonBattle } from "../src/game/dungeonRunner.js";

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

const STARTER = [
  { templateId: "slime", element: "FIRE" },
  { templateId: "wolf", element: "WATER" },
  { templateId: "golem", element: "ELECTRIC" },
  { templateId: "fairy", element: "GRASS" },
];

function buildParty(star: 1 | 2 | 3 | 4 | 5, level: number) {
  return STARTER.map((s) => createMonsterInstance(`${s.templateId}_${s.element}`, star, level));
}

function equipFullLoadout(state: PlayerState, monsterId: string, eqStar: EquipStar, subStatCount: number, rng: () => number): void {
  for (const slot of EQUIP_SLOTS) {
    const eq = generateEquipment({ slot, star: eqStar, subStatCount, rng });
    addEquipment(state, eq);
    equipToMonster(state, monsterId, eq.id);
  }
}

/**
 * 装備は乱数ロール(85〜115%のばらつき)を含むため、1回だけ装備を生成して繰り返し戦わせると
 * 「たまたま当たりロールだった/外れロールだった」1サンプルの結果に依存してしまう。
 * 統計的に意味のある勝率を得るため、試行のたびに装備そのものを新しく生成し直す。
 */
function winRate(
  floorNum: number,
  star: 1 | 2 | 3 | 4 | 5,
  level: number,
  eqStar: EquipStar | null,
  subStatCount: number,
  trials: number,
): number {
  const floor = EQUIPMENT_DUNGEON_FLOORS[floorNum - 1];
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const rng = mulberry32(500 + i);
    const state = createInitialState();
    const party = buildParty(star, level);
    state.monsters = party;
    if (eqStar !== null) {
      for (const m of party) equipFullLoadout(state, m.id, eqStar, subStatCount, rng);
    }

    const setup = setupDungeonBattle(party, floor, state.equipment);
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng });
    if (engine.run().winner === "PLAYER") wins += 1;
  }
  return wins / trials;
}

describe("装備ダンジョンの難易度(1階は星3+星1装備くらいで挑める、9・10階は星6装備クラスをフルで固めてようやく突破できる最終関門)", () => {
  it("星1Lv1の未装備パーティは1階にほとんど勝てない(最低限の育成は必要)", () => {
    const rate = winRate(1, 1, 1, null, 0, 60);
    expect(rate).toBeLessThan(0.15);
  });

  it("星3モンスターでも未装備では1階の勝率は低い(装備が意味を持つ)", () => {
    const rate = winRate(1, 3, 30, null, 0, 60);
    expect(rate).toBeLessThan(0.2);
  });

  it("星3モンスターに星1装備をフル装備すれば1階を高い勝率でクリアできる", () => {
    const rate = winRate(1, 3, 30, 1, 2, 120);
    expect(rate).toBeGreaterThan(0.6);
  });

  it("10階は星5装備クラスではほぼ勝てず、星6装備でもサブ2個程度ではまだ厳しい(最終関門)", () => {
    const star5Rate = winRate(10, 5, 50, 5, 2, 150);
    const star6Rate = winRate(10, 5, 50, 6, 2, 150);
    expect(star5Rate).toBeLessThan(0.15);
    expect(star6Rate).toBeGreaterThan(star5Rate);
    expect(star6Rate).toBeLessThan(0.6);
  });

  it("10階は星6装備をサブ4個までフルで固めればしっかり突破できるようになる", () => {
    const rate = winRate(10, 5, 50, 6, 4, 150);
    expect(rate).toBeGreaterThan(0.8);
  });

  it("9階は10階ほど厳しくなく、星5装備クラスでも十分勝機がある", () => {
    const rate = winRate(9, 5, 50, 5, 2, 150);
    expect(rate).toBeGreaterThan(0.7);
  });

  it("同じ星4装備フル装備でも、10階は1階よりはっきり難しい", () => {
    const floor1Rate = winRate(1, 5, 50, 4, 2, 80);
    const floor10Rate = winRate(10, 5, 50, 4, 2, 80);
    expect(floor10Rate).toBeLessThan(floor1Rate);
  });

  it("9・10階は8階までの線形カーブから大きく難易度が跳ね上がる", () => {
    const floor8 = EQUIPMENT_DUNGEON_FLOORS[7];
    const floor9 = EQUIPMENT_DUNGEON_FLOORS[8];
    const floor10 = EQUIPMENT_DUNGEON_FLOORS[9];
    const linearStep = floor8.powerScale - EQUIPMENT_DUNGEON_FLOORS[6].powerScale;
    expect(floor9.powerScale - floor8.powerScale).toBeGreaterThan(linearStep);
    expect(floor10.powerScale - floor9.powerScale).toBeGreaterThan(linearStep);
  });

  it("階層が上がるほどpowerScaleが単調増加する", () => {
    for (let i = 1; i < EQUIPMENT_DUNGEON_FLOORS.length; i++) {
      expect(EQUIPMENT_DUNGEON_FLOORS[i].powerScale).toBeGreaterThan(EQUIPMENT_DUNGEON_FLOORS[i - 1].powerScale);
    }
  });
});
