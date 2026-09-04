import type { AllySpec, Scenario } from "../types.js";
import { buildTower70, TOWER70_FOCUS, TOWER70_POISON } from "./tower70.js";
import { tower70V6Probe } from "../tower70/probeV6.js";
import { TOWER70_BASE } from "../tower70/spec.js";

/** 回復阻害3体。すべて本編の実在スキルを使う。 */
export const TOWER70_HEAL_BLOCK_3: AllySpec[] = [
  { label: "マッシュルン[草]", templateId: "mushroon", element: "GRASS", preset: "MAX_DEBUFFER" },
  { label: "フェンリル[電気]", templateId: "fenrir", element: "ELECTRIC", preset: "MAX_ATTACKER" },
  { label: "ウルフ[電気]", templateId: "wolf", element: "ELECTRIC", preset: "MAX_DEBUFFER" },
  { label: "ウィスプ[水]", templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { label: "クロノス[電気]", templateId: "chronos", element: "ELECTRIC", preset: "MAX_SPEED" },
];

/** 毒3体は既存の毒編成をそのまま使う。 */
export const TOWER70_POISON_3: AllySpec[] = TOWER70_POISON;

/**
 * 回復阻害+毒の混合型。
 * 回復阻害2体、毒2体、回復役1体で両方の攻略軸を同時に使う。
 */
export const TOWER70_MIXED: AllySpec[] = [
  { label: "マッシュルン[草]", templateId: "mushroon", element: "GRASS", preset: "MAX_DEBUFFER" },
  { label: "ウルフ[電気]", templateId: "wolf", element: "ELECTRIC", preset: "MAX_DEBUFFER" },
  { label: "マッシュルン[火]", templateId: "mushroon", element: "FIRE", preset: "MAX_DEBUFFER" },
  { label: "スライム[草]", templateId: "slime", element: "GRASS", preset: "MAX_DEBUFFER" },
  { label: "ウィスプ[水]", templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
];

export function buildTower70V6(allies: AllySpec[]): Scenario {
  const base = buildTower70({ allies, numbers: TOWER70_BASE });
  return {
    ...base,
    id: "tower-70-v6",
    title: "試練の塔 70階 始祖ベヒモス 第6回",
    note: "被ダメ軽減を削除し、瀕死ほどATKとHP比例火力を大幅強化。回復阻害3体・毒3体・混合型を比較する",
    focusPatterns: TOWER70_FOCUS,
    hook: (context) => tower70V6Probe(context, TOWER70_BASE),
  };
}
