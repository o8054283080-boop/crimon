import { getElementAffinity } from "../core/element.js";
import { Skill } from "../core/skill.js";
import { BattleUnit, hasStatus, hpRatio } from "./unit.js";

export interface SkillChoice {
  skill: Skill;
  index: 0 | 1 | 2;
}

/**
 * 簡易AI: クールタイムが明けている中で最も強力な(番号が大きい)スキルを優先する。
 * skill 0 は常にクールタイム無しなので必ずフォールバックとして使用可能。
 */
export const HEAL_SKILL_HP_THRESHOLD = 0.8;

export function chooseSkill(unit: BattleUnit, allUnits: BattleUnit[] = [unit]): SkillChoice {
  if (hasStatus(unit, "SKILL_LOCK")) return { skill: unit.def.skills[0], index: 0 };
  for (let i = 2; i >= 1; i -= 1) {
    if (unit.cooldowns[i] === 0) {
      const skill = unit.def.skills[i];
      const hasHeal = skill.effects.some((effect) => effect.kind === "HEAL");
      const allies = allUnits.filter((candidate) => candidate.team === unit.team && candidate.alive);
      if (hasHeal && allies.every((ally) => hpRatio(ally) >= HEAL_SKILL_HP_THRESHOLD)) continue;
      return { skill, index: i as 1 | 2 };
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
      const isAttackBuff = skill.effects.some((effect) => effect.kind === "BUFF" && effect.stat === "atk");
      if (isAttackBuff) {
        const preferred = allies.find((ally) => ally.def.primaryTarget)
          ?? [...allies].sort((a, b) => b.def.stats.atk - a.def.stats.atk)[0];
        return preferred ? [preferred] : [];
      }
      const sorted = [...allies].sort((a, b) => hpRatio(a) - hpRatio(b));
      return sorted.length > 0 ? [sorted[0]] : [];
    }

    case "SINGLE_ENEMY": {
      const taunt = unit.statusEffects.find((effect) => effect.type === "TAUNT");
      if (taunt?.sourceId) {
        const source = enemies.find((enemy) => enemy.instanceId === taunt.sourceId);
        if (source) return [source];
        unit.statusEffects = unit.statusEffects.filter((effect) => effect !== taunt);
      }
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
