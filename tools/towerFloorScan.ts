/**
 * **塔の1階ぶんだけ**、敵の HP / DEF / ATK 倍率を振って勝率と手数を測る。
 *
 *   npx tsx tools/towerFloorScan.ts --floor 90 --runs 200
 *
 * 条件は固定:
 *   ・編成 = 塔の基準編成(TOWER60.allies)・装備STRONG
 *   ・防御式 = 新式 係数1.2 ＋ 最終候補(タイプ転生・能力付与・防御低下75%)
 *   ・seed = 20260913 から200戦・旧仕様と同じ種
 *   ・`trialTowerFloor` が入っているので**階固有ギミックは動く**
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
const FLOOR = Number(arg("floor", "90"));
const RUNS = Number(arg("runs", "200"));
const GEAR = arg("gear", "STRONG") as GearGrade;
const SEED = 20260913;

/** `--scales "0.70,0.25,2.50 0.65,0.25,2.50"` の形で任意の組を渡せる */
const SCALES: [number, number, number][] = arg("scales", "")
  ? arg("scales", "").split(" ").map((s) => s.split(",").map(Number) as [number, number, number])
  : [[0.70, 0.25, 2.50], [0.68, 0.25, 2.50], [0.67, 0.25, 2.50], [0.65, 0.25, 2.50], [0.65, 0.25, 2.45], [0.60, 0.25, 2.50]];

function scaled(id: string, hp: number, def: number, atk: number): Scenario {
  const b = findScenario(id);
  if (!b) throw new Error(`シナリオがない: ${id}`);
  return {
    ...b,
    enemies: b.enemies.map((e) => ({
      ...e,
      stats: e.stats
        ? {
          ...e.stats,
          hp: Math.max(1, Math.round((e.stats.hp ?? 1) * hp)),
          def: Math.max(1, Math.round((e.stats.def ?? 1) * def)),
          atk: Math.max(1, Math.round((e.stats.atk ?? 1) * atk)),
        }
        : e.stats,
    })),
  } as Scenario;
}

interface Row { win: number; turnsMedian: number; turnsMean: number; wipe: number; timeout: number; enemyLeft: number; allyLeft: number }

function row(s: Scenario): Row {
  const t = runMany(s, SEED, RUNS, undefined, GEAR);
  let wins = 0, wipe = 0, timeout = 0, eLeft = 0, aLeft = 0;
  const turns: number[] = [];
  for (const x of t) {
    if (x.winner === "PLAYER") wins += 1;
    turns.push(x.turns);
    const es = x.units.filter((u) => u.team === "ENEMY");
    const as = x.units.filter((u) => u.team === "PLAYER");
    const eMax = es.reduce((a, u) => a + u.maxHp, 0);
    const aMax = as.reduce((a, u) => a + u.maxHp, 0);
    eLeft += eMax > 0 ? es.reduce((a, u) => a + Math.max(0, u.hpLeft), 0) / eMax : 0;
    aLeft += aMax > 0 ? as.reduce((a, u) => a + Math.max(0, u.hpLeft), 0) / aMax : 0;
    if (as.every((u) => !u.alive)) wipe += 1;
    else if (x.winner !== "PLAYER") timeout += 1;
  }
  turns.sort((a, b) => a - b);
  const n = t.length;
  return {
    win: wins / n, turnsMedian: turns[Math.floor(n / 2)], turnsMean: turns.reduce((a, b) => a + b, 0) / n,
    wipe: wipe / n, timeout: timeout / n, enemyLeft: eLeft / n, allyLeft: aLeft / n,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function show(label: string, r: Row, target?: [number, number]): void {
  const hit = target && r.win >= target[0] && r.win <= target[1] ? "  ← 目標帯" : "";
  console.log(
    `  ${label.padEnd(30)} 勝率${pct(r.win).padStart(5)}  手数 中${String(r.turnsMedian).padStart(3)}/平${r.turnsMean.toFixed(0).padStart(3)}  ` +
    `全滅${pct(r.wipe).padStart(4)}  時間切${pct(r.timeout).padStart(4)}  敵残${pct1(r.enemyLeft).padStart(6)}  味方残${pct1(r.allyLeft).padStart(6)}${hit}`,
  );
}

const id = `tower-f${FLOOR}`;
console.log(`塔${FLOOR}階 / ${RUNS}戦・装備${GEAR}・seed${SEED}・階固有ギミック有効`);
console.log(`新式は係数1.2＋最終候補(体力/防御タイプ・AP DEF=5・防御低下75%)\n`);

resetBalanceFlags(); setBalanceFlags(LEGACY_SPEC);
show("旧仕様・敵は素のまま(基準)", row(findScenario(id)!));
resetBalanceFlags();
console.log("");

for (const [hp, def, atk] of SCALES) {
  resetBalanceFlags(); setBalanceFlags(FINAL_CANDIDATE);
  show(`新式 HP×${hp.toFixed(2)} DEF×${def.toFixed(2)} ATK×${atk.toFixed(2)}`, row(scaled(id, hp, def, atk)), [0.30, 0.40]);
  resetBalanceFlags();
}
resetBalanceFlags();
console.log("\n(終了時のフラグは現行仕様へ戻してある)");
