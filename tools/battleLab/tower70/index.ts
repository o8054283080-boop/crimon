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
import { TOWER70_ADDS, TOWER70_BASE } from "./spec.js";
import { detailMarkdown, gridMarkdown, runTower70, runTower70Sweeps, sweepMarkdown, type Tower70Row } from "./report.js";

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
  "HP70%以下到達", "HP50%以下到達", "HP30%以下到達", "HP30%以下の行動回数",
  "30%から50%へ復帰", "S3使用回数", "S3自己解除数", "HP比例強化中の攻撃",
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
    + `シールド${Math.round(TOWER70_BASE.pulseShieldRate * 100)}%、HP30%以下で速度+${TOWER70_BASE.lowHpSpdBonus}。`
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
  out.push("\n## 階の中で起きたこと(1戦あたり)\n");
  out.push(detailMarkdown(rows, CORE_KEYS));
  out.push("\n## 本体の段階\n");
  out.push(detailMarkdown(rows, TIER_KEYS));
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
