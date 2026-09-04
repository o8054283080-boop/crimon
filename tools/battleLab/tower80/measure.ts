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
import { buildTower80V3, TOWER80_V3 } from "../scenarios/tower80v3.js";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const RUNS = Number(arg("runs", "1000"));
const SEED = Number(arg("seed", "20260930"));
/** どの案を測るか。`v2`(既定) か `v3` */
const GEN = arg("gen", "v2").toLowerCase();

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
  "倒したお供の数", "お供撃破ぶんの被ダメ増", "撃破ボーナス下でのボス行動割合",
];

/** 割合として出す列(1戦あたりの平均ではなく%で読む) */
const AS_PERCENT = new Set([
  "免疫中の行動割合", "強化阻害中の行動割合", "ボス残HP割合",
  "HP50%未満へ到達", "HP50%未満後の全滅", "護晶を倒せた", "破邪獣を倒せた",
  "お供撃破ぶんの被ダメ増", "撃破ボーナス下でのボス行動割合",
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

/**
 * V2の実測(各1000戦)。**消さずに残す。**
 * 新旧を並べられないと、勝率が動いた時に何をしたから動いたのかが読めない。
 */
const V2 = [
  { focus: "破邪獣→護晶→ボス", winRate: 0.169, lossRate: 0.716, drawRate: 0.115, avgTurns: 147.2, bossHpRatio: 0.723 },
  { focus: "護晶→破邪獣→ボス", winRate: 0.133, lossRate: 0.803, drawRate: 0.064, avgTurns: 126.4, bossHpRatio: 0.796 },
  { focus: "鼓舞晶→護晶→破邪獣→ボス", winRate: 0.040, lossRate: 0.752, drawRate: 0.208, avgTurns: 146.5, bossHpRatio: 0.879 },
  { focus: "呪獣→護晶→破邪獣→ボス", winRate: 0.060, lossRate: 0.873, drawRate: 0.067, avgTurns: 115.7, bossHpRatio: 0.866 },
  { focus: "ボス集中", winRate: 0.357, lossRate: 0.643, drawRate: 0.0, avgTurns: 109.8, bossHpRatio: 0.384 },
];

function markdown(rows: Row[], againstV2 = false): string {
  const out: string[] = [];
  out.push("## 勝敗\n");
  out.push("| 狙う順 | 戦数 | 勝率 | 敗北 | 引分 | 平均手数 |");
  out.push("|---|--:|--:|--:|--:|--:|");
  for (const row of rows) {
    out.push(`| ${row.focus} | ${row.runs} | **${pct(row.winRate)}** | ${pct(row.lossRate)} | ${pct(row.drawRate)} | ${row.avgTurns.toFixed(1)} |`);
  }

  const prevLabel = againstV2 ? "V2" : "V1";
  const nowLabel = againstV2 ? "V3" : "V2";
  out.push(`\n## ${prevLabel}との比較\n`);
  out.push(`| 狙う順 | 勝率${prevLabel} | 勝率${nowLabel} | 差 | 敗北${prevLabel} | 敗北${nowLabel} | 引分${prevLabel} | 引分${nowLabel} | 手数${prevLabel} | 手数${nowLabel} |`);
  out.push("|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|");
  for (const row of rows) {
    const before = (againstV2 ? V2 : V1).find((entry) => entry.focus === row.focus);
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

/**
 * V3(鼓舞晶を弱める + お供撃破でボス被ダメ+5%)の切り分け。
 *
 * **2つ同時に入れたので、必ず分けて測る。**
 * V1→V2でお供のATKとSPDを同時に動かし、どちらがどれだけ効いたのか
 * 分からなくなった前例がある。
 */
const V3_STAGES: { name: string; variant: Tower80Variant }[] = [
  { name: "A V2のまま", variant: {} },
  { name: "B 鼓舞晶を弱めるだけ(中)", variant: { inspireProfile: "MID" } },
  { name: "C お供撃破ボーナスだけ", variant: { escortKillDamageBonus: 0.05 } },
  { name: "D 両方・弱め小", variant: { inspireProfile: "LIGHT", escortKillDamageBonus: 0.05 } },
  { name: "E 両方・弱め中", variant: { inspireProfile: "MID", escortKillDamageBonus: 0.05 } },
  { name: "F 両方・弱め大", variant: { inspireProfile: "HEAVY", escortKillDamageBonus: 0.05 } },
  /*
   * **撃破ボーナスの効き幅を確かめる段。**
   * 5%では1戦に1〜1.4体しか倒せず、実効5〜7%しか乗らなかった
   * (最大20%のうち)。上げれば「お供を倒す線」だけが伸びるはず——
   * ボス集中はお供を倒さないので、ここは動かないことが確認になる
   */
  { name: "G 弱め小+ボーナス10%", variant: { inspireProfile: "LIGHT", escortKillDamageBonus: 0.10 } },
  { name: "H 弱め小+ボーナス15%", variant: { inspireProfile: "LIGHT", escortKillDamageBonus: 0.15 } },
  { name: "I 弱め小+ボーナス20%", variant: { inspireProfile: "LIGHT", escortKillDamageBonus: 0.20 } },
  /*
   * **倒せる数が増えればボーナスが効くのか。**
   * ボーナスを4倍(5→20%)にしてもお供線が+5.2ptしか動かなかったのは、
   * 1戦に1.21体しか倒せていないため。お供を柔らかくして数を増やす。
   *
   * V2ではHP0.75倍が**逆効果**(−6.2pt)だったが、あの時は倒す見返りが
   * 無かった。見返りがある今は結果が変わるはずで、
   * 変わらなければ「お供の数そのものが多すぎる」ということになる
   */
  { name: "J 弱め小+10%+お供HP0.75倍", variant: { inspireProfile: "LIGHT", escortKillDamageBonus: 0.10, escortHpFactor: 0.75 } },
  { name: "K 弱め小+10%+お供HP0.6倍", variant: { inspireProfile: "LIGHT", escortKillDamageBonus: 0.10, escortHpFactor: 0.6 } },
];

function v3StageMarkdown(): string {
  const out: string[] = [];
  // `--stage-only A,J,K` で測る段を絞る。**基準(A)は必ず含める**
  const only = arg("stage-only", "");
  const picked = only === ""
    ? V3_STAGES
    : V3_STAGES.filter((stage) => only.split(",").some((key) => stage.name.startsWith(key.trim())));
  if (picked.length === 0) throw new Error(`測る段がありません(--stage-only ${only})`);
  const table = picked.map((stage) => {
    process.stderr.write(`  切り分け: ${stage.name} …\n`);
    return { name: stage.name, rows: measure(buildTower80V2(stage.variant), true) };
  });
  const base = table[0];
  const names = TOWER80_FOCUS_V2.map((focus) => focus.name);

  out.push(`\n## 2つの変更を分けて測る(各${RUNS}戦)\n`);
  out.push("### 勝率\n");
  out.push(`| 変えたところ | ${names.join(" | ")} |`);
  out.push(`|---|${names.map(() => "--:").join("|")}|`);
  for (const stage of table) {
    const cells = stage.rows.map((row, i) => {
      const diff = (row.winRate - base.rows[i].winRate) * 100;
      return stage === base ? pct(row.winRate) : `${pct(row.winRate)} (${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pt)`;
    });
    out.push(`| ${stage.name} | ${cells.join(" | ")} |`);
  }

  out.push("\n### ボス残HP割合(削れているか)\n");
  out.push(`| 変えたところ | ${names.join(" | ")} |`);
  out.push(`|---|${names.map(() => "--:").join("|")}|`);
  for (const stage of table) {
    out.push(`| ${stage.name} | ${stage.rows.map((row) => pct(row.extra["ボス残HP割合"] ?? 0)).join(" | ")} |`);
  }

  out.push("\n### 倒せたお供の数(1戦あたり)\n");
  out.push(`| 変えたところ | ${names.join(" | ")} |`);
  out.push(`|---|${names.map(() => "--:").join("|")}|`);
  for (const stage of table) {
    out.push(`| ${stage.name} | ${stage.rows.map((row) => (row.extra["倒したお供の数"] ?? 0).toFixed(2)).join(" | ")} |`);
  }
  return out.join("\n");
}

function main(): void {
  const started = Date.now();
  const v3 = GEN === "v3";
  const rows = measure(v3 ? TOWER80_V3 : TOWER80_V2);
  const text = [
    `# 試練の塔80階「古代聖竜」${v3 ? "V3" : "V2"} 実測(検証中・本編未反映)\n`,
    `装備段階 TYPICAL / 各 ${RUNS} 戦 / seed ${SEED}(攻略順ごとに +10,000)。`
    + "ボス HP200,000 ATK9,500 DEF3,800 SPD185(免疫中は実質11,500)。"
    + "お供は 護晶 ATK6,000/SPD170、鼓舞晶 ATK5,500/SPD162、破邪獣 ATK8,500/SPD180、呪獣 ATK6,500/SPD155。"
    + "開始時とHP70%/40%初到達、ボスS3で敵側全体に免疫2ターン。"
    + "免疫が剥がれている間は被ダメージ+25%、HP50%未満で全攻撃×1.5。"
    + (v3
      ? "**V3の変更2つ**: 鼓舞晶を弱める(S2 ATK+25%/SPD+15% CT5、S3 ゲージ+12%のみ CT6)、"
        + "お供1体撃破ごとにボスの被ダメージ+5%(最大+20%、免疫中も効く)。"
      : "")
    + "\n",
    markdown(rows, v3),
    process.argv.includes("--ablate") ? ablationMarkdown() : "",
    process.argv.includes("--stages") ? v3StageMarkdown() : "",
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
