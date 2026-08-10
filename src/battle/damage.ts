import { ElementAffinity, getElementAffinity, getElementMultiplier } from "../core/element.js";
import { DamageEffect } from "../core/skill.js";
import { BattleUnit, getEffectiveStat } from "./unit.js";

/** 防御力によるダメージ軽減の緩和係数。大きいほど防御力の効きが穏やかになる */
const DEFENSE_SOFTENING_CONSTANT = 300;

export interface DamageResult {
  damage: number;
  isCrit: boolean;
  affinity: ElementAffinity;
}

export function calcDamage(
  attacker: BattleUnit,
  defender: BattleUnit,
  effect: DamageEffect,
  rng: () => number,
): DamageResult {
  const atk = getEffectiveStat(attacker, "atk");
  const def = getEffectiveStat(defender, "def");

  const base = atk * effect.multiplier;
  const mitigation = def / (def + DEFENSE_SOFTENING_CONSTANT);
  const afterDefense = base * (1 - mitigation);

  const affinity = getElementAffinity(attacker.def.element, defender.def.element);
  const elementMultiplier = getElementMultiplier(attacker.def.element, defender.def.element);

  const isCrit = rng() < attacker.def.stats.criRate;
  const critMultiplier = isCrit ? attacker.def.stats.criDmg : 1;

  const dealtMultiplier = attacker.def.combatMods?.damageDealtMultiplier ?? 1;
  const takenMultiplier = defender.def.combatMods?.damageTakenMultiplier ?? 1;

  const rawDamage = afterDefense * elementMultiplier * critMultiplier * dealtMultiplier * takenMultiplier;
  const damage = Math.max(1, Math.round(rawDamage));

  return { damage, isCrit, affinity };
}
