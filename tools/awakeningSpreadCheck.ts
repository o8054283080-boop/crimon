/**
 * **目覚の深域で「分散型」だけが苦戦するのは案Aのせいか**を切り分ける。
 *
 *   npx tsx tools/awakeningSpreadCheck.ts --runs 200
 *
 * 目覚の深域が問うのは**手の分散**。5階から乗る「才能適応」は、
 * 同じ相手から連続で受けるほどその相手からのダメージが効かなくなる仕掛けで、
 * **攻撃役を分けた編成ほど有利**になるはずの設計。
 *
 * ところが10階TYPICALで 集中型100%/41手 に対し **分散型63%/166手**と逆転している。
 * 旧仕様（いまの本番）でも同じなら案Aとは無関係の別件。案Aで悪化しているなら案Aの話。
 *
 * 本番データは1つも変えない。
 */
import { resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { AWAKENING_DEPTH_FLOORS } from "../src/data/awakeningDepths.js";
import {
  AWAKENING_PVE_TEAMS, type PressureResult, type PressureTeam, measurePressureOnFloor,
} from "./dungeonPressure.js";
import { FINAL_CANDIDATE, LEGACY_SPEC } from "./finalCandidate.js";
import type { GearGrade } from "./battleLab/types.js";

const argv = process.argv.slice(2);
const arg = (n: string, f: string): string => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : f;
};
const RUNS = Number(arg("runs", "200"));
const SEED = 20260913;
const SCALE = { hp: 0.80, def: 0.30, atk: 2.20 };

const scaled = (defs: MonsterDefinition[]): MonsterDefinition[] => defs.map((d) => ({
  ...d,
  stats: {
    ...d.stats,
    hp: Math.max(1, Math.round(d.stats.hp * SCALE.hp)),
    def: Math.max(1, Math.round(d.stats.def * SCALE.def)),
    atk: Math.max(1, Math.round(d.stats.atk * SCALE.atk)),
  },
}));
const bare = (defs: MonsterDefinition[]): MonsterDefinition[] => defs;

const TEAMS: [string, PressureTeam][] = ["集中型", "分散型", "耐久型"]
  .map((n) => [n, AWAKENING_PVE_TEAMS[n]] as [string, PressureTeam]);

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function show(label: string, r: PressureResult): void {
  console.log(
    `  ${label.padEnd(22)} 勝率${pct(r.rate).padStart(5)}  手数 中${String(r.actions).padStart(3)}/平${r.actionsMean.toFixed(0).padStart(3)}  ` +
    `全滅${pct(r.wipeRate).padStart(4)}  時間切${pct(r.timeoutRate).padStart(4)}  敵残${pct1(r.enemyHpLeft).padStart(6)}  味方残${pct1(r.allyHpLeft).padStart(6)}`,
  );
}

function withFlags<T>(flags: Parameters<typeof setBalanceFlags>[0], fn: () => T): T {
  resetBalanceFlags();
  setBalanceFlags(flags);
  const out = fn();
  resetBalanceFlags();
  return out;
}

console.log(`目覚の深域10階「分散型」の切り分け / ${RUNS}戦 / seed${SEED}`);
const floor = AWAKENING_DEPTH_FLOORS[9];

for (const gear of ["STRONG", "TYPICAL"] as const) {
  console.log(`\n── 10階 / ${gear} / 旧仕様(いまの本番)・敵倍率なし ──`);
  for (const [n, t] of TEAMS) {
    show(n, withFlags(LEGACY_SPEC, () => measurePressureOnFloor(t, floor, gear as GearGrade, RUNS, SEED, bare)));
  }
  console.log(`── 10階 / ${gear} / 案A・敵 HP×${SCALE.hp} DEF×${SCALE.def} ATK×${SCALE.atk} ──`);
  for (const [n, t] of TEAMS) {
    show(n, withFlags(FINAL_CANDIDATE, () => measurePressureOnFloor(t, floor, gear as GearGrade, RUNS, SEED, scaled)));
  }
}
