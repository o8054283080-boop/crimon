import { Element } from "../core/element.js";
import { Star } from "../core/rarity.js";
import { DungeonEnemy } from "./equipmentDungeon.js";
import { MONSTER_TEMPLATES } from "./monsters.js";

/**
 * ゴールドダンジョン: ゴールド稼ぎに特化した専用コンテンツ。
 * 固定で3階まであり、1日に挑戦できる回数は全階層合計で3回まで(日付が変わるとリセット)。
 * 装備ドロップや経験値ボーナスはなく、その代わりに他コンテンツよりゴールド報酬が大幅に大きい。
 */
export const GOLD_DUNGEON_FLOOR_COUNT = 3;

/** 1日に挑戦できる回数(全階層合計)。日付が変わるとリセットされる */
export const GOLD_DUNGEON_DAILY_LIMIT = 3;

export interface GoldDungeonFloor {
  floor: number;
  name: string;
  enemies: DungeonEnemy[];
  powerScale: number;
  goldReward: number;
}

const FLOOR_ELEMENTS: Element[] = ["FIRE", "WATER", "ELECTRIC"];

interface FloorConfig {
  star: Star;
  level: number;
  powerScale: number;
  goldReward: number;
}

/** 階層が上がるほど敵は強くなるが、その分ゴールド報酬も大きく増える */
const FLOOR_CONFIG: Record<number, FloorConfig> = {
  1: { star: 3, level: 30, powerScale: 0.7, goldReward: 3000 },
  2: { star: 4, level: 40, powerScale: 1.0, goldReward: 8000 },
  3: { star: 5, level: 50, powerScale: 1.4, goldReward: 20000 },
};

function buildEnemies(floor: number, star: Star, level: number): DungeonEnemy[] {
  const element = FLOOR_ELEMENTS[(floor - 1) % FLOOR_ELEMENTS.length];
  return MONSTER_TEMPLATES.map((template) => ({
    templateId: template.templateId,
    element,
    star,
    level,
  }));
}

export const GOLD_DUNGEON_FLOORS: GoldDungeonFloor[] = Array.from({ length: GOLD_DUNGEON_FLOOR_COUNT }, (_, i) => {
  const floor = i + 1;
  const cfg = FLOOR_CONFIG[floor];
  return {
    floor,
    name: `ゴールドダンジョン ${floor}階`,
    enemies: buildEnemies(floor, cfg.star, cfg.level),
    powerScale: cfg.powerScale,
    goldReward: cfg.goldReward,
  };
});

export function findGoldDungeonFloor(floor: number): GoldDungeonFloor | undefined {
  return GOLD_DUNGEON_FLOORS.find((f) => f.floor === floor);
}
