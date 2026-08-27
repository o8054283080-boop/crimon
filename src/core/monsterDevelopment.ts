/**
 * クリエイト拡張で個体ごとに保存する育成情報。
 *
 * 保存値とバランス設定の境界。調整中の倍率やコストを呼び出し側へ散らさないこと。
 */
export type MonsterType = "ATTACK" | "HP" | "DEFENSE" | "SUPPORT" | "DISRUPT";

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
}

export const ABILITY_POINT_RESET_COST = 100_000;

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
  accuracy: number;
}

export const MONSTER_TYPE_STAT_MULTIPLIERS: Readonly<Record<MonsterType, Readonly<MonsterTypeModifiers>>> = {
  ATTACK: { hp: 0.95, atk: 1.15, def: 1, spd: 1, criRate: 0.05, accuracy: 0 },
  HP: { hp: 1.15, atk: 0.95, def: 1, spd: 1, criRate: 0, accuracy: 0 },
  DEFENSE: { hp: 1, atk: 1, def: 1.15, spd: 0.95, criRate: 0, accuracy: 0 },
  SUPPORT: { hp: 1.05, atk: 1, def: 1, spd: 1.08, criRate: 0, accuracy: 0 },
  DISRUPT: { hp: 1, atk: 0.95, def: 1, spd: 1.05, criRate: 0, accuracy: 0.10 },
};

export const MONSTER_TYPE_DESCRIPTIONS: Readonly<Record<MonsterType, string>> = {
  ATTACK: "ATK+15%・クリ率+5% / HP-5%",
  HP: "HP+15% / ATK-5%",
  DEFENSE: "DEF+15% / SPD-5%",
  SUPPORT: "SPD+8%・HP+5%",
  DISRUPT: "SPD+5%・的中+10% / ATK-5%",
};

export const MONSTER_TYPE_LABELS: Readonly<Record<MonsterType, string>> = {
  ATTACK: "攻撃", HP: "体力", DEFENSE: "防御", SUPPORT: "補助", DISRUPT: "妨害",
};

/** 潜在能力の候補。効果本体は未確定のため、安定IDと説明を分離して持つ。 */
export interface LatentAbilityCandidate {
  id: string;
  name: string;
  description: string;
  skillSlot: 0;
}

export function createDefaultMonsterDevelopment(): MonsterDevelopment {
  return {
    schemaVersion: 1,
    type: null,
    abilityPoints: { hp: 0, atk: 0, def: 0, spd: 0 },
    latentAbilityId: null,
  };
}
