/**
 * クリエイト拡張で個体ごとに保存する育成情報。
 *
 * 保存値とバランス設定の境界。調整中の倍率やコストを呼び出し側へ散らさないこと。
 */
export type MonsterType = "ATTACK" | "HP" | "DEFENSE" | "SUPPORT" | "DISRUPT" | "BALANCE";

export type AllocatableStat = "hp" | "atk" | "def" | "spd";

export type AbilityPointAllocation = Record<AllocatableStat, number>;

export interface MonsterDevelopment {
  /** 保存形式の移行単位。個別機能の実装時に必要な場合だけ上げる */
  schemaVersion: 1;
  /** タイプ転生を行うまでは未設定。未設定個体の補正は常にゼロとする */
  type: MonsterType | null;
  /** 能力ポイントの割り振り。換算後の能力ではなくポイント数を保存する */
  abilityPoints: AbilityPointAllocation;
  /** 選択した潜在能力の安定ID。未覚醒ならnull */
  latentAbilityId: string | null;
  /** 再覚醒の費用を支払い済みで、候補の再選択を待っている状態 */
  latentReselectPending: boolean;
}

export const ABILITY_POINT_RESET_COST = 100_000;
export const TYPE_REINCARNATION_GOLD_COST = 150_000;

/** 星ごとの配分上限。能力ポイントは星4で解放される。 */
export const ABILITY_POINT_BUDGETS = { 1: 0, 2: 0, 3: 0, 4: 20, 5: 50, 6: 100 } as const;
/** @deprecated 星別上限には abilityPointBudget を使用する。 */
export const ABILITY_POINT_BUDGET = ABILITY_POINT_BUDGETS[6];

export function abilityPointBudget(star: keyof typeof ABILITY_POINT_BUDGETS): number {
  return ABILITY_POINT_BUDGETS[star];
}

/** 能力付与の正式換算値。必ずこの一か所から参照する。 */
export const ABILITY_POINT_VALUES: Readonly<Record<AllocatableStat, number>> = {
  hp: 20,
  atk: 2,
  def: 3,
  spd: 0.1,
};

/**
 * タイプの正式補正。保存済み個体にはタイプだけを保存し、数値は一元管理する。
 */
export interface MonsterTypeModifiers extends Record<AllocatableStat, number> {
  criRate: number;
  criDmg: number;
  accuracy: number;
  resistance: number;
}

export const MONSTER_TYPE_STAT_MULTIPLIERS: Readonly<Record<MonsterType, Readonly<MonsterTypeModifiers>>> = {
  ATTACK: { hp: 0.85, atk: 1.20, def: 0.90, spd: 1, criRate: 0.10, criDmg: 0, accuracy: 0, resistance: -0.10 },
  HP: { hp: 1.20, atk: 0.85, def: 1, spd: 1, criRate: -0.05, criDmg: -0.10, accuracy: 0, resistance: 0.10 },
  DEFENSE: { hp: 1, atk: 0.90, def: 1.20, spd: 1, criRate: -0.10, criDmg: -0.10, accuracy: 0, resistance: 0.10 },
  SUPPORT: { hp: 1.10, atk: 0.85, def: 1, spd: 1.10, criRate: 0, criDmg: -0.15, accuracy: 0, resistance: 0.05 },
  DISRUPT: { hp: 1, atk: 0.85, def: 1, spd: 1.08, criRate: 0, criDmg: -0.15, accuracy: 0.15, resistance: -0.05 },
  BALANCE: { hp: 1, atk: 1, def: 1, spd: 1, criRate: 0, criDmg: 0, accuracy: 0, resistance: 0 },
};

export const MONSTER_TYPE_DESCRIPTIONS: Readonly<Record<MonsterType, string>> = {
  ATTACK: "長所: ATK +20%・クリ率 +10pt / 短所: HP -15%・DEF -10%・抵抗 -10pt",
  HP: "長所: HP +20%・抵抗 +10pt / 短所: ATK -15%・クリ率 -5pt・クリダメ -10pt",
  DEFENSE: "長所: DEF +20%・抵抗 +10pt / 短所: ATK -10%・クリ率 -10pt・クリダメ -10pt",
  SUPPORT: "長所: SPD +10%・HP +10%・抵抗 +5pt / 短所: ATK -15%・クリダメ -15pt",
  DISRUPT: "長所: SPD +8%・的中 +15pt / 短所: ATK -15%・クリダメ -15pt・抵抗 -5pt",
  BALANCE: "すべての能力補正なし。長所も短所もない標準型",
};

export const MONSTER_TYPE_LABELS: Readonly<Record<MonsterType, string>> = {
  ATTACK: "攻撃", HP: "体力", DEFENSE: "防御", SUPPORT: "補助", DISRUPT: "妨害", BALANCE: "バランス",
};

export type LatentAbilityCategory = "OFFENSE" | "DISRUPT" | "DURABILITY" | "SUPPORT" | "SPECIAL";
export type LatentAbilityEffectType =
  | "DAMAGE_UP" | "CRIT_TRIGGER" | "HP_SCALING" | "DEF_SCALING"
  | "DEBUFF_CHANCE_UP" | "ADD_DEBUFF" | "TURN_METER_DOWN"
  | "SELF_HEAL" | "ADD_BUFF" | "ALLY_SUPPORT" | "SHIELD" | "SPECIAL_TRIGGER"
  | "RUNTIME";

export type LatentRuntimeTarget = "PRIMARY" | "ALL_ENEMIES" | "SELF" | "ALL_ALLIES" | "LOWEST_GAUGE_ALLY" | "LOWEST_HP_ALLY";

/** A skill-use scoped effect.  Runtime effects are never evaluated once per hit. */
export type LatentRuntimeEffect =
  | { kind: "GAUGE_DOWN"; amount: number; chance: number; target?: LatentRuntimeTarget }
  | { kind: "GAUGE_UP"; amount: number; chance?: number; target: LatentRuntimeTarget }
  | { kind: "DEBUFF"; status: "SPD_DOWN" | "ATK_DOWN" | "DEF_DOWN" | "HEAL_BLOCK" | "BUFF_BLOCK" | "POISON" | "STUN"; chance: number; duration: number; target?: LatentRuntimeTarget; amount?: number }
  | { kind: "STRIP"; chance: number; count?: number; target?: LatentRuntimeTarget }
  | { kind: "EXTEND_DEBUFF"; chance: number; turns: number; count?: number; target?: LatentRuntimeTarget }
  | { kind: "CLEANSE"; count?: number; target: LatentRuntimeTarget; afterHeal?: boolean }
  | { kind: "SHIELD"; rate: number; duration: number; target: LatentRuntimeTarget; afterHeal?: boolean }
  | { kind: "HEAL"; rate: number; target: LatentRuntimeTarget; lowHpThreshold?: number; bonusRate?: number }
  | { kind: "BUFF"; stat: "atk" | "def" | "spd"; amount: number; duration: number; target: LatentRuntimeTarget; lowHpThreshold?: number }
  | { kind: "REGEN"; rate: number; duration: number; target: LatentRuntimeTarget; afterHeal?: boolean };

export interface LatentAoeConversion {
  /** Only SINGLE_ENEMY skills are converted; native AoE skills are left untouched. */
  damageMultiplier: number;
  /** Multiplier for the chance of native harmful skill effects on secondary targets. */
  secondaryEffectChanceMultiplier?: number;
  /** Native non-damage effects may instead be restricted to the selected primary target. */
  nativeEffectTarget?: "ALL" | "PRIMARY_ONLY";
}

/** ⑧-3の戦闘実装へそのまま渡せる、スキル1専用の宣言的な候補データ。 */
export interface LatentAbilityCandidate {
  id: string;
  name: string;
  description: string;
  skillSlot: 0;
  category: LatentAbilityCategory;
  effectType: LatentAbilityEffectType;
  /** 倍率・係数・ゲージ量。効果に数値が不要な場合は0。 */
  value: number;
  /** 0～1。確定発動も1と明記する。 */
  chance: number;
  duration: number;
  target: "SELF" | "TARGET" | "LOWEST_HP_ALLY" | "ALL_ALLIES";
  /** ADD_DEBUFF / ADD_BUFF 等が扱う状態ID。 */
  status?: string;
  /** 既存S1効果とは別判定か、既存確率への加算か。 */
  resolution: "ALWAYS" | "SEPARATE" | "ADD_TO_EXISTING" | "ON_CRIT" | "CONDITIONAL";
  /** Optional extensible runtime. Existing stable IDs and legacy fields remain valid. */
  runtimeEffects?: readonly LatentRuntimeEffect[];
  aoeConversion?: LatentAoeConversion;
  ignoreDefenseRatio?: number;
  debuffDamageBonus?: { perDebuff: number; max: number };
  damageTakenMultiplier?: number;
  defMultiplier?: number;
  hpMultiplier?: number;
}

export function createDefaultMonsterDevelopment(): MonsterDevelopment {
  return {
    schemaVersion: 1,
    type: null,
    abilityPoints: { hp: 0, atk: 0, def: 0, spd: 0 },
    latentAbilityId: null,
    latentReselectPending: false,
  };
}
