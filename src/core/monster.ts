import { Element, ELEMENT_COLOR, ELEMENT_JA, ELEMENTS } from "./element.js";
import { Skill } from "./skill.js";
import { Stats, cloneStats } from "./stats.js";

/** モンスターの「原型」。6属性の色違いバリエーションのベースとなる */
export interface MonsterTemplate {
  templateId: string;
  baseName: string;
  role: string;
  baseStats: Stats;
  skills: [Skill, Skill, Skill];
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

export function createMonsterVariant(template: MonsterTemplate, element: Element): MonsterDefinition {
  const flavoredStats = ELEMENT_STAT_FLAVOR[element](cloneStats(template.baseStats));
  return {
    id: `${template.templateId}_${element}`,
    templateId: template.templateId,
    name: `${template.baseName}[${ELEMENT_JA[element]}]`,
    element,
    color: ELEMENT_COLOR[element],
    role: template.role,
    stats: flavoredStats,
    skills: template.skills,
  };
}

/** テンプレートから6属性すべての色違いバリエーションを生成する */
export function createAllVariants(template: MonsterTemplate): MonsterDefinition[] {
  return ELEMENTS.map((element) => createMonsterVariant(template, element));
}
