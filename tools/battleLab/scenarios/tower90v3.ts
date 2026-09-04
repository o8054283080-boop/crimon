import type { EnemySpec, Scenario } from "../types.js";
import { tower90ProbeV3 } from "../tower90/probeV3.js";
import {
  TOWER90_RUSH_FOCUS,
  TOWER90_RUSH_PARTY,
  TOWER90_SAFE_FOCUS,
  TOWER90_SAFE_PARTY,
} from "./tower90v1.js";
import { TOWER90_ENEMIES_V2 } from "./tower90v2.js";

/** 90階V3: お供4体のHPを各+100,000し、お供死亡狂化をATK+1200/SPD+15へ強化。 */
export const TOWER90_ENEMIES_V3: EnemySpec[] = TOWER90_ENEMIES_V2.map((enemy, index) => {
  if (index === 0) return { ...enemy };
  return { ...enemy, stats: { ...enemy.stats, hp: (enemy.stats?.hp ?? 0) + 100_000 } };
});

const base = {
  enemies: TOWER90_ENEMIES_V3,
  maxTurns: 300,
  hook: tower90ProbeV3,
};

export const TOWER90_SAFE_V3: Scenario = {
  id: "tower-90-v3-safe",
  title: "試練の塔90階 狂化 V3 安全処理型",
  note: "V2からお供4体HPを各+10万、お供死亡ごとの狂化をATK+1200/SPD+15へ強化。目標は最適安全処理25〜35%。本編90階には未接続。",
  allies: TOWER90_SAFE_PARTY,
  focusPatterns: TOWER90_SAFE_FOCUS,
  ...base,
};

export const TOWER90_RUSH_V3: Scenario = {
  id: "tower-90-v3-rush",
  title: "試練の塔90階 狂化 V3 ボス速攻型",
  note: "V2からお供4体HPを各+10万、お供死亡ごとの狂化をATK+1200/SPD+15へ強化。ボス集中の目標勝率15〜20%。本編90階には未接続。",
  allies: TOWER90_RUSH_PARTY,
  focusPatterns: TOWER90_RUSH_FOCUS,
  ...base,
};
