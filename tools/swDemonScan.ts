/**
 * **sw方式で消えた有利属性×1.5のぶん、魔人ダンジョンの敵倍率を測り直す。**
 *
 *   npx tsx tools/swDemonScan.ts --runs 120
 *
 * sw方式は有利属性の倍率(×1.5)を使わず、クリ率+15ptに置き換える。
 * 魔人は階ごとに属性が回るので、有利属性を持ち込む攻略が**×1.5の前提で**成立していた。
 * そこが消えた結果、魔人12階の共通高レアが STRONG 80%→9% に落ちている。
 * 敵ATK倍率を下げて、どこで元の帯に戻るかを見る。
 *
 * 本番データは1つも変えない。
 */
import { resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { PVE_DUNGEON_TEAMS, type PressureResult, type PressureTeam, measurePressure } from "./dungeonPressure.js";
import { FINAL_CANDIDATE } from "./finalCandidate.js";
import type { GearGrade } from "./battleLab/types.js";

const argv = process.argv.slice(2);
const arg = (n: string, f: string): string => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : f;
};
const RUNS = Number(arg("runs", "120"));
const SEED = 20260913;

const patchOf = (hp: number, def: number, atk: number) =>
  (defs: MonsterDefinition[]): MonsterDefinition[] => defs.map((d) => ({
    ...d,
    stats: {
      ...d.stats,
      hp: Math.max(1, Math.round(d.stats.hp * hp)),
      def: Math.max(1, Math.round(d.stats.def * def)),
      atk: Math.max(1, Math.round(d.stats.atk * atk)),
    },
  }));

const TEAMS: [string, PressureTeam][] = ["実戦通常", "実戦毒", "実戦耐久", "共通高レア",
  "魔人攻略高レア(水フェニックス)", "防御無視"]
  .map((n) => [n, PVE_DUNGEON_TEAMS[n]] as [string, PressureTeam])
  .filter(([, t]) => t);

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function show(label: string, r: PressureResult): void {
  console.log(
    `  ${label.padEnd(30)} 勝率${pct(r.rate).padStart(5)}  手数 中${String(r.actions).padStart(3)}/平${r.actionsMean.toFixed(0).padStart(3)}  ` +
    `全滅${pct(r.wipeRate).padStart(4)}  時間切${pct(r.timeoutRate).padStart(4)}  敵残${pct1(r.enemyHpLeft).padStart(6)}  味方残${pct1(r.allyHpLeft).padStart(6)}`,
  );
}

console.log(`sw方式での魔人ダンジョン敵倍率スキャン / ${RUNS}戦 / seed${SEED}`);
console.log(`確定候補(案A)を載せたまま、ATK倍率だけを動かす。HP×0.80 DEF×0.30 は据え置き`);

for (const atk of [2.20, 2.00, 1.80, 1.60, 1.40]) {
  const patch = patchOf(0.80, 0.30, atk);
  for (const gear of ["STRONG", "TYPICAL"] as const) {
    console.log(`\n── 12階 / ATK×${atk.toFixed(2)} / ${gear} ──`);
    for (const [name, team] of TEAMS) {
      resetBalanceFlags();
      setBalanceFlags(FINAL_CANDIDATE);
      show(name, measurePressure(team, 12, gear as GearGrade, RUNS, "DEMON", SEED, patch));
      resetBalanceFlags();
    }
  }
}
