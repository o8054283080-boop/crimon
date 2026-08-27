import { ElementAffinity, getElementAffinity, getElementMultiplier } from "../core/element.js";
import { DamageEffect, SCALE_REFERENCE } from "../core/skill.js";
import { BattleUnit, getEffectiveStat } from "./unit.js";
import { applyDefenseE, calculateBaseDamage, roundNormalDamage } from "./damageFormula.js";

/**
 * 防御力による軽減は、**攻める側の攻撃力との比**で決める。
 *
 * 以前は `防御 ÷ (防御 + 300)` という固定の定数だった。この300は序盤の防御力
 * (100〜200)に合わせた値で、終盤の防御3500では92%を弾いてしまい、
 * 補正のない技が相手のHPを1%も削れなくなっていた。
 * 定数を終盤に合わせ直すと、今度は序盤の防御力がほぼ無意味になる。
 *
 * 攻撃力との比なら段階に依存しない。攻撃と防御が釣り合っていれば常に50%軽減で、
 * 序盤の防御役も終盤の防御役も同じ意味を持つ。攻撃を積めば相手の防御を抜け、
 * 防御を積めば硬くなる、という関係が全編で成り立つ。
 */
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

  const scaleBonusStatValue = effect.scaleBonus
    ? effect.scaleBonus.stat === "hp"
      ? attacker.maxHp
      : getEffectiveStat(attacker, effect.scaleBonus.stat)
    : 0;
  // 基準値に対する割合。基準の半分なら上乗せも半分になる
  const scaleBonus = effect.scaleBonus
    ? effect.scaleBonus.bonusAtReference * (scaleBonusStatValue / SCALE_REFERENCE[effect.scaleBonus.stat])
    : 0;
  const dependentStat = effect.hpCoefficient !== undefined
    ? attacker.maxHp
    : effect.defCoefficient !== undefined
      ? getEffectiveStat(attacker, "def")
      : 0;
  const coefficient = effect.hpCoefficient ?? effect.defCoefficient ?? 0;
  const perHitBase = calculateBaseDamage(atk, effect.multiplier + scaleBonus, dependentStat, coefficient);
  const hits = Math.max(1, Math.floor(effect.hits ?? 1));
  // 割合軽減は線形なのでhitごとの結果と同じ。固定軽減だけは解決全体で算出し均等配賦する。
  const resolutionDefense = applyDefenseE(perHitBase * hits, atk, def, effect.ignoreDefense);
  const afterDefense = resolutionDefense.afterDefense / hits;

  const affinity = getElementAffinity(attacker.def.element, defender.def.element);
  const elementMultiplier = getElementMultiplier(attacker.def.element, defender.def.element);

  const isCrit = rng() < getEffectiveStat(attacker, "criRate");
  const critMultiplier = isCrit ? getEffectiveStat(attacker, "criDmg") : 1;

  const dealtMultiplier = attacker.def.combatMods?.damageDealtMultiplier ?? 1;
  const takenMultiplier = defender.def.combatMods?.damageTakenMultiplier ?? 1;

  const rawDamage = afterDefense * elementMultiplier * critMultiplier * dealtMultiplier * takenMultiplier;
  const damage = roundNormalDamage(rawDamage);

  return { damage, isCrit, affinity };
}
