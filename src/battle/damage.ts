import { ElementAffinity, getElementAffinity, getElementMultiplier } from "../core/element.js";
import { SW_CRIT_SHIFT, SW_GLANCING_CHANCE, SW_GLANCING_MULTIPLIER, balanceFlags } from "../core/balanceFlags.js";
import { DamageEffect, EffectCondition, SCALE_REFERENCE } from "../core/skill.js";
import { CRIT_RATE_TAKEN_DOWN, CRIT_RATE_TAKEN_UP } from "../core/statusValues.js";
import {
  BattleUnit,
  countDebuffs,
  getEffectiveStat,
  hasAnyBuff,
  hasStatus,
  passiveEffectOf,
  passiveHpDamageBonus,
} from "./unit.js";
import { applyDefense, calculateBaseDamage, roundNormalDamage } from "./damageFormula.js";

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
    case "TARGET_GAUGE_ABOVE_50": return target.gauge >= 50;
    case "TARGET_DEBUFF_AT_LEAST_2": return countDebuffs(target) >= 2;
    case "TARGET_DEBUFF_AT_LEAST_3": return countDebuffs(target) >= 3;
    case "SELF_HP_ABOVE_50": return source.currentHp / source.maxHp >= 0.5;
    /*
     * 実効値どうしで比べる。**素の値ではない。**
     * 防御バフを撒いてから撃つ、相手を遅くしてから撃つ、という
     * 手順そのものが条件を満たしにいく動きになる。
     */
    case "SELF_DEF_ABOVE_TARGET": return getEffectiveStat(source, "def") > getEffectiveStat(target, "def");
    case "TARGET_SPD_ABOVE_SELF": return getEffectiveStat(target, "spd") > getEffectiveStat(source, "spd");
    // 解決の文脈が要る条件は、ここでは判定できない
    case "ANY_CRIT": case "CRITS_AT_LEAST_2": case "CRITS_AT_LEAST_3":
    case "STUN_FAILED": case "KILLED_TARGET": case "STRIPPED_TARGET":
      return false;
  }
}

/**
 * 防御力による軽減は `1000 / (1000 + 1.2 × DEF)`。**攻撃力は見ない。**
 *
 * 以前は攻める側の攻撃力との比で決めていた(方式E)。段階に依存しない良さがあった反面、
 * **攻撃を積めばどんな防御も抜けてしまう**ので、HPを積むほうが常に得という形になっていた。
 * 依頼主とChatGPTの相談で、HPと防御が釣り合うようサマナーズウォー寄りの式へ入れ替えた。
 *
 * いまの式では軽減率がDEFの値だけで確定する。攻撃側にできるのは
 * **防御無視と防御低下**で、そこが編成の分かれ目になる。
 *
 * 式そのものは `damageFormula.ts`。旧式に戻して比べる道は
 * `balanceFlags.defenseFormula = "legacy"` に残してある。
 */
export interface DamageResult {
  damage: number;
  isCrit: boolean;
  affinity: ElementAffinity;
  /**
   * サマナーズウォー方式で「かすり」になったか。
   * **この一撃では弱体を入れられない。**戦闘側が見て弱体付与を止める。
   */
  isGlancing?: boolean;
}

/**
 * 才能適応による被ダメージの軽減倍率。
 *
 * **同じ相手から連続で攻撃を受けるほど、その相手からのダメージが効かなくなる。**
 * 段数を進めるのも戻すのも `BattleEngine` の仕事で、ここは今の段を読むだけ
 * (ダメージ計算はヒットごとに走るので、ここで数えると多段攻撃1回で
 * 上限まで積み上がってしまう)。
 */
export function adaptationMultiplier(attacker: BattleUnit, defender: BattleUnit): number {
  const trait = defender.def.bossTraits?.talentAdaptation;
  if (!trait) return 1;
  const stacks = defender.adaptationStacks?.get(attacker.instanceId) ?? 0;
  if (stacks <= 0) return 1;
  return 1 - Math.min(trait.maxReduction, stacks * trait.perStack);
}

/**
 * 水の祝福による被クリ率の低下。**張り主自身には効かない。**
 * 守る側が同時にいちばん会心されにくくなると、狙う場所が無くなる。
 */
function waterBlessingCritReduction(defender: BattleUnit): number {
  for (const holder of defender.alliesForAura ?? []) {
    if (!holder.alive || holder === defender) continue;
    const aura = passiveEffectOf(holder);
    if (aura?.kind === "WATER_BLESSING") return aura.critTaken;
  }
  return 0;
}

export function getFinalCritRate(attacker: BattleUnit, defender: BattleUnit, skillBonus = 0): number {
  const weak = passiveEffectOf(attacker);
  const conditionalCrit = weak?.kind === "WEAK_POINT" && defender.currentHp / defender.maxHp <= weak.hpRatio ? weak.critRate : 0;
  const rate = conditionalCrit + getEffectiveStat(attacker, "criRate")
    + skillBonus
    // 被クリ率の上げ下げ。**受ける側に付く**効果なので、名前の UP/DOWN は相手から見た向き
    + (hasStatus(defender, "CRIT_RATE_UP") ? CRIT_RATE_TAKEN_UP : 0)
    - (hasStatus(defender, "CRIT_RATE_DOWN") ? CRIT_RATE_TAKEN_DOWN : 0)
    // 水の祝福。**守られているのは自分以外の味方**なので、防御側の仲間を辿る
    - waterBlessingCritReduction(defender);
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
  /*
   * 取り巻きが倒れて手に入れた防御無視も、ここで一緒に見る。
   * **足すのではなく大きい方を取る**——重ねると、防御役が
   * どれだけ積んでも意味を持たない相手が出来てしまう。
   */
  const weak = passiveEffectOf(attacker);
  const weakActive = weak?.kind === "WEAK_POINT" && defenderRatio <= weak.hpRatio;
  const debuffIgnore = effect.debuffIgnoreDefense && countDebuffs(defender) >= effect.debuffIgnoreDefense.count ? effect.debuffIgnoreDefense.ratio : 0;
  // 条件付きの防御無視。当たること自体は条件に左右されない
  const condIgnore = effect.conditionalIgnoreDefense
    && evaluateTargetCondition(effect.conditionalIgnoreDefense.when, attacker, defender)
    ? effect.conditionalIgnoreDefense.ratio : 0;
  const ratio = Math.max(0, Math.min(1, Math.max(
    effect.ignoreDefenseRatio ?? 0, hpIgnore?.ratio ?? 0, attacker.deathBoostDefenseIgnore ?? 0, debuffIgnore, condIgnore,
    weakActive ? weak.ignore : 0,
  )));
  const def = getEffectiveStat(defender, "def") * (1 - ratio);

  const scaleBonusStatValue = effect.scaleBonus
    ? effect.scaleBonus.stat === "hp"
      ? attacker.maxHp
      : getEffectiveStat(attacker, effect.scaleBonus.stat)
    : 0;
  // 基準値に対する割合。基準の半分なら上乗せも半分になる
  const prey = passiveEffectOf(attacker);
  const passiveSpeedBonus = prey?.kind === "SCENT_OF_PREY"
    ? (prey.speedCoefficient ?? 0) * getEffectiveStat(attacker, "spd") / 200 : 0;
  const scaleBonus = passiveSpeedBonus + (effect.scaleBonus
    ? effect.scaleBonus.bonusAtReference * (scaleBonusStatValue / SCALE_REFERENCE[effect.scaleBonus.stat])
    : 0);
  /*
   * HP比例とDEF比例は**両方同時に乗る。**
   *
   * ここを三項演算子で排他にしていた頃は、両方書いた技から
   * **DEF項が黙って消えていた**(既存のスキルはどれも片方しか持たず、
   * モッチーのS1がATK・最大HP・防御力の3つを足す初めての技になった)。
   */
  const dependentStat = effect.hpCoefficient !== undefined ? attacker.maxHp : 0;
  // ベヒモスの「古代巨獣」は、HPが減るほど最大HP比例のダメージが伸びる
  const hpDamageBonus = effect.hpCoefficient !== undefined ? passiveHpDamageBonus(attacker) : 0;
  const coefficient = (effect.hpCoefficient ?? 0) * (1 + hpDamageBonus);
  const defStat = effect.defCoefficient !== undefined ? getEffectiveStat(attacker, "def") : 0;
  const defCoefficient = effect.defCoefficient ?? 0;
  const debuffCount = countDebuffs(defender);
  const debuffBonus = effect.debuffDamageBonus
    ? Math.min(effect.debuffDamageBonus.maxBonus, debuffCount * effect.debuffDamageBonus.perDebuff) : 0;

  /*
   * ここから下は「最終ダメージへの上乗せ」。
   * **足し算でまとめてから1度だけ掛ける。** 掛け算で重ねると、条件が2つ揃った時に
   * 想定の倍以上へ跳ねる(HP30%以下の相手に処刑技を撃った時が実際にそうなった)。
   */
  let finalBonus = (effect.finalDamageBonus ?? 0) + (effect.currentHpBonus ?? 0) * defenderRatio + (defenderRatio >= 1 ? effect.fullHpBonus ?? 0 : 0);
  if (prey?.kind === "REBIRTH") finalBonus += prey.damage * defenderRatio;
  /*
   * ガッツチャージ。**与えるダメージへの上乗せ**であって攻撃力ではない。
   * 攻撃力を上げると防御で削られる前の値が動き、
   * 「与えるダメージが+25%」より大きくも小さくもなってしまう。
   */
  if (prey?.kind === "GUTS_CHARGE") {
    finalBonus += prey.damageUp * Math.min(prey.maxStacks, attacker.gutsStacks ?? 0);
  }
  if (prey?.kind === "ILLUSION" && ["LIGHT", "DARK"].includes(defender.def.element)) finalBonus += .5;
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
  const perHitBase = calculateBaseDamage(
    atk, (effect.multiplier + scaleBonus) * (1 + debuffBonus), dependentStat, coefficient, defStat, defCoefficient,
  ) * (1 + finalBonus);
  const hits = Math.max(1, Math.floor(effect.hits ?? 1));
  // 割合軽減は線形なのでhitごとの結果と同じ。固定軽減だけは解決全体で算出し均等配賦する。
  const resolutionDefense = applyDefense(perHitBase * hits, atk, def, effect.ignoreDefense);
  const afterDefense = resolutionDefense.afterDefense / hits;

  const affinity = getElementAffinity(attacker.def.element, defender.def.element);
  /*
   * sw方式では属性の倍率を使わない(相性はクリ率とかすりで表す)。
   * かすった時だけ 0.7 を掛ける。
   */
  const elementMultiplier = balanceFlags.elementMode === "sw"
    ? 1
    : getElementMultiplier(attacker.def.element, defender.def.element);

  /*
   * サマナーズウォー方式の属性相性。**倍率ではなく確率で効く。**
   * 有利はクリ率+15pt、不利はクリ率−15ptに加えて50%でかすり。
   * かすりは「ダメージ−30%・クリ不可・弱体不可」。
   */
  const swElement = balanceFlags.elementMode === "sw";
  const swCritBonus = swElement
    ? (affinity === "ADVANTAGE" ? SW_CRIT_SHIFT : affinity === "DISADVANTAGE" ? -SW_CRIT_SHIFT : 0)
    : 0;
  const isGlancing = swElement && affinity === "DISADVANTAGE" && rng() < SW_GLANCING_CHANCE;
  const isCrit = !isGlancing
    && (effect.alwaysCrit === true
      || rng() < getFinalCritRate(attacker, defender, (effect.critRateBonus ?? 0) + swCritBonus));
  const critMultiplier = isCrit ? (getEffectiveStat(attacker, "criDmg") + (weakActive ? weak.critDmg : 0)) * (1 + (effect.critDamageBonus ?? 0)) : 1;

  const dealtMultiplier = (attacker.def.combatMods?.damageDealtMultiplier ?? 1)
    // 高揚支援。**掛かっている間だけ**乗る
    * (attacker.damageDealtBonusTurns && attacker.damageDealtBonusTurns > 0
      ? 1 + (attacker.damageDealtBonus ?? 0) : 1);
  const takenMultiplier = (defender.def.combatMods?.damageTakenMultiplier ?? 1)
    * (defender.deathBoostDamageTaken ?? 1)
    * adaptationMultiplier(attacker, defender);
  // 軽減・パッシブによる被ダメージ減はここでは掛けない。
  // 無敵・シールド・かばうと同じ場所(applyIncomingDamage)で1度だけ掛ける

  const defensePassive = passiveEffectOf(defender);
  const critReduction = isCrit && defensePassive?.kind === "CHEAT" ? 1 - defensePassive.reduction : 1;
  const glancingMultiplier = isGlancing ? SW_GLANCING_MULTIPLIER : 1;
  const rawDamage = critReduction * afterDefense * elementMultiplier * glancingMultiplier * critMultiplier * dealtMultiplier * takenMultiplier;
  const damage = roundNormalDamage(rawDamage);

  return { damage, isCrit, affinity, isGlancing };
}
