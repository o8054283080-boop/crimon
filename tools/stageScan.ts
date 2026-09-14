/**
 * **本編ステージが新しい防御式で壊れていないかを測る。**
 *
 *   npx tsx tools/stageScan.ts --runs 40
 *
 * 本編は3ウェーブを**HPを持ち越して**通す。1戦ずつの勝率では見えないので、
 * 「ステージを最後まで通せたか」で測る。
 *
 * 新式は序盤のDEF帯(100〜300)で軽減がほとんど効かない
 * (`npx tsx tools/defenseCurveCompare.ts`)。本編は序盤ほどDEFが低いので、
 * **1〜3章がいちばん危ない。**旧式と並べて、どこから差がつくかを見る。
 */
import { BattleEngine } from "../src/battle/engine.js";
import { EQUIP_SLOTS, EquipStar, generateEquipment } from "../src/core/equipment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import { STAGES } from "../src/data/stages.js";
import { extractSurvivors, setupWaveBattle } from "../src/game/stageRunner.js";
import { PlayerState, addEquipment, createInitialState, equipToMonster } from "../src/game/playerState.js";
import { LEGACY_SPEC } from "./finalCandidate.js";

const argv = process.argv.slice(2);
const arg = (n: string, f: string): string => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : f;
};
const RUNS = Number(arg("runs", "40"));
const SEED = 20260913;

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

/**
 * 章ごとの「その辺りで遊んでいる人」の育成段階。
 * **章が進むほど育っている**前提に置かないと、後半章が全滅して読めなくなる。
 */
const CHAPTER_STAGE: Record<number, { star: 3 | 4 | 5 | 6; level: number; eqStar: EquipStar | null; subs: number }> = {
  1: { star: 3, level: 10, eqStar: null, subs: 0 },
  2: { star: 3, level: 20, eqStar: 1, subs: 1 },
  3: { star: 3, level: 30, eqStar: 2, subs: 2 },
  4: { star: 4, level: 35, eqStar: 3, subs: 2 },
  5: { star: 4, level: 40, eqStar: 4, subs: 3 },
  6: { star: 5, level: 45, eqStar: 4, subs: 3 },
  7: { star: 5, level: 50, eqStar: 5, subs: 4 },
  8: { star: 6, level: 55, eqStar: 5, subs: 4 },
};

function buildState(chapter: number, rng: () => number): PlayerState {
  const s = CHAPTER_STAGE[chapter];
  const state = createInitialState();
  const party = ["knight_WATER", "wolf_ELECTRIC", "imp_FIRE", "fairy_GRASS"]
    .map((id) => createMonsterInstance(id, s.star, s.level));
  state.monsters = party;
  if (s.eqStar !== null) {
    for (const m of party) {
      for (const slot of EQUIP_SLOTS) {
        const eq = generateEquipment(slot, s.eqStar, rng, s.subs);
        addEquipment(state, eq);
        equipToMonster(state, m.id, eq.id);
      }
    }
  }
  return state;
}

/** 3ウェーブをHP持ち越しで通せた割合と、1回あたりの手数 */
function clearRate(chapter: number, stageNumber: number): { rate: number; turns: number } {
  const stage = STAGES.find((s) => s.chapter === chapter && s.stageNumber === stageNumber);
  if (!stage) throw new Error(`ステージが無い: ${chapter}-${stageNumber}`);
  let cleared = 0;
  let turnSum = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const rng = mulberry32(SEED + i * 7919);
    const state = buildState(chapter, rng);
    let alive = state.monsters;
    let carry: Map<string, number> | null = null;
    let ok = true;
    for (const wave of stage.waves) {
      if (alive.length === 0) { ok = false; break; }
      const setup = setupWaveBattle(alive, carry, wave, state.equipment);
      const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng, initialPlayerHp: setup.initialPlayerHp });
      const result = engine.run();
      turnSum += result.turns;
      if (result.winner !== "PLAYER") { ok = false; break; }
      const survivors = extractSurvivors(engine, alive);
      alive = survivors.instances;
      carry = survivors.carryHp;
    }
    if (ok) cleared += 1;
  }
  return { rate: cleared / RUNS, turns: turnSum / RUNS };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

function withFlags<T>(flags: Parameters<typeof setBalanceFlags>[0] | null, fn: () => T): T {
  resetBalanceFlags();
  if (flags) setBalanceFlags(flags);
  const out = fn();
  resetBalanceFlags();
  return out;
}

console.log(`本編ステージの踏破率 / ${RUNS}回 / seed${SEED}`);
console.log(`3ウェーブをHP持ち越しで通せた割合。左が**いまの本番(新式)**、右が入れ替える前(旧式)\n`);
console.log("  章-面   新式 踏破/手数     旧式 踏破/手数    育成段階");
console.log("  " + "─".repeat(74));

for (const chapter of [1, 2, 3, 4, 5, 6, 7, 8]) {
  for (const stageNumber of [1, 5]) {
    const now = withFlags(null, () => clearRate(chapter, stageNumber));
    const old = withFlags(LEGACY_SPEC, () => clearRate(chapter, stageNumber));
    const s = CHAPTER_STAGE[chapter];
    const tag = s.eqStar === null ? `星${s.star}Lv${s.level} 装備なし` : `星${s.star}Lv${s.level} ★${s.eqStar}装備`;
    console.log(
      `  ${chapter}-${stageNumber}     ${pct(now.rate).padStart(5)} / ${now.turns.toFixed(0).padStart(3)}手`
      + `     ${pct(old.rate).padStart(5)} / ${old.turns.toFixed(0).padStart(3)}手     ${tag}`,
    );
  }
}
