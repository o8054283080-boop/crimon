/**
 * **2026年10月のスキル調整の変更一覧を書き出す。**
 *
 *   npx tsx tools/skillsReport/tuning/summary.ts
 *
 * 出力は `docs/skills/tuning-2026-10.md`。中身はすべて機械で作る:
 *
 *   - 調整したスキルの Lv1〜5(変更前 → 変更後)
 *   - ナーフ禁止のために指定値から引き上げた値(指定 → 最終)
 *   - 置き換えの指定で弱くなって良いとした所と理由
 *   - 曖昧な指定をどう具体化したか(spec.ts の note)
 *   - 強化なし・保留・指定なしの一覧
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describePassiveLevel, type PassiveLevelEffect } from "../../../src/core/passive.js";
import { describeSkillLines, type Skill } from "../../../src/core/skill.js";
import { collectAll, type LevelEntry, type MonsterReport, type SkillReport } from "../collect.js";
import { PENDING_NOTES, SPEC } from "./spec.js";
import { findSkill, resolveSkill } from "./resolve.js";

const BEFORE = JSON.parse(readFileSync("tests/fixtures/skills-before-2026-10.json", "utf8")) as MonsterReport[];
const AFTER = collectAll();

/** 変更前の控えは文を持っていないので、効果から作り直す */
function linesOf(level: LevelEntry): string {
  if (level.passive) return describePassiveLevel(level.passive as PassiveLevelEffect);
  const skill = { effects: level.effects, ...level.flags } as unknown as Skill;
  const flags = Object.keys(level.flags).filter((k) => !["extraTurn", "resetCooldownOnKill", "gaugeIfThreeEnemies"].includes(k));
  return [...describeSkillLines(skill), ...flags].join(" / ");
}

function ct(level: LevelEntry): string {
  return level.cooldownTurns > 0 ? `CT${level.cooldownTurns}` : "CTなし";
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function levelTable(before: SkillReport, after: SkillReport): string[] {
  const rows = ["| Lv | 変更前 | 変更後 |", "|---|---|---|"];
  after.levels.forEach((level, i) => {
    const b = before.levels[i];
    const was = `${cell(linesOf(b))}(${ct(b)})`;
    const now = `${cell(linesOf(level))}(${ct(level)})`;
    rows.push(`| Lv${i + 1} | ${was} | ${was === now ? "(同じ)" : `**${now}**`} |`);
  });
  return rows;
}

const tuned = SPEC.filter((s) => !s.keep && !s.pending);
const keep = SPEC.filter((s) => s.keep);
const pending = SPEC.filter((s) => s.pending);
const specIds = new Set(SPEC.map((s) => s.id));

const out: string[] = [
  "# 2026年10月 スキル調整の変更一覧(自動生成)",
  "",
  "**手で直さない。**`npx tsx tools/skillsReport/tuning/summary.ts` で作り直す。",
  "指定は `tools/skillsReport/tuning/spec.ts`、最終値の決め方は `tools/skillsReport/tuning/resolve.ts`、",
  "照合は `tests/skillTuning.test.ts`(指定値と実効値)と `tests/skillTuningBattle.test.ts`(戦闘での発動回数)。",
  "",
  `- 対象: ${AFTER.length}種 / ${AFTER.reduce((n, m) => n + m.skills.length, 0)}スキル`,
  `- 調整したスキル: ${tuned.length}`,
  `- 強化なし(完全一致を確認): ${keep.length}`,
  `- 保留: ${pending.length}`,
  `- 指定の無いスキル(完全一致を確認): ${BEFORE.flatMap((m) => m.skills).filter((s) => !specIds.has(s.skillId)).length}`,
  "",
  "## 最終値の決め方",
  "",
  "1. 指定がある値は指定値。ただし**変更前の同じ Lv より弱ければ**、変更前以上で最も近いきりのいい値へ引き上げる(下の「引き上げ」に全件)",
  "2. 指定が無い値は変更前の同じ Lv を引き継ぐ。一律成長の端数(1.06倍ずつ)は上方向へ整える",
  "3. 新しい効果は指定に書かれたものだけを足す",
  "4. 置き換え・作り直しの指定がある所だけ、弱くなって良いとした(下の「置き換え」に理由つきで全件)",
  "",
];

/* ---------------------------------------------------------------- 引き上げ */
const deviations = tuned.flatMap((spec) => resolveSkill(spec, findSkill(BEFORE, spec.id)).deviations);
out.push("## 指定値から引き上げた値(ナーフ禁止のため)", "", `${deviations.length}件。多くは、指定を書いた時点で一律成長(Lv ごとに約6%)や実行時の差し替えが見えていなかったもの。`, "",
  "| スキル | Lv | 項目 | 指定 | 最終 | 理由 |", "|---|---|---|---:|---:|---|",
  ...deviations.map((d) => `| \`${d.skillId}\` | Lv${d.level} | ${d.path} | ${d.specified} | ${d.final} | ${d.reason} |`), "");

/* ---------------------------------------------------------------- 置き換え */
out.push("## 置き換えの指定で、変更前より弱くなって良いとした所", "", "| スキル | 項目 | 理由 |", "|---|---|---|");
for (const spec of SPEC) {
  for (const [path, reason] of Object.entries(spec.allowWeaker ?? {})) out.push(`| \`${spec.id}\` | ${path === "*" ? "(全体)" : path} | ${cell(reason)} |`);
}
out.push("");

/* ---------------------------------------------------------------- 解釈 */
out.push("## 曖昧な指定をどう具体化したか", "", "| スキル | 具体化 |", "|---|---|");
for (const spec of SPEC) if (spec.note && !spec.pending) out.push(`| \`${spec.id}\` | ${cell(spec.note)} |`);
out.push("");

/* ---------------------------------------------------------------- 保留・強化なし */
out.push("## 保留(今回は数値を動かしていない)", "", "| スキル | 理由 |", "|---|---|",
  ...pending.map((s) => `| \`${s.id}\` | ${cell(s.pending!)} |`), ...PENDING_NOTES.map((n) => `| ${n.title} | ${cell(n.body)} |`), "");
out.push("## 強化なし(実効 Lv1〜5 が変更前と完全一致)", "", keep.map((s) => `\`${s.id}\``).join("、"), "");

/* ---------------------------------------------------------------- 変更一覧 */
out.push("## 変更一覧(種族ごと・Lv1〜5)", "");
for (const monster of AFTER) {
  const changed = monster.skills.filter((s) => tuned.some((t) => t.id === s.skillId));
  if (changed.length === 0) continue;
  out.push(`### ${monster.name}(\`${monster.templateId}\`)`, "");
  for (const skill of changed) {
    const before = findSkill(BEFORE, skill.skillId);
    out.push(`#### ${skill.slot} ${skill.skillName}(\`${skill.skillId}\`)`, "", ...levelTable(before, skill), "");
  }
}

writeFileSync("docs/skills/tuning-2026-10.md", `${out.join("\n")}\n`);
console.log(`書き出しました: docs/skills/tuning-2026-10.md(調整 ${tuned.length} / 引き上げ ${deviations.length}件)`);
