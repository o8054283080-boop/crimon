/**
 * **防御計算を変えると、プレイヤーのどの型が得をするか**を測る。
 *
 *   npx tsx tools/defenseFormulaArchetype.ts --runs 200
 *
 * 旧式(方式E)の軽減は攻める側の攻撃力との比で決まるので、
 * **相手の攻撃力が上がるほど防御の価値が落ちる。**
 * 新式は攻撃力を見ないので、防御の価値が相手によらず一定になる。
 * この違いがHP型・DEF型・ATK型のどれを利するのかは、
 * 実効HP(何発耐えられるか)で見ないと分からない。
 *
 * 後半は実測。同じ敵の前へ1体ずつ立たせて、**倒れるまでの手数**を数える。
 */
import { setBalanceFlags } from "../src/core/balanceFlags.js";
import { BattleEngine } from "../src/battle/engine.js";
import { applyDefense } from "../src/battle/damageFormula.js";
import { findDungeonFloor } from "../src/data/equipmentDungeon.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { GearGrade } from "./battleLab/types.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const RUNS = Number(arg("runs", "200"));
const GEAR = arg("gear", "TYPICAL") as GearGrade;

/** 比べる型。**同じ種族で揃える**(種族差が混ざると型の差が読めない) */
const ARCHETYPES: { label: string; preset: string; note: string }[] = [
  { label: "ATK型", preset: "MAX_ATTACKER", note: "会心4セット・攻撃と速度へ全振り" },
  { label: "HP型", preset: "MAX_HEALER", note: "体力4セット・HP%を3枠" },
  { label: "DEF型", preset: "MAX_TANK", note: "守護4セット・DEF%を2枠" },
  { label: "速度型", preset: "MAX_SPEED", note: "疾風4セット・速度へ全振り" },
];

console.log(`型ごとの影響 / 装備${GEAR} / ★6 Lv60 のナイト(水)で揃える\n`);

// ── 1. 素のステータスと、実効HP(何発耐えられるか) ──
console.log("■ 実効HP = HP ÷ 1発あたりに通る割合。**大きいほど長く立っていられる**");
console.log("   敵の攻撃力ごとに出す。旧式は相手の攻撃力で軽減が変わるため、1つの数字では表せない\n");
console.log("  型        HP       DEF     SPD     敵ATK 5,000 旧/新      敵ATK 10,000 旧/新     敵ATK 20,000 旧/新");

const built = ARCHETYPES.map((a) => {
  const rng = mulberry32(20260913);
  const ally = buildAlly({ templateId: "knight", element: "WATER", preset: a.preset } as never, rng, GEAR);
  return { ...a, stats: ally.stats };
});

for (const a of built) {
  const cells: string[] = [];
  for (const atk of [5_000, 10_000, 20_000]) {
    const base = 100_000;
    setBalanceFlags({ defenseFormula: "legacy", unifyDefModifiers: false });
    const oldThrough = applyDefense(base, atk, a.stats.def).afterDefense / base;
    setBalanceFlags({ defenseFormula: "sw", unifyDefModifiers: false });
    const newThrough = applyDefense(base, atk, a.stats.def).afterDefense / base;
    const oldEff = a.stats.hp / oldThrough;
    const newEff = a.stats.hp / newThrough;
    cells.push(`${Math.round(oldEff / 1000).toLocaleString().padStart(5)}k /${Math.round(newEff / 1000).toLocaleString().padStart(5)}k (${(newEff / oldEff).toFixed(2)}倍)`);
  }
  console.log(`  ${a.label.padEnd(8)} ${a.stats.hp.toLocaleString().padStart(7)} ${a.stats.def.toLocaleString().padStart(6)} ${String(a.stats.spd).padStart(5)}   ${cells.join("  ")}`);
}
setBalanceFlags({ defenseFormula: "legacy", unifyDefModifiers: false });

// ── 2. 実測: 同じ敵の前に1体で立たせ、倒れるまでの手数を数える ──
console.log("\n■ 実測: 魔人12階の3体を相手に、**1体だけで立たせて倒れるまでの手数**");
console.log("   勝てる編成ではない。**どれだけ長く立っていられるか**だけを見る\n");
console.log("  型        旧式(手数)   新式(手数)   伸び");

const floor = findDungeonFloor(12, "DEMON")!;
for (const a of ARCHETYPES) {
  const survive = (formula: "legacy" | "sw"): number => {
    setBalanceFlags({ defenseFormula: formula, unifyDefModifiers: false });
    let total = 0;
    for (let i = 0; i < RUNS; i += 1) {
      const rng = mulberry32(20260913 + i * 7919);
      const ally = buildAlly({ templateId: "knight", element: "WATER", preset: a.preset } as never, rng, GEAR);
      const res = new BattleEngine([ally], buildDungeonEnemyTeam(floor), { rng, maxTurns: 300 }).run();
      total += res.turnsTaken;
    }
    return total / RUNS;
  };
  const o = survive("legacy");
  const n = survive("sw");
  console.log(`  ${a.label.padEnd(8)} ${o.toFixed(1).padStart(10)} ${n.toFixed(1).padStart(12)}   ${(n / o).toFixed(2)}倍`);
}
setBalanceFlags({ defenseFormula: "legacy", unifyDefModifiers: false });
console.log("\n(終了時のフラグは旧式へ戻してある)");
