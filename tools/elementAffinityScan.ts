/**
 * 属性相性の**不利倍率**を振って、各コンテンツへの影響を測る。
 *
 *   npx tsx tools/elementAffinityScan.ts --runs 200
 *
 * 現行は 有利×1.5 / 不利×0.5。サマナーズウォーは不利側が「かすり」で
 * 実効0.7倍前後なので、**現行のほうが不利のペナルティが重い。**
 *
 * ここを緩めると両陣営に効く。プレイヤーが不利属性で殴れるようになる一方、
 * **敵が不利属性で殴ってくる時のダメージも上がる。**どちらが勝つかは測らないと分からない。
 */
import { resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { AWAKENING_DEPTH_FLOORS } from "../src/data/awakeningDepths.js";
import { AWAKENING_PVE_TEAMS, PVE_DUNGEON_TEAMS, measurePressure, measurePressureOnFloor } from "./dungeonPressure.js";
import { runMany } from "./battleLab/run.js";
import { findScenario } from "./battleLab/scenarios/index.js";
import type { GearGrade, Scenario } from "./battleLab/types.js";
import { FINAL_CANDIDATE } from "./finalCandidate.js";

const argv = process.argv.slice(2);
const arg = (n: string, f: string): string => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : f;
};
const RUNS = Number(arg("runs", "200"));
const GEAR = arg("gear", "TYPICAL") as GearGrade;
const SEED = 20260913;

/**
 * 比べる方式。
 *   legacy 0.5  いまの本番(有利×1.5 / 不利×0.5)
 *   legacy 0.7  倍率だけサマナーズウォー寄りへ緩めた版
 *   sw          本物の方式(クリ率±15pt・不利は50%でかすり・かすりは弱体不可)
 */
const MODES: [string, { elementMode?: "legacy" | "sw"; elementMultiplierOverride?: { disadvantage: number } }][] = [
  ["現行(不利×0.5)", {}],
  ["倍率だけ0.7", { elementMultiplierOverride: { disadvantage: 0.7 } }],
  ["sw方式", { elementMode: "sw" }],
];

const DEMON = { hp: 0.80, def: 0.30, atk: 2.20 };
const BEAST = { hp: 0.80, def: 0.30, atk: 2.00 };
const AWAKE = { hp: 0.80, def: 0.30, atk: 2.20 };
const patchOf = (s: { hp: number; def: number; atk: number }) => (defs: MonsterDefinition[]): MonsterDefinition[] =>
  defs.map((d) => ({ ...d, stats: {
    ...d.stats,
    hp: Math.max(1, Math.round(d.stats.hp * s.hp)),
    def: Math.max(1, Math.round(d.stats.def * s.def)),
    atk: Math.max(1, Math.round(d.stats.atk * s.atk)),
  } }));

function towerRow(id: string, hp: number, def: number, atk: number) {
  const b = findScenario(id)!;
  const sc = {
    ...b,
    enemies: b.enemies.map((e) => ({ ...e, stats: e.stats ? {
      ...e.stats,
      hp: Math.max(1, Math.round((e.stats.hp ?? 1) * hp)),
      def: Math.max(1, Math.round((e.stats.def ?? 1) * def)),
      atk: Math.max(1, Math.round((e.stats.atk ?? 1) * atk)),
    } : e.stats })),
  } as Scenario;
  const t = runMany(sc, SEED, RUNS, undefined, GEAR);
  const turns = t.map((x) => x.turns).sort((a, b) => a - b);
  return { rate: t.filter((x) => x.winner === "PLAYER").length / t.length, actions: turns[Math.floor(t.length / 2)] };
}

interface Case { label: string; run: () => { rate: number; actions: number } }
const CASES: Case[] = [
  // **環の外の階を重点的に見る。**魔獣10F(闇)・12F(光)は有利を取りにくい
  { label: "魔獣12F(光) 共通高レア", run: () => measurePressure(PVE_DUNGEON_TEAMS["共通高レア"], 12, GEAR, RUNS, "BEAST", SEED, patchOf(BEAST)) },
  { label: "魔獣12F(光) 実戦通常", run: () => measurePressure(PVE_DUNGEON_TEAMS["実戦通常"], 12, GEAR, RUNS, "BEAST", SEED, patchOf(BEAST)) },
  { label: "魔獣10F(闇) 共通高レア", run: () => measurePressure(PVE_DUNGEON_TEAMS["共通高レア"], 10, GEAR, RUNS, "BEAST", SEED, patchOf(BEAST)) },
  { label: "魔人12F(草) 共通高レア", run: () => measurePressure(PVE_DUNGEON_TEAMS["共通高レア"], 12, GEAR, RUNS, "DEMON", SEED, patchOf(DEMON)) },
  { label: "魔人11F(電) 実戦耐久", run: () => measurePressure(PVE_DUNGEON_TEAMS["実戦耐久"], 11, GEAR, RUNS, "DEMON", SEED, patchOf(DEMON)) },
  { label: "魔人11F(電) 共通高レア", run: () => measurePressure(PVE_DUNGEON_TEAMS["共通高レア"], 11, GEAR, RUNS, "DEMON", SEED, patchOf(DEMON)) },
  { label: "目覚10F 共通高レア", run: () => measurePressureOnFloor(AWAKENING_PVE_TEAMS["共通高レア"], AWAKENING_DEPTH_FLOORS[9], GEAR, RUNS, SEED, patchOf(AWAKE)) },
  { label: "塔90F 基準編成", run: () => towerRow("tower-f90", 0.70, 0.25, 2.50) },
  { label: "塔100F 基準編成", run: () => towerRow("tower-f100", 1.00, 0.30, 2.50) },
];

console.log(`属性の不利倍率を振る / ${RUNS}戦・装備${GEAR}・seed${SEED}`);
console.log(`有利は×1.5で据え置き。プレイヤー側は採用候補で固定\n`);
console.log(`  対象                      ${MODES.map(([l]) => l.padStart(16)).join("")}`);
for (const c of CASES) {
  const cells = MODES.map(([, flags]) => {
    resetBalanceFlags();
    setBalanceFlags({ ...FINAL_CANDIDATE, ...flags });
    const r = c.run();
    resetBalanceFlags();
    return `${`${(r.rate * 100).toFixed(0)}%`}/${r.actions}`.padStart(16);
  });
  console.log(`  ${c.label.padEnd(26)}${cells.join("")}`);
}
resetBalanceFlags();
console.log("\n(終了時のフラグは現行仕様へ戻してある)");
