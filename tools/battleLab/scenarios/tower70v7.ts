import type { AllySpec, Scenario } from "../types.js";
import { buildTower70, TOWER70_FOCUS } from "./tower70.js";
import { TOWER70_HEAL_BLOCK_3 } from "./tower70v6.js";
import { tower70V6Probe } from "../tower70/probeV6.js";
import { TOWER70_BASE, type Tower70Numbers } from "../tower70/spec.js";

/**
 * 第7回の70階数値。
 * - 始祖ベヒモス HP 230,000 -> 170,000
 * - 始祖ベヒモス ATK 7,800 -> 8,000
 * - それ以外は第6回を維持
 */
export const TOWER70_V7_NUMBERS: Tower70Numbers = {
  ...TOWER70_BASE,
  bossHp: 170_000,
  bossAtk: 8_000,
};

/**
 * 混合A: 安定型
 * 回復阻害2 / 毒1 / 回復1 / 速度支援1。
 * 命脈断ち後の立て直しと、回復阻害・毒の回転率を両立する。
 */
export const TOWER70_MIXED_A: AllySpec[] = [
  { label: "マッシュルン[草]", templateId: "mushroon", element: "GRASS", preset: "MAX_DEBUFFER" },
  { label: "フェンリル[電気]", templateId: "fenrir", element: "ELECTRIC", preset: "MAX_ATTACKER" },
  { label: "マッシュルン[火]", templateId: "mushroon", element: "FIRE", preset: "MAX_DEBUFFER" },
  { label: "ウィスプ[水]", templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { label: "クロノス[電気]", templateId: "chronos", element: "ELECTRIC", preset: "MAX_SPEED" },
];

/**
 * 混合B: 攻撃型
 * 回復阻害2 / 毒2 / 速度支援1。
 * 回復役を抜いて決着速度を上げ、毒+回復阻害で先に押し切る。
 */
export const TOWER70_MIXED_B: AllySpec[] = [
  { label: "マッシュルン[草]", templateId: "mushroon", element: "GRASS", preset: "MAX_DEBUFFER" },
  { label: "ウルフ[電気]", templateId: "wolf", element: "ELECTRIC", preset: "MAX_DEBUFFER" },
  { label: "マッシュルン[火]", templateId: "mushroon", element: "FIRE", preset: "MAX_DEBUFFER" },
  { label: "スライム[草]", templateId: "slime", element: "GRASS", preset: "MAX_DEBUFFER" },
  { label: "クロノス[電気]", templateId: "chronos", element: "ELECTRIC", preset: "MAX_SPEED" },
];

export function buildTower70V7(allies: AllySpec[]): Scenario {
  const base = buildTower70({ allies, numbers: TOWER70_V7_NUMBERS });
  return {
    ...base,
    id: "tower-70-v7",
    title: "試練の塔 70階 始祖ベヒモス 第7回",
    note: "本体HP17万・ATK8000。毒単独を外し、回復阻害3体と混合A/Bを比較する",
    focusPatterns: TOWER70_FOCUS,
    hook: (context) => tower70V6Probe(context, TOWER70_V7_NUMBERS),
  };
}

export const TOWER70_V7_HEAL_BLOCK: Scenario = buildTower70V7(TOWER70_HEAL_BLOCK_3);
