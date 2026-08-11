export type TargetType =
  | "SINGLE_ENEMY"
  | "ALL_ENEMIES"
  | "SINGLE_ALLY"
  | "ALL_ALLIES"
  | "SELF";

export type BuffStat = "atk" | "def" | "spd";

export interface DamageEffect {
  kind: "DAMAGE";
  /** ATK に対する倍率。属性相性・防御力で更に補正される */
  multiplier: number;
  /** 命中回数 */
  hits?: number;
  /** 追加ダメージ: 自身のいずれかの能力値が高いほど、その能力値1につきこの倍率が上乗せされる */
  scaleBonus?: { stat: "spd" | "def" | "hp"; ratePerPoint: number };
}

export interface HealEffect {
  kind: "HEAL";
  /**
   * healRateの基準にする値。省略時(undefined)は対象の最大HPに対する割合。
   * "atk"/"def"を指定すると、施術者(スキルの使い手)の攻撃力/防御力に対する割合になる。
   */
  scaleStat?: "atk" | "def";
  /** scaleStat省略時は対象の最大HPに対する割合、指定時は施術者のその能力値に対する割合 */
  healRate: number;
}

/** ライフスティール: 同じスキルのDAMAGE効果で与えたダメージの一部を自身が回復する */
export interface LifestealEffect {
  kind: "LIFESTEAL";
  /** 直前に与えたダメージに対する回復割合(例: 0.1で与ダメの10%回復) */
  healRate: number;
}

export interface BuffEffect {
  kind: "BUFF";
  stat: BuffStat;
  /** 例: 0.3 で +30% */
  amount: number;
  durationTurns: number;
}

export interface DebuffEffect {
  kind: "DEBUFF";
  stat: BuffStat;
  /** 例: 0.3 で -30% */
  amount: number;
  durationTurns: number;
  /** この効果が発動を試みる基礎確率(0-1)。省略時は常に発動を試みる(その後、命中率/抵抗率判定を経る) */
  chance?: number;
}

export interface StunEffect {
  kind: "STUN";
  durationTurns: number;
  /** この効果が発動を試みる基礎確率(0-1)。省略時は常に発動を試みる(その後、命中率/抵抗率判定を経る) */
  chance?: number;
}

/** 火傷: 付与された相手が、自身の手番終了時に自分の攻撃力と同じ量のダメージを受ける */
export interface BurnEffect {
  kind: "BURN";
  durationTurns: number;
  /** この効果が発動を試みる基礎確率(0-1) */
  chance: number;
}

/** 行動ゲージ操作: 対象のATBゲージを即座に増減させる(例: 0.2で+20%進む) */
export interface GaugeEffect {
  kind: "GAUGE";
  amount: number;
}

export type SkillEffect =
  | DamageEffect
  | HealEffect
  | LifestealEffect
  | BuffEffect
  | DebuffEffect
  | StunEffect
  | BurnEffect
  | GaugeEffect;

export interface Skill {
  id: string;
  name: string;
  description: string;
  target: TargetType;
  /** このスキルが使えるようになるまでのクールタイム(ターン数)。0ならクールタイム無し */
  cooldownTurns: number;
  effects: SkillEffect[];
}

export function isOffCooldownSkill(skill: Skill): boolean {
  return skill.cooldownTurns > 0;
}

/** スキルレベルの上限 */
export const MAX_SKILL_LEVEL = 5;

/** レベル2〜4の間、1レベルごとにダメージ倍率・回復量・発動確率がこの割合ずつ上昇する */
const SKILL_POWER_GROWTH_PER_LEVEL = 0.06;

/**
 * クールタイムが無いスキル(スキル1)は、Lv5になってもクールタイム短縮の恩恵を受けられず、
 * バフ/デバフ/スタンを持たない純粋な攻撃技だと何も変化しなかったため、Lv5到達時にさらに
 * もう一段成長するようにしてある(通常のLv2〜4と同じ上昇幅を追加で1回分)。
 */
const NO_COOLDOWN_LV5_BONUS_GROWTH = SKILL_POWER_GROWTH_PER_LEVEL;

function powerGrowthFactor(level: number, hasNoCooldown: boolean): number {
  const cappedLevel = Math.min(level, 4);
  let growth = 1 + SKILL_POWER_GROWTH_PER_LEVEL * (cappedLevel - 1);
  if (level >= MAX_SKILL_LEVEL && hasNoCooldown) {
    growth += NO_COOLDOWN_LV5_BONUS_GROWTH;
  }
  return growth;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function growChance(chance: number, growth: number): number {
  return Math.min(1, round3(chance * growth));
}

/**
 * スキルレベルを反映した実効スキルを計算する。
 * レベル2〜4: ダメージ倍率・回復量・(デバフ/スタン/火傷の)発動確率が少しずつ上昇する。
 * レベル5到達時: それ以上の威力上昇はせず(クールタイム無しのスキルを除く)、代わりにクールタイムが
 * 1ターン短縮され、バフ・デバフの継続ターンが1ターン延びる。ただしスタン・火傷は強力すぎるため、
 * 継続ターンはレベルによらず常に一定(発動確率のみ成長する)。
 */
export function computeLeveledSkill(skill: Skill, level: number): Skill {
  const clampedLevel = Math.max(1, Math.min(level, MAX_SKILL_LEVEL));
  if (clampedLevel === 1) return skill;

  const growth = powerGrowthFactor(clampedLevel, skill.cooldownTurns === 0);
  const isMaxLevel = clampedLevel >= MAX_SKILL_LEVEL;

  const effects = skill.effects.map((effect): SkillEffect => {
    switch (effect.kind) {
      case "DAMAGE":
        return { ...effect, multiplier: round2(effect.multiplier * growth) };
      case "HEAL":
        return { ...effect, healRate: round3(effect.healRate * growth) };
      case "LIFESTEAL":
        return { ...effect, healRate: round3(effect.healRate * growth) };
      case "BUFF":
        return isMaxLevel ? { ...effect, durationTurns: effect.durationTurns + 1 } : effect;
      case "DEBUFF": {
        const withChance = effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
        return isMaxLevel ? { ...withChance, durationTurns: withChance.durationTurns + 1 } : withChance;
      }
      case "STUN":
        return effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
      case "BURN":
        return { ...effect, chance: growChance(effect.chance, growth) };
      case "GAUGE":
        return { ...effect, amount: round3(effect.amount * growth) };
      default:
        return effect;
    }
  });

  const cooldownTurns = isMaxLevel ? Math.max(0, skill.cooldownTurns - 1) : skill.cooldownTurns;

  return { ...skill, cooldownTurns, effects };
}

export const BUFF_STAT_JA: Record<BuffStat, string> = {
  atk: "攻撃力",
  def: "防御力",
  spd: "速度",
};

const SCALE_BONUS_STAT_JA: Record<"spd" | "def" | "hp", string> = {
  spd: "速度",
  def: "防御力",
  hp: "最大HP",
};

function chanceSuffix(chance: number | undefined): string {
  return chance !== undefined ? `${Math.round(chance * 100)}%で` : "";
}

/** UI表示用に、スキル効果1件を短い日本語テキストに変換する */
export function describeSkillEffect(effect: SkillEffect): string {
  switch (effect.kind) {
    case "DAMAGE": {
      const scaleText = effect.scaleBonus
        ? `(自身の${SCALE_BONUS_STAT_JA[effect.scaleBonus.stat]}が高いほど上昇)`
        : "";
      return `ダメージ倍率 ${effect.multiplier.toFixed(2)}倍${effect.hits && effect.hits > 1 ? ` × ${effect.hits}回` : ""}${scaleText}`;
    }
    case "HEAL":
      if (effect.scaleStat === "atk") return `回復量 自身の攻撃力の${(effect.healRate * 100).toFixed(0)}%`;
      if (effect.scaleStat === "def") return `回復量 自身の防御力の${(effect.healRate * 100).toFixed(0)}%`;
      return `回復量 最大HPの${(effect.healRate * 100).toFixed(1)}%`;
    case "LIFESTEAL":
      return `与えたダメージの${(effect.healRate * 100).toFixed(0)}%を自身が回復`;
    case "BUFF":
      return `${BUFF_STAT_JA[effect.stat]}+${Math.round(effect.amount * 100)}% (${effect.durationTurns}ターン)`;
    case "DEBUFF":
      return `${chanceSuffix(effect.chance)}${BUFF_STAT_JA[effect.stat]}-${Math.round(effect.amount * 100)}% (${effect.durationTurns}ターン)`;
    case "STUN":
      return `${chanceSuffix(effect.chance)}スタン (${effect.durationTurns}ターン)`;
    case "BURN":
      return `${chanceSuffix(effect.chance)}火傷 (${effect.durationTurns}ターン、自身のターン終了時に自身の攻撃力分のダメージ)`;
    case "GAUGE":
      return `行動ゲージ+${Math.round(effect.amount * 100)}%`;
  }
}
