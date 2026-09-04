import type { EnemySpec, Scenario } from "../types.js";
import { tower90ProbeV2 } from "../tower90/probeV2.js";
import {
  TOWER90_ENEMIES_V1,
  TOWER90_RUSH_FOCUS,
  TOWER90_RUSH_PARTY,
  TOWER90_SAFE_FOCUS,
  TOWER90_SAFE_PARTY,
} from "./tower90v1.js";

/**
 * 90階V2。
 * V1はボスが32手前後で倒され、狂化もお供も仕事をする前に決着していた。
 * そこでボスだけを硬く・速くし、火力自体はATK9000のまま据え置く。
 *
 * 変更点:
 * - HP 230,000 -> 400,000
 * - DEF 3,500 -> 4,200
 * - SPD 180 -> 200
 * - HP狂化のSPD: +20 / +30 / +50（HP狂化だけで最終300）
 * - お供死亡ごとのSPD+7は別枠で加算される
 */
export const TOWER90_ENEMIES_V2: EnemySpec[] = TOWER90_ENEMIES_V1.map((enemy, index) => index === 0
  ? { ...enemy, stats: { ...enemy.stats, hp: 400_000, atk: 9_000, def: 4_200, spd: 200 } }
  : { ...enemy });

const base = {
  enemies: TOWER90_ENEMIES_V2,
  maxTurns: 300,
  hook: tower90ProbeV2,
};

export const TOWER90_SAFE_V2: Scenario = {
  id: "tower-90-v2-safe",
  title: "試練の塔90階 狂化 V2 安全処理型",
  note: "V1からボスHP/DEF/SPDとHP狂化SPDだけを強化。目標は最適安全処理25〜35%。本編90階には未接続。",
  allies: TOWER90_SAFE_PARTY,
  focusPatterns: TOWER90_SAFE_FOCUS,
  ...base,
};

export const TOWER90_RUSH_V2: Scenario = {
  id: "tower-90-v2-rush",
  title: "試練の塔90階 狂化 V2 ボス速攻型",
  note: "V1からボスHP/DEF/SPDとHP狂化SPDだけを強化。ボス集中の目標勝率15〜20%。本編90階には未接続。",
  allies: TOWER90_RUSH_PARTY,
  focusPatterns: TOWER90_RUSH_FOCUS,
  ...base,
};
