import { ElementAffinity, getElementAffinity, getElementMultiplier } from "../core/element.js";
import { DamageEffect, EffectCondition, SCALE_REFERENCE } from "../core/skill.js";
import {
  BattleUnit,
  countDebuffs,
  getEffectiveStat,
  hasAnyBuff,
  hasStatus,
  passiveEffectOf,
  passiveHpDamageBonus,
} from "./unit.js";
import { applyDefenseE, calculateBaseDamage, roundNormalDamage } from "./damageFormula.js";

/**
 * 相手や自分の**今の状態だけ**で決まる条件を判定する。
 *
 * クリティカル回数のような「そのスキルの解決の中で起きたこと」は
 * ここでは見ない(ダメージ計算はヒットごとに走るので、まだ結果が出ていない)。
 * それらは戦闘側が解決の文脈を持って判定する。
 */
export function evaluateTargetCondition(condition: EffectCondition, source: BattleUnit, target: BattleUnit): boolean {
  const targetRatio = target.currentHp / target.maxHp;
  switch (condition) {
    case "TARGET_HAS_DEBUFF": return countDebuffs(target) > 0;
    case "TARGET_SPD_DOWN": return target.effects.some((e) => e.kind === "DEBUFF" && e.stat === "spd");
    case "TARGET_POISONED": return target.poisonStacks > 0;
    case "TARGET_TAUNTED": return hasStatus(target, "TAUNT");
    case "TARGET_HAS_BUFF": return hasAnyBuff(target);
    case "TARGET_HP_BELOW_50": return targetRatio <= 0.5;
    case "TARGET_HP_BELOW_30": return targetRatio <= 0.3;
    case "TARGET_HP_ABOVE_SELF": return targetRatio > source.currentHp / source.maxHp;
    case "TARGET_GAUGE_BELOW_20": return target.gauge <= 20;
    case "TARGET_DEBUFF_AT_LEAST_3": return countDebuffs(target) >= 3;
    case "SELF_HP_ABOVE_50": return source.currentHp / source.maxHp >= 0.5;
    // 解決の文脈が要る条件は、ここでは判定できない
    case "ANY_CRIT": case "CRITS_AT_LEAST_2": case "CRITS_AT_LEAST_3":
    case "STUN_FAILED": case "KILLED_TARGET":
      return false;
  }
}

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

export function getFinalCritRate(attacker: BattleUnit, defender: BattleUnit): number {
  const rate = getEffectiveStat(attacker, "criRate")
    + (hasStatus(defender, "CRIT_RATE_UP") ? 0.5 : 0)
    - (hasStatus(defender, "CRIT_RATE_DOWN") ? 0.3 : 0);
  return Math.max(0, Math.min(1, rate));
}

export function calcDamage(
  attacker: BattleUnit,
  defender: BattleUnit,
  effect: DamageEffect,
  rng: () => number,
): DamageResult {
  const atk = getEffectiveStat(attacker, "atk");
  const defenderRatio = defender.currentHp / defender.maxHp;
  // 対象のHPが下がるほど深く刺さる防御無視。当てはまるうち最も低い閾値の1つだけを使う
  const hpIgnore = [...(effect.targetHpIgnoreDefense ?? [])]
    .sort((a, b) => a.hpRatio - b.hpRatio)
    .find((tier) => defenderRatio <= tier.hpRatio);
  const ratio = Math.max(0, Math.min(1, Math.max(effect.ignoreDefenseRatio ?? 0, hpIgnore?.ratio ?? 0)));
  const def = getEffectiveStat(defender, "def") * (1 - ratio);

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
  // ベヒモスの「古代巨獣」は、HPが減るほど最大HP比例のダメージが伸びる
  const hpDamageBonus = effect.hpCoefficient !== undefined ? passiveHpDamageBonus(attacker) : 0;
  const coefficient = (effect.hpCoefficient ?? effect.defCoefficient ?? 0) * (1 + hpDamageBonus);
  const debuffCount = defender.effects.filter((e) => e.kind === "DEBUFF").length
    + defender.statusEffects.filter((e) => e.category === "DEBUFF").length
    + Number(defender.poisonStacks > 0) + Number(defender.healBlockTurns > 0) + Number(defender.stunTurns > 0);
  const debuffBonus = effect.debuffDamageBonus
    ? Math.min(effect.debuffDamageBonus.maxBonus, debuffCount * effect.debuffDamageBonus.perDebuff) : 0;

  /*
   * ここから下は「最終ダメージへの上乗せ」。
   * **足し算でまとめてから1度だけ掛ける。** 掛け算で重ねると、条件が2つ揃った時に
   * 想定の倍以上へ跳ねる(HP30%以下の相手に処刑技を撃った時が実際にそうなった)。
   */
  let finalBonus = effect.finalDamageBonus ?? 0;
  const hpTier = [...(effect.targetHpBonus ?? [])]
    .sort((a, b) => a.hpRatio - b.hpRatio)
    .find((tier) => defenderRatio <= tier.hpRatio);
  if (hpTier) finalBonus += hpTier.bonus;
  for (const entry of effect.conditionalBonus ?? []) {
    if (evaluateTargetCondition(entry.when, attacker, defender)) finalBonus += entry.bonus;
  }
  if (effect.missingHpBonus) {
    const lost = 1 - attacker.currentHp / attacker.maxHp;
    finalBonus += Math.min(effect.missingHpBonus.maxBonus, lost * effect.missingHpBonus.perLostRatio);
  }
  // コボルトの「獲物の匂い」は、弱った相手を狙うほど深く刺さる
  const scent = passiveEffectOf(attacker);
  if (scent?.kind === "SCENT_OF_PREY" && defenderRatio <= scent.hpRatio) finalBonus += scent.damageUp;

  // 最終ダメージへの上乗せは、ATK項だけでなくHP/DEF比例の項にも同じように掛ける。
  // 片方だけに掛けると、HP比例が主のモンスターでは条件を満たしてもほとんど変わらない
  const perHitBase = calculateBaseDamage(atk, (effect.multiplier + scaleBonus) * (1 + debuffBonus), dependentStat, coefficient)
    * (1 + finalBonus);
  const hits = Math.max(1, Math.floor(effect.hits ?? 1));
  // 割合軽減は線形なのでhitごとの結果と同じ。固定軽減だけは解決全体で算出し均等配賦する。
  const resolutionDefense = applyDefenseE(perHitBase * hits, atk, def, effect.ignoreDefense);
  const afterDefense = resolutionDefense.afterDefense / hits;

  const affinity = getElementAffinity(attacker.def.element, defender.def.element);
  const elementMultiplier = getElementMultiplier(attacker.def.element, defender.def.element);

  const isCrit = rng() < getFinalCritRate(attacker, defender);
  const critMultiplier = isCrit ? getEffectiveStat(attacker, "criDmg") : 1;

  const dealtMultiplier = attacker.def.combatMods?.damageDealtMultiplier ?? 1;
  const takenMultiplier = defender.def.combatMods?.damageTakenMultiplier ?? 1;
  // 軽減・パッシブによる被ダメージ減はここでは掛けない。
  // 無敵・シールド・かばうと同じ場所(applyIncomingDamage)で1度だけ掛ける

  const rawDamage = afterDefense * elementMultiplier * critMultiplier * dealtMultiplier * takenMultiplier;
  const damage = roundNormalDamage(rawDamage);

  return { damage, isCrit, affinity };
}
