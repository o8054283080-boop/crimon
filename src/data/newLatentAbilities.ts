import { Element, ELEMENTS } from "../core/element.js";
import {
  LatentAbilityCandidate, LatentAbilityCategory, LatentCondition, LatentRuntimeEffect,
} from "../core/monsterDevelopment.js";
import { BuffStat, EffectCondition } from "../core/skill.js";

/**
 * 追加11種の潜在覚醒。**66個体 × 3候補 = 198個。**
 *
 * ## なぜ自動生成に混ぜないのか
 *
 * 既存72個体の潜在は `src/data/latentAbilities.ts` が機械的に配っている。
 * あちらは「どの種族にも当てはまる汎用の3方向」を配る作りなので、
 * **その種族のスキル1が何をするかを見ていない。**
 *
 * 今回の11種は、依頼主が**スキル1ごとに噛み合う強化**を指定している
 * (毒を入れた時・速度を落とした時・挑発した時・解除に成功した時)。
 * 汎用の配り方ではその指定を表現できないので、ここに書き下ろす。
 *
 * ## 何を優先しているか
 *
 * 依頼主の指定どおり、**低確率で体感しづらいものを増やさない。**
 * ほとんどが「条件を満たせば必ず起きる」か「100%の小さな効果」で、
 * 確率に頼るものは元のスキル1の判定に相乗りしている。
 */

/* ---------- 効果の短縮記法。1行に収めるためだけの道具 ---------- */
const G = (value: number): LatentRuntimeEffect => ({ kind: "SELF_GAUGE", value });
const H = (value: number): LatentRuntimeEffect => ({ kind: "SELF_HEAL", value });
const LS = (value: number): LatentRuntimeEffect => ({ kind: "LIFESTEAL", value });
const CL = (count: number): LatentRuntimeEffect => ({ kind: "SELF_CLEANSE", count });
const SSH = (value: number, duration: number): LatentRuntimeEffect => ({ kind: "SELF_SHIELD", value, duration });
const AH = (value: number): LatentRuntimeEffect => ({ kind: "LOWEST_ALLY_HEAL", value });
const AG = (value: number, whenAllyHpBelow?: number, extra?: number): LatentRuntimeEffect =>
  ({ kind: "LOWEST_ALLY_GAUGE", value, whenAllyHpBelow, extra });
const ACL = (count: number): LatentRuntimeEffect => ({ kind: "LOWEST_ALLY_CLEANSE", count });
const ASH = (value: number, duration: number): LatentRuntimeEffect => ({ kind: "LOWEST_ALLY_SHIELD", value, duration });
const AMT = (value: number, duration: number): LatentRuntimeEffect => ({ kind: "LOWEST_ALLY_MITIGATE", value, duration });
const ABF = (stat: BuffStat, amount: number, duration: number): LatentRuntimeEffect =>
  ({ kind: "LOWEST_ALLY_BUFF", stat, amount, duration });
const ALLH = (value: number): LatentRuntimeEffect => ({ kind: "ALLY_HEAL", value });
const ALLG = (value: number): LatentRuntimeEffect => ({ kind: "ALLY_GAUGE_UP", chance: 1, value });
const TG = (value: number): LatentRuntimeEffect => ({ kind: "GAUGE_DOWN", chance: 1, value });
const STEAL = (count: number): LatentRuntimeEffect => ({ kind: "STEAL_BUFF", count });
const DRAIN = (value: number): LatentRuntimeEffect => ({ kind: "GAUGE_DRAIN_SHARE", value });
type DebuffStatus = Extract<LatentRuntimeEffect, { kind: "DEBUFF" }>["status"];
const DB = (status: DebuffStatus, duration: number): LatentRuntimeEffect => ({ kind: "DEBUFF", status, chance: 1, duration });

/* ---------- 条件の短縮記法 ---------- */
const on = (status: "POISON" | "SPD_DOWN" | "ATK_DOWN" | "DEF_DOWN" | "TAUNT" | "STRIP"): LatentCondition =>
  ({ kind: "ON_APPLIED", status });
const crit = (atLeast?: number): LatentCondition => ({ kind: "ON_CRIT", atLeast });
const kill: LatentCondition = { kind: "ON_KILL" };
const below = (ratio: number): LatentCondition => ({ kind: "TARGET_HP_BELOW", ratio });
const state = (s: EffectCondition): LatentCondition => ({ kind: "TARGET_STATE", state: s });

interface Draft {
  name: string;
  description: string;
  category?: LatentAbilityCategory;
  effects?: LatentRuntimeEffect[];
  condition?: LatentCondition;
  internalCooldown?: number;
  flat?: number;
  when?: { when: EffectCondition; bonus: number }[];
  hpTiers?: { hpRatio: number; bonus: number }[];
  hpIgnore?: { hpRatio: number; ratio: number }[];
  scale?: { stat: "spd" | "def" | "hp"; bonusAtReference: number };
  gaugeOverride?: number;
  chanceBonus?: LatentAbilityCandidate["chanceBonus"];
  chargeOnHit?: { perHit: number; maxBonus: number };
  chargeOnCrit?: { perHit: number; maxBonus: number };
  critDmgGrowth?: { perCrit: number; maxBonus: number };
  oneShotMitigate?: number;
  debuffBonus?: { perDebuff: number; maxBonus: number };
  hpMul?: number;
  defMul?: number;
  hpScale?: number;
  defScale?: number;
  ignoreDef?: number;
  damageIndex?: number;
}

function build(templateId: string, element: Element, index: 1 | 2 | 3, draft: Draft): LatentAbilityCandidate {
  return {
    id: `${templateId}_${element}_latent_${index}`,
    name: draft.name,
    description: draft.description,
    skillSlot: 0,
    category: draft.category ?? "OFFENSE",
    effectType: draft.hpScale !== undefined ? "HP_SCALING" : draft.defScale !== undefined ? "DEF_SCALING" : "DAMAGE_UP",
    value: draft.hpScale ?? draft.defScale ?? 0,
    chance: 1,
    duration: 0,
    target: "TARGET",
    resolution: "ALWAYS",
    runtimeEffects: draft.effects,
    condition: draft.condition,
    internalCooldown: draft.internalCooldown,
    flatDamageBonus: draft.flat,
    damageBonusWhen: draft.when,
    replaceTargetHpBonus: draft.hpTiers,
    addTargetHpIgnoreDefense: draft.hpIgnore,
    scaleBonusAdd: draft.scale,
    gaugeAmountOverride: draft.gaugeOverride,
    chanceBonus: draft.chanceBonus,
    chargeOnHit: draft.chargeOnHit,
    chargeOnCrit: draft.chargeOnCrit,
    critDmgGrowth: draft.critDmgGrowth,
    oneShotMitigate: draft.oneShotMitigate,
    debuffDamageBonus: draft.debuffBonus,
    ignoreDefenseRatio: draft.ignoreDef,
    damageEffectIndex: draft.damageIndex,
    hpMultiplier: draft.hpMul,
    defMultiplier: draft.defMul,
    grade: "A",
  };
}

/** 種族 → 属性 → 3候補 */
type SpeciesTable = Record<Element, [Draft, Draft, Draft]>;

const SUP: LatentAbilityCategory = "SUPPORT";
const DIS: LatentAbilityCategory = "DISRUPT";
const DUR: LatentAbilityCategory = "DURABILITY";

const MUSHROON: SpeciesTable = {
  FIRE: [
    { name: "猛毒培養", description: "スキル1の毒付与率が30%上がる", chanceBonus: { effectKind: "POISON", value: 0.3 } },
    { name: "腐食胞子", description: "スキル1で毒が入った時、1ターン防御力を50%低下させる", category: DIS, condition: on("POISON"), effects: [DB("DEF_DOWN", 1)] },
    { name: "胞子吸収", description: "スキル1使用時、自身のHPを最大HPの5%回復する", category: DUR, effects: [H(0.05)] },
  ],
  GRASS: [
    { name: "寄生菌糸", description: "対象が弱体状態なら、スキル1の最終ダメージが15%上がる", when: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.15 }] },
    { name: "衰弱菌", description: "スキル1で毒が入った時、1ターン攻撃力を50%低下させる", category: DIS, condition: on("POISON"), effects: [DB("ATK_DOWN", 1)] },
    { name: "共生菌", description: "スキル1使用時、HP割合が最も低い味方を最大HPの6%回復する", category: SUP, effects: [AH(0.06)] },
  ],
  ELECTRIC: [
    { name: "高速胞子", description: "スキル1使用時、自身の行動ゲージが8%進む", effects: [G(0.08)] },
    { name: "麻痺胞子", description: "スキル1で毒が入った時、対象の行動ゲージを20%減少させる", category: DIS, condition: on("POISON"), effects: [TG(0.2)] },
    { name: "電撃菌", description: "対象が速度低下状態なら、スキル1の最終ダメージが18%上がる", when: [{ when: "TARGET_SPD_DOWN", bonus: 0.18 }] },
  ],
  WATER: [
    { name: "湿地の毒", description: "毒状態の敵へのスキル1の最終ダメージが15%上がる", when: [{ when: "TARGET_POISONED", bonus: 0.15 }] },
    { name: "浄化菌", description: "スキル1使用時、自身の弱体効果を1個解除する(内部クールタイム2ターン)", category: DUR, effects: [CL(1)], internalCooldown: 2 },
    { name: "再生胞子", description: "スキル1使用時、自身のHPを最大HPの6%回復する", category: DUR, effects: [H(0.06)] },
  ],
  LIGHT: [
    { name: "聖胞子", description: "スキル1使用時、HP割合が最も低い味方を最大HPの5%回復する", category: SUP, effects: [AH(0.05)] },
    { name: "浄化胞子", description: "スキル1で毒が入った時、HP割合が最も低い味方の弱体効果を1個解除する", category: SUP, condition: on("POISON"), effects: [ACL(1)] },
    { name: "活性菌", description: "スキル1使用時、HP割合が最も低い味方の行動ゲージが8%進む", category: SUP, effects: [AG(0.08)] },
  ],
  DARK: [
    { name: "深淵菌", description: "対象の弱体効果1個につき、スキル1の最終ダメージが5%上がる(最大20%)", debuffBonus: { perDebuff: 0.05, maxBonus: 0.2 } },
    { name: "禁断胞子", description: "スキル1で毒が入った時、1ターン強化効果を受けられなくする", category: DIS, condition: on("POISON"), effects: [DB("BUFF_BLOCK", 1)] },
    { name: "捕食菌", description: "スキル1で与えたダメージの15%を自身が回復する", category: DUR, effects: [LS(0.15)] },
  ],
};

const SHELLTURTLE: SpeciesTable = {
  FIRE: [
    { name: "灼熱甲殻", description: "スキル1の防御力比例ダメージが上がる", defScale: 0.35 },
    { name: "崩し打ち", description: "スキル1で攻撃力低下が入った時、対象の行動ゲージを15%減少させる", category: DIS, condition: on("ATK_DOWN"), effects: [TG(0.15)] },
    { name: "熱吸収", description: "スキル1使用時、自身のHPを最大HPの5%回復する", category: DUR, effects: [H(0.05)] },
  ],
  GRASS: [
    { name: "大地の甲殻", description: "自身の最大HPが10%、防御力が10%上がる", category: DUR, hpMul: 1.1, defMul: 1.1 },
    { name: "泥濘打ち", description: "スキル1で攻撃力低下が入った時、1ターン速度を低下させる", category: DIS, condition: on("ATK_DOWN"), effects: [DB("SPD_DOWN", 1)] },
    { name: "守りの苔", description: "スキル1使用時、HP割合が最も低い味方へ自身の最大HPの8%のシールドを1ターン張る", category: SUP, effects: [ASH(0.08, 1)] },
  ],
  ELECTRIC: [
    { name: "帯電甲殻", description: "スキル1使用時、自身の行動ゲージが8%進む", effects: [G(0.08)] },
    { name: "痺れ打ち", description: "スキル1で攻撃力低下が入った時、対象の行動ゲージを20%減少させる", category: DIS, condition: on("ATK_DOWN"), effects: [TG(0.2)] },
    { name: "静電障壁", description: "スキル1の後、次に受けるダメージを10%軽減する(1回被弾で解除)", category: DUR, oneShotMitigate: 0.1 },
  ],
  WATER: [
    { name: "水圧甲殻", description: "スキル1の防御力比例ダメージが上がる", defScale: 0.35 },
    { name: "洗浄", description: "スキル1使用時、自身の弱体効果を1個解除する(内部クールタイム2ターン)", category: DUR, effects: [CL(1)], internalCooldown: 2 },
    { name: "潤いの甲羅", description: "スキル1使用時、自身のHPを最大HPの6%回復する", category: DUR, effects: [H(0.06)] },
  ],
  LIGHT: [
    { name: "慈光の甲羅", description: "スキル1使用時、HP割合が最も低い味方を最大HPの5%回復する", category: SUP, effects: [AH(0.05)] },
    { name: "励ましの一撃", description: "スキル1で攻撃力低下が入った時、HP割合が最も低い味方の行動ゲージが8%進む", category: SUP, condition: on("ATK_DOWN"), effects: [AG(0.08)] },
    { name: "聖盾", description: "スキル1使用時、HP割合が最も低い味方へ自身の最大HPの10%のシールドを1ターン張る", category: SUP, effects: [ASH(0.1, 1)] },
  ],
  DARK: [
    { name: "貫通甲殻", description: "スキル1が対象の防御力を15%無視する", ignoreDef: 0.15 },
    { name: "怨念蓄積", description: "攻撃を受けるたび次のスキル1の最終ダメージが5%上がる(最大20%、スキル1使用で戻る)", category: DUR, chargeOnHit: { perHit: 0.05, maxBonus: 0.2 } },
    { name: "闇喰らい", description: "スキル1で与えたダメージの15%を自身が回復する", category: DUR, effects: [LS(0.15)] },
  ],
};

const KOBOLD: SpeciesTable = {
  FIRE: [
    { name: "追撃の嗅覚", description: "スキル1の「対象HP50%以下で追加ダメージ」が20%から35%に上がる", hpTiers: [{ hpRatio: 0.5, bonus: 0.35 }] },
    { name: "傷抉り", description: "HPが50%以下の相手へのスキル1で、1ターン回復阻害を付与する", category: DIS, condition: below(0.5), effects: [DB("HEAL_BLOCK", 1)] },
    { name: "血の高揚", description: "HPが50%以下の相手へのスキル1で、自身の行動ゲージが10%進む", condition: below(0.5), effects: [G(0.1)] },
  ],
  GRASS: [
    { name: "森の狩人", description: "HPが50%以下の相手へのスキル1の最終ダメージが20%上がる", when: [{ when: "TARGET_HP_BELOW_50", bonus: 0.2 }] },
    { name: "足払い", description: "HPが50%以下の相手へのスキル1で、1ターン速度を低下させる", category: DIS, condition: below(0.5), effects: [DB("SPD_DOWN", 1)] },
    { name: "狩りの糧", description: "スキル1で相手を倒した時、自身のHPを最大HPの15%回復する", category: DUR, condition: kill, effects: [H(0.15)] },
  ],
  ELECTRIC: [
    { name: "疾走", description: "スキル1使用時、自身の行動ゲージが8%進む", effects: [G(0.08)] },
    { name: "膝砕き", description: "HPが50%以下の相手へのスキル1で、対象の行動ゲージを20%減少させる", category: DIS, condition: below(0.5), effects: [TG(0.2)] },
    { name: "会心の踏み込み", description: "スキル1がクリティカルした時、自身の行動ゲージが10%進む", condition: crit(), effects: [G(0.1)] },
  ],
  WATER: [
    { name: "研ぎ澄まし", description: "スキル1の最終ダメージが12%上がる", flat: 0.12 },
    { name: "腕折り", description: "HPが50%以下の相手へのスキル1で、1ターン攻撃力を50%低下させる", category: DIS, condition: below(0.5), effects: [DB("ATK_DOWN", 1)] },
    { name: "返しの刃", description: "スキル1で与えたダメージの12%を自身が回復する", category: DUR, effects: [LS(0.12)] },
  ],
  LIGHT: [
    { name: "先陣の合図", description: "スキル1使用時、HP割合が最も低い味方の行動ゲージが8%進む", category: SUP, effects: [AG(0.08)] },
    { name: "追い風", description: "HPが50%以下の相手を攻撃した時、味方全体の行動ゲージが4%進む", category: SUP, condition: below(0.5), effects: [ALLG(0.04)] },
    { name: "凱歌", description: "スキル1で相手を倒した時、味方全体のHPを最大HPの8%回復する", category: SUP, condition: kill, effects: [ALLH(0.08)] },
  ],
  DARK: [
    { name: "処刑人", description: "HPが50%以下の相手へのスキル1の最終ダメージが25%上がる", when: [{ when: "TARGET_HP_BELOW_50", bonus: 0.25 }] },
    { name: "鎧断ち", description: "HPが50%以下の相手へのスキル1で、1ターン防御力を50%低下させる", category: DIS, condition: below(0.5), effects: [DB("DEF_DOWN", 1)] },
    { name: "血の疾走", description: "スキル1で相手を倒した時、自身の行動ゲージが30%進む", condition: kill, effects: [G(0.3)] },
  ],
};

const BASILISK: SpeciesTable = {
  FIRE: [
    { name: "灼熱の毒", description: "スキル1で速度低下が入った時、2ターン毒を付与する", category: DIS, condition: on("SPD_DOWN"), effects: [DB("POISON", 2)] },
    { name: "遅滞の眼", description: "スキル1使用時、対象の行動ゲージを10%減少させる", category: DIS, effects: [TG(0.1)] },
    { name: "蛇の敏捷", description: "スキル1使用時、自身の行動ゲージが8%進む", effects: [G(0.08)] },
  ],
  GRASS: [
    { name: "蔦絡み", description: "速度低下状態の相手へのスキル1の最終ダメージが18%上がる", when: [{ when: "TARGET_SPD_DOWN", bonus: 0.18 }] },
    { name: "鱗剥がし", description: "スキル1で速度低下が入った時、1ターン防御力を50%低下させる", category: DIS, condition: on("SPD_DOWN"), effects: [DB("DEF_DOWN", 1)] },
    { name: "森の恵み", description: "スキル1使用時、自身のHPを最大HPの6%回復する", category: DUR, effects: [H(0.06)] },
  ],
  ELECTRIC: [
    { name: "雷光の眼", description: "スキル1使用時、自身の行動ゲージが10%進む", effects: [G(0.1)] },
    { name: "痺れ鱗", description: "スキル1で速度低下が入った時、対象の行動ゲージを20%減少させる", category: DIS, condition: on("SPD_DOWN"), effects: [TG(0.2)] },
    { name: "電導の鼓動", description: "スキル1がクリティカルした時、味方全体の行動ゲージが7%進む", category: SUP, condition: crit(), effects: [ALLG(0.07)] },
  ],
  WATER: [
    { name: "沼の締め付け", description: "速度低下状態の相手へのスキル1の最終ダメージが15%上がる", when: [{ when: "TARGET_SPD_DOWN", bonus: 0.15 }] },
    { name: "淀み", description: "スキル1で速度低下が入った時、対象の行動ゲージを15%減少させる", category: DIS, condition: on("SPD_DOWN"), effects: [TG(0.15)] },
    { name: "水鱗", description: "スキル1使用時、自身のHPを最大HPの7%回復する", category: DUR, effects: [H(0.07)] },
  ],
  LIGHT: [
    { name: "清眼", description: "スキル1使用時、自身の弱体効果を1個解除する(内部クールタイム2ターン)", category: DUR, effects: [CL(1)], internalCooldown: 2 },
    { name: "看破", description: "スキル1で速度低下が入った時、対象の有利な効果を1個解除する", category: DIS, condition: on("SPD_DOWN"), effects: [{ kind: "STRIP", chance: 1, count: 1 }] },
    { name: "導きの眼", description: "スキル1使用時、HP割合が最も低い味方の行動ゲージが8%進む", category: SUP, effects: [AG(0.08)] },
  ],
  DARK: [
    { name: "魔眼", description: "速度低下状態の相手へのスキル1の最終ダメージが25%上がる", when: [{ when: "TARGET_SPD_DOWN", bonus: 0.25 }] },
    { name: "呪縛", description: "スキル1で速度低下が入った時、1ターン強化効果を受けられなくする", category: DIS, condition: on("SPD_DOWN"), effects: [DB("BUFF_BLOCK", 1)] },
    { name: "時喰み", description: "スキル1で速度低下が入った時、対象の行動ゲージを25%減少させる", category: DIS, condition: on("SPD_DOWN"), effects: [TG(0.25)] },
  ],
};

const MIMIC: SpeciesTable = {
  FIRE: [
    { name: "灼ける宝物", description: "スキル1の最大HP比例ダメージが上がる", hpScale: 0.015 },
    { name: "封じの錠", description: "対象が回復阻害状態なら、スキル1で行動ゲージを15%減少させる", category: DIS, condition: state("TARGET_HAS_DEBUFF"), effects: [TG(0.15)] },
    { name: "貪欲な胃袋", description: "スキル1の吸収による回復が10%増える", category: DUR, effects: [LS(0.1)] },
  ],
  GRASS: [
    { name: "肥えた宝箱", description: "自身の最大HPが12%上がる", category: DUR, hpMul: 1.12 },
    { name: "蔦の錠前", description: "対象が弱体状態なら、スキル1で1ターン防御力を50%低下させる", category: DIS, condition: state("TARGET_HAS_DEBUFF"), effects: [DB("DEF_DOWN", 1)] },
    { name: "苔むす木箱", description: "スキル1使用時、自身のHPを最大HPの5%回復する", category: DUR, effects: [H(0.05)] },
  ],
  ELECTRIC: [
    { name: "帯電する錠", description: "スキル1使用時、自身の行動ゲージが8%進む", effects: [G(0.08)] },
    { name: "放電の鍵", description: "スキル1がクリティカルした時、味方全体の行動ゲージが7%進む", category: SUP, condition: crit(), effects: [ALLG(0.07)] },
    { name: "怒りの箱", description: "攻撃を受けるたび次のスキル1のダメージが8%上がる(最大24%、スキル1使用で戻る)", category: DUR, chargeOnHit: { perHit: 0.08, maxBonus: 0.24 } },
  ],
  WATER: [
    { name: "潤う宝物", description: "スキル1の吸収による回復が10%増える", category: DUR, effects: [LS(0.1)] },
    { name: "洗浄の水", description: "スキル1使用時、自身の弱体効果を1個解除する(内部クールタイム2ターン)", category: DUR, effects: [CL(1)], internalCooldown: 2 },
    { name: "湧き水の箱", description: "スキル1使用時、自身のHPを最大HPの6%回復する", category: DUR, effects: [H(0.06)] },
  ],
  LIGHT: [
    { name: "施しの箱", description: "スキル1使用時、HP割合が最も低い味方を最大HPの5%回復する", category: SUP, effects: [AH(0.05)] },
    { name: "守りの宝", description: "スキル1使用時、HP割合が最も低い味方へ自身の最大HPの8%のシールドを1ターン張る", category: SUP, effects: [ASH(0.08, 1)] },
    { name: "身代わりの鍵", description: "スキル1使用時、HP割合が最も低い味方の行動ゲージが5%進む", category: SUP, effects: [AG(0.05)] },
  ],
  DARK: [
    { name: "呪いの財宝", description: "弱体状態の敵へのスキル1の最終ダメージが20%上がる", when: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.2 }] },
    { name: "腐蝕の錠", description: "弱体状態の敵へのスキル1で、1ターン回復阻害を付与する", category: DIS, condition: state("TARGET_HAS_DEBUFF"), effects: [DB("HEAL_BLOCK", 1)] },
    { name: "強欲", description: "スキル1で与えたダメージの20%を自身が回復する", category: DUR, effects: [LS(0.2)] },
  ],
};

const VALKYRIA: SpeciesTable = {
  FIRE: [
    { name: "戦の祝福", description: "スキル1使用時、HP割合が最も低い味方の攻撃力を1ターン上昇させる", category: SUP, effects: [ABF("atk", 0.4, 1)] },
    { name: "翼の加速", description: "スキル1使用時、自身の行動ゲージが8%進む", effects: [G(0.08)] },
    { name: "勝鬨", description: "スキル1がクリティカルした時、味方全体の行動ゲージが7%進む", category: SUP, condition: crit(), effects: [ALLG(0.07)] },
  ],
  GRASS: [
    { name: "癒しの羽", description: "スキル1使用時、HP割合が最も低い味方を最大HPの6%回復する", category: SUP, effects: [AH(0.06)] },
    { name: "守羽", description: "スキル1使用時、HP割合が最も低い味方へ自身の最大HPの8%のシールドを1ターン張る", category: SUP, effects: [ASH(0.08, 1)] },
    { name: "清めの羽", description: "スキル1使用時、HP割合が最も低い味方の弱体効果を1個解除する(内部クールタイム2ターン)", category: SUP, effects: [ACL(1)], internalCooldown: 2 },
  ],
  ELECTRIC: [
    { name: "雷翼", description: "スキル1使用時、自身の行動ゲージが10%進む", effects: [G(0.1)] },
    { name: "号令の徹底", description: "スキル1の味方支援で、HP割合が最も低い味方の行動ゲージがさらに10%進む", category: SUP, effects: [AG(0.1)] },
    { name: "雷の鼓舞", description: "スキル1がクリティカルした時、味方全体の行動ゲージが7%進む", category: SUP, condition: crit(), effects: [ALLG(0.07)] },
  ],
  WATER: [
    { name: "静水の慈悲", description: "スキル1使用時、HP割合が最も低い味方を最大HPの7%回復する", category: SUP, effects: [AH(0.07)] },
    { name: "浄めの槍", description: "スキル1使用時、自身の弱体効果を1個解除する(内部クールタイム2ターン)", category: DUR, effects: [CL(1)], internalCooldown: 2 },
    { name: "危急の翼", description: "スキル1の味方支援は、相手がHP30%以下ならさらに7%多く行動ゲージを進める", category: SUP, effects: [AG(0.0, 0.3, 0.07)] },
  ],
  LIGHT: [
    { name: "聖翼", description: "スキル1使用時、HP割合が最も低い味方を最大HPの6%回復する", category: SUP, effects: [AH(0.06)] },
    { name: "光の号令", description: "スキル1使用時、HP割合が最も低い味方の行動ゲージが12%進む", category: SUP, effects: [AG(0.12)] },
    { name: "庇護の光", description: "スキル1使用時、HP割合が最も低い味方が受けるダメージを1ターン10%軽減する", category: SUP, effects: [AMT(0.1, 1)] },
  ],
  DARK: [
    { name: "黒羽の刃", description: "弱体状態の敵へのスキル1の最終ダメージが20%上がる", when: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.2 }] },
    { name: "闇の号令", description: "スキル1使用時、HP割合が最も低い味方の行動ゲージが12%進む", category: SUP, effects: [AG(0.12)] },
    { name: "死線の祝福", description: "スキル1使用時、HP割合が最も低い味方のクリダメを1ターン上昇させる", category: SUP, effects: [ABF("criDmg", 0.3, 1)] },
  ],
};

const THUNDERBEAST: SpeciesTable = {
  FIRE: [
    { name: "灼雷の脚", description: "スキル1の速度比例ダメージが上がる", scale: { stat: "spd", bonusAtReference: 0.15 } },
    { name: "雷の昂ぶり", description: "スキル1がクリティカルした時、自身の行動ゲージが10%進む", condition: crit(), effects: [G(0.1)] },
    { name: "焦がす牙", description: "スキル1がクリティカルした時、1ターン防御力を50%低下させる", category: DIS, condition: crit(), effects: [DB("DEF_DOWN", 1)] },
  ],
  GRASS: [
    { name: "野生の脚", description: "スキル1使用時、自身の行動ゲージが8%進む", effects: [G(0.08)] },
    { name: "獣の予兆", description: "スキル1がクリティカルした時、次の攻撃スキルの最終ダメージが12%上がる", chargeOnCrit: { perHit: 0.12, maxBonus: 0.12 } },
    { name: "森の息吹", description: "スキル1使用時、自身のHPを最大HPの5%回復する", category: DUR, effects: [H(0.05)] },
  ],
  ELECTRIC: [
    { name: "超電導", description: "スキル1使用時、自身の行動ゲージが12%進む", effects: [G(0.12)] },
    { name: "放電共鳴", description: "スキル1がクリティカルした時、味方全体の行動ゲージが7%進む", category: SUP, condition: crit(), effects: [ALLG(0.07)] },
    { name: "帯電牙", description: "スキル1がクリティカルした時、次のスキル1の最終ダメージが15%上がる", chargeOnCrit: { perHit: 0.15, maxBonus: 0.15 } },
  ],
  WATER: [
    { name: "澄んだ雷", description: "スキル1の最終ダメージが12%上がる", flat: 0.12 },
    { name: "水鳴り", description: "スキル1がクリティカルした時、対象の行動ゲージを15%減少させる", category: DIS, condition: crit(), effects: [TG(0.15)] },
    { name: "雨露", description: "スキル1使用時、自身のHPを最大HPの6%回復する", category: DUR, effects: [H(0.06)] },
  ],
  LIGHT: [
    { name: "導きの雷", description: "スキル1使用時、HP割合が最も低い味方の行動ゲージが8%進む", category: SUP, effects: [AG(0.08)] },
    { name: "閃光の合図", description: "スキル1がクリティカルした時、味方全体の行動ゲージが7%進む", category: SUP, condition: crit(), effects: [ALLG(0.07)] },
    { name: "癒しの閃光", description: "スキル1がクリティカルした時、HP割合が最も低い味方を最大HPの5%回復する", category: SUP, condition: crit(), effects: [AH(0.05)] },
  ],
  DARK: [
    { name: "黒雷の脚", description: "スキル1の速度比例ダメージが大きく上がる", scale: { stat: "spd", bonusAtReference: 0.25 } },
    { name: "喰らう雷", description: "スキル1がクリティカルした時、対象の行動ゲージを20%減少させる", category: DIS, condition: crit(), effects: [TG(0.2)] },
    { name: "雷の記憶", description: "スキル1がクリティカルするたび自身のクリダメが5%上がる(最大20%、戦闘中維持)", critDmgGrowth: { perCrit: 0.05, maxBonus: 0.2 } },
  ],
};

const ABYSSREAPER: SpeciesTable = {
  FIRE: [
    { name: "灼熱の鎌", description: "スキル1で解除に成功した時、1ターン防御力を50%低下させる", category: DIS, condition: on("STRIP"), effects: [DB("DEF_DOWN", 1)] },
    { name: "無防備狩り", description: "強化効果を持つ相手を崩したあと、スキル1の最終ダメージが20%上がる", flat: 0.2 },
    { name: "刈り取りの勢い", description: "スキル1で解除に成功した時、自身の行動ゲージが12%進む", condition: on("STRIP"), effects: [G(0.12)] },
  ],
  GRASS: [
    { name: "生命の刈り取り", description: "スキル1で解除に成功した時、自身のHPを最大HPの8%回復する", category: DUR, condition: on("STRIP"), effects: [H(0.08)] },
    { name: "枯死の刃", description: "スキル1で解除に成功した時、2ターン回復阻害を付与する", category: DIS, condition: on("STRIP"), effects: [DB("HEAL_BLOCK", 2)] },
    { name: "魂の殻", description: "スキル1で解除に成功した時、自身に最大HPの10%のシールドを1ターン張る", category: DUR, condition: on("STRIP"), effects: [SSH(0.1, 1)] },
  ],
  ELECTRIC: [
    { name: "疾走する鎌", description: "スキル1使用時、自身の行動ゲージが10%進む", effects: [G(0.1)] },
    { name: "時奪いの刃", description: "スキル1で解除に成功した時、対象の行動ゲージを20%減少させる", category: DIS, condition: on("STRIP"), effects: [TG(0.2)] },
    { name: "電導の魂", description: "スキル1がクリティカルした時、味方全体の行動ゲージが7%進む", category: SUP, condition: crit(), effects: [ALLG(0.07)] },
  ],
  WATER: [
    { name: "澱みの祓い", description: "スキル1で解除に成功した時、自身の弱体効果を1個解除する(内部クールタイム2ターン)", category: DUR, condition: on("STRIP"), effects: [CL(1)], internalCooldown: 2 },
    { name: "萎えの刃", description: "スキル1で解除に成功した時、1ターン攻撃力を50%低下させる", category: DIS, condition: on("STRIP"), effects: [DB("ATK_DOWN", 1)] },
    { name: "静かな回復", description: "スキル1使用時、自身のHPを最大HPの6%回復する", category: DUR, effects: [H(0.06)] },
  ],
  LIGHT: [
    { name: "魂の分配", description: "スキル1で解除に成功した時、HP割合が最も低い味方を最大HPの7%回復する", category: SUP, condition: on("STRIP"), effects: [AH(0.07)] },
    { name: "導魂", description: "スキル1で解除に成功した時、HP割合が最も低い味方の行動ゲージが10%進む", category: SUP, condition: on("STRIP"), effects: [AG(0.1)] },
    { name: "浄魂", description: "スキル1で解除に成功した時、HP割合が最も低い味方の弱体効果を1個解除する", category: SUP, condition: on("STRIP"), effects: [ACL(1)] },
  ],
  DARK: [
    { name: "支え崩し", description: "強化効果を持つ敵へのスキル1の最終ダメージが25%上がる", when: [{ when: "TARGET_HAS_BUFF", bonus: 0.25 }] },
    { name: "簒奪", description: "スキル1で解除に成功した時、対象の有利な効果をさらに1個奪って自身に付ける", category: DIS, condition: on("STRIP"), effects: [STEAL(1)] },
    { name: "時の刈り取り", description: "スキル1で解除に成功した時、対象の行動ゲージを25%減少させる", category: DIS, condition: on("STRIP"), effects: [TG(0.25)] },
  ],
};

const FENRIR: SpeciesTable = {
  FIRE: [
    { name: "灼熱の二撃目", description: "スキル1の2撃目の最終ダメージが20%上がる", flat: 0.2, damageIndex: 1 },
    { name: "双牙の呼吸", description: "スキル1が2回ともクリティカルした時、自身の行動ゲージが15%進む", condition: crit(2), effects: [G(0.15)] },
    { name: "狩りの余勢", description: "スキル1で相手を倒した時、自身の行動ゲージが30%進む", condition: kill, effects: [G(0.3)] },
  ],
  GRASS: [
    { name: "森の糧", description: "スキル1で与えたダメージの15%を自身が回復する", category: DUR, effects: [LS(0.15)] },
    { name: "手負い狙い", description: "HPが50%以下の相手へのスキル1の最終ダメージが20%上がる", when: [{ when: "TARGET_HP_BELOW_50", bonus: 0.2 }] },
    { name: "獲物の血肉", description: "スキル1で相手を倒した時、自身のHPを最大HPの20%回復する", category: DUR, condition: kill, effects: [H(0.2)] },
  ],
  ELECTRIC: [
    { name: "疾風の牙", description: "スキル1使用時、自身の行動ゲージが10%進む", effects: [G(0.1)] },
    { name: "群れの合図", description: "スキル1が2回ともクリティカルした時、味方全体の行動ゲージが7%進む", category: SUP, condition: crit(2), effects: [ALLG(0.07)] },
    { name: "追い込み", description: "HPが50%以下の相手へのスキル1で、自身の行動ゲージが15%進む", condition: below(0.5), effects: [G(0.15)] },
  ],
  WATER: [
    { name: "澄んだ牙", description: "スキル1の最終ダメージが12%上がる", flat: 0.12 },
    { name: "足止めの牙", description: "HPが50%以下の相手へのスキル1で、対象の行動ゲージを15%減少させる", category: DIS, condition: below(0.5), effects: [TG(0.15)] },
    { name: "血の潤い", description: "スキル1で与えたダメージの18%を自身が回復する", category: DUR, effects: [LS(0.18)] },
  ],
  LIGHT: [
    { name: "白狼の導き", description: "スキル1使用時、HP割合が最も低い味方の行動ゲージが8%進む", category: SUP, effects: [AG(0.08)] },
    { name: "群れの鼓舞", description: "スキル1で相手を倒した時、味方全体の行動ゲージが15%進む", category: SUP, condition: kill, effects: [ALLG(0.15)] },
    { name: "勝利の遠吠え", description: "スキル1で相手を倒した時、味方全体のHPを最大HPの10%回復する", category: SUP, condition: kill, effects: [ALLH(0.1)] },
  ],
  DARK: [
    { name: "深淵の牙", description: "HPが50%以下の相手へのスキル1の最終ダメージが25%上がる", when: [{ when: "TARGET_HP_BELOW_50", bonus: 0.25 }] },
    { name: "鎧砕きの牙", description: "HPが30%以下の相手へのスキル1が防御力を20%無視する", hpIgnore: [{ hpRatio: 0.3, ratio: 0.2 }] },
    { name: "終焉の勢い", description: "スキル1で相手を倒した時、自身の行動ゲージが50%進む", condition: kill, effects: [G(0.5)] },
  ],
};

const CHRONOS: SpeciesTable = {
  FIRE: [
    { name: "加速する針", description: "スキル1使用時、自身の行動ゲージが10%進む", effects: [G(0.1)] },
    { name: "重い針", description: "スキル1の行動ゲージ減少が15%から25%になる", category: DIS, gaugeOverride: 0.25 },
    { name: "止まる時", description: "スキル1のあと対象の行動ゲージが50%以下なら、1ターン攻撃力を50%低下させる", category: DIS, condition: state("TARGET_GAUGE_BELOW_20"), effects: [DB("ATK_DOWN", 1)] },
  ],
  GRASS: [
    { name: "巡る時", description: "スキル1使用時、HP割合が最も低い味方を最大HPの6%回復する", category: SUP, effects: [AH(0.06)] },
    { name: "戻る時", description: "スキル1使用時、自身のHPを最大HPの6%回復する", category: DUR, effects: [H(0.06)] },
    { name: "時の殻", description: "スキル1使用時、HP割合が最も低い味方へ自身の最大HPの8%のシールドを1ターン張る", category: SUP, effects: [ASH(0.08, 1)] },
  ],
  ELECTRIC: [
    { name: "秒針加速", description: "スキル1使用時、自身の行動ゲージが12%進む", effects: [G(0.12)] },
    { name: "分配される時", description: "スキル1使用時、HP割合が最も低い味方の行動ゲージが10%進む", category: SUP, effects: [AG(0.1)] },
    { name: "共振する時計", description: "スキル1がクリティカルした時、味方全体の行動ゲージが7%進む", category: SUP, condition: crit(), effects: [ALLG(0.07)] },
  ],
  WATER: [
    { name: "淀む時", description: "スキル1の行動ゲージ減少が20%になる", category: DIS, gaugeOverride: 0.2 },
    { name: "澄む時", description: "スキル1使用時、自身の弱体効果を1個解除する(内部クールタイム2ターン)", category: DUR, effects: [CL(1)], internalCooldown: 2 },
    { name: "潤う時", description: "スキル1使用時、HP割合が最も低い味方を最大HPの7%回復する", category: SUP, effects: [AH(0.07)] },
  ],
  LIGHT: [
    { name: "光の秒針", description: "スキル1使用時、HP割合が最も低い味方の行動ゲージが12%進む", category: SUP, effects: [AG(0.12)] },
    { name: "癒しの時", description: "スキル1使用時、HP割合が最も低い味方を最大HPの6%回復する", category: SUP, effects: [AH(0.06)] },
    { name: "巻き戻す時", description: "スキル1使用時、HP割合が最も低い味方の弱体効果を1個解除する(内部クールタイム2ターン)", category: SUP, effects: [ACL(1)], internalCooldown: 2 },
  ],
  DARK: [
    { name: "奪う時", description: "スキル1の行動ゲージ減少が30%になる", category: DIS, gaugeOverride: 0.3 },
    { name: "凍てつく針", description: "スキル1のあと対象の行動ゲージが20%以下なら、1ターン防御力を50%低下させる", category: DIS, condition: state("TARGET_GAUGE_BELOW_20"), effects: [DB("DEF_DOWN", 1)] },
    { name: "時の吸収", description: "スキル1で減らした行動ゲージの50%を自身が吸収する", effects: [DRAIN(0.5)] },
  ],
};

const BEHEMOTH: SpeciesTable = {
  FIRE: [
    { name: "灼ける巨体", description: "スキル1の最大HP比例ダメージが上がる", hpScale: 0.015 },
    { name: "威圧の踏みつけ", description: "スキル1で挑発が入った時、対象の行動ゲージを20%減少させる", category: DIS, condition: on("TAUNT"), effects: [TG(0.2)] },
    { name: "熱の躍動", description: "スキル1使用時、自身の行動ゲージが8%進む", effects: [G(0.08)] },
  ],
  GRASS: [
    { name: "大地の巨体", description: "自身の最大HPが15%上がる", category: DUR, hpMul: 1.15 },
    { name: "根絡みの咆哮", description: "スキル1で挑発が入った時、1ターン攻撃力を50%低下させる", category: DIS, condition: on("TAUNT"), effects: [DB("ATK_DOWN", 1)] },
    { name: "森の巨躯", description: "スキル1使用時、自身のHPを最大HPの7%回復する", category: DUR, effects: [H(0.07)] },
  ],
  ELECTRIC: [
    { name: "雷鳴の巨体", description: "スキル1使用時、自身の行動ゲージが10%進む", effects: [G(0.1)] },
    { name: "痺れる咆哮", description: "スキル1で挑発が入った時、対象の行動ゲージを25%減少させる", category: DIS, condition: on("TAUNT"), effects: [TG(0.25)] },
    { name: "雷の共鳴", description: "スキル1がクリティカルした時、味方全体の行動ゲージが7%進む", category: SUP, condition: crit(), effects: [ALLG(0.07)] },
  ],
  WATER: [
    { name: "潤う巨体", description: "スキル1で与えたダメージの15%を自身が回復する", category: DUR, effects: [LS(0.15)] },
    { name: "洗い流す", description: "スキル1使用時、自身の弱体効果を1個解除する(内部クールタイム2ターン)", category: DUR, effects: [CL(1)], internalCooldown: 2 },
    { name: "水膜", description: "スキル1使用時、自身に最大HPの8%のシールドを1ターン張る", category: DUR, effects: [SSH(0.08, 1)] },
  ],
  LIGHT: [
    { name: "守護の巨体", description: "スキル1使用時、HP割合が最も低い味方を最大HPの6%回復する", category: SUP, effects: [AH(0.06)] },
    { name: "神獣の盾", description: "スキル1使用時、HP割合が最も低い味方へ自身の最大HPの10%のシールドを1ターン張る", category: SUP, effects: [ASH(0.1, 1)] },
    { name: "導く咆哮", description: "スキル1で挑発が入った時、HP割合が最も低い味方の行動ゲージが10%進む", category: SUP, condition: on("TAUNT"), effects: [AG(0.1)] },
  ],
  DARK: [
    { name: "挑発の追撃", description: "挑発状態の敵へのスキル1の最終ダメージが25%上がる", when: [{ when: "TARGET_TAUNTED", bonus: 0.25 }] },
    { name: "砕く咆哮", description: "スキル1で挑発が入った時、1ターン防御力を50%低下させる", category: DIS, condition: on("TAUNT"), effects: [DB("DEF_DOWN", 1)] },
    { name: "怒りの巨体", description: "攻撃を受けるたび次のスキル1の最終ダメージが6%上がる(最大30%、スキル1使用で戻る)", category: DUR, chargeOnHit: { perHit: 0.06, maxBonus: 0.3 } },
  ],
};

const TABLES: Record<string, SpeciesTable> = {
  mushroon: MUSHROON,
  shellturtle: SHELLTURTLE,
  kobold: KOBOLD,
  basilisk: BASILISK,
  mimic: MIMIC,
  valkyria: VALKYRIA,
  thunderbeast: THUNDERBEAST,
  abyssreaper: ABYSSREAPER,
  fenrir: FENRIR,
  chronos: CHRONOS,
  behemoth: BEHEMOTH,
};

/** 図鑑ID(種族_属性) → 3候補。11種 × 6属性 = 66件 */
export const NEW_LATENT_ABILITY_CANDIDATES: Readonly<Record<string, readonly LatentAbilityCandidate[]>> =
  Object.fromEntries(
    Object.entries(TABLES).flatMap(([templateId, table]) =>
      ELEMENTS.map((element) => [
        `${templateId}_${element}`,
        table[element].map((draft, i) => build(templateId, element, (i + 1) as 1 | 2 | 3, draft)),
      ] as const),
    ),
  );
