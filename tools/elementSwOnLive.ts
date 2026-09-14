/**
 * **いまの本番仕様のまま、属性のsw方式だけを入れた場合**を測る。
 *
 *   npx tsx tools/elementSwOnLive.ts --runs 200
 *
 * これまでの属性の測定は、新防御式などの最終候補を当てた状態で行っていた。
 * sw方式だけを先に本番へ入れるなら、**現行の本番仕様の上で**測らないと
 * 実際に起きることが分からない。
 */
import { resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { AWAKENING_DEPTH_FLOORS } from "../src/data/awakeningDepths.js";
import { AWAKENING_PVE_TEAMS, PVE_DUNGEON_TEAMS, measurePressure, measurePressureOnFloor } from "./dungeonPressure.js";
import { runMany } from "./battleLab/run.js";
import { findScenario } from "./battleLab/scenarios/index.js";
import type { GearGrade } from "./battleLab/types.js";

const argv = process.argv.slice(2);
const arg = (n: string, f: string): string => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : f;
};
const RUNS = Number(arg("runs", "200"));
const SEED = 20260913;

/** 敵は**本番のまま**。倍率は一切掛けない */
const NOPATCH = undefined as unknown as ((d: MonsterDefinition[]) => MonsterDefinition[]) | undefined;

interface Case { label: string; run: (gear: GearGrade) => { rate: number; actions: number } }

function tower(id: string): Case["run"] {
  return (gear) => {
    const t = runMany(findScenario(id)!, SEED, RUNS, undefined, gear);
    const turns = t.map((x) => x.turns).sort((a, b) => a - b);
    return { rate: t.filter((x) => x.winner === "PLAYER").length / t.length, actions: turns[Math.floor(t.length / 2)] };
  };
}
const dungeon = (team: string, floor: number, kind: "DEMON" | "BEAST"): Case["run"] =>
  (gear) => measurePressure(PVE_DUNGEON_TEAMS[team], floor, gear, RUNS, kind, SEED, NOPATCH);
const awake = (team: string, floor: number): Case["run"] =>
  (gear) => measurePressureOnFloor(AWAKENING_PVE_TEAMS[team], AWAKENING_DEPTH_FLOORS[floor - 1], gear, RUNS, SEED, NOPATCH);

const CASES: Case[] = [
  { label: "魔人10F 実戦通常", run: dungeon("実戦通常", 10, "DEMON") },
  { label: "魔人10F 共通高レア", run: dungeon("共通高レア", 10, "DEMON") },
  { label: "魔人12F 共通高レア", run: dungeon("共通高レア", 12, "DEMON") },
  { label: "魔人12F 実戦毒", run: dungeon("実戦毒", 12, "DEMON") },
  { label: "魔獣10F 共通高レア", run: dungeon("共通高レア", 10, "BEAST") },
  { label: "魔獣12F 共通高レア", run: dungeon("共通高レア", 12, "BEAST") },
  { label: "目覚8F 集中型", run: awake("集中型", 8) },
  { label: "目覚10F 共通高レア", run: awake("共通高レア", 10) },
  { label: "塔60F", run: tower("tower-f60") },
  { label: "塔70F", run: tower("tower-f70") },
  { label: "塔80F", run: tower("tower-f80") },
  { label: "塔90F", run: tower("tower-f90") },
  { label: "塔99F", run: tower("tower-f99") },
  { label: "塔100F", run: tower("tower-f100") },
];

console.log(`本番仕様のまま、属性のsw方式だけを入れた場合 / ${RUNS}戦・seed${SEED}`);
console.log(`敵の倍率は一切掛けていない(本番のデータそのまま)\n`);

for (const gear of ["STRONG", "TYPICAL", "MID"] as GearGrade[]) {
  console.log(`═══ ${gear} ═══`);
  console.log("  対象                        現行         sw方式        差");
  for (const c of CASES) {
    resetBalanceFlags();
    const before = c.run(gear);
    resetBalanceFlags();
    setBalanceFlags({ elementMode: "sw" });
    const after = c.run(gear);
    resetBalanceFlags();
    const dWin = (after.rate - before.rate) * 100;
    const dTurn = before.actions > 0 ? (after.actions / before.actions - 1) * 100 : 0;
    const flag = Math.abs(dWin) >= 10 || Math.abs(dTurn) >= 20 ? " ⚠" : "";
    console.log(
      `  ${c.label.padEnd(26)} ${`${(before.rate * 100).toFixed(0)}%`.padStart(4)}/${String(before.actions).padStart(3)}  ` +
      `${`${(after.rate * 100).toFixed(0)}%`.padStart(4)}/${String(after.actions).padStart(3)}  ` +
      `${dWin >= 0 ? "+" : ""}${dWin.toFixed(0)}pt / ${dTurn >= 0 ? "+" : ""}${dTurn.toFixed(0)}%${flag}`,
    );
  }
  console.log("");
}
resetBalanceFlags();
console.log("(終了時のフラグは現行仕様へ戻してある)");
