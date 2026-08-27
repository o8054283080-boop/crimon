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

export const ABILITY_POINT_BUDGET = 100;

/** 暫定バランス値。能力付与の換算値は必ずこの一か所から参照する。 */
export const ABILITY_POINT_VALUES: Readonly<Record<AllocatableStat, number>> = {
  hp: 20,
  atk: 2,
  def: 3,
  spd: 0.1,
};

/**
 * タイプ補正の差し替え口。最終値は未確定なので、このタスクでは全て中立値にする。
 * 数値が決まった後も保存済み個体を書き換えず、この表だけで調整できる。
 */
export const MONSTER_TYPE_STAT_MULTIPLIERS: Readonly<
  Record<MonsterType, Readonly<Record<AllocatableStat, number>>>
> = {
  ATTACK: { hp: 1, atk: 1, def: 1, spd: 1 },
  HP: { hp: 1, atk: 1, def: 1, spd: 1 },
  DEFENSE: { hp: 1, atk: 1, def: 1, spd: 1 },
  SUPPORT: { hp: 1, atk: 1, def: 1, spd: 1 },
  DISRUPT: { hp: 1, atk: 1, def: 1, spd: 1 },
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
