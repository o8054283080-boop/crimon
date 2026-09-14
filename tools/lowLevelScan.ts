/**
 * **序盤〜中盤が新しい防御式で壊れていないかを測る。**
 *
 *   npx tsx tools/lowLevelScan.ts
 *
 * 新式 `1000/(1000+1.2×DEF)` は係数を終盤のDEF(3,000〜6,000)に合わせてある。
 * **序盤のDEFは100〜300しかない**ので、そこでは軽減がほとんど効かない。
 *   ・DEF 100 → 89%が通る (旧式は攻撃力との比なので、釣り合っていれば40%)
 *   ・DEF 3,600 → 19%しか通らない
 * つまり序盤ほど「お互いに素通し」になる。実際どのくらいかを見る。
 *
 * 比べるのは**旧式との差**。装備ダンジョンの1〜10階を、同じ育成段階で両方測る。
 */
import { BattleEngine } from "../src/battle/engine.js";
import { EQUIP_SLOTS, EquipStar, generateEquipment } from "../src/core/equipment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { setupDungeonBattle } from "../src/game/dungeonRunner.js";
import { PlayerState, addEquipment, createInitialState, equipToMonster } from "../src/game/playerState.js";
import { LEGACY_SPEC } from "./finalCandidate.js";

const argv = process.argv.slice(2);
const arg = (n: string, f: string): string => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : f;
};
const RUNS = Number(arg("runs", "120"));

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

/** 星3〜6の育成段階。装備の★と副能力の数で「どのくらい育っているか」を表す */
interface Stage { label: string; star: 3 | 4 | 5 | 6; level: number; eqStar: EquipStar | null; subs: number }
const STAGES: Stage[] = [
  { label: "星3Lv30 + ★1装備", star: 3, level: 30, eqStar: 1, subs: 2 },
  { label: "星4Lv40 + ★3装備", star: 4, level: 40, eqStar: 3, subs: 3 },
  { label: "星5Lv50 + ★5装備", star: 5, level: 50, eqStar: 5, subs: 4 },
  { label: "星6Lv60 + ★6装備", star: 6, level: 60, eqStar: 6, subs: 4 },
];

function buildState(stage: Stage, rng: () => number): PlayerState {
  const state = createInitialState();
  const ids = ["knight_WATER", "wolf_ELECTRIC", "imp_FIRE", "fairy_GRASS"];
  const party = ids.map((id) => createMonsterInstance(id, stage.star, stage.level));
  state.monsters = party;
  if (stage.eqStar !== null) {
    for (const m of party) {
      for (const slot of EQUIP_SLOTS) {
        const eq = generateEquipment(slot, stage.eqStar, rng, stage.subs);
        addEquipment(state, eq);
        equipToMonster(state, m.id, eq.id);
      }
    }
  }
  return state;
}

function winRate(floor: number, stage: Stage, seed: number): { rate: number; turns: number } {
  let wins = 0;
  let turns = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const rng = mulberry32(seed + i * 7919);
    const state = buildState(stage, rng);
    const setup = setupDungeonBattle(state.monsters, EQUIPMENT_DUNGEON_FLOORS[floor - 1], state.equipment);
    const result = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng }).run();
    if (result.winner === "PLAYER") wins += 1;
    turns += result.turns;
  }
  return { rate: wins / RUNS, turns: turns / RUNS };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

function withFlags<T>(flags: Parameters<typeof setBalanceFlags>[0] | null, fn: () => T): T {
  resetBalanceFlags();
  if (flags) setBalanceFlags(flags);
  const out = fn();
  resetBalanceFlags();
  return out;
}

console.log(`装備ダンジョン(通常)の育成段階ごとの勝率 / ${RUNS}戦`);
console.log(`左が**いまの本番(新式)**、右が入れ替える前(旧式)。同じ編成・同じ種で測る\n`);

for (const stage of STAGES) {
  console.log(`── ${stage.label} ──`);
  console.log("  階  新式 勝率/手数      旧式 勝率/手数");
  for (const floor of [1, 3, 5, 7, 9, 10]) {
    const now = withFlags(null, () => winRate(floor, stage, 20260913));
    const old = withFlags(LEGACY_SPEC, () => winRate(floor, stage, 20260913));
    console.log(
      `  ${String(floor).padStart(2)}  ${pct(now.rate).padStart(5)} / ${now.turns.toFixed(0).padStart(3)}手`
      + `      ${pct(old.rate).padStart(5)} / ${old.turns.toFixed(0).padStart(3)}手`,
    );
  }
  console.log("");
}
