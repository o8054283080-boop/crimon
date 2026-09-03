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
import { TOWER70_ADDS, TOWER70_BASE, TOWER70_CRUSH, TOWER70_ROAR, tower70With } from "./spec.js";
import { detailMarkdown, generationsMarkdown, gridMarkdown, runTower70, runTower70Sweeps, sweepMarkdown, type Tower70Row } from "./report.js";

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

/*
 * **シールドの列は第3回には無い。**脈動晶は守り役をやめたので、
 * 「シールド発動回数 0」が並ぶ表を出すと、読む側が
 * 「効かなかった」のか「そもそも無い」のかを取り違える
 */
const CORE_KEYS = [
  "本体総回復量", "再生発動回数", "生命晶生存中の再生回数", "生命晶ぶんの回復量",
  "生命晶の全体解除回数", "解除された弱化数", "本体被ダメージ",
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
/** 第3回の主役。**「直接死亡」が0でなければ仕様違反** */
const CRUSH_KEYS = [
  "命脈断ちの発動回数", "命脈断ちが1回以上", "命脈断ちが2回以上",
  "命脈断ち発動前HP", "命脈断ち発動後HP", "命脈断ち1回の削り", "命脈断ちの合計削り",
  "命脈断ちでの死亡",
];
const CRUSH_TARGET_KEYS = ["命脈断ちP1", "命脈断ちP2", "命脈断ちP3", "命脈断ちP4", "命脈断ちP5"];
const ADD_KEYS = [
  "生命晶の生存手数", "生命晶の全体解除回数", "生命晶が1回以上解除", "生命晶が2回以上解除",
  "脈動晶の生存手数", "命脈断ちの発動回数", "命脈断ちが1回以上",
];
const POISON_KEYS = [
  "毒付与成功", "毒ダメージ", "毒割合", "解除された毒スタック数",
  "生命晶撃破前の毒", "生命晶撃破後の毒", "毒でとどめ", "本体被ダメージ",
];

function main(): void {
  const started = Date.now();
  const out: string[] = [];

  out.push("# 試練の塔 70階「始祖ベヒモス」実測 第3回(検証中・本編未反映)\n");
  out.push(
    `装備段階 TYPICAL / 各 ${RUNS} 戦 / seed ${SEED}。`
    + `本体 HP${TOWER70_BASE.bossHp.toLocaleString("ja-JP")} ATK${TOWER70_BASE.bossAtk.toLocaleString("ja-JP")} `
    + `DEF${TOWER70_BASE.bossDef.toLocaleString("ja-JP")} SPD${TOWER70_BASE.bossSpd}、`
    + `再生${Math.round(TOWER70_BASE.bossRegen * 100)}%(生命晶生存中は+${Math.round(TOWER70_BASE.lifeCrystalRegenBonus * 100)}%)。`
    + `段階は置き換え式(70%以下 SPD+10/HP比例+10% → 50%以下 +25/+20% → 30%以下 +45/+35%、被ダメは一律-10%)。`
    + `咆哮は75/50/25%を初めて割った時に1回ずつ`
    + `(ATK${TOWER70_ROAR.multiplier}倍+最大HP${Math.round(TOWER70_ROAR.hpCoefficient * 100)}%、`
    + `ゲージ-${Math.round(TOWER70_ROAR.gaugeDown * 100)}%、防御-${Math.round(TOWER70_ROAR.defDown * 100)}%${TOWER70_ROAR.defDownTurns}ターン)。`
    + `脈動晶はシールドを持たず、S2「命脈断ち」で**現在HPが最も高い1体を${Math.round(TOWER70_CRUSH.ratio * 100)}%にする**`
    + `(CT${TOWER70_CRUSH.cooldownTurns})。`
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
  out.push("\n## 第1回 / 第2回 / 第3回(①②③)\n");
  out.push(generationsMarkdown(rows));
  out.push("\n## 階の中で起きたこと(1戦あたり)\n");
  out.push(detailMarkdown(rows, CORE_KEYS));
  out.push("\n## 本体の段階\n");
  out.push(detailMarkdown(rows, TIER_KEYS));
  out.push("\n## 始祖の咆哮\n");
  out.push(detailMarkdown(rows, ROAR_KEYS));
  out.push("\n## 命脈断ち\n");
  out.push(detailMarkdown(rows, CRUSH_KEYS));
  out.push("\n### 誰を狙ったか(1戦あたりの回数)\n");
  out.push(detailMarkdown(rows, CRUSH_TARGET_KEYS));
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
   * **第2回から2つ変えたので、1つずつ分ける。**
   *
   *   A 第2回のまま  ……… 咆哮2.0倍+8% / 脈動晶=シールド
   *   B 咆哮だけ弱く ……… 咆哮1.5倍+5% / 脈動晶=シールド
   *   C 脈動晶だけ …………  咆哮2.0倍+8% / 脈動晶=命脈断ち
   *   D 第3回(確定値) …… 咆哮1.5倍+5% / 脈動晶=命脈断ち
   *
   * A→B が咆哮の弱体化ぶん、A→C が**シールド削除ぶん**。
   * 引き分けは勝率と別に必ず出す——第2回で壊れたのは勝率ではなく引き分けだった
   */
  if (!has("no-compare")) {
    const stages: { name: string; numbers: ReturnType<typeof tower70With> }[] = [
      { name: "A 第2回のまま", numbers: tower70With({ roarProfile: "V2", pulseRole: "SHIELD" }) },
      { name: "B 咆哮だけ1.5倍+5%", numbers: tower70With({ roarProfile: "V3", pulseRole: "SHIELD" }) },
      { name: "C 脈動晶だけ命脈断ち", numbers: tower70With({ roarProfile: "V2", pulseRole: "CRUSH" }) },
      { name: "D 第3回(確定値)", numbers: TOWER70_BASE },
    ];
    const compareCells = [
      { party: "TYPICAL", focus: "ボス集中" },
      { party: "TYPICAL", focus: "生命晶→ボス" },
      { party: "POISON", focus: "生命晶→ボス" },
      { party: "HIGH_RARITY", focus: "ボス集中" },
      { party: "SUSTAIN", focus: "ボス集中" },
    ];
    const runsForCompare = Math.max(250, Math.round(RUNS / 2));
    const table = stages.map((stage) => {
      process.stderr.write(`  切り分け: ${stage.name} …\n`);
      return {
        name: stage.name,
        rows: compareCells.map((cell) => runTower70({ ...cell, runs: runsForCompare, seed: SEED, numbers: stage.numbers })),
      };
    });

    const header = `| 段階 | ${compareCells.map((c) => `${c.party} ${c.focus}`).join(" | ")} |`;
    const rule = `|---|${compareCells.map(() => "--:").join("|")}|`;

    out.push(`\n## 何が効いたのか(各${runsForCompare}戦)\n`);
    out.push("### 勝率\n");
    out.push(header);
    out.push(rule);
    for (const stage of table) {
      out.push(`| ${stage.name} | ${stage.rows.map((row) => `${(row.winRate * 100).toFixed(1)}%`).join(" | ")} |`);
    }

    out.push("\n### 引き分け率(**第3回の主題**)\n");
    out.push(header);
    out.push(rule);
    for (const stage of table) {
      out.push(`| ${stage.name} | ${stage.rows.map((row) => `${(row.drawRate * 100).toFixed(1)}%`).join(" | ")} |`);
    }

    out.push("\n### 敗北率\n");
    out.push(header);
    out.push(rule);
    for (const stage of table) {
      out.push(`| ${stage.name} | ${stage.rows.map((row) => `${(row.lossRate * 100).toFixed(1)}%`).join(" | ")} |`);
    }

    // A→B と A→C を直に引き算して出す。表を目で引き算させない
    const base = table[0];
    out.push("\n### Aからの差(pt)\n");
    out.push(`| 変えたところ | 見る値 | ${compareCells.map((c) => `${c.party} ${c.focus}`).join(" | ")} |`);
    out.push(`|---|---|${compareCells.map(() => "--:").join("|")}|`);
    const deltas: { stage: typeof table[number]; label: string }[] = [
      { stage: table[1], label: "咆哮の弱体化だけ" },
      { stage: table[2], label: "**シールド削除だけ**" },
      { stage: table[3], label: "両方(第3回)" },
    ];
    for (const { stage, label } of deltas) {
      for (const [metric, pick] of [["勝率", (r: Tower70Row) => r.winRate], ["引き分け", (r: Tower70Row) => r.drawRate], ["敗北", (r: Tower70Row) => r.lossRate]] as const) {
        const cells = stage.rows.map((row, i) => {
          const diff = (pick(row) - pick(base.rows[i])) * 100;
          return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}`;
        });
        out.push(`| ${label} | ${metric} | ${cells.join(" | ")} |`);
      }
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
