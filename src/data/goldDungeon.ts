import { Element } from "../core/element.js";
import { Star } from "../core/rarity.js";
import { DungeonEnemy } from "./equipmentDungeon.js";
import { MONSTER_TEMPLATES } from "./monsters.js";

/**
 * ゴールドダンジョン: ゴールド稼ぎに特化した専用コンテンツ。
 * 5階まであり、1日に挑戦できる回数は全階層合計で3回まで(日付が変わるとリセット)。
 * 装備ドロップや経験値ボーナスはなく、その代わりに他コンテンツよりゴールド報酬が大幅に大きい。
 *
 * ショップの追加で、ゴールドの使い道が装備の強化以外にも増えた。
 * 稼ぐ側の上限が3階のままだと、並んだ品を眺めるだけで終わってしまうため5階まで伸ばしてある。
 */
export const GOLD_DUNGEON_FLOOR_COUNT = 5;

/** 1日に挑戦できる回数(全階層合計)。日付が変わるとリセットされる */
export const GOLD_DUNGEON_DAILY_LIMIT = 3;

export interface GoldDungeonFloor {
  floor: number;
  name: string;
  enemies: DungeonEnemy[];
  powerScale: number;
  /** 敵の速度に掛かる倍率 */
  speedScale: number;
  goldReward: number;
}

const FLOOR_ELEMENTS: Element[] = ["FIRE", "WATER", "ELECTRIC", "GRASS", "DARK"];

/** 1階層に並ぶ敵の数。プレイヤー側と同じ4体 */
const ENEMY_COUNT = 4;

interface FloorConfig {
  star: Star;
  level: number;
  powerScale: number;
  /**
   * 敵の速度に掛かる倍率。
   *
   * powerScale は速度に掛からないので、速度だけが据え置きだった。
   * ただし**装備ダンジョンより弱くする**。ここは1日3回しか挑めない
   * 稼ぎの場所で、手が止まると取り返しがつかない。
   * 装備ダンジョンが最終階で1.85倍なのに対し、5階で1.2倍に留める。
   */
  speedScale: number;
  goldReward: number;
}

/** 階層が上がるほど敵は強くなるが、その分ゴールド報酬も大きく増える */
const FLOOR_CONFIG: Record<number, FloorConfig> = {
  1: { star: 3, level: 30, powerScale: 0.7, speedScale: 1, goldReward: 3000 },
  2: { star: 4, level: 40, powerScale: 1.0, speedScale: 1.05, goldReward: 8000 },
  3: { star: 5, level: 50, powerScale: 1.4, speedScale: 1.1, goldReward: 20000 },
  4: { star: 5, level: 50, powerScale: 1.9, speedScale: 1.15, goldReward: 45000 },
  5: { star: 6, level: 60, powerScale: 2.3, speedScale: 1.2, goldReward: 90000 },
};

function buildEnemies(floor: number, star: Star, level: number): DungeonEnemy[] {
  const element = FLOOR_ELEMENTS[(floor - 1) % FLOOR_ELEMENTS.length];
  // 通常モンスターの種類は8体に増えたので、そのまま並べると8体編成になってしまう。
  // 階層ごとに開始位置をずらして4体だけ取り、階が変われば顔ぶれも変わるようにする
  const templates = MONSTER_TEMPLATES;
  return Array.from({ length: ENEMY_COUNT }, (_, i) => ({
    templateId: templates[(floor - 1 + i) % templates.length].templateId,
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
    speedScale: cfg.speedScale,
    goldReward: cfg.goldReward,
  };
});

export function findGoldDungeonFloor(floor: number): GoldDungeonFloor | undefined {
  return GOLD_DUNGEON_FLOORS.find((f) => f.floor === floor);
}
