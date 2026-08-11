import { Element } from "../core/element.js";
import { Star } from "../core/rarity.js";
import { DungeonEnemy } from "./equipmentDungeon.js";
import { MONSTER_TEMPLATES } from "./monsters.js";

/**
 * レベル上げダンジョン: 装備ではなくモンスターの経験値稼ぎに特化した専用コンテンツ。
 * 装備ダンジョン(1〜10階の連続的な難易度)と異なり、初級/中級/上級の3段階固定。
 * 通常ステージ・装備ダンジョンより消費スタミナが多い代わりに、直接もらえる経験値が大きく、
 * クリアするたびに経験値フィード専用の「経験ピッグ」を確定で入手できる
 * (難易度が高いほど経験値・ピッグの星ともに大きくなる)。
 */
export type LevelDungeonTier = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export const LEVEL_DUNGEON_TIERS: LevelDungeonTier[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

export const LEVEL_DUNGEON_TIER_JA: Record<LevelDungeonTier, string> = {
  BEGINNER: "初級",
  INTERMEDIATE: "中級",
  ADVANCED: "上級",
};

export interface LevelDungeonDef {
  tier: LevelDungeonTier;
  name: string;
  enemies: DungeonEnemy[];
  powerScale: number;
  /** クリアで手持ちパーティに直接入る経験値 */
  expReward: number;
  goldReward: number;
  /** クリア確定でもらえる経験ピッグの星 */
  pigStar: Star;
}

const NORMAL_ELEMENTS: Element[] = ["FIRE", "WATER", "ELECTRIC", "GRASS"];

function buildEnemies(star: Star, level: number): DungeonEnemy[] {
  return MONSTER_TEMPLATES.map((template, i) => ({
    templateId: template.templateId,
    element: NORMAL_ELEMENTS[i % NORMAL_ELEMENTS.length],
    star,
    level,
  }));
}

interface TierConfig {
  star: Star;
  level: number;
  powerScale: number;
  expReward: number;
  goldReward: number;
  pigStar: Star;
}

const TIER_CONFIG: Record<LevelDungeonTier, TierConfig> = {
  BEGINNER: { star: 2, level: 20, powerScale: 0.45, expReward: 400, goldReward: 150, pigStar: 2 },
  INTERMEDIATE: { star: 4, level: 40, powerScale: 0.8, expReward: 1400, goldReward: 400, pigStar: 4 },
  ADVANCED: { star: 5, level: 50, powerScale: 1.35, expReward: 3500, goldReward: 900, pigStar: 6 },
};

export const LEVEL_DUNGEON_DEFS: LevelDungeonDef[] = LEVEL_DUNGEON_TIERS.map((tier) => {
  const cfg = TIER_CONFIG[tier];
  return {
    tier,
    name: `レベル上げダンジョン(${LEVEL_DUNGEON_TIER_JA[tier]})`,
    enemies: buildEnemies(cfg.star, cfg.level),
    powerScale: cfg.powerScale,
    expReward: cfg.expReward,
    goldReward: cfg.goldReward,
    pigStar: cfg.pigStar,
  };
});

export function findLevelDungeonDef(tier: LevelDungeonTier): LevelDungeonDef | undefined {
  return LEVEL_DUNGEON_DEFS.find((d) => d.tier === tier);
}
