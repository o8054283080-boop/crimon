import type { AllySpec, Scenario } from "../types.js";
import { buildTower70, TOWER70_FOCUS } from "./tower70.js";
import { tower70V4Probe } from "../tower70/probeV4.js";
import { TOWER70_BASE } from "../tower70/spec.js";

/**
 * 第4回: 回復阻害を正解として測る専用シナリオ。
 * 本編に実在する回復阻害だけを使う。
 *
 * - 草マッシュルン: S2「衰弱胞子」75% / 2ターン / 回復50%減
 * - 電気フェンリル: S3「血の追跡」80% / 2ターン / 回復50%減
 */
export const TOWER70_HEAL_BLOCK: AllySpec[] = [
  { label: "マッシュルン[草]", templateId: "mushroon", element: "GRASS", preset: "MAX_DEBUFFER" },
  { label: "フェンリル[電気]", templateId: "fenrir", element: "ELECTRIC", preset: "MAX_ATTACKER" },
  { label: "ウィスプ[水]", templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { label: "クロノス[電気]", templateId: "chronos", element: "ELECTRIC", preset: "MAX_SPEED" },
  { label: "ドラゴン[火]", templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
];

export function buildTower70V4(allies: AllySpec[] = TOWER70_HEAL_BLOCK): Scenario {
  const base = buildTower70({ allies, numbers: TOWER70_BASE });
  return {
    ...base,
    id: "tower-70-v4",
    title: "試練の塔 70階 始祖ベヒモス 第4回(回復阻害)",
    note: "回復阻害で超再生を止める攻略と、瀕死ほど急激に火力が上がる終盤を測る",
    focusPatterns: TOWER70_FOCUS,
    hook: (context) => tower70V4Probe(context, TOWER70_BASE),
  };
}

export const TOWER70_V4: Scenario = buildTower70V4();
