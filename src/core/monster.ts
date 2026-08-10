import { Element, ELEMENT_COLOR, ELEMENT_JA, ELEMENTS } from "./element.js";
import { CombatModifiers } from "./equipment.js";
import { Skill } from "./skill.js";
import { Stats, cloneStats } from "./stats.js";

/**
 * モンスターの「原型」。6属性の色違いバリエーションのベースとなる。
 * スキル1(クールタイム無しの通常攻撃)は全属性共通だが、スキル2・3は属性ごとに
 * 異なる組み合わせになるよう、それぞれ候補(通常3種類)から属性に応じて1つ選ばれる。
 */
export interface MonsterTemplate {
  templateId: string;
  baseName: string;
  role: string;
  baseStats: Stats;
  skill1: Skill;
  skill2Variants: Skill[];
  skill3Variants: Skill[];
}

/** 属性ごとの色違いバリエーションとして実体化されたモンスター定義(静的データ) */
export interface MonsterDefinition {
  id: string;
  templateId: string;
  name: string;
  element: Element;
  color: string;
  role: string;
  stats: Stats;
  skills: [Skill, Skill, Skill];
  /** 装備セット由来の戦闘専用効果。装備なし(敵など)ではundefined */
  combatMods?: CombatModifiers;
}

/**
 * 属性ごとの簡単なステータス補正。同じモンスターでも属性違いで
 * 少しだけ得意分野が変わる(色違い=完全に同一ステータスではない)フレーバー付け。
 */
const ELEMENT_STAT_FLAVOR: Record<Element, (stats: Stats) => Stats> = {
  FIRE: (s) => ({ ...s, atk: Math.round(s.atk * 1.1) }),
  WATER: (s) => ({ ...s, def: Math.round(s.def * 1.1), hp: Math.round(s.hp * 1.05) }),
  ELECTRIC: (s) => ({ ...s, spd: Math.round(s.spd * 1.15) }),
  GRASS: (s) => ({ ...s, hp: Math.round(s.hp * 1.15) }),
  LIGHT: (s) => ({ ...s, criRate: Math.min(1, s.criRate + 0.1) }),
  DARK: (s) => ({ ...s, criDmg: s.criDmg + 0.2 }),
};

/** 属性(ELEMENTS配列中の並び順)に応じて、スキル候補の中から1つを決定的に選ぶ */
function pickSkillVariant(variants: Skill[], element: Element): Skill {
  const index = ELEMENTS.indexOf(element) % variants.length;
  return variants[index];
}

export function createMonsterVariant(template: MonsterTemplate, element: Element): MonsterDefinition {
  const flavoredStats = ELEMENT_STAT_FLAVOR[element](cloneStats(template.baseStats));
  const skill2 = pickSkillVariant(template.skill2Variants, element);
  const skill3 = pickSkillVariant(template.skill3Variants, element);
  return {
    id: `${template.templateId}_${element}`,
    templateId: template.templateId,
    name: `${template.baseName}[${ELEMENT_JA[element]}]`,
    element,
    color: ELEMENT_COLOR[element],
    role: template.role,
    stats: flavoredStats,
    skills: [template.skill1, skill2, skill3],
  };
}

/** テンプレートから6属性すべての色違いバリエーションを生成する */
export function createAllVariants(template: MonsterTemplate): MonsterDefinition[] {
  return ELEMENTS.map((element) => createMonsterVariant(template, element));
}
