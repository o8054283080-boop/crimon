import type {
  BuffEffect, CleanseEffect, DamageEffect, DebuffEffect, GaugeEffect, HealEffect,
  RegenEffect, ShieldEffect, Skill, SkillEffect, SkillTalentMods, StripEffect,
} from "./skill.js";
import { findSkillTalent, type SkillTalentEffect } from "./talentSkills.js";

/**
 * 取得したスキル才能を、その枠のスキルへ焼き込む。
 *
 * ## 組み替えでできることは、組み替えでやる
 *
 * 「使用後に自分のゲージ+10%」は `{ kind: "GAUGE", amount: 0.1, applyTo: "SELF" }`
 * を効果の配列へ足すだけで済む。**エンジンに才能ごとの分岐を作らない**のが
 * ここの仕事で、そうしておけば才能を増やしても戦闘側は触らずに済む。
 *
 * 組み替えでは書けないもの(このスキルだけ抵抗を低く扱う、シールドが乗っている
 * 間の反射)だけが `talentMods` としてスキルに載り、エンジンがそこを読む。
 *
 * ## 元の定義は壊さない
 *
 * 図鑑のスキルは全個体で共有している。**その場で書き換えると、
 * 才能を取った1体のせいで同じ技を持つ全員が変わる。**必ず複製して返す。
 */

/** 弱体扱いする効果。弱化成功率の才能はここにだけ乗る */
const DEBUFF_KINDS: ReadonlySet<SkillEffect["kind"]> = new Set([
  "DEBUFF", "STUN", "BURN", "POISON", "BLIND", "HEAL_BLOCK", "COOLDOWN_EXTEND", "STRIP",
]);

function cloneEffect<T extends SkillEffect>(effect: T): T {
  return { ...effect };
}

/**
 * 才能を1つ適用する。
 *
 * 効果の配列と `talentMods` を直に書き換える(呼ぶ側が複製済みの器を渡す)。
 */
function applyOne(effects: SkillEffect[], mods: SkillTalentMods, effect: SkillTalentEffect, skill: Skill): void {
  switch (effect.kind) {
    case "DAMAGE_MULT":
      for (const e of effects) {
        if (e.kind === "DAMAGE") (e as DamageEffect).multiplier *= 1 + effect.value;
      }
      break;
    case "CRIT_RATE":
      for (const e of effects) {
        if (e.kind === "DAMAGE") {
          const d = e as DamageEffect;
          d.critRateBonus = (d.critRateBonus ?? 0) + effect.value;
        }
      }
      break;
    case "COND_DAMAGE":
      for (const e of effects) {
        if (e.kind !== "DAMAGE") continue;
        const d = e as DamageEffect;
        d.conditionalBonus = [...(d.conditionalBonus ?? []), { when: effect.when, bonus: effect.value }];
      }
      break;
    case "IGNORE_DEF":
      for (const e of effects) {
        if (e.kind !== "DAMAGE") continue;
        const d = e as DamageEffect;
        // 完全無視の技へ足しても意味が無いので、そこは触らない
        if (d.ignoreDefense) continue;
        d.ignoreDefenseRatio = Math.min(1, (d.ignoreDefenseRatio ?? 0) + effect.value);
      }
      break;
    case "LIFESTEAL":
      effects.push({ kind: "LIFESTEAL", healRate: effect.value });
      break;
    case "SELF_GAUGE": {
      const gauge: GaugeEffect = { kind: "GAUGE", amount: effect.value, applyTo: "SELF" };
      if (effect.requires) gauge.requires = effect.requires;
      effects.push(gauge);
      break;
    }
    case "TARGET_GAUGE":
      /*
       * **味方へ向く技かどうかで意味が変わる。**敵を狙う技に足すと
       * 相手のゲージを進めてしまうので、味方向けの技にだけ足す。
       */
      if (skill.target === "SINGLE_ALLY" || skill.target === "ALL_ALLIES" || skill.target === "SELF") {
        effects.push({ kind: "GAUGE", amount: effect.value });
      } else {
        effects.push({ kind: "GAUGE", amount: effect.value, applyTo: "LOWEST_HP_ALLY" });
      }
      break;
    case "HEAL_MULT":
      for (const e of effects) {
        if (e.kind === "HEAL") (e as HealEffect).healRate *= 1 + effect.value;
        else if (e.kind === "REGEN") (e as RegenEffect).healRate *= 1 + effect.value;
      }
      break;
    case "HEAL_LOW_HP":
      for (const e of effects) {
        if (e.kind !== "HEAL") continue;
        const h = e as HealEffect;
        const current = h.lowHpExtra;
        h.lowHpExtra = current
          ? { hpRatio: Math.max(current.hpRatio, effect.hpRatio), extra: current.extra + effect.extra }
          : { hpRatio: effect.hpRatio, extra: effect.extra };
      }
      break;
    case "SELF_HEAL":
      effects.push({ kind: "HEAL", healRate: effect.value, applyTo: "SELF" });
      break;
    case "CLEANSE": {
      const cleanse: CleanseEffect = { kind: "CLEANSE", count: effect.count };
      if (effect.chance < 1) cleanse.chance = effect.chance;
      /*
       * **敵を狙う技に置く時は、味方へ向け直す。**
       * 攻撃技に付いた「浄化補助」は自分の弱体を解くためのもので、
       * 相手の弱体を消してやるためのものではない。
       */
      if (skill.target === "SINGLE_ENEMY" || skill.target === "ALL_ENEMIES") cleanse.applyTo = "SELF";
      // 解除は回復や強化より先に行う(回復阻害を剥がしてから回復する)
      effects.unshift(cleanse);
      break;
    }
    case "STRIP": {
      const strip: StripEffect = { kind: "STRIP", count: effect.count };
      if (effect.chance < 1) strip.chance = effect.chance;
      // 攻撃・弱化の**前**に置く。剥がしてから通すのがこの才能の意味
      effects.unshift(strip);
      break;
    }
    case "SHIELD": {
      const shield: ShieldEffect = {
        kind: "SHIELD", shieldRate: effect.rate, durationTurns: effect.turns, fixedDuration: true,
      };
      if (skill.target === "SINGLE_ENEMY" || skill.target === "ALL_ENEMIES") shield.applyTo = "SELF";
      effects.push(shield);
      break;
    }
    case "REGEN": {
      const regen: RegenEffect = {
        kind: "REGEN", healRate: effect.rate, durationTurns: effect.turns, fixedDuration: true,
      };
      if (skill.target === "SINGLE_ENEMY" || skill.target === "ALL_ENEMIES") regen.applyTo = "SELF";
      effects.push(regen);
      break;
    }
    case "SELF_BUFF":
      effects.push({
        kind: "BUFF", stat: effect.stat, amount: effect.amount,
        durationTurns: effect.turns, applyTo: "SELF", fixedDuration: true,
      });
      break;
    case "TARGET_BUFF":
      /*
       * **量が負なら弱体。**「速度ダウン1ターンを30%で」を
       * BUFF に負の量で書くと、画面にも強化として並んでしまう。
       */
      if (effect.amount < 0) {
        effects.push({
          kind: "DEBUFF", stat: effect.stat, amount: -effect.amount,
          durationTurns: effect.turns, chance: effect.chance, fixedDuration: true,
        });
      } else {
        const buff: BuffEffect = {
          kind: "BUFF", stat: effect.stat, amount: effect.amount,
          durationTurns: effect.turns, fixedDuration: true,
        };
        effects.push(buff);
      }
      break;
    case "BUFF_AMOUNT":
      for (const e of effects) {
        if (e.kind === "BUFF") (e as BuffEffect).amount *= 1 + effect.value;
      }
      break;
    case "DEBUFF_CHANCE":
      for (const e of effects) {
        if (!DEBUFF_KINDS.has(e.kind)) continue;
        const withChance = e as { chance?: number };
        // 確率が書かれていない効果は「常に試みる」なので、足す先が無い
        if (withChance.chance === undefined) continue;
        withChance.chance = Math.min(1, withChance.chance + effect.value);
      }
      break;
    case "DEBUFF_CHANCE_WHEN":
      mods.debuffChanceWhen = [...(mods.debuffChanceWhen ?? []), { when: effect.when, value: effect.value }];
      break;
    case "BUFF_EXTEND":
      mods.buffExtendChance = Math.max(mods.buffExtendChance ?? 0, effect.chance);
      break;
    case "DEBUFF_EXTEND":
      mods.debuffExtendChance = Math.max(mods.debuffExtendChance ?? 0, effect.chance);
      break;
    case "SHIELD_EXTEND":
      mods.shieldExtendChance = Math.max(mods.shieldExtendChance ?? 0, effect.chance);
      break;
    case "IGNORE_RESIST":
      mods.ignoreResistance = (mods.ignoreResistance ?? 0) + effect.value;
      break;
    case "GAUGE_MULT":
      for (const e of effects) {
        if (e.kind === "GAUGE") (e as GaugeEffect).amount *= 1 + effect.value;
      }
      break;
    case "GAUGE_LOW_HP":
      for (const e of effects) {
        if (e.kind !== "GAUGE" || (e as GaugeEffect).amount <= 0) continue;
        const g = e as GaugeEffect;
        const current = g.lowHpExtra;
        g.lowHpExtra = current
          ? { hpRatio: Math.max(current.hpRatio, effect.hpRatio), amount: current.amount + effect.extra }
          : { hpRatio: effect.hpRatio, amount: effect.extra };
      }
      break;
    case "GAUGE_COND":
      for (const e of effects) {
        if (e.kind !== "GAUGE" || (e as GaugeEffect).amount >= 0) continue;
        const g = e as GaugeEffect;
        // 減少量を増やすので、上乗せは負の向き
        const extra = -effect.value;
        g.conditionalExtra = g.conditionalExtra
          ? { when: g.conditionalExtra.when, amount: g.conditionalExtra.amount + extra }
          : { when: effect.when, amount: extra };
      }
      break;
    case "SHIELD_MULT":
      for (const e of effects) {
        if (e.kind === "SHIELD") (e as ShieldEffect).shieldRate *= 1 + effect.value;
      }
      break;
    case "SHIELD_HEAL":
      mods.shieldHeal = (mods.shieldHeal ?? 0) + effect.value;
      break;
    case "SHIELD_MITIGATE":
      mods.shieldMitigate = (mods.shieldMitigate ?? 0) + effect.value;
      break;
    case "SHIELD_REFLECT":
      mods.shieldReflect = (mods.shieldReflect ?? 0) + effect.value;
      break;
    case "SELF_GAUGE_ON_DEBUFF":
      mods.selfGaugeOnDebuff = (mods.selfGaugeOnDebuff ?? 0) + effect.value;
      break;
    case "TARGET_GAUGE_ON_DEBUFF":
      mods.targetGaugeOnDebuff = (mods.targetGaugeOnDebuff ?? 0) + effect.value;
      break;
    case "GAUGE_STEAL":
      mods.gaugeSteal = { chance: effect.chance, value: effect.value };
      break;
    case "DEBUFF_SPREAD":
      mods.debuffSpreadChance = Math.max(mods.debuffSpreadChance ?? 0, effect.chance);
      break;
    case "HEAL_SPLASH":
      mods.healSplash = (mods.healSplash ?? 0) + effect.value;
      break;
    case "GAUGE_CHAIN":
      mods.gaugeChain = (mods.gaugeChain ?? 0) + effect.value;
      break;
    case "GAUGE_DRAIN_SHARE":
      mods.gaugeDrainShare = (mods.gaugeDrainShare ?? 0) + effect.value;
      break;
    case "COOLDOWN_REFUND":
      mods.cooldownRefundChance = Math.max(mods.cooldownRefundChance ?? 0, effect.chance);
      break;
    case "FOLLOW_UP_S1":
      mods.followUpS1Chance = Math.max(mods.followUpS1Chance ?? 0, effect.chance);
      break;
    case "EXTRA_TURN":
      mods.extraTurnChance = Math.max(mods.extraTurnChance ?? 0, effect.chance);
      break;
    case "BUFFED_ALLY_DAMAGE":
      mods.buffedAllyDamage = { value: effect.value, turns: effect.turns };
      break;
  }
}

/**
 * その枠のスキルへ、取得済みのスキル才能とスキル覚醒を焼き込む。
 *
 * `talentIds` に**もう付けられない才能**が混ざっていても素通りする
 * (継承で中身が変わった時のptの返却は `game` 層の仕事で、
 * ここは「今の技に何が乗るか」だけを見る)。
 */
export function applySkillTalents(skill: Skill, talentIds: readonly string[]): Skill {
  if (talentIds.length === 0) return skill;
  const effects: SkillEffect[] = skill.effects.map(cloneEffect);
  const mods: SkillTalentMods = { ...(skill.talentMods ?? {}) };
  let applied = false;
  for (const id of talentIds) {
    const def = findSkillTalent(id);
    if (!def) continue;
    for (const effect of def.effects) applyOne(effects, mods, effect, skill);
    applied = true;
  }
  if (!applied) return skill;
  const next: Skill = { ...skill, effects };
  if (Object.keys(mods).length > 0) next.talentMods = mods;
  return next;
}
