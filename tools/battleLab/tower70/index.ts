/**
 * 70階をまとめて測る入口。
 *
 *   npx tsx tools/battleLab/tower70/index.ts               # 格子だけ(既定1000戦)
 *   npx tsx tools/battleLab/tower70/index.ts --runs 2000
 *   npx tsx tools/battleLab/tower70/index.ts --sweep       # 1軸ずつ振る比較も
 *   npx tsx tools/battleLab/tower70/index.ts --out out.md  # 表をファイルへ
 *
 * **本編には1行も触れていない。**`src/data/trialTower.ts` の70階は
 * 従来どおりのまま(古代の魔人+お供2体、超再生)。
 */
import { writeFileSync } from "node:fs";
import { TOWER70_FOCUS, TOWER70_PARTIES } from "../scenarios/tower70.js";
import { TOWER70_ADDS, TOWER70_BASE, tower70With } from "./spec.js";
import { beforeAfterMarkdown, detailMarkdown, gridMarkdown, runTower70, runTower70Sweeps, sweepMarkdown, type Tower70Row } from "./report.js";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

const RUNS = Number(arg("runs", "1000"));
const SEED = Number(arg("seed", "20260903"));

/** 依頼の最低ライン。TYPICALは全5線、POISONは4線 */
const MATRIX: { party: string; focus: string }[] = [
  ...TOWER70_FOCUS.map((f) => ({ party: "TYPICAL", focus: f.name })),
  { party: "POISON", focus: "ボス集中" },
  { party: "POISON", focus: "生命晶→ボス" },
  { party: "POISON", focus: "生命晶→脈動晶→ボス" },
  { party: "POISON", focus: "既存AIまかせ" },
  ...TOWER70_FOCUS.map((f) => ({ party: "HIGH_RARITY", focus: f.name })),
  ...TOWER70_FOCUS.map((f) => ({ party: "SUSTAIN", focus: f.name })),
];

const CORE_KEYS = [
  "本体総回復量", "再生発動回数", "生命晶生存中の再生回数", "生命晶ぶんの回復量",
  "生命晶の全体解除回数", "解除された弱化数", "シールド発動回数", "シールド吸収量",
];
const TIER_KEYS = [
  "HP70%以下到達", "HP50%以下到達", "HP30%以下到達",
  "70%帯の行動", "50%帯の行動", "30%帯の行動",
  "段が下がった回数", "30%から50%へ復帰", "S3使用回数",
];
const ROAR_KEYS = [
  "咆哮75%", "咆哮50%", "咆哮25%", "咆哮回数", "咆哮3回そろった",
  "咆哮ダメージ", "咆哮の撃破数", "咆哮で全滅", "咆哮前の味方HP", "咆哮後の味方HP",
];
const ADD_KEYS = [
  "生命晶の生存手数", "生命晶の全体解除回数", "生命晶が1回以上解除", "生命晶が2回以上解除",
  "脈動晶の生存手数", "シールド発動回数", "シールドが1回以上", "シールド吸収量",
];
const POISON_KEYS = [
  "毒付与成功", "毒ダメージ", "毒割合", "解除された毒スタック数",
  "生命晶撃破前の毒", "生命晶撃破後の毒", "毒でとどめ", "本体被ダメージ",
];

function main(): void {
  const started = Date.now();
  const out: string[] = [];

  out.push("# 試練の塔 70階「始祖ベヒモス」実測(検証中・本編未反映)\n");
  out.push(
    `装備段階 TYPICAL / 各 ${RUNS} 戦 / seed ${SEED}。`
    + `本体 HP${TOWER70_BASE.bossHp.toLocaleString("ja-JP")} ATK${TOWER70_BASE.bossAtk.toLocaleString("ja-JP")} `
    + `DEF${TOWER70_BASE.bossDef.toLocaleString("ja-JP")} SPD${TOWER70_BASE.bossSpd}、`
    + `再生${Math.round(TOWER70_BASE.bossRegen * 100)}%(生命晶生存中は+${Math.round(TOWER70_BASE.lifeCrystalRegenBonus * 100)}%)、`
    + `シールド${Math.round(TOWER70_BASE.pulseShieldRate * 100)}%。`
    + `段階は置き換え式(70%以下 SPD+10/HP比例+10% → 50%以下 +25/+20% → 30%以下 +45/+35%、被ダメは一律-10%)。`
    + `咆哮は75/50/25%を初めて割った時に1回ずつ(ATK2.0倍+最大HP8%、ゲージ-50%、防御-50%3ターン)。`
    + `生命晶 HP${TOWER70_ADDS.life.hp.toLocaleString("ja-JP")}/SPD${TOWER70_ADDS.life.spd}、`
    + `脈動晶 HP${TOWER70_ADDS.pulse.hp.toLocaleString("ja-JP")}/SPD${TOWER70_ADDS.pulse.spd}。\n`,
  );

  const rows: Tower70Row[] = [];
  for (const cell of MATRIX) {
    process.stderr.write(`  測定中: ${cell.party} × ${cell.focus} …\n`);
    rows.push(runTower70({ ...cell, runs: RUNS, seed: SEED }));
  }

  out.push("## 編成 × 狙う順\n");
  out.push(gridMarkdown(rows));
  out.push("\n## 第1回との比較(BEFORE / AFTER)\n");
  out.push(beforeAfterMarkdown(rows));
  out.push("\n## 階の中で起きたこと(1戦あたり)\n");
  out.push(detailMarkdown(rows, CORE_KEYS));
  out.push("\n## 本体の段階\n");
  out.push(detailMarkdown(rows, TIER_KEYS));
  out.push("\n## 始祖の咆哮\n");
  out.push(detailMarkdown(rows, ROAR_KEYS));
  out.push("\n## 取り巻きが仕事をできたか\n");
  out.push(detailMarkdown(rows, ADD_KEYS));
  out.push("\n## 毒\n");
  out.push(detailMarkdown(rows.filter((row) => row.party === "POISON"), POISON_KEYS));

  out.push("\n## 負けた理由\n");
  out.push("| 編成 | 狙う順 | 内訳 |");
  out.push("|---|---|---|");
  for (const row of rows) {
    const detail = row.losses.length > 0
      ? row.losses.map(([reason, count]) => `${reason} ${count}`).join(" / ")
      : "—";
    out.push(`| ${row.party} | ${row.focus} | ${detail} |`);
  }

  /*
   * **第1回と第2回を同じ物差しで並べる。**
   * 3つ(取り巻きの硬さ・段の強化・咆哮)を同時に入れたので、
   * 1つずつ足していかないと、勝率が動いた理由が読めない
   */
  if (!has("no-compare")) {
    const stages: { name: string; numbers: ReturnType<typeof tower70With> }[] = [
      { name: "A 第1回のまま", numbers: tower70With({ addsProfile: "V1", tierProfile: "V1", roar: false }) },
      { name: "B 取り巻きだけ強化", numbers: tower70With({ addsProfile: "V2", tierProfile: "V1", roar: false }) },
      { name: "C 段だけ強化", numbers: tower70With({ addsProfile: "V1", tierProfile: "V2", roar: false }) },
      { name: "D 咆哮だけ追加", numbers: tower70With({ addsProfile: "V1", tierProfile: "V1", roar: true }) },
      { name: "E 第2回(確定値)", numbers: TOWER70_BASE },
    ];
    const compareCells = [
      { party: "TYPICAL", focus: "ボス集中" },
      { party: "TYPICAL", focus: "生命晶→ボス" },
      { party: "POISON", focus: "生命晶→ボス" },
      { party: "HIGH_RARITY", focus: "ボス集中" },
      { party: "SUSTAIN", focus: "ボス集中" },
    ];
    const runsForCompare = Math.max(200, Math.round(RUNS / 2));
    out.push(`\n## 何が効いたのか(各${runsForCompare}戦)\n`);
    out.push(`| 段階 | ${compareCells.map((c) => `${c.party} ${c.focus}`).join(" | ")} |`);
    out.push(`|---|${compareCells.map(() => "--:").join("|")}|`);
    for (const stage of stages) {
      process.stderr.write(`  切り分け: ${stage.name} …\n`);
      const cells = compareCells.map((cell) => {
        const row = runTower70({ ...cell, runs: runsForCompare, seed: SEED, numbers: stage.numbers });
        return `${(row.winRate * 100).toFixed(1)}%`;
      });
      out.push(`| ${stage.name} | ${cells.join(" | ")} |`);
    }
  }

  if (has("sweep")) {
    out.push("\n## 1軸ずつ振った比較(TYPICAL × 生命晶→ボス)\n");
    process.stderr.write("  スイープ中 …\n");
    out.push(sweepMarkdown(runTower70Sweeps({
      party: "TYPICAL",
      focus: "生命晶→ボス",
      runs: Math.max(200, Math.round(RUNS / 4)),
      seed: SEED,
    })));
  }

  const text = out.join("\n");
  const file = arg("out", "");
  if (file) {
    writeFileSync(file, `${text}\n`, "utf8");
    process.stderr.write(`書き出した: ${file}\n`);
  } else {
    console.log(text);
  }
  process.stderr.write(`かかった時間: ${((Date.now() - started) / 1000).toFixed(1)}秒\n`);
}

// 編成の名前を間違えた時に、静かに空の表を出さない
for (const cell of MATRIX) {
  if (!TOWER70_PARTIES[cell.party]) throw new Error(`知らない編成: ${cell.party}`);
}

main();
