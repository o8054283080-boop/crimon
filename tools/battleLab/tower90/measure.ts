import { runMany } from "../run.js";
import type { BattleTally, UnitTally } from "../run.js";
import { TOWER90_RUSH_FOCUS, TOWER90_RUSH_V1, TOWER90_SAFE_FOCUS, TOWER90_SAFE_V1 } from "../scenarios/tower90v1.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUNS = Number(arg("runs", "1000"));
const SEED = Number(arg("seed", "20260990"));
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

interface Row {
  type: "安全処理" | "ボス速攻";
  focus: string;
  wins: number;
  losses: number;
  draws: number;
  avgTurns: number;
  avgSurvivors: number;
  extra: Record<string, number>;
}

const EXTRA_KEYS = [
  "ボス残HP割合",
  "HP70%以下へ到達",
  "HP40%以下へ到達",
  "HP20%以下へ到達",
  "HP40%以下後の全滅",
  "HP20%以下後の全滅",
  "倒したお供の数",
  "お供死亡狂化ATK",
  "お供死亡狂化SPD",
  "ボス行動回数",
  "HP40%以下でのボス行動",
  "HP20%以下でのボス行動",
  "戦鼓晶ATK/SPDバフ使用",
  "戦鼓晶加速使用",
  "狂牙獣による撃破数",
  "裂晶が倒れた手番",
  "戦鼓晶が倒れた手番",
  "狂牙獣が倒れた手番",
  "縛晶が倒れた手番",
  "最終狂化段階",
];

function deathTurnAverage(tallies: BattleTally[], key: string): number {
  const xs = tallies.map((t) => t.extra[key] ?? 0).filter((x) => x > 0);
  return mean(xs);
}

function measure(type: Row["type"], scenario: typeof TOWER90_SAFE_V1, patterns: typeof TOWER90_SAFE_FOCUS, seedBase: number): Row[] {
  return patterns.map((pattern, index) => {
    process.stderr.write(`測定中: ${pattern.name} ${RUNS}戦\n`);
    const tallies = runMany(scenario, seedBase + index * 10_000, RUNS, pattern.order, "TYPICAL");
    const extra: Record<string, number> = {};
    for (const key of EXTRA_KEYS) {
      extra[key] = key.includes("倒れた手番")
        ? deathTurnAverage(tallies, key)
        : mean(tallies.map((t) => t.extra[key] ?? 0));
    }
    return {
      type,
      focus: pattern.name,
      wins: tallies.filter((t) => t.winner === "PLAYER").length,
      losses: tallies.filter((t) => t.winner === "ENEMY").length,
      draws: tallies.filter((t) => t.winner === "DRAW").length,
      avgTurns: mean(tallies.map((t) => t.turns)),
      avgSurvivors: mean(tallies.map((t) => t.survivors)),
      extra,
    };
  });
}

const rows = [
  ...measure("安全処理", TOWER90_SAFE_V1, TOWER90_SAFE_FOCUS, SEED),
  ...measure("ボス速攻", TOWER90_RUSH_V1, TOWER90_RUSH_FOCUS, SEED + 100_000),
];

console.log("TOWER90_V1_RESULTS=" + JSON.stringify(rows));
console.log("\n|型|攻略順|勝率|敗北|引分|平均手数|平均生存|ボス20%到達|40%以下後全滅|平均お供撃破|狂牙獣撃破数|");
console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const r of rows) {
  const n = r.wins + r.losses + r.draws;
  console.log(`|${r.type}|${r.focus}|${pct(r.wins / n)}|${pct(r.losses / n)}|${pct(r.draws / n)}|${r.avgTurns.toFixed(1)}|${r.avgSurvivors.toFixed(2)}|${pct(r.extra["HP20%以下へ到達"])}|${pct(r.extra["HP40%以下後の全滅"])}|${r.extra["倒したお供の数"].toFixed(2)}|${r.extra["狂牙獣による撃破数"].toFixed(2)}|`);
}

const bestSafe = rows.filter((r) => r.type === "安全処理").sort((a, b) => b.wins - a.wins)[0];
const bossRush = rows.find((r) => r.focus === "速攻: ボス集中");
if (bestSafe && bossRush) {
  const safeRate = bestSafe.wins / RUNS;
  const rushRate = bossRush.wins / RUNS;
  console.log(`\n目標: 安全処理25〜35% / ボス速攻15〜20%`);
  console.log(`最良安全処理=${pct(safeRate)} (${bestSafe.focus}) / ボス集中=${pct(rushRate)}`);
}
