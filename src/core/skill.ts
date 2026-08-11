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
}

export interface StunEffect {
  kind: "STUN";
  durationTurns: number;
}

export type SkillEffect = DamageEffect | HealEffect | BuffEffect | DebuffEffect | StunEffect;

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

/** レベル2〜4の間、1レベルごとにダメージ倍率・回復量がこの割合ずつ上昇する */
const SKILL_POWER_GROWTH_PER_LEVEL = 0.06;

function powerGrowthFactor(level: number): number {
  const cappedLevel = Math.min(level, 4);
  return 1 + SKILL_POWER_GROWTH_PER_LEVEL * (cappedLevel - 1);
}

/**
 * スキルレベルを反映した実効スキルを計算する。
 * レベル2〜4: ダメージ倍率・回復量が少しずつ上昇する。
 * レベル5到達時: それ以上の威力上昇はせず、代わりにクールタイムが1ターン短縮され、
 * バフ・デバフ・スタンの継続ターンが1ターン延びる。
 */
export function computeLeveledSkill(skill: Skill, level: number): Skill {
  const clampedLevel = Math.max(1, Math.min(level, MAX_SKILL_LEVEL));
  if (clampedLevel === 1) return skill;

  const growth = powerGrowthFactor(clampedLevel);
  const isMaxLevel = clampedLevel >= MAX_SKILL_LEVEL;

  const effects = skill.effects.map((effect): SkillEffect => {
    if (effect.kind === "DAMAGE") {
      return { ...effect, multiplier: Math.round(effect.multiplier * growth * 100) / 100 };
    }
    if (effect.kind === "HEAL") {
      return { ...effect, healRate: Math.round(effect.healRate * growth * 1000) / 1000 };
    }
    if ((effect.kind === "BUFF" || effect.kind === "DEBUFF" || effect.kind === "STUN") && isMaxLevel) {
      return { ...effect, durationTurns: effect.durationTurns + 1 };
    }
    return effect;
  });

  const cooldownTurns = isMaxLevel ? Math.max(0, skill.cooldownTurns - 1) : skill.cooldownTurns;

  return { ...skill, cooldownTurns, effects };
}

export const BUFF_STAT_JA: Record<BuffStat, string> = {
  atk: "攻撃力",
  def: "防御力",
  spd: "速度",
};

/** UI表示用に、スキル効果1件を短い日本語テキストに変換する */
export function describeSkillEffect(effect: SkillEffect): string {
  switch (effect.kind) {
    case "DAMAGE":
      return `ダメージ倍率 ${effect.multiplier.toFixed(2)}倍${effect.hits && effect.hits > 1 ? ` × ${effect.hits}回` : ""}`;
    case "HEAL":
      if (effect.scaleStat === "atk") return `回復量 自身の攻撃力の${(effect.healRate * 100).toFixed(0)}%`;
      if (effect.scaleStat === "def") return `回復量 自身の防御力の${(effect.healRate * 100).toFixed(0)}%`;
      return `回復量 最大HPの${(effect.healRate * 100).toFixed(1)}%`;
    case "BUFF":
      return `${BUFF_STAT_JA[effect.stat]}+${Math.round(effect.amount * 100)}% (${effect.durationTurns}ターン)`;
    case "DEBUFF":
      return `${BUFF_STAT_JA[effect.stat]}-${Math.round(effect.amount * 100)}% (${effect.durationTurns}ターン)`;
    case "STUN":
      return `スタン (${effect.durationTurns}ターン)`;
  }
}
