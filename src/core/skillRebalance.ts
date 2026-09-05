import type { Skill, SkillEffect } from "./skill.js";
import type { PassiveSpec } from "./passive.js";

/** 9月の合意済み調整。実体化時に適用し、所持済み・継承済みの技にも反映する。 */
export function applySeptemberSkillBalance(skill: Skill): Skill {
  const change = (description: string, effects: SkillEffect[], rest: Partial<Skill> = {}): Skill =>
    ({ ...skill, description, effects, ...rest });
  switch (skill.id) {
    case "golem_s2_c": return change("敵単体に攻撃力1.5倍のダメージ。85%で防御力を50%低下させる(2ターン)。", [
      { kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "def", amount: 0.5, chance: 0.85, durationTurns: 2 }]);
    case "abyssreaper_s2_c": return change("敵単体の強化を1個奪い、行動ゲージを50%減少。さらに強化阻害と毒1スタックをそれぞれ90%で2ターン付与する。", [
      { kind: "STEAL_BUFF", count: 1 }, { kind: "GAUGE", amount: -0.5 },
      { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.9, durationTurns: 2 },
      { kind: "POISON", damageRatePerStack: 0.05, stacks: 1, chance: 0.9, durationTurns: 2 }]);
    case "kobold_s2_b": return change("敵単体に攻撃力1.75倍のダメージ。対象のHPが50%以下なら最終ダメージが33%増加。行動ゲージを30%吸収する。", [
      { kind: "DAMAGE", multiplier: 1.75, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.33 }] }, { kind: "GAUGE", amount: 0.3, drain: true }]);
    case "mushroon_s2_a": return change("敵全体に攻撃力0.75倍のダメージ。75%で毒2スタックを2ターン付与する。", [
      { kind: "DAMAGE", multiplier: 0.75 }, { kind: "POISON", damageRatePerStack: 0.05, stacks: 2, chance: 0.75, durationTurns: 2 }]);
    case "mimic_s2_a": return change("敵単体に攻撃力1.8倍＋自身の最大HP×0.04のダメージ。与えたダメージの40%を回復し、自身のHPが50%以下なら吸血率が20ポイント増加する。",
      skill.effects.map(e => e.kind === "DAMAGE" ? { ...e, multiplier: 1.8 } : e));
    case "behemoth_s2_a": return change("敵全体に攻撃力0.8倍＋自身の最大HP×0.05のダメージ。70%で攻撃力を50%低下させる(2ターン)。行動ゲージを30%減少させる。", [
      { kind: "DAMAGE", multiplier: 0.8, hpCoefficient: 0.05 },
      { kind: "DEBUFF", stat: "atk", amount: 0.5, chance: 0.7, durationTurns: 2 }, { kind: "GAUGE", amount: -0.3 }]);
    case "kobold_s3_a": return change("敵単体に攻撃力2.3倍のダメージ。攻撃前の対象HPが30%以下なら防御力を完全に無視する。", [
      { kind: "DAMAGE", multiplier: 2.3, targetHpIgnoreDefense: [{ hpRatio: 0.3, ratio: 1 }] }]);
    case "wisp_s3_c": return change("味方単体の行動ゲージを80%進め、速度を25%上昇させる(2ターン)。最大レベルでゲージ100%、速度3ターン、CT3。", [
      { kind: "GAUGE", amount: 0.8 }, { kind: "BUFF", stat: "spd", amount: 0.25, durationTurns: 2 }], {
      target: "SINGLE_ALLY", cooldownTurns: 4, maxLevelOverride: { cooldownTurns: 3, effects: [
        { kind: "GAUGE", amount: 1 }, { kind: "BUFF", stat: "spd", amount: 0.25, durationTurns: 3 }] } });
    case "valkyria_s3_b": return change("味方全体の行動ゲージを30%進め、速度と攻撃力を30%上昇させる(2ターン)。", [
      { kind: "GAUGE", amount: 0.3 }, { kind: "BUFF", stat: "spd", amount: 0.3, durationTurns: 2 },
      { kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 2 }]);
    case "fairy_s1": return change("敵単体に攻撃力0.7倍のダメージを与え、自身の最大HPの2%を回復。最大レベルでは1.0倍・4%回復。", skill.effects, {
      maxLevelOverride: { effects: [{ kind: "DAMAGE", multiplier: 1 }, { kind: "HEAL", healRate: 0.04, applyTo: "SELF" }] } });
    case "mimic_s3_b": return { ...skill, cooldownTurns: 4 };
    case "golem_s3_c": return { ...skill, description: skill.description + "最大レベルで自身に3ターン反射も付与する。", maxLevelOverride: { effects: [
      { kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: 0.3, durationTurns: 3 },
      { kind: "STATUS", status: "REFLECT", durationTurns: 3, applyTo: "SELF" }] } };
    case "griffon_s3_c": return { ...skill, description: skill.description + "さらに味方全体の行動ゲージを15%進める。", effects: [...skill.effects, { kind: "GAUGE", amount: 0.15 }] };
    case "treant_s2_c": return { ...skill, description: skill.description + "回復量は自身の最大HPの30%まで。最大レベルでは攻撃力1.5倍＋最大HP×0.06のダメージ。",
      effects: skill.effects.map(e => e.kind === "LIFESTEAL" ? { ...e, maxSourceHpRate: 0.3 } : e),
      maxLevelOverride: { effects: [{ kind: "DAMAGE", multiplier: 1.5, hpCoefficient: 0.06 }, { kind: "LIFESTEAL", healRate: 0.472, maxSourceHpRate: 0.3 }] } };
    case "mushroon_s3_dark": return { ...skill, description: skill.description + "最大レベルでは全体0.5倍の3回攻撃になり、各攻撃後65%で毒1スタックを3ターン付与する。弱体数による威力増加は維持する。",
      maxLevelOverride: { effects: Array.from({ length: 3 }, (): SkillEffect[] => [
        { kind: "DAMAGE", multiplier: 0.5, debuffDamageBonus: { perDebuff: 0.06, maxBonus: 0.3 } },
        { kind: "POISON", damageRatePerStack: 0.059, stacks: 1, chance: 0.65, durationTurns: 3 }]).flat() } };
    case "kobold_s3_c": return { ...skill, description: "パッシブ。HP50%以下の敵への最終ダメージが20%上昇し、常時攻撃力25%・速度15が上昇。すべての攻撃に速度比例の威力を加算する(速度200で攻撃力0.15倍ぶん)。",
      passive: skill.passive && { ...skill.passive, levels: skill.passive.levels.map(e => e.kind === "SCENT_OF_PREY" ? { ...e, damageUp: 0.2, atkUp: 0.25, spd: 15, speedCoefficient: 0.15 } : e) as unknown as PassiveSpec["levels"] } };
    default: return skill;
  }
}
