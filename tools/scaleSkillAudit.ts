/**
 * HP比例・DEF比例のダメージを持つスキルを全件洗い出す。
 *
 * **係数はスキルレベルで伸びるものと伸びないものがある。**
 * 既存モンスターの `computeLeveledSkill` は `multiplier` しか伸ばさないので
 * 比例係数はLv1〜5で不変。一方 `fourSpecies.ts` の新種は `levelOverrides` を
 * 持っていて、`power()` が `hpCoefficient` にも同じ倍率を掛ける。
 * どちらなのかを一覧に出さないと、係数を触った時の効き方を読み違える。
 *
 *   npx tsx tools/scaleSkillAudit.ts            # 全件
 *   npx tsx tools/scaleSkillAudit.ts --hp       # HP比例だけ
 *   npx tsx tools/scaleSkillAudit.ts --def      # DEF比例だけ
 *   npx tsx tools/scaleSkillAudit.ts --md       # 表として出す
 */
import { ELEMENTS, ELEMENT_JA, type Element } from "../src/core/element.js";
import { createMonsterVariant, type MonsterTemplate } from "../src/core/monster.js";
import { computeLeveledSkill, MAX_SKILL_LEVEL, type DamageEffect, type Skill } from "../src/core/skill.js";
import {
  ALL_MONSTER_TEMPLATES,
  GACHA_STAR3_TEMPLATES,
  GACHA_STAR4_TEMPLATES,
  GACHA_STAR5_TEMPLATES,
} from "../src/data/monsters.js";

/** 召喚の抽選プールから★を引く。どのプールにも居ないもの(塔の敵など)は0 */
const STAR_OF = new Map<string, number>();
for (const [star, pool] of [[3, GACHA_STAR3_TEMPLATES], [4, GACHA_STAR4_TEMPLATES], [5, GACHA_STAR5_TEMPLATES]] as const) {
  for (const template of pool) if (!STAR_OF.has(template.templateId)) STAR_OF.set(template.templateId, star);
}

interface Row {
  templateId: string;
  monster: string;
  star: number;
  elements: Element[];
  skillId: string;
  skillName: string;
  slot: 1 | 2 | 3;
  target: string;
  hits: number;
  multiplierLv1: number;
  multiplierLv5: number;
  hpLv1?: number;
  hpLv5?: number;
  defLv1?: number;
  defLv5?: number;
  cooldown: number;
  extras: string[];
}

const SINGLE = new Set(["SINGLE_ENEMY", "SINGLE_ALLY", "SELF"]);

function extras(effect: DamageEffect, skill: Skill): string[] {
  const out: string[] = [];
  if (effect.ignoreDefense) out.push("完全防御無視");
  if (effect.ignoreDefenseRatio) out.push(`防御無視${Math.round(effect.ignoreDefenseRatio * 100)}%`);
  if (effect.targetHpIgnoreDefense) out.push("低HPで防御無視");
  if (effect.currentHpBonus) out.push(`対象HP比例+${Math.round(effect.currentHpBonus * 100)}%`);
  if (effect.fullHpBonus) out.push(`満タン+${Math.round(effect.fullHpBonus * 100)}%`);
  if (effect.missingHpBonus) out.push(`自傷比例+最大${Math.round(effect.missingHpBonus.maxBonus * 100)}%`);
  if (effect.targetHpBonus) out.push("低HP追撃");
  if (effect.debuffDamageBonus) out.push("弱体数で増加");
  if (effect.conditionalBonus) out.push("条件付き増加");
  if (effect.scaleBonus) out.push(`${effect.scaleBonus.stat}補正`);
  for (const other of skill.effects) {
    if (other.kind === "DAMAGE") continue;
    out.push(other.kind);
  }
  return out;
}

function scan(): Row[] {
  const rows = new Map<string, Row>();
  for (const template of ALL_MONSTER_TEMPLATES as MonsterTemplate[]) {
    for (const element of ELEMENTS) {
      if (template.elements && !template.elements.includes(element)) continue;
      const def = createMonsterVariant(template, element);
      // 実体化した定義はスキルを配列で持つ。3枠すべてを持たない個体もいる(分身など)
      for (const [index, skill] of def.skills.entries()) {
        const slot = (index + 1) as 1 | 2 | 3;
        if (!skill) continue;
        const lv1 = computeLeveledSkill(skill, 1);
        const lv5 = computeLeveledSkill(skill, MAX_SKILL_LEVEL);
        const damages1 = lv1.effects.filter((e): e is DamageEffect => e.kind === "DAMAGE");
        const damages5 = lv5.effects.filter((e): e is DamageEffect => e.kind === "DAMAGE");
        for (let i = 0; i < damages1.length; i += 1) {
          const d1 = damages1[i];
          const d5 = damages5[i] ?? d1;
          if (d1.hpCoefficient === undefined && d1.defCoefficient === undefined) continue;
          const key = `${skill.id}#${i}`;
          const found = rows.get(key);
          if (found) {
            if (!found.elements.includes(element)) found.elements.push(element);
            continue;
          }
          rows.set(key, {
            templateId: template.templateId,
            monster: template.baseName,
            star: STAR_OF.get(template.templateId) ?? 0,
            elements: [element],
            skillId: skill.id,
            skillName: skill.name,
            slot,
            target: SINGLE.has(skill.target) ? "単体" : "全体",
            hits: Math.max(1, Math.floor(d1.hits ?? 1)),
            multiplierLv1: d1.multiplier,
            multiplierLv5: d5.multiplier,
            hpLv1: d1.hpCoefficient,
            hpLv5: d5.hpCoefficient,
            defLv1: d1.defCoefficient,
            defLv5: d5.defCoefficient,
            cooldown: lv5.cooldownTurns,
            extras: extras(d1, lv1),
          });
        }
      }
    }
  }
  return [...rows.values()];
}

const argv = process.argv.slice(2);
const onlyHp = argv.includes("--hp");
const onlyDef = argv.includes("--def");
const asTable = argv.includes("--md");

const all = scan()
  .filter((r) => (onlyHp ? r.hpLv1 !== undefined : true))
  .filter((r) => (onlyDef ? r.defLv1 !== undefined : true))
  .sort((a, b) => (a.templateId === b.templateId ? a.slot - b.slot : a.templateId.localeCompare(b.templateId)));

const fmt = (value: number | undefined) => (value === undefined ? "-" : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));
const elementsOf = (r: Row) => (r.elements.length === ELEMENTS.length ? "全" : r.elements.map((e) => ELEMENT_JA[e]).join("/"));

if (asTable) {
  console.log("| モンスター | ★ | 属性 | スキル | 枠 | 対象 | 回数 | 倍率Lv5 | HP比例Lv1 | HP比例Lv5 | DEF比例Lv1 | DEF比例Lv5 | CT | 追加効果 |");
  console.log("|---|---:|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const r of all) {
    console.log(`| ${r.monster} | ${r.star} | ${elementsOf(r)} | ${r.skillName} | S${r.slot} | ${r.target} | ${r.hits} | ${r.multiplierLv5.toFixed(2)} `
      + `| ${fmt(r.hpLv1)} | ${fmt(r.hpLv5)} | ${fmt(r.defLv1)} | ${fmt(r.defLv5)} | ${r.cooldown} | ${r.extras.join(" ") || "-"} |`);
  }
} else {
  for (const r of all) {
    const scale = r.hpLv1 !== undefined ? `HP×${fmt(r.hpLv1)}→${fmt(r.hpLv5)}` : `DEF×${fmt(r.defLv1)}→${fmt(r.defLv5)}`;
    console.log(`${r.monster}(★${r.star} ${elementsOf(r)}) S${r.slot} ${r.skillName} ${r.target}${r.hits > 1 ? `${r.hits}回` : ""} `
      + `倍率${r.multiplierLv1}→${r.multiplierLv5} ${scale} CT${r.cooldown} ${r.extras.join(" ")}`);
  }
  console.log(`\n${all.length}件`);
}
