/**
 * **敵倍率が決まっていない塔の階（60 / 80 / 99）の DEF倍率を決める。**
 *
 *   npx tsx tools/towerLowerScan.ts --runs 120
 *
 * 案Aの防御式（1000/(1000+1.2×DEF)）では、敵のDEFをそのままにすると
 * 手数が旧仕様の3〜4.5倍になる。70/90/100階は倍率が確定しているが、
 * 60/80/99階は未指定のまま残っていた。
 *
 * 旧仕様（いまの本番）の手数を基準に置き、DEF倍率を振ってどこで戻るかを見る。
 * HP・ATKは触らない（この3階は勝率が100%で、壁になっていないため）。
 *
 * 本番データは1つも変えない。
 */
import { resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import { runMany } from "./battleLab/run.js";
import { findScenario } from "./battleLab/scenarios/index.js";
import type { GearGrade, Scenario } from "./battleLab/types.js";
import { FINAL_CANDIDATE, LEGACY_SPEC } from "./finalCandidate.js";

const argv = process.argv.slice(2);
const arg = (n: string, f: string): string => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : f;
};
const RUNS = Number(arg("runs", "120"));
const SEED = 20260913;
const GEAR: GearGrade = "STRONG";
const FLOORS = [60, 80, 99];
const DEF_SCALES = [1.00, 0.50, 0.40, 0.35, 0.30, 0.25, 0.20];

function scaledScenario(id: string, defScale: number): Scenario {
  const b = findScenario(id);
  if (!b) throw new Error(`シナリオがない: ${id}`);
  if (defScale === 1) return b;
  return {
    ...b,
    enemies: b.enemies.map((e) => ({
      ...e,
      stats: e.stats
        ? { ...e.stats, def: Math.max(1, Math.round((e.stats.def ?? 1) * defScale)) }
        : e.stats,
    })),
  } as Scenario;
}

interface Row { win: number; median: number; mean: number; wipe: number; timeout: number; allyLeft: number }

function measure(s: Scenario): Row {
  const t = runMany(s, SEED, RUNS, undefined, GEAR);
  let wins = 0, wipe = 0, timeout = 0, aLeft = 0;
  const turns: number[] = [];
  for (const x of t) {
    if (x.winner === "PLAYER") wins += 1;
    turns.push(x.turns);
    const as = x.units.filter((u) => u.team === "PLAYER");
    const aMax = as.reduce((a, u) => a + u.maxHp, 0);
    aLeft += aMax > 0 ? as.reduce((a, u) => a + Math.max(0, u.hpLeft), 0) / aMax : 0;
    if (as.every((u) => !u.alive)) wipe += 1;
    else if (x.winner !== "PLAYER") timeout += 1;
  }
  turns.sort((a, b) => a - b);
  const n = t.length;
  return {
    win: wins / n, median: turns[Math.floor(n / 2)], mean: turns.reduce((a, b) => a + b, 0) / n,
    wipe: wipe / n, timeout: timeout / n, allyLeft: aLeft / n,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function show(label: string, r: Row): void {
  console.log(
    `  ${label.padEnd(26)} 勝率${pct(r.win).padStart(5)}  手数 中${String(r.median).padStart(3)}/平${r.mean.toFixed(0).padStart(3)}  ` +
    `全滅${pct(r.wipe).padStart(4)}  時間切${pct(r.timeout).padStart(4)}  味方残${pct1(r.allyLeft).padStart(6)}`,
  );
}

function withFlags<T>(flags: Parameters<typeof setBalanceFlags>[0], fn: () => T): T {
  resetBalanceFlags();
  setBalanceFlags(flags);
  const out = fn();
  resetBalanceFlags();
  return out;
}

console.log(`塔60/80/99階のDEF倍率スキャン / ${RUNS}戦 / seed${SEED} / 装備${GEAR}`);
console.log(`案A（防御式1.2・sw方式・タイプ・能力付与）を載せたまま、敵DEFだけを動かす`);

for (const floor of FLOORS) {
  const id = `tower-f${floor}`;
  console.log(`\n════ ${floor}階 ════`);
  show("旧仕様(いまの本番)", withFlags(LEGACY_SPEC, () => measure(scaledScenario(id, 1))));
  for (const d of DEF_SCALES) {
    const tag = d === 1 ? "案A DEF×1.00(素のまま)" : `案A DEF×${d.toFixed(2)}`;
    show(tag, withFlags(FINAL_CANDIDATE, () => measure(scaledScenario(id, d))));
  }
}
