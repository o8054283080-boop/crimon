import type { EnemySpec, Scenario } from "../types.js";
import { tower90ProbeV5 } from "../tower90/probeV5.js";
import {
  TOWER90_RUSH_FOCUS,
  TOWER90_RUSH_PARTY,
  TOWER90_SAFE_FOCUS,
  TOWER90_SAFE_PARTY,
} from "./tower90v1.js";
import { TOWER90_ENEMIES_V4 } from "./tower90v4.js";

/**
 * 90階V5。
 * V4から戦鼓晶だけHP+50,000 / DEF+1,000。
 * 戦鼓晶S3のボス追加ゲージを30%→15%へ緩和し、ボスCT-1は維持。
 */
export const TOWER90_ENEMIES_V5: EnemySpec[] = TOWER90_ENEMIES_V4.map((enemy, index) => {
  if (index !== 2) return { ...enemy };
  return {
    ...enemy,
    stats: {
      ...enemy.stats,
      hp: (enemy.stats?.hp ?? 0) + 50_000,
      def: (enemy.stats?.def ?? 0) + 1_000,
    },
  };
});

const base = {
  enemies: TOWER90_ENEMIES_V5,
  maxTurns: 300,
  hook: tower90ProbeV5,
};

export const TOWER90_SAFE_V5: Scenario = {
  id: "tower-90-v5-safe",
  title: "試練の塔90階 狂化 V5 安全処理型",
  note: "V4から戦鼓晶HP+5万/DEF+1000、ボス追加ゲージ30%→15%。その他V4仕様を維持。目標25〜35%。本編未接続。",
  allies: TOWER90_SAFE_PARTY,
  focusPatterns: TOWER90_SAFE_FOCUS,
  ...base,
};

export const TOWER90_RUSH_V5: Scenario = {
  id: "tower-90-v5-rush",
  title: "試練の塔90階 狂化 V5 ボス速攻型",
  note: "V4から戦鼓晶HP+5万/DEF+1000、ボス追加ゲージ30%→15%。その他V4仕様を維持。ボス集中目標15〜20%。本編未接続。",
  allies: TOWER90_RUSH_PARTY,
  focusPatterns: TOWER90_RUSH_FOCUS,
  ...base,
};
