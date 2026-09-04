/**
 * 70階の各案(V4〜V7)を、同じ物差しで測る入口。
 *
 *   npx tsx tools/battleLab/tower70/measure.ts                 # 全部
 *   npx tsx tools/battleLab/tower70/measure.ts --gen v7        # V7だけ
 *   npx tsx tools/battleLab/tower70/measure.ts --gen v7 --party 混合A
 *   npx tsx tools/battleLab/tower70/measure.ts --runs 200      # 手早く見る
 *   npx tsx tools/battleLab/tower70/measure.ts --out out.md
 *
 * ## なぜ `tests/` から出したのか
 *
 * これは **`tests/tower70V4Lab.test.ts` などに置かれていた計測**を移したもの。
 * あちらの「1000戦×5攻略順を実測してログへ出す」は、7つとも
 * **確かめていたのが `expect(rows).toHaveLength(5)` だけ**だった——
 * 5回ループしたことしか見ておらず、肝心の数字は `console.log` へ流すだけ。
 *
 * そのために毎回のCIが約170秒(1件36〜44秒×7)遅くなり、
 * テスト全体の実行時間の大半をここが占めていた。**測定はテストではない。**
 * 仕様を固める `it`(回復阻害を実際に持っているか、段階の値が正しいか)は
 * `tests/` に残してある。あちらは速いし、壊れたら落ちる。
 *
 * 数字が要る時に、ここから好きな回数で回す。
 */
import { writeFileSync } from "node:fs";
import { runMany } from "../run.js";
import type { AllySpec, BattleTally, Scenario } from "../types.js";
import { TOWER70_FOCUS } from "../scenarios/tower70.js";
import { buildTower70V4, TOWER70_HEAL_BLOCK } from "../scenarios/tower70v4.js";
import { buildTower70V5 } from "../scenarios/tower70v5.js";
import { buildTower70V6, TOWER70_HEAL_BLOCK_3, TOWER70_MIXED, TOWER70_POISON_3 } from "../scenarios/tower70v6.js";
import { buildTower70V7, TOWER70_MIXED_A, TOWER70_MIXED_B } from "../scenarios/tower70v7.js";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const RUNS = Number(arg("runs", "1000"));
const GEN = arg("gen", "all").toLowerCase();
const PARTY = arg("party", "");

/**
 * 測る組み合わせ。**種は案ごとに固定する。**
 * 案の間で種が揃っていないと、引いた乱数の違いを案の差だと読んでしまう。
 */
interface Case {
  gen: string;
  party: string;
  seed: number;
  scenario: (allies: AllySpec[]) => Scenario;
  allies: AllySpec[];
}

const CASES: Case[] = [
  { gen: "v4", party: "回復阻害", seed: 20260904, scenario: buildTower70V4, allies: TOWER70_HEAL_BLOCK },
  { gen: "v5", party: "回復阻害", seed: 20260905, scenario: buildTower70V5, allies: TOWER70_HEAL_BLOCK },
  { gen: "v6", party: "回復阻害3体", seed: 20260906, scenario: buildTower70V6, allies: TOWER70_HEAL_BLOCK_3 },
  { gen: "v6", party: "毒3体", seed: 20260906, scenario: buildTower70V6, allies: TOWER70_POISON_3 },
  { gen: "v6", party: "混合", seed: 20260907, scenario: buildTower70V6, allies: TOWER70_MIXED },
  { gen: "v7", party: "回復阻害3体", seed: 20260908, scenario: buildTower70V7, allies: TOWER70_HEAL_BLOCK_3 },
  { gen: "v7", party: "混合A安定型", seed: 20260909, scenario: buildTower70V7, allies: TOWER70_MIXED_A },
  { gen: "v7", party: "混合B攻撃型", seed: 20260910, scenario: buildTower70V7, allies: TOWER70_MIXED_B },
];

const mean = (values: number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

interface Row {
  gen: string;
  party: string;
  focus: string;
  runs: number;
  winRate: number;
  lossRate: number;
  drawRate: number;
  avgTurns: number;
  extra: Record<string, number>;
}

/** 1戦あたりに均して見たい値。無い案では0のまま出る(**列は落とさない**) */
const EXTRA_KEYS = [
  "本体総回復量", "V4治癒阻害成功", "V4治癒阻害稼働率", "V4阻害した回復量",
  "毒ダメージ", "命脈断ちの発動回数",
];

function measure(entry: Case): Row[] {
  const scenario = entry.scenario(entry.allies);
  return TOWER70_FOCUS.map((pattern) => {
    const tallies: BattleTally[] = runMany(scenario, entry.seed, RUNS, pattern.order, "TYPICAL");
    const count = (winner: string) => tallies.filter((tally) => tally.winner === winner).length;
    const extra: Record<string, number> = {};
    for (const key of EXTRA_KEYS) extra[key] = mean(tallies.map((tally) => tally.extra[key] ?? 0));
    return {
      gen: entry.gen,
      party: entry.party,
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

function markdown(rows: Row[]): string {
  const lines: string[] = [];
  lines.push(`| 案 | 編成 | 狙う順 | 戦数 | 勝率 | 敗北 | 引分 | 平均手数 | ${EXTRA_KEYS.join(" | ")} |`);
  lines.push(`|---|---|---|--:|--:|--:|--:|--:|${EXTRA_KEYS.map(() => "--:").join("|")}|`);
  for (const row of rows) {
    const cells = EXTRA_KEYS.map((key) => {
      const value = row.extra[key] ?? 0;
      if (key.includes("稼働率")) return pct(value);
      // 1戦に数回しか起きないものは、丸めると差が消える
      return key === "命脈断ちの発動回数" ? value.toFixed(2) : num(value);
    });
    lines.push(
      `| ${row.gen.toUpperCase()} | ${row.party} | ${row.focus} | ${row.runs} `
      + `| **${pct(row.winRate)}** | ${pct(row.lossRate)} | ${pct(row.drawRate)} | ${row.avgTurns.toFixed(1)} | ${cells.join(" | ")} |`,
    );
  }
  return lines.join("\n");
}

function main(): void {
  const started = Date.now();
  const targets = CASES.filter((entry) => (GEN === "all" || entry.gen === GEN) && (PARTY === "" || entry.party === PARTY));
  // 名前を打ち間違えた時に、静かに空の表を出さない
  if (targets.length === 0) {
    throw new Error(`測る対象がありません(--gen ${GEN} --party ${PARTY || "(指定なし)"})。`
      + `選べるのは ${[...new Set(CASES.map((c) => c.gen))].join(" / ")} と ${[...new Set(CASES.map((c) => c.party))].join(" / ")}`);
  }

  const rows: Row[] = [];
  for (const entry of targets) {
    process.stderr.write(`  測定中: ${entry.gen.toUpperCase()} × ${entry.party} (各${RUNS}戦 × ${TOWER70_FOCUS.length}攻略順) …\n`);
    rows.push(...measure(entry));
  }

  const text = [
    `# 試練の塔70階 案の比較(V4〜V7)\n`,
    `装備段階 TYPICAL / 各 ${RUNS} 戦。種は案ごとに固定(案の差と乱数の差を混ぜないため)。\n`,
    markdown(rows),
  ].join("\n");

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
