/**
 * **係数1.2は固定したまま**、敵側の倍率を振って旧仕様に近い点を探す。
 *
 *   npx tsx tools/finalBalanceEnemyScan.ts --runs 200
 *   npx tsx tools/finalBalanceEnemyScan.ts --only tower --runs 200
 *
 * 係数を下げずに手数と勝率を戻すなら、動かせるのは敵の HP / DEF / ATK しかない。
 * **手数を決めているのは敵のDEF**(前の測定で、敵DEFを1にすると
 * 魔人10階の手数が269→149手と旧仕様の136手近くまで戻ることを確認済み)。
 *
 * 塔は依頼で敵倍率の指定が無かったため素のまま測っていたが、
 * **手数が4.5倍まで伸びたのはそのせい**なので、ここでは塔にも当てて探る。
 */
import { resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { AWAKENING_DEPTH_FLOORS } from "../src/data/awakeningDepths.js";
import { AWAKENING_PVE_TEAMS, PVE_DUNGEON_TEAMS, type PressureResult, measurePressure, measurePressureOnFloor } from "./dungeonPressure.js";
import { runMany } from "./battleLab/run.js";
import { findScenario } from "./battleLab/scenarios/index.js";
import type { GearGrade, Scenario } from "./battleLab/types.js";
import { FINAL_CANDIDATE } from "./finalCandidate.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const RUNS = Number(arg("runs", "200"));
const ONLY = arg("only", "all");
const GEAR = arg("gear", "STRONG") as GearGrade;
const SEED = 20260913;

const LEGACY = { defenseFormula: "legacy" as const, unifyDefModifiers: false };

interface Scale { hp: number; def: number; atk: number }
const patchOf = (s: Scale) => (defs: MonsterDefinition[]): MonsterDefinition[] => defs.map((d) => ({
  ...d,
  stats: {
    ...d.stats,
    hp: Math.max(1, Math.round(d.stats.hp * s.hp)),
    def: Math.max(1, Math.round(d.stats.def * s.def)),
    atk: Math.max(1, Math.round(d.stats.atk * s.atk)),
  },
}));

interface Row { win: number; enemyLeft: number; turns: number; wipe: number; timeout: number }
const toRow = (r: PressureResult): Row => ({ win: r.rate, enemyLeft: r.enemyHpLeft, turns: r.actions, wipe: r.wipeRate, timeout: r.timeoutRate });

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function line(label: string, r: Row, base?: Row): void {
  const near = base
    ? (Math.abs(r.win - base.win) <= 0.10 && Math.abs(r.turns / Math.max(1, base.turns) - 1) <= 0.25 ? "  ← 旧仕様に近い" : "")
    : "";
  console.log(
    `    ${label.padEnd(30)} 勝率${pct(r.win).padStart(5)}  敵残${pct1(r.enemyLeft).padStart(6)}  手数${String(r.turns).padStart(4)}  ` +
    `全滅${pct(r.wipe).padStart(4)}  時間切${pct(r.timeout).padStart(4)}${near}`,
  );
}

function under<T>(flags: object, fn: () => T): T {
  resetBalanceFlags();
  setBalanceFlags(flags as never);
  const out = fn();
  resetBalanceFlags();
  return out;
}

function header(t: string): void { console.log(`\n${"═".repeat(100)}\n■ ${t}\n${"═".repeat(100)}`); }

// ───────────────────── 塔: 敵倍率を掛けたシナリオを作る ─────────────────────

/** シナリオの敵ステータスへ倍率を掛けた複製を返す。**本編データには触らない** */
function scaledScenario(id: string, s: Scale): Scenario {
  const base = findScenario(id);
  if (!base) throw new Error(`シナリオがない: ${id}`);
  return {
    ...base,
    enemies: base.enemies.map((e) => ({
      ...e,
      stats: e.stats
        ? {
          ...e.stats,
          hp: Math.max(1, Math.round((e.stats.hp ?? 1) * s.hp)),
          def: Math.max(1, Math.round((e.stats.def ?? 1) * s.def)),
          atk: Math.max(1, Math.round((e.stats.atk ?? 1) * s.atk)),
        }
        : e.stats,
    })),
  } as Scenario;
}

function towerRow(scenario: Scenario, runs: number): Row {
  const t = runMany(scenario, SEED, runs, undefined, GEAR);
  let wins = 0, eLeft = 0, wipe = 0, timeout = 0;
  const turns: number[] = [];
  for (const x of t) {
    if (x.winner === "PLAYER") wins += 1;
    turns.push(x.turns);
    const es = x.units.filter((u) => u.team === "ENEMY");
    const as = x.units.filter((u) => u.team === "PLAYER");
    const eMax = es.reduce((s, u) => s + u.maxHp, 0);
    eLeft += eMax > 0 ? es.reduce((s, u) => s + Math.max(0, u.hpLeft), 0) / eMax : 0;
    if (as.every((u) => !u.alive)) wipe += 1;
    else if (x.winner !== "PLAYER") timeout += 1;
  }
  turns.sort((a, b) => a - b);
  const n = t.length;
  return { win: wins / n, enemyLeft: eLeft / n, turns: turns[Math.floor(n / 2)], wipe: wipe / n, timeout: timeout / n };
}

/** 塔で振る敵倍率。**DEFだけを動かす**(HP/ATKを触ると階の設計そのものが変わる) */
const TOWER_SCALES: [string, Scale][] = [
  ["素のまま", { hp: 1, def: 1, atk: 1 }],
  ["DEF×0.70", { hp: 1, def: 0.70, atk: 1 }],
  ["DEF×0.50", { hp: 1, def: 0.50, atk: 1 }],
  ["DEF×0.35", { hp: 1, def: 0.35, atk: 1 }],
  ["DEF×0.25", { hp: 1, def: 0.25, atk: 1 }],
];

function runTower(): void {
  header(`試練の塔 / 係数1.2固定・敵DEF倍率を振る / ${RUNS}戦・装備${GEAR}`);
  for (const floor of [60, 70, 80, 90, 99, 100]) {
    const id = `tower-f${floor}`;
    const base = under(LEGACY, () => towerRow(findScenario(id)!, RUNS));
    console.log(`  ── ${floor}階 ──`);
    line("旧仕様(基準)", base);
    for (const [label, s] of TOWER_SCALES) {
      line(`新式1.2 ${label}`, under(FINAL_CANDIDATE, () => towerRow(scaledScenario(id, s), RUNS)), base);
    }
    console.log("");
  }
}

// ───────────────── 魔人・魔獣・目覚: 敵DEF倍率を振る ─────────────────

/** 依頼の指定は DEF×0.30。**効きすぎていた**ので、その上下を振る */
const DUNGEON_SCALES: [string, number][] = [
  ["DEF×0.30(指定)", 0.30], ["DEF×0.50", 0.50], ["DEF×0.70", 0.70], ["DEF×1.00", 1.00], ["DEF×1.40", 1.40],
];

function runDungeonScan(kind: "DEMON" | "BEAST", floor: number, atk: number): void {
  const jp = kind === "DEMON" ? "魔人" : "魔獣";
  header(`${jp}${floor}階 / 係数1.2固定・敵DEF倍率を振る(HP×0.80 ATK×${atk} は指定のまま) / ${RUNS}戦`);
  for (const teamName of ["実戦通常", "実戦耐久", "共通高レア", "防御無視"]) {
    const team = PVE_DUNGEON_TEAMS[teamName];
    if (!team || (team.kinds && !team.kinds.includes(kind))) continue;
    const base = under(LEGACY, () => toRow(measurePressure(team, floor, GEAR, RUNS, kind, SEED)));
    console.log(`  ── ${teamName} ──`);
    line("旧仕様(基準・敵は素のまま)", base);
    for (const [label, d] of DUNGEON_SCALES) {
      line(`新式1.2 ${label}`,
        under(FINAL_CANDIDATE, () => toRow(measurePressure(team, floor, GEAR, RUNS, kind, SEED, patchOf({ hp: 0.80, def: d, atk })))),
        base);
    }
    console.log("");
  }
}

function runAwakeningScan(floor: number): void {
  header(`目覚の深域${floor}階 / 係数1.2固定・敵DEF倍率を振る(HP×0.80 ATK×2.20 は指定のまま) / ${RUNS}戦`);
  const def = AWAKENING_DEPTH_FLOORS[floor - 1];
  for (const teamName of ["集中型", "分散型", "耐久型", "共通高レア"]) {
    const team = AWAKENING_PVE_TEAMS[teamName];
    if (!team) continue;
    const base = under(LEGACY, () => toRow(measurePressureOnFloor(team, def, GEAR, RUNS, SEED)));
    console.log(`  ── ${teamName} ──`);
    line("旧仕様(基準・敵は素のまま)", base);
    for (const [label, d] of DUNGEON_SCALES) {
      line(`新式1.2 ${label}`,
        under(FINAL_CANDIDATE, () => toRow(measurePressureOnFloor(team, def, GEAR, RUNS, SEED, patchOf({ hp: 0.80, def: d, atk: 2.20 })))),
        base);
    }
    console.log("");
  }
}

// ───────────────────────────── 実行 ─────────────────────────────

console.log(`敵側の倍率スキャン / 係数1.2固定 / ${RUNS}戦 / 装備${GEAR}`);
console.log(`「旧仕様に近い」= 勝率差10pt以内 かつ 手数差25%以内\n`);

if (ONLY === "all" || ONLY === "tower") runTower();
if (ONLY === "all" || ONLY === "demon") runDungeonScan("DEMON", 12, 2.20);
if (ONLY === "all" || ONLY === "beast") runDungeonScan("BEAST", 12, 2.00);
if (ONLY === "all" || ONLY === "awakening") runAwakeningScan(10);

resetBalanceFlags();
console.log("\n(終了時のフラグは現行仕様へ戻してある)");
