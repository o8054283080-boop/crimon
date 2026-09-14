/**
 * **最終候補を全部まとめて当てた状態**で、塔・魔人・魔獣・目覚の深域を測る。
 *
 *   npx tsx tools/finalBalanceContent.ts --runs 200
 *   npx tsx tools/finalBalanceContent.ts --only tower --runs 200
 *
 * 本番データは1つも変えない。`balanceFlags` に仮適用し、敵の倍率はこのファイルの中で
 * 掛けてから戦わせる。測定のたびに `resetBalanceFlags()` で戻す。
 *
 * ## 編成は `dungeonPressure.ts` の既存定義をそのまま使う
 *
 * 実戦通常・実戦毒・実戦耐久・共通高レア・攻略高レア・防御無視は
 * **すでに `PVE_DUNGEON_TEAMS` / `AWAKENING_PVE_TEAMS` に定義されている。**
 * ここで別に組み直すと、同じ名前で中身の違う編成を測ることになる。
 */
import { balanceFlags, resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { AWAKENING_DEPTH_FLOORS } from "../src/data/awakeningDepths.js";
import {
  AWAKENING_PVE_TEAMS, PVE_DUNGEON_TEAMS, type PressureResult, type PressureTeam,
  measurePressure, measurePressureOnFloor,
} from "./dungeonPressure.js";
import { runMany } from "./battleLab/run.js";
import { findScenario } from "./battleLab/scenarios/index.js";
import type { GearGrade } from "./battleLab/types.js";
import { FINAL_CANDIDATE } from "./finalCandidate.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const RUNS = Number(arg("runs", "200"));
const ONLY = arg("only", "all");
const SEED = 20260913;

/** 旧仕様 = いまの本番。防御式・タイプ・AP・防御低下、すべて現行 */
const LEGACY = { defenseFormula: "legacy" as const, unifyDefModifiers: false };

/**
 * 敵側の倍率。**依頼で指定された値**で、こちらが測って出した候補ではない。
 * 塔は指定が無いので素のまま測る。
 */
const ENEMY_SCALE = {
  DEMON: { hp: 0.80, def: 0.30, atk: 2.20 },
  BEAST: { hp: 0.80, def: 0.30, atk: 2.00 },
  AWAKENING: { hp: 0.80, def: 0.30, atk: 2.20 },
};

function scaleEnemies(s: { hp: number; def: number; atk: number }) {
  return (defs: MonsterDefinition[]): MonsterDefinition[] => defs.map((d) => ({
    ...d,
    stats: {
      ...d.stats,
      hp: Math.max(1, Math.round(d.stats.hp * s.hp)),
      def: Math.max(1, Math.round(d.stats.def * s.def)),
      atk: Math.max(1, Math.round(d.stats.atk * s.atk)),
    },
  }));
}

interface Row { win: number; enemyLeft: number; allyLeft: number; turnsMedian: number; turnsMean: number; wipe: number; timeout: number }

const toRow = (r: PressureResult): Row => ({
  win: r.rate, enemyLeft: r.enemyHpLeft, allyLeft: r.allyHpLeft,
  turnsMedian: r.actions, turnsMean: r.actionsMean, wipe: r.wipeRate, timeout: r.timeoutRate,
});

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function printPair(label: string, legacy: Row, candidate: Row): void {
  const dWin = (candidate.win - legacy.win) * 100;
  const dTurn = legacy.turnsMedian > 0 ? (candidate.turnsMedian / legacy.turnsMedian - 1) * 100 : 0;
  const flag = Math.abs(dWin) >= 10 || Math.abs(dTurn) >= 20 ? " ⚠要調整" : "";
  for (const [key, r] of [["旧仕様", legacy], ["最終候補", candidate]] as [string, Row][]) {
    console.log(
      `  ${label.padEnd(26)} ${key.padEnd(8)} 勝率${pct(r.win).padStart(5)}  敵残${pct1(r.enemyLeft).padStart(6)}  味方残${pct1(r.allyLeft).padStart(6)}  ` +
      `手数 中${String(r.turnsMedian).padStart(3)}/平${r.turnsMean.toFixed(0).padStart(3)}  全滅${pct(r.wipe).padStart(4)}  時間切${pct(r.timeout).padStart(4)}`,
    );
  }
  console.log(`  ${" ".repeat(26)} 差       勝率 ${dWin >= 0 ? "+" : ""}${dWin.toFixed(0)}pt / 手数 ${dTurn >= 0 ? "+" : ""}${dTurn.toFixed(0)}%${flag}\n`);
}

function under<T>(flags: object, fn: () => T): T {
  resetBalanceFlags();
  setBalanceFlags(flags as never);
  const out = fn();
  resetBalanceFlags();
  return out;
}

function header(title: string): void {
  console.log(`\n${"═".repeat(112)}\n■ ${title}\n${"═".repeat(112)}`);
}

// ───────────────────────────── 試練の塔 ─────────────────────────────

function towerRow(scenarioId: string, runs: number, gear: GearGrade): Row {
  const scenario = findScenario(scenarioId);
  if (!scenario) throw new Error(`シナリオがない: ${scenarioId}`);
  const t = runMany(scenario, SEED, runs, undefined, gear);
  let wins = 0, eLeft = 0, aLeft = 0, wipe = 0, timeout = 0;
  const turns: number[] = [];
  for (const x of t) {
    if (x.winner === "PLAYER") wins += 1;
    turns.push(x.turns);
    const es = x.units.filter((u) => u.team === "ENEMY");
    const as = x.units.filter((u) => u.team === "PLAYER");
    const eMax = es.reduce((s, u) => s + u.maxHp, 0);
    const aMax = as.reduce((s, u) => s + u.maxHp, 0);
    eLeft += eMax > 0 ? es.reduce((s, u) => s + Math.max(0, u.hpLeft), 0) / eMax : 0;
    aLeft += aMax > 0 ? as.reduce((s, u) => s + Math.max(0, u.hpLeft), 0) / aMax : 0;
    if (as.every((u) => !u.alive)) wipe += 1;
    else if (x.winner !== "PLAYER") timeout += 1;
  }
  turns.sort((a, b) => a - b);
  const n = t.length;
  return {
    win: wins / n, enemyLeft: eLeft / n, allyLeft: aLeft / n,
    turnsMedian: turns[Math.floor(n / 2)], turnsMean: turns.reduce((a, b) => a + b, 0) / n,
    wipe: wipe / n, timeout: timeout / n,
  };
}

function runTower(): void {
  header(`19-20. 試練の塔 / ${RUNS}戦・装備STRONG・敵は素のまま(敵倍率の指定なし)・階固有ギミック有効`);
  for (const floor of [60, 70, 80, 90, 99, 100]) {
    const id = `tower-f${floor}`;
    printPair(`${floor}階`, under(LEGACY, () => towerRow(id, RUNS, "STRONG")), under(FINAL_CANDIDATE, () => towerRow(id, RUNS, "STRONG")));
  }
}

// ─────────────────── 魔人・魔獣のダンジョン ───────────────────

/** その階で使う編成。`kinds` が付いているものは、その種類の時だけ出す */
function teamsFor(kind: "DEMON" | "BEAST"): [string, PressureTeam][] {
  return Object.entries(PVE_DUNGEON_TEAMS).filter(([name, t]) =>
    (!t.kinds || t.kinds.includes(kind)) && name !== "旧毒圧力");
}

function runDungeon(kind: "DEMON" | "BEAST"): void {
  const scale = ENEMY_SCALE[kind];
  const patch = scaleEnemies(scale);
  const jp = kind === "DEMON" ? "魔人" : "魔獣";
  header(`${kind === "DEMON" ? "21" : "22"}. ${jp}のダンジョン / ${RUNS}戦・装備STRONG・敵 HP×${scale.hp} DEF×${scale.def} ATK×${scale.atk}`);
  for (const floor of [10, 11, 12]) {
    console.log(`  ── ${floor}階 ──`);
    for (const [name, team] of teamsFor(kind)) {
      printPair(name,
        under(LEGACY, () => toRow(measurePressure(team, floor, "STRONG", RUNS, kind, SEED, patch))),
        under(FINAL_CANDIDATE, () => toRow(measurePressure(team, floor, "STRONG", RUNS, kind, SEED, patch))));
    }
    if (floor === 12) {
      console.log(`  ── 12階 / 装備TYPICAL(項目27) ──`);
      for (const [name, team] of teamsFor(kind)) {
        printPair(`${name}(TYPICAL)`,
          under(LEGACY, () => toRow(measurePressure(team, floor, "TYPICAL", RUNS, kind, SEED, patch))),
          under(FINAL_CANDIDATE, () => toRow(measurePressure(team, floor, "TYPICAL", RUNS, kind, SEED, patch))));
      }
    }
  }
}

function runAwakening(): void {
  const scale = ENEMY_SCALE.AWAKENING;
  const patch = scaleEnemies(scale);
  header(`23. 目覚の深域 / ${RUNS}戦・装備STRONG・敵 HP×${scale.hp} DEF×${scale.def} ATK×${scale.atk}`);
  const teams = Object.entries(AWAKENING_PVE_TEAMS);
  for (const floor of [8, 9, 10]) {
    console.log(`  ── ${floor}階 ──`);
    const def = AWAKENING_DEPTH_FLOORS[floor - 1];
    for (const [name, team] of teams) {
      printPair(name,
        under(LEGACY, () => toRow(measurePressureOnFloor(team, def, "STRONG", RUNS, SEED, patch))),
        under(FINAL_CANDIDATE, () => toRow(measurePressureOnFloor(team, def, "STRONG", RUNS, SEED, patch))));
    }
    if (floor === 10) {
      console.log(`  ── 10階 / 装備TYPICAL(項目27) ──`);
      for (const [name, team] of teams) {
        printPair(`${name}(TYPICAL)`,
          under(LEGACY, () => toRow(measurePressureOnFloor(team, def, "TYPICAL", RUNS, SEED, patch))),
          under(FINAL_CANDIDATE, () => toRow(measurePressureOnFloor(team, def, "TYPICAL", RUNS, SEED, patch))));
      }
    }
  }
}

// ───────── 24. 防御低下75%が強すぎないか ─────────

function runDefDownImpact(): void {
  header("24. 防御低下75%の効き — 防御低下を持つ編成と、持たない編成で手数を比べる");
  console.log("  **同じ最終候補のまま、編成側の防御低下の有無だけを変える。**");
  console.log("  「あり」= 共通高レア(ドラゴン・ネメシスが防御低下を持つ) / 「なし」= 防御無視編成\n");
  const withDown = PVE_DUNGEON_TEAMS["共通高レア"];
  const withoutDown = PVE_DUNGEON_TEAMS["防御無視"];
  const cases: [string, () => PressureResult, () => PressureResult][] = [
    ["魔人12階",
      () => measurePressure(withDown, 12, "STRONG", RUNS, "DEMON", SEED, scaleEnemies(ENEMY_SCALE.DEMON)),
      () => measurePressure(withoutDown, 12, "STRONG", RUNS, "DEMON", SEED, scaleEnemies(ENEMY_SCALE.DEMON))],
    ["魔獣12階",
      () => measurePressure(withDown, 12, "STRONG", RUNS, "BEAST", SEED, scaleEnemies(ENEMY_SCALE.BEAST)),
      () => measurePressure(withoutDown, 12, "STRONG", RUNS, "BEAST", SEED, scaleEnemies(ENEMY_SCALE.BEAST))],
    ["目覚10階",
      () => measurePressureOnFloor(AWAKENING_PVE_TEAMS["共通高レア"] ?? withDown, AWAKENING_DEPTH_FLOORS[9], "STRONG", RUNS, SEED, scaleEnemies(ENEMY_SCALE.AWAKENING)),
      () => measurePressureOnFloor(AWAKENING_PVE_TEAMS["防御無視"] ?? withoutDown, AWAKENING_DEPTH_FLOORS[9], "STRONG", RUNS, SEED, scaleEnemies(ENEMY_SCALE.AWAKENING))],
  ];
  for (const [label, on, off] of cases) {
    const a = under(FINAL_CANDIDATE, () => toRow(on()));
    const b = under(FINAL_CANDIDATE, () => toRow(off()));
    console.log(`  ${label}`);
    console.log(`    防御低下あり  勝率${pct(a.win).padStart(5)}  敵残${pct1(a.enemyLeft).padStart(6)}  手数 中${String(a.turnsMedian).padStart(3)}`);
    console.log(`    防御低下なし  勝率${pct(b.win).padStart(5)}  敵残${pct1(b.enemyLeft).padStart(6)}  手数 中${String(b.turnsMedian).padStart(3)}`);
    console.log(`    → 防御低下を入れると手数が ${(b.turnsMedian > 0 ? a.turnsMedian / b.turnsMedian * 100 : 100).toFixed(0)}% (100未満なら速い)\n`);
  }
}

// ───────────────────────────── 実行 ─────────────────────────────

console.log(`最終総合検証 / ${RUNS}戦`);
console.log(`最終候補: ${JSON.stringify(FINAL_CANDIDATE)}`);
console.log(`編成は tools/dungeonPressure.ts の PVE_DUNGEON_TEAMS / AWAKENING_PVE_TEAMS をそのまま使用`);

if (ONLY === "all" || ONLY === "tower") runTower();
if (ONLY === "all" || ONLY === "demon") runDungeon("DEMON");
if (ONLY === "all" || ONLY === "beast") runDungeon("BEAST");
if (ONLY === "all" || ONLY === "awakening") runAwakening();
if (ONLY === "all" || ONLY === "defdown") runDefDownImpact();

resetBalanceFlags();
console.log(`\n終了時のフラグ: ${JSON.stringify(balanceFlags)}`);
