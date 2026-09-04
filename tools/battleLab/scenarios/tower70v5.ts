import type { AllySpec, Scenario } from "../types.js";
import { buildTower70, TOWER70_FOCUS } from "./tower70.js";
import { TOWER70_HEAL_BLOCK } from "./tower70v4.js";
import { tower70V5Probe } from "../tower70/probeV5.js";
import { TOWER70_BASE } from "../tower70/spec.js";

/**
 * 第5回:
 * - 治癒阻害は回復完全不可
 * - 回復阻害スキルはボス維持として評価
 * - 命脈断ちは現在HP上位3体を同時に半分
 * - 終盤HP比例強化はV4のまま
 */
export function buildTower70V5(allies: AllySpec[] = TOWER70_HEAL_BLOCK): Scenario {
  const base = buildTower70({ allies, numbers: TOWER70_BASE });
  return {
    ...base,
    id: "tower-70-v5",
    title: "試練の塔 70階 始祖ベヒモス 第5回",
    note: "完全回復阻害と3体命脈断ちで、攻略性と決着率を再検証する",
    focusPatterns: TOWER70_FOCUS,
    hook: (context) => tower70V5Probe(context, TOWER70_BASE),
  };
}

export const TOWER70_V5: Scenario = buildTower70V5();
