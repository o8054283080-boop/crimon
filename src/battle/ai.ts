import { getElementAffinity } from "../core/element.js";
import { Skill } from "../core/skill.js";
import { BattleUnit, hpRatio } from "./unit.js";

export interface SkillChoice {
  skill: Skill;
  index: 0 | 1 | 2;
}

/**
 * 簡易AI: クールタイムが明けている中で最も強力な(番号が大きい)スキルを優先する。
 * skill 0 は常にクールタイム無しなので必ずフォールバックとして使用可能。
 */
export function chooseSkill(unit: BattleUnit): SkillChoice {
  for (let i = 2; i >= 1; i -= 1) {
    if (unit.cooldowns[i] === 0) {
      return { skill: unit.def.skills[i], index: i as 1 | 2 };
    }
  }
  return { skill: unit.def.skills[0], index: 0 };
}

/** スキルの対象タイプに応じて対象ユニットを選ぶ */
export function chooseTargets(unit: BattleUnit, skill: Skill, allUnits: BattleUnit[]): BattleUnit[] {
  const allies = allUnits.filter((u) => u.team === unit.team && u.alive);
  const enemies = allUnits.filter((u) => u.team !== unit.team && u.alive);

  switch (skill.target) {
    case "SELF":
      return [unit];

    case "ALL_ALLIES":
      return allies;

    case "ALL_ENEMIES":
      return enemies;

    case "SINGLE_ALLY": {
      const sorted = [...allies].sort((a, b) => hpRatio(a) - hpRatio(b));
      return sorted.length > 0 ? [sorted[0]] : [];
    }

    case "SINGLE_ENEMY": {
      const affinityScore = (target: BattleUnit): number => {
        const affinity = getElementAffinity(unit.def.element, target.def.element);
        if (affinity === "ADVANTAGE") return 0;
        if (affinity === "NEUTRAL") return 1;
        return 2;
      };
      const sorted = [...enemies].sort((a, b) => {
        const scoreDiff = affinityScore(a) - affinityScore(b);
        if (scoreDiff !== 0) return scoreDiff;
        return hpRatio(a) - hpRatio(b);
      });
      return sorted.length > 0 ? [sorted[0]] : [];
    }

    default:
      return [];
  }
}
