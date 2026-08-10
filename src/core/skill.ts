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
  /** 対象の最大HPに対する割合 */
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
