/**
 * クリエイト拡張で個体ごとに保存する育成情報。
 *
 * このファイルは保存形式だけを先に固定するための境界であり、各値はまだ戦闘計算へ
 * 反映しない。仕様調整中の倍率やコストをここへ焼き込まないこと。
 */
export type MonsterType = "ATTACK" | "HP" | "DEFENSE" | "SUPPORT" | "DISRUPT";

export type AllocatableStat = "hp" | "atk" | "def" | "spd";

export type AbilityPointAllocation = Record<AllocatableStat, number>;

export interface MonsterDevelopment {
  /** 保存形式の移行単位。個別機能の実装時に必要な場合だけ上げる */
  schemaVersion: 1;
  /** タイプ転生を行うまでは未設定。未設定個体の補正は常にゼロとする */
  type: MonsterType | null;
  /** 能力ポイントの割り振り。現段階では保存のみで、Statsには加算しない */
  abilityPoints: AbilityPointAllocation;
  /** 選択した潜在能力の安定ID。未覚醒ならnull */
  latentAbilityId: string | null;
}

export const ABILITY_POINT_BUDGET = 100;

export function createDefaultMonsterDevelopment(): MonsterDevelopment {
  return {
    schemaVersion: 1,
    type: null,
    abilityPoints: { hp: 0, atk: 0, def: 0, spd: 0 },
    latentAbilityId: null,
  };
}

