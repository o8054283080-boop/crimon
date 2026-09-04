import type { EnemySpec, Scenario } from "../types.js";
import { tower90ProbeV7 } from "../tower90/probeV7.js";
import {
  TOWER90_RUSH_FOCUS,
  TOWER90_RUSH_PARTY,
  TOWER90_SAFE_FOCUS,
  TOWER90_SAFE_PARTY,
} from "./tower90v1.js";
import { TOWER90_ENEMIES_V6 } from "./tower90v6.js";

/**
 * 90階V7。
 * - V6を基準にボスHP40%以下のATK補正をさらに+500
 * - 戦鼓晶死亡後かつ狂牙獣生存中、狂牙獣ATK+1500 / SPD+15 / 処刑突撃2.9倍相当
 * - その他V6仕様を維持
 */
export const TOWER90_ENEMIES_V7: EnemySpec[] = TOWER90_ENEMIES_V6.map((enemy) => ({ ...enemy }));

const base = {
  enemies: TOWER90_ENEMIES_V7,
  maxTurns: 300,
  hook: tower90ProbeV7,
};

export const TOWER90_SAFE_V7: Scenario = {
  id: "tower-90-v7-safe",
  title: "試練の塔90階 狂化 V7 安全処理型",
  note: "V6から、戦鼓晶先処理時だけ狂牙獣を追加強化し、ボスHP40%以下ATKを+500。安全3ルートの勝率を狙って微調整。本編未接続。",
  allies: TOWER90_SAFE_PARTY,
  focusPatterns: TOWER90_SAFE_FOCUS,
  ...base,
};

export const TOWER90_RUSH_V7: Scenario = {
  id: "tower-90-v7-rush",
  title: "試練の塔90階 狂化 V7 ボス速攻型",
  note: "安全処理側の最終調整確認用。速攻側は今回は評価対象外。本編未接続。",
  allies: TOWER90_RUSH_PARTY,
  focusPatterns: TOWER90_RUSH_FOCUS,
  ...base,
};
