/**
 * 本編100階「クリモアーク」を測り、**Battle Lab V3 の基準値と突き合わせる。**
 *
 *   npx tsx tools/battleLab/tower100/measureLive.ts --runs 1000
 *
 * ## なぜ突き合わせるのか
 *
 * V3は仮案の盤面(測定用テストが分身の生成もスキル4も外から手で回していた)で
 * 測った値で、本編は `src/battle/engine.ts` の100階処理が同じことをする。
 * **同じ挙動を別の場所で書いた**ので、移した時にどこかで食い違っていても
 * テストは通ってしまう。勝率が基準から大きくずれていたら移植に処理差がある。
 *
 * ## 分かっている仕様差(V3の測定盤面と本編で意図的に違うところ)
 *
 * どれも「Battle Labでは表現しきれず近似していた」ところで、
 * **本編の方が依頼どおり**。差が出たら本編の値を基準にする。
 *
 *   1. S1の「弱体2個以上で+30%」。V3は `debuffDamageBonus`(1個につき+15%・上限30%)で
 *      近似していたので、**弱体1個でも+15%乗っていた。**本編は2個以上でだけ+30%
 *   2. 攻撃型分身の「模造処刑」で倒した時のゲージ。V3は味方全体へ+20%だったが、
 *      本編は**本体だけ**
 *   3. サポート型分身の支援。V3は味方全体(=もう1体の分身にも)へ配っていたが、
 *      本編は**本体だけ**
 *   4. サポート型「模造加速」のCT短縮。V3は味方全体の全スキルを縮めたが、
 *      本編は**本体のスキル3とスキル4だけ**
 *   5. 攻撃型「模造連撃」の「HP50%以下で+30%」。V3は2発目だけに乗せていたが、
 *      本編は技として2発とも乗る
 */
import { BattleEngine } from "../../../src/battle/engine.js";
import { findTowerFloor } from "../../../src/data/trialTower.js";
import { buildDungeonEnemyTeam } from "../../../src/game/dungeonRunner.js";
import { buildAlly } from "../build.js";
import { mulberry32 } from "../rng.js";
import type { AllySpec, GearGrade } from "../types.js";

/** Battle Lab V3 の実測(各1000戦)。移植前の基準値 */
const V3_BASELINE: Record<string, Record<string, number>> = {
  TYPICAL: { 分身処理型: 0.023, ボス集中型: 0.077, 耐久処理型: 0 },
  STRONG: { 分身処理型: 0.091, ボス集中型: 0.267, 耐久処理型: 0 },
  FINISHED: { 分身処理型: 0.267, ボス集中型: 0.477, 耐久処理型: 0.009 },
};

const SAFE: AllySpec[] = [
  { templateId: "fenrir", element: "ELECTRIC", preset: "MAX_ATTACKER" },
  { templateId: "mushroon", element: "GRASS", preset: "MAX_DEBUFFER" },
  { templateId: "basilisk", element: "LIGHT", preset: "MAX_TANK" },
  { templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { templateId: "chronos", element: "ELECTRIC", preset: "MAX_SUPPORT" },
];
const RUSH: AllySpec[] = [
  { templateId: "fenrir", element: "ELECTRIC", preset: "MAX_ATTACKER" },
  { templateId: "dragon", element: "DARK", preset: "MAX_ATTACKER" },
  { templateId: "mushroon", element: "GRASS", preset: "MAX_DEBUFFER" },
  { templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { templateId: "chronos", element: "ELECTRIC", preset: "MAX_SUPPORT" },
];
const SUSTAIN: AllySpec[] = [
  { templateId: "valkyria", element: "LIGHT", preset: "MAX_TANK" },
  { templateId: "seraph", element: "LIGHT", preset: "MAX_HEALER" },
  { templateId: "basilisk", element: "LIGHT", preset: "MAX_TANK" },
  { templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { templateId: "mushroon", element: "GRASS", preset: "MAX_DEBUFFER" },
];

/** 攻略の方針。誰を先に狙うかだけが違う */
type Mode = "CLONES" | "BOSS" | "SUSTAIN";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUNS = Number(arg("runs", "1000"));
const SEED = Number(arg("seed", "610000"));
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

function runOne(specs: AllySpec[], seed: number, mode: Mode, grade: GearGrade) {
  const rng = mulberry32(seed);
  const players = specs.map((spec) => buildAlly(spec, rng, grade));
  const enemies = buildDungeonEnemyTeam(findTowerFloor(100)!);
  const engine = new BattleEngine(players, enemies, { rng, maxTurns: 350, trialTowerFloor: 100 });
  const units = engine.getUnits();
  const boss = units.find((unit) => unit.instanceId === "E1")!;
  const clones = units.filter((unit) => unit.team === "ENEMY" && unit !== boss);

  /*
   * 狙う順。**同じ相手を指し直すと解除になる**ので、今と違う時だけ指す
   * (`setFocusTarget` の作法。ここを守らないと1手おきに集中が外れる)
   */
  let focused: string | null = null;
  const focus = (id: string | null): void => {
    if (focused === id) return;
    focused = id;
    engine.setFocusTarget(id);
  };

  let turns = 0;
  while (!engine.getWinner() && turns < 350) {
    if (mode === "BOSS") focus("E1");
    else focus(clones.find((clone) => clone.alive)?.instanceId ?? "E1");
    const actor = engine.getNextActor();
    if (!actor) break;
    engine.resolveTurn(actor);
    turns += 1;
  }

  /*
   * **一度でも生まれた席だけを数える。**眠ったままの席は攻撃型の器を着ているので、
   * そのまま数えると攻撃型が過半を占めているように見える(実際に一度そう出た)。
   * 生まれた席は最大HPが本体から作り直されるので、器のHP(1)と区別できる
   */
  const cloneRoles = clones.filter((clone) => clone.maxHp > 1).map((clone) => clone.def.templateId);
  return {
    winner: engine.getWinner() ?? "DRAW",
    turns,
    survivors: units.filter((unit) => unit.team === "PLAYER" && unit.alive).length,
    bossHpRatio: Math.max(0, boss.currentHp / boss.maxHp),
    attack: cloneRoles.filter((id) => id === "crimoark_attack").length,
    support: cloneRoles.filter((id) => id === "crimoark_support").length,
    debuff: cloneRoles.filter((id) => id === "crimoark_debuff").length,
  };
}

function measure(name: string, specs: AllySpec[], mode: Mode, grade: GearGrade, seedBase: number) {
  process.stderr.write(`測定中: ${grade} ${name} ${RUNS}戦\n`);
  const rows = Array.from({ length: RUNS }, (_, i) => runOne(specs, seedBase + i, mode, grade));
  const wins = rows.filter((row) => row.winner === "PLAYER").length;
  return {
    name,
    grade,
    winRate: wins / RUNS,
    lossRate: rows.filter((row) => row.winner === "ENEMY").length / RUNS,
    drawRate: rows.filter((row) => row.winner === "DRAW").length / RUNS,
    avgTurns: mean(rows.map((row) => row.turns)),
    avgSurvivors: mean(rows.map((row) => row.survivors)),
    avgBossHpRatio: mean(rows.map((row) => row.bossHpRatio)),
    cloneRoles: {
      ATTACK: rows.reduce((n, row) => n + row.attack, 0),
      SUPPORT: rows.reduce((n, row) => n + row.support, 0),
      DEBUFF: rows.reduce((n, row) => n + row.debuff, 0),
    },
  };
}

const grades: GearGrade[] = ["TYPICAL", "STRONG", "FINISHED"];
const rows = grades.flatMap((grade, i) => [
  measure("分身処理型", SAFE, "CLONES", grade, SEED + i * 30_000),
  measure("ボス集中型", RUSH, "BOSS", grade, SEED + 10_000 + i * 30_000),
  measure("耐久処理型", SUSTAIN, "SUSTAIN", grade, SEED + 20_000 + i * 30_000),
]);

console.log("TOWER100_LIVE_RESULTS=" + JSON.stringify(rows));
console.log("\n|装備|攻略型|勝率|敗北|引分|平均手数|平均生存|ボス残HP|V3基準|差|");
console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const row of rows) {
  const base = V3_BASELINE[row.grade]?.[row.name];
  const diff = base === undefined ? "—" : `${(row.winRate - base) * 100 >= 0 ? "+" : ""}${((row.winRate - base) * 100).toFixed(1)}pt`;
  console.log(`|${row.grade}|${row.name}|${pct(row.winRate)}|${pct(row.lossRate)}|${pct(row.drawRate)}|`
    + `${row.avgTurns.toFixed(1)}|${row.avgSurvivors.toFixed(2)}|${pct(row.avgBossHpRatio)}|`
    + `${base === undefined ? "—" : pct(base)}|${diff}|`);
}

const totals = rows.reduce((acc, row) => ({
  ATTACK: acc.ATTACK + row.cloneRoles.ATTACK,
  SUPPORT: acc.SUPPORT + row.cloneRoles.SUPPORT,
  DEBUFF: acc.DEBUFF + row.cloneRoles.DEBUFF,
}), { ATTACK: 0, SUPPORT: 0, DEBUFF: 0 });
const all = totals.ATTACK + totals.SUPPORT + totals.DEBUFF;
console.log(`\n分身の型の出方(一度でも生まれた席・${all}体): 攻撃 ${pct(totals.ATTACK / all)} / `
  + `サポート ${pct(totals.SUPPORT / all)} / デバフ ${pct(totals.DEBUFF / all)}`);
