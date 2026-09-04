/**
 * 80階「古代聖竜」を、5つの攻略順で測る入口。
 *
 *   npx tsx tools/battleLab/tower80/measure.ts                 # 既定1000戦×5
 *   npx tsx tools/battleLab/tower80/measure.ts --runs 100      # 手早く見る
 *   npx tsx tools/battleLab/tower80/measure.ts --out out.md
 *
 * **本編の80階には1行も触れていない。**あちらは今も従来どおり
 * (`src/data/trialTower.ts` の「80階 免疫」)。
 *
 * ## なぜテストではなくここか
 *
 * 5000戦は数分かかる。CIが毎回それを払う理由は無い
 * (70階で同じことをして、テスト全体を170秒遅くしていた)。
 * 仕様の見張り——お供の実数、剥がし役が本当に剥がせるか——は
 * `tests/tower80V2Lab.test.ts` に残してあり、そちらは一瞬で終わる。
 *
 * ## 勝率だけを見ない
 *
 * この階の芯は「免疫をどう剥がすか」なので、
 * **ボスが免疫を張ったまま何割の手番を過ごしたか**まで見ないと、
 * 勝てた/負けたの理由が読めない。剥がし回数・強化阻害回数・
 * 強化阻害で防いだ免疫の数まで並べる。
 */
import { writeFileSync } from "node:fs";
import { runMany } from "../run.js";
import type { BattleTally } from "../types.js";
import { buildTower80V2, TOWER80_FOCUS_V2, TOWER80_V2, type Tower80Variant } from "../scenarios/tower80v2.js";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const RUNS = Number(arg("runs", "1000"));
const SEED = Number(arg("seed", "20260930"));

const mean = (values: number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

interface Row {
  focus: string;
  runs: number;
  winRate: number;
  lossRate: number;
  drawRate: number;
  avgTurns: number;
  extra: Record<string, number>;
}

/** 1戦あたりに均して見る値 */
const KEYS = [
  "免疫中の行動割合", "強化阻害中の行動割合", "ボスへの剥がし回数", "ボスへの強化阻害回数",
  "免疫再展開の合計", "S3の免疫供給", "強化阻害で防いだ免疫",
  "ボス残HP", "ボス残HP割合", "HP50%未満へ到達", "HP50%未満後の全滅",
  "護晶を倒せた", "護晶が倒れた手番", "破邪獣を倒せた", "破邪獣が倒れた手番", "ボス行動回数",
];

/** 割合として出す列(1戦あたりの平均ではなく%で読む) */
const AS_PERCENT = new Set([
  "免疫中の行動割合", "強化阻害中の行動割合", "ボス残HP割合",
  "HP50%未満へ到達", "HP50%未満後の全滅", "護晶を倒せた", "破邪獣を倒せた",
]);

function measure(scenario = TOWER80_V2, quiet = false): Row[] {
  return TOWER80_FOCUS_V2.map((pattern, index) => {
    if (!quiet) process.stderr.write(`  測定中: ${pattern.name} (${RUNS}戦) …\n`);
    // 攻略順ごとに種をずらす。**同じ種を使い回すと、線の差が乱数の差と混ざる**
    const tallies: BattleTally[] = runMany(scenario, SEED + index * 10_000, RUNS, pattern.order, "TYPICAL");
    const count = (winner: string) => tallies.filter((tally) => tally.winner === winner).length;
    const extra: Record<string, number> = {};
    for (const key of KEYS) {
      const values = tallies.map((tally) => tally.extra[key] ?? 0);
      /*
       * 「何手番目に倒れたか」は**倒せた戦いだけ**で平均する。
       * 倒せなかった戦いの0を混ぜると、倒すのが早いほど数字が小さくなるのか、
       * 倒せていないから小さいのかが読めなくなる
       */
      extra[key] = key.includes("倒れた手番")
        ? mean(values.filter((value) => value > 0))
        : mean(values);
    }
    return {
      focus: pattern.name,
      runs: tallies.length,
      winRate: count("PLAYER") / tallies.length,
      lossRate: count("ENEMY") / tallies.length,
      drawRate: count("DRAW") / tallies.length,
      avgTurns: mean(tallies.map((tally) => tally.turns)),
      extra,
    };
  });
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const num = (value: number): string => Math.round(value).toLocaleString("ja-JP");

/** V1の実測。**消さずに残す**(新旧を並べられないと、動いた理由が読めない) */
const V1 = [
  { focus: "破邪獣→護晶→ボス", winRate: 0.063, lossRate: 0.903, drawRate: 0.034, avgTurns: 91.8 },
  { focus: "護晶→破邪獣→ボス", winRate: 0.047, lossRate: 0.941, drawRate: 0.012, avgTurns: 77.8 },
  { focus: "鼓舞晶→護晶→破邪獣→ボス", winRate: 0.012, lossRate: 0.886, drawRate: 0.102, avgTurns: 94.3 },
  { focus: "呪獣→護晶→破邪獣→ボス", winRate: 0.027, lossRate: 0.945, drawRate: 0.028, avgTurns: 80.2 },
  { focus: "ボス集中", winRate: 0.158, lossRate: 0.842, drawRate: 0, avgTurns: 89.8 },
];

function markdown(rows: Row[]): string {
  const out: string[] = [];
  out.push("## 勝敗\n");
  out.push("| 狙う順 | 戦数 | 勝率 | 敗北 | 引分 | 平均手数 |");
  out.push("|---|--:|--:|--:|--:|--:|");
  for (const row of rows) {
    out.push(`| ${row.focus} | ${row.runs} | **${pct(row.winRate)}** | ${pct(row.lossRate)} | ${pct(row.drawRate)} | ${row.avgTurns.toFixed(1)} |`);
  }

  out.push("\n## V1との比較\n");
  out.push("| 狙う順 | 勝率V1 | 勝率V2 | 差 | 敗北V1 | 敗北V2 | 引分V1 | 引分V2 | 手数V1 | 手数V2 |");
  out.push("|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|");
  for (const row of rows) {
    const before = V1.find((entry) => entry.focus === row.focus);
    if (!before) continue;
    const diff = (row.winRate - before.winRate) * 100;
    out.push(
      `| ${row.focus} | ${pct(before.winRate)} | **${pct(row.winRate)}** | ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pt `
      + `| ${pct(before.lossRate)} | ${pct(row.lossRate)} | ${pct(before.drawRate)} | ${pct(row.drawRate)} `
      + `| ${before.avgTurns.toFixed(1)} | ${row.avgTurns.toFixed(1)} |`,
    );
  }

  out.push("\n## 免疫・剥がし・強化阻害(1戦あたり)\n");
  out.push(`| 狙う順 | ${KEYS.join(" | ")} |`);
  out.push(`|---|${KEYS.map(() => "--:").join("|")}|`);
  for (const row of rows) {
    const cells = KEYS.map((key) => {
      const value = row.extra[key] ?? 0;
      if (AS_PERCENT.has(key)) return pct(value);
      if (key.includes("回数") || key.includes("合計") || key.includes("供給") || key.includes("防いだ")) return value.toFixed(2);
      if (key.includes("手番")) return value > 0 ? value.toFixed(1) : "—";
      return num(value);
    });
    out.push(`| ${row.focus} | ${cells.join(" | ")} |`);
  }
  return out.join("\n");
}

/**
 * 「何が効いているのか」を1つずつ外して測る。
 *
 * **1軸ずつしか動かさない。**V1→V2でお供のATKとSPDを同時に下げたため、
 * どちらがどれだけ効いたのかは結局分からないままになっている。
 * 同じ轍を踏まないように、ここは必ず単独で振る。
 */
const ABLATIONS: { name: string; variant: Tower80Variant }[] = [
  { name: "A V2そのまま", variant: {} },
  { name: "B お供ATKをさらに-1,500", variant: { escortAtkDelta: -1_500 } },
  { name: "C お供SPDをさらに-10", variant: { escortSpdDelta: -10 } },
  { name: "D お供HPを0.75倍", variant: { escortHpFactor: 0.75 } },
  { name: "E 鼓舞晶のATK/SPDバフ無し", variant: { noInspireBuff: true } },
  { name: "F 鼓舞晶のゲージ加速無し", variant: { noInspireGauge: true } },
  { name: "G 呪獣の全体デバフ無し", variant: { noCurseDebuff: true } },
  { name: "H 護晶の免疫供給無し", variant: { noGuardImmunity: true } },
  { name: "I 閾値の免疫再展開無し", variant: { noThresholdImmunity: true } },
  { name: "J ボスS3の免疫供給無し", variant: { noRoarImmunity: true } },
  { name: "K HP50%未満の×1.5無し", variant: { noEnrage: true } },
  { name: "L 免疫中のATK+2,000無し", variant: { noImmuneAtk: true } },
];

function ablationMarkdown(): string {
  const cells = ["破邪獣→護晶→ボス", "ボス集中"];
  const out: string[] = [];
  const table: { name: string; rows: Row[] }[] = [];
  for (const entry of ABLATIONS) {
    process.stderr.write(`  切り分け: ${entry.name} …\n`);
    const rows = measure(buildTower80V2(entry.variant), true).filter((row) => cells.includes(row.focus));
    table.push({ name: entry.name, rows });
  }
  const base = table[0];

  out.push(`\n## 何が効いているのか(各${RUNS}戦)\n`);
  out.push("### 勝率\n");
  out.push(`| 変えたところ | ${cells.join(" | ")} |`);
  out.push(`|---|${cells.map(() => "--:").join("|")}|`);
  for (const stage of table) {
    const line = stage.rows.map((row, i) => {
      const diff = (row.winRate - base.rows[i].winRate) * 100;
      const mark = stage === base ? "" : ` (${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pt)`;
      return `${pct(row.winRate)}${mark}`;
    });
    out.push(`| ${stage.name} | ${line.join(" | ")} |`);
  }

  out.push("\n### ボス残HP割合(削れているか)\n");
  out.push(`| 変えたところ | ${cells.join(" | ")} |`);
  out.push(`|---|${cells.map(() => "--:").join("|")}|`);
  for (const stage of table) {
    out.push(`| ${stage.name} | ${stage.rows.map((row) => pct(row.extra["ボス残HP割合"] ?? 0)).join(" | ")} |`);
  }
  return out.join("\n");
}

function main(): void {
  const started = Date.now();
  const rows = measure();
  const text = [
    "# 試練の塔80階「古代聖竜」V2 実測(検証中・本編未反映)\n",
    `装備段階 TYPICAL / 各 ${RUNS} 戦 / seed ${SEED}(攻略順ごとに +10,000)。`
    + "ボス HP200,000 ATK9,500 DEF3,800 SPD185(免疫中は実質11,500)。"
    + "お供は 護晶 ATK6,000/SPD170、鼓舞晶 ATK5,500/SPD162、破邪獣 ATK8,500/SPD180、呪獣 ATK6,500/SPD155。"
    + "開始時とHP70%/40%初到達、ボスS3で敵側全体に免疫2ターン。"
    + "免疫が剥がれている間は被ダメージ+25%、HP50%未満で全攻撃×1.5。\n",
    markdown(rows),
    process.argv.includes("--ablate") ? ablationMarkdown() : "",
    // **空の要素を混ぜたまま繋がない。**末尾に空行が残り、
    // CIの `git diff --check` が「new blank line at EOF」で落ちる
  ].filter((part) => part !== "").join("\n").replace(/\n+$/, "");

  const file = arg("out", "");
  if (file) {
    writeFileSync(file, `${text}\n`, "utf8");
    process.stderr.write(`書き出した: ${file}\n`);
  } else {
    console.log(text);
  }
  process.stderr.write(`かかった時間: ${((Date.now() - started) / 1000).toFixed(1)}秒\n`);
}

main();
