/**
 * **バフ・デバフの全件監査。**読むだけで、何も書き換えない。
 *
 *   npx tsx tools/statusEffectAudit.ts            # 数値のばらつきだけ
 *   npx tsx tools/statusEffectAudit.ts --full     # 使っているスキルも全部出す
 *
 * 「同じ名前のバフなのにスキルごとに値が違う」を機械的に拾うためのもの。
 * grepでは定数(`ATK_UP` など)が展開されないので、**実際のスキル定義を読んで**数える。
 *
 * 見るのは Lv1 の素の値。レベルでの伸びは `computeLeveledSkill` が別に持つので、
 * 「固定値をいくつに揃えるか」の話とは分けて扱う。
 */
import type { MonsterTemplate } from "../src/core/monster.js";
import type { Skill, SkillEffect } from "../src/core/skill.js";
import { ALL_MONSTER_TEMPLATES } from "../src/data/monsters.js";
import { ARCHEOS_SKILLS } from "../src/data/awakeningDepthsMonsters.js";

const FULL = process.argv.includes("--full");

/** 1件の使用箇所 */
interface Use {
  monster: string;
  skillId: string;
  skillName: string;
  description: string;
  amount: number | undefined;
  turns: number | undefined;
  chance: number | undefined;
  applyTo: string | undefined;
}

const uses = new Map<string, Use[]>();

function record(key: string, use: Use): void {
  const list = uses.get(key) ?? [];
  list.push(use);
  uses.set(key, list);
}

/** スキル1つぶんの効果を舐める。効果の種類ごとにキーを作る */
function scanSkill(monster: string, skill: Skill): void {
  const base = { monster, skillId: skill.id, skillName: skill.name, description: skill.description };
  for (const effect of skill.effects ?? []) {
    const e = effect as SkillEffect & Record<string, unknown>;
    const common = {
      ...base,
      amount: typeof e.amount === "number" ? e.amount : undefined,
      turns: typeof e.durationTurns === "number" ? e.durationTurns : undefined,
      chance: typeof e.chance === "number" ? e.chance : undefined,
      applyTo: typeof e.applyTo === "string" ? e.applyTo : undefined,
    };
    switch (e.kind) {
      case "BUFF": record(`BUFF:${String(e.stat)}`, common); break;
      case "DEBUFF": record(`DEBUFF:${String(e.stat)}`, common); break;
      case "STATUS": record(`STATUS:${String(e.status)}`, common); break;
      default: record(String(e.kind), common); break;
    }
  }
}

const seen = new Set<string>();
function scanTemplate(t: MonsterTemplate): void {
  const name = t.name ?? t.templateId;
  const all: Skill[] = [
    t.skill1,
    ...(t.skill2Variants ?? []),
    ...(t.skill3Variants ?? []),
    ...(t.lightSkill3 ? [t.lightSkill3] : []),
    ...(t.darkSkill3 ? [t.darkSkill3] : []),
  ].filter(Boolean) as Skill[];
  for (const s of all) {
    const key = `${t.templateId}:${s.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scanSkill(name, s);
  }
}

for (const t of ALL_MONSTER_TEMPLATES) scanTemplate(t);
for (const s of ARCHEOS_SKILLS) scanSkill("才能神獣 アルケオス", s);

/* ---------------------------------------------------------------- 出力 */

const pctOf = (x: number | undefined) => (x === undefined ? "—" : `${(x * 100).toFixed(0)}%`);

const KEYS = [...uses.keys()].sort();

console.log("バフ・デバフの全件監査 / Lv1の素の値 / 読むだけ\n");
console.log(`対象: モンスター ${ALL_MONSTER_TEMPLATES.length}種 + 目覚のアルケオス、スキル ${seen.size}件\n`);

console.log("══════════ 1. 効果ごとの値のばらつき ══════════\n");
console.log("  キー                        使用数  値の種類(件数)");
console.log("  " + "─".repeat(86));
for (const key of KEYS) {
  const list = uses.get(key)!;
  const counts = new Map<string, number>();
  for (const u of list) {
    const v = u.amount === undefined ? "—" : pctOf(u.amount);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const spread = sorted.filter(([v]) => v !== "—").length;
  const mark = spread >= 2 ? " ← ばらつき" : "";
  console.log(
    `  ${key.padEnd(26)} ${String(list.length).padStart(5)}   `
    + sorted.map(([v, c]) => `${v}×${c}`).join("  ") + mark,
  );
}

console.log("\n══════════ 2. 持続ターンのばらつき ══════════\n");
console.log("  キー                        ターン(件数)");
console.log("  " + "─".repeat(86));
for (const key of KEYS) {
  const list = uses.get(key)!;
  const counts = new Map<string, number>();
  for (const u of list) {
    const v = u.turns === undefined ? "—" : `${u.turns}T`;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (counts.size === 1 && counts.has("—")) continue;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`  ${key.padEnd(26)} ` + sorted.map(([v, c]) => `${v}×${c}`).join("  "));
}

console.log("\n══════════ 3. 付与確率のばらつき ══════════\n");
console.log("  キー                        確率(件数)  ※ chance 省略は確定付与");
console.log("  " + "─".repeat(86));
for (const key of KEYS) {
  const list = uses.get(key)!;
  const counts = new Map<string, number>();
  for (const u of list) {
    const v = u.chance === undefined ? "確定" : pctOf(u.chance);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`  ${key.padEnd(26)} ` + sorted.map(([v, c]) => `${v}×${c}`).join("  "));
}

if (FULL) {
  console.log("\n══════════ 4. 使用箇所の全件 ══════════");
  for (const key of KEYS) {
    const list = uses.get(key)!;
    console.log(`\n── ${key} (${list.length}件) ──`);
    for (const u of [...list].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))) {
      console.log(
        `  ${pctOf(u.amount).padStart(6)} ${(u.turns === undefined ? "—" : `${u.turns}T`).padStart(3)}`
        + ` ${(u.chance === undefined ? "確定" : pctOf(u.chance)).padStart(5)}`
        + ` ${(u.applyTo ?? "対象").padEnd(14)} ${u.monster.padEnd(22)} ${u.skillName}`,
      );
      console.log(`         └ ${u.description}`);
    }
  }
}
