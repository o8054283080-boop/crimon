/**
 * 装備ダンジョンの難易度つまみを振って、勝率を実測する道具。
 *
 * ボスのHPを5倍にすると、ボスが生き残る時間が伸びるぶん
 * ボスが与える総ダメージも伸びる。つまり powerScale を据え置くと
 * 難易度は「5倍」どころではなく跳ね上がる(実際、1階の勝率が0になった)。
 * 勘で数値を置くと必ず外すので、候補を振って測ってから決める。
 *
 *   npx tsx tools/dungeonProbe.ts
 */

import { BattleEngine } from "../src/battle/engine.js";
import { EQUIP_SLOTS, EquipStar, generateEquipment } from "../src/core/equipment.js";
import { MonsterInstance, createMonsterInstance } from "../src/core/monsterInstance.js";
import { DungeonFloor, EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { setupDungeonBattle } from "../src/game/dungeonRunner.js";
import { PlayerState, addEquipment, createInitialState, equipToMonster } from "../src/game/playerState.js";

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

function equipFull(state: PlayerState, monsterId: string, eqStar: EquipStar, subs: number, rng: () => number): void {
  for (const slot of EQUIP_SLOTS) {
    const eq = generateEquipment({ slot, star: eqStar, subStatCount: subs, rng });
    addEquipment(state, eq);
    equipToMonster(state, monsterId, eq.id);
  }
}

/** powerScale だけ差し替えた階層を作る(データ本体は書き換えずに試せる) */
function withScale(floor: DungeonFloor, powerScale: number): DungeonFloor {
  return { ...floor, powerScale };
}

interface Scenario {
  label: string;
  floor: number;
  party: () => MonsterInstance[];
  eqStar: EquipStar | null;
  subs: number;
  trials: number;
  /** テストが要求している水準。">0.6" のように書く */
  target: string;
}

const generic = (star: 1 | 2 | 3 | 4 | 5, level: number, size: number) =>
  [
    { templateId: "slime", element: "FIRE" },
    { templateId: "wolf", element: "WATER" },
    { templateId: "golem", element: "ELECTRIC" },
    { templateId: "fairy", element: "GRASS" },
    { templateId: "slime", element: "WATER" },
  ]
    .slice(0, size)
    .map((s) => createMonsterInstance(`${s.templateId}_${s.element}`, star, level));

const srSsr = () => [
  createMonsterInstance("griffon_GRASS", 5, 50),
  createMonsterInstance("dragon_FIRE", 5, 50),
  createMonsterInstance("seraph_WATER", 5, 50),
  createMonsterInstance("nemesis_ELECTRIC", 5, 50),
  createMonsterInstance("griffon_WATER", 5, 50),
];

// テストと同じ条件に揃えること。特に9階は星6装備でも「サブ2個」で測っている
// (サブ4個で測ると別物の強さになり、数字が食い違う)
/** バランス報告にあった現実的な混成編成(通常1体+SR/SSR4体、レベルにもばらつき) */
const mixed = () => [
  createMonsterInstance("fairy_GRASS", 5, 50),
  createMonsterInstance("nemesis_DARK", 5, 50),
  createMonsterInstance("seraph_DARK", 5, 45),
  createMonsterInstance("griffon_GRASS", 5, 50),
  createMonsterInstance("seraph_LIGHT", 5, 35),
];

const SCENARIOS: Scenario[] = [
  { label: "1階 星3Lv30 + 星1装備 (4体)", floor: 1, party: () => generic(3, 30, 4), eqStar: 1, subs: 2, trials: 120, target: ">0.6" },
  { label: "1階 星3Lv30 装備なし (4体)", floor: 1, party: () => generic(3, 30, 4), eqStar: null, subs: 0, trials: 60, target: "<0.2" },
  { label: "9階 SR/SSR + 星6装備sub2 (5体)", floor: 9, party: srSsr, eqStar: 6, subs: 2, trials: 100, target: ">0.5" },
  { label: "9階 通常星5Lv50 + 星5装備sub2 (5体)", floor: 9, party: () => generic(5, 50, 5), eqStar: 5, subs: 2, trials: 100, target: "<0.15" },
  { label: "10階 SR/SSR + 星6装備sub2 (5体)", floor: 10, party: srSsr, eqStar: 6, subs: 2, trials: 100, target: "<0.35" },
  { label: "10階 SR/SSR + 星6装備sub4 (5体)", floor: 10, party: srSsr, eqStar: 6, subs: 4, trials: 100, target: ">0.75【上限を決める制約】" },
  { label: "10階 通常星5Lv50 + 星6装備sub4 (5体)", floor: 10, party: () => generic(5, 50, 5), eqStar: 6, subs: 4, trials: 100, target: "<0.5" },
  { label: "10階 混成(通常1+SR/SSR4) + 星6装備sub2", floor: 10, party: mixed, eqStar: 6, subs: 2, trials: 100, target: "<0.2" },
];

function winRate(sc: Scenario, powerScale: number): number {
  const floor = withScale(EQUIPMENT_DUNGEON_FLOORS[sc.floor - 1], powerScale);
  let wins = 0;
  for (let i = 0; i < sc.trials; i++) {
    const rng = mulberry32(500 + i);
    const state = createInitialState();
    const party = sc.party();
    state.monsters = party;
    if (sc.eqStar !== null) for (const m of party) equipFull(state, m.id, sc.eqStar, sc.subs, rng);
    const setup = setupDungeonBattle(party, floor, state.equipment);
    if (new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng }).run().winner === "PLAYER") wins += 1;
  }
  return wins / sc.trials;
}

/** その階層に実際に設定されている powerScale */
function currentScale(floor: number): number {
  return EQUIPMENT_DUNGEON_FLOORS[floor - 1].powerScale;
}

function main(): void {
  const sweeps: Record<number, number[]> = {
    1: [0.28],
    9: [1.7, 1.8, 1.9],
    10: [2.35, 2.45, 2.50, 2.55, 2.60],
  };

  for (const sc of SCENARIOS) {
    const now = currentScale(sc.floor);
    const row = sweeps[sc.floor]
      .map((scale) => `${scale.toFixed(2)}:${(winRate(sc, scale) * 100).toFixed(0)}%`)
      .join("  ");
    console.log(`${sc.label}`);
    console.log(`  目標 ${sc.target} / 現在の powerScale=${now.toFixed(3)} → ${(winRate(sc, now) * 100).toFixed(0)}%`);
    console.log(`  振ってみた結果: ${row}`);
    console.log("");
  }
}

main();
