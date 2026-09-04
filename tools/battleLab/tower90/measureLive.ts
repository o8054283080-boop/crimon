/**
 * 本編90階を測り、**Battle Lab V7 の基準値と突き合わせる。**
 *
 *   npx tsx tools/battleLab/tower90/measureLive.ts --runs 1000
 *
 * ## なぜ突き合わせるのか
 *
 * V7は仮案の盤面(`hook` が外から狂化を張り替える)で測った値で、本編は
 * `src/battle/engine.ts` の実装が同じことをする。**同じ挙動を別の場所で書いた**ので、
 * 移した時にどこかで食い違っていても、テストは通ってしまう。
 * 勝率が基準から±3〜5ポイント以上ずれていたら、移植の途中に処理差がある。
 *
 * ## 分かっている仕様差(V7の盤面と本編で意図的に違うところ)
 *
 * 戦鼓晶S3「血戦共鳴」。V7の盤面は `ALL_ALLIES` へ ゲージ+30% と CT-1 を配っていたが、
 * 依頼の正式仕様は **全員ゲージ+30% / ボスだけ追加ゲージ+15% / ボスだけCT-1**。
 * お供4体のCTが回らなくなる代わりに、ボスの手番が少し早く来る。
 * ここは**本編の方が正しい**ので、差が出たらV7の値ではなく本編の値を基準にする。
 *
 * 実測(TYPICAL装備・各1000戦)では **27.8% / 34.9% / 28.9%**。
 * V7から +2.5 / +2.9 / +3.6pt で、お供のCTが止まったぶんが上回った形。
 */
import { runMany } from "../run.js";
import { TOWER90_RUSH_FOCUS, TOWER90_SAFE_FOCUS } from "../scenarios/tower90v1.js";
import { TOWER90_LIVE_RUSH, TOWER90_LIVE_SAFE } from "../scenarios/tower90Live.js";

/** V7実測(TYPICAL装備・各1000戦)。移植前の基準値 */
const V7_BASELINE: Record<string, { win: number; loss: number; draw: number }> = {
  "安全: 狂牙獣→戦鼓晶→ボス": { win: 0.253, loss: 0.743, draw: 0.004 },
  "安全: 戦鼓晶→狂牙獣→ボス": { win: 0.320, loss: 0.609, draw: 0.071 },
  "安全: 狂牙獣→ボス": { win: 0.253, loss: 0.743, draw: 0.004 },
};

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUNS = Number(arg("runs", "1000"));
const SEED = Number(arg("seed", "20311190"));
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

const rows = [
  ...TOWER90_SAFE_FOCUS.map((focus, i) => ({ type: "安全処理", focus, scenario: TOWER90_LIVE_SAFE, seed: SEED + i * 10_000 })),
  ...TOWER90_RUSH_FOCUS.map((focus, i) => ({ type: "ボス速攻", focus, scenario: TOWER90_LIVE_RUSH, seed: SEED + 100_000 + i * 10_000 })),
].map(({ type, focus, scenario, seed }) => {
  process.stderr.write(`測定中: ${focus.name} ${RUNS}戦\n`);
  const tallies = runMany(scenario, seed, RUNS, focus.order, "TYPICAL");
  const wins = tallies.filter((t) => t.winner === "PLAYER").length;
  const losses = tallies.filter((t) => t.winner === "ENEMY").length;
  const draws = tallies.filter((t) => t.winner === "DRAW").length;
  return {
    type,
    focus: focus.name,
    winRate: wins / tallies.length,
    lossRate: losses / tallies.length,
    drawRate: draws / tallies.length,
    avgTurns: mean(tallies.map((t) => t.turns)),
    avgSurvivors: mean(tallies.map((t) => t.survivors)),
  };
});

console.log("TOWER90_LIVE_RESULTS=" + JSON.stringify(rows));
console.log("\n|型|攻略順|勝率|敗北|引分|平均手数|平均生存|V7基準|差|");
console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|");
for (const r of rows) {
  const base = V7_BASELINE[r.focus];
  const diff = base ? `${((r.winRate - base.win) * 100 >= 0 ? "+" : "")}${((r.winRate - base.win) * 100).toFixed(1)}pt` : "—";
  console.log(`|${r.type}|${r.focus}|${pct(r.winRate)}|${pct(r.lossRate)}|${pct(r.drawRate)}|${r.avgTurns.toFixed(1)}|${r.avgSurvivors.toFixed(2)}|${base ? pct(base.win) : "—"}|${diff}|`);
}

const outliers = rows.filter((r) => {
  const base = V7_BASELINE[r.focus];
  return base !== undefined && Math.abs(r.winRate - base.win) >= 0.05;
});
console.log(outliers.length === 0
  ? "\n±5ポイント以上ずれた攻略順は無し。移植で処理が落ちてはいない"
  : `\n**±5ポイント以上ずれた攻略順**: ${outliers.map((r) => r.focus).join(" / ")}`);
