/** 装備ダンジョンの戦闘が何ターンで終わるかを実測する(長くなりすぎていないかの確認用) */
import { BattleEngine } from "../src/battle/engine.js";
import { EQUIP_SLOTS, EquipStar, generateEquipment } from "../src/core/equipment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { setupDungeonBattle } from "../src/game/dungeonRunner.js";
import { addEquipment, createInitialState, equipToMonster } from "../src/game/playerState.js";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function measure(floorNum: number, make: () => ReturnType<typeof createMonsterInstance>[], eqStar: EquipStar, subs: number, trials: number) {
  const floor = EQUIPMENT_DUNGEON_FLOORS[floorNum - 1];
  const turns: number[] = [];
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const rng = mulberry32(900 + i);
    const state = createInitialState();
    const party = make();
    state.monsters = party;
    for (const m of party) for (const slot of EQUIP_SLOTS) {
      const eq = generateEquipment({ slot, star: eqStar, subStatCount: subs, rng });
      addEquipment(state, eq); equipToMonster(state, m.id, eq.id);
    }
    const setup = setupDungeonBattle(party, floor, state.equipment);
    const result = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng }).run();
    turns.push(result.turnsTaken);
    if (result.winner === "PLAYER") wins += 1;
  }
  turns.sort((a, b) => a - b);
  const avg = turns.reduce((s, t) => s + t, 0) / turns.length;
  console.log(`${floorNum}階: 平均${avg.toFixed(1)}ターン 中央値${turns[Math.floor(turns.length/2)]} 最長${turns[turns.length-1]} 勝率${(wins/trials*100).toFixed(0)}%`);
}

const generic = (star: 1|2|3|4|5, level: number, size: number) => [
  { templateId: "slime", element: "FIRE" }, { templateId: "wolf", element: "WATER" },
  { templateId: "golem", element: "ELECTRIC" }, { templateId: "fairy", element: "GRASS" },
  { templateId: "slime", element: "WATER" },
].slice(0, size).map((s) => createMonsterInstance(`${s.templateId}_${s.element}`, star, level));

const srSsr = () => [
  createMonsterInstance("griffon_GRASS", 5, 50), createMonsterInstance("dragon_FIRE", 5, 50),
  createMonsterInstance("seraph_WATER", 5, 50), createMonsterInstance("nemesis_ELECTRIC", 5, 50),
  createMonsterInstance("griffon_WATER", 5, 50),
];

measure(1, () => generic(3, 30, 4), 1, 2, 60);
measure(5, () => generic(5, 50, 5), 4, 3, 60);
measure(10, srSsr, 6, 4, 60);
