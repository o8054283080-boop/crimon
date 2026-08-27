import { Element } from "../core/element.js";
import { Star } from "../core/rarity.js";
import { DungeonEnemy } from "./equipmentDungeon.js";
import { MONSTER_TEMPLATES } from "./monsters.js";

/**
 * レベル上げダンジョン: 装備ではなくモンスターの経験値稼ぎに特化した専用コンテンツ。
 *
 * **1日5回まで**。回数を絞る代わりに1回の実入りを大きくしてある。
 * 以前は無制限で1回あたりの経験値が小さく、**スタミナの続く限り延々と回す場所**だった。
 * 周回そのものが目的化して、育成という行為が「時間を溶かす作業」になっていた。
 * 回数を絞ると、1回をどの階でどの編成で使うかを選ぶことになる。
 *
 * 階は5つ。上の階ほど経験値と経験ピッグが増える。
 */
export type LevelDungeonTier = "F1" | "F2" | "F3" | "F4" | "F5";

export const LEVEL_DUNGEON_TIERS: LevelDungeonTier[] = ["F1", "F2", "F3", "F4", "F5"];

export const LEVEL_DUNGEON_TIER_JA: Record<LevelDungeonTier, string> = {
  F1: "1階",
  F2: "2階",
  F3: "3階",
  F4: "4階",
  F5: "5階",
};

/**
 * 1日に挑める回数。
 *
 * 集中育成の機会を増やしつつ、通常ステージとの役割を分けるため5回とする。
 */
export const LEVEL_DUNGEON_DAILY_LIMIT = 5;

/**
 * 古い控えに残っている階の名前を、今の名前へ読み替える。
 *
 * 3段階(初級/中級/上級)だった頃のクリア記録が控えに残っている。
 * **読み替えないと、前から遊んでいる人のクリア済みが全部消える。**
 * 上級は今の3階に相当する強さだったので、そこへ寄せてある。
 */
export const LEGACY_LEVEL_DUNGEON_TIERS: Record<string, LevelDungeonTier> = {
  BEGINNER: "F1",
  INTERMEDIATE: "F2",
  ADVANCED: "F3",
};

export interface LevelDungeonDef {
  tier: LevelDungeonTier;
  name: string;
  enemies: DungeonEnemy[];
  powerScale: number;
  /** 敵の速度に掛かる倍率 */
  speedScale: number;
  /** クリアで手持ちパーティに直接入る経験値(1体ずつに入る) */
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
  /**
   * 敵の速度に掛かる倍率。
   *
   * powerScale は速度に掛からないので、速度だけが据え置きだった
   * (プレイヤー側は★6装備を詰めると300を超える)。
   * ただし**装備ダンジョンより弱くする**。あちらは装備を詰めた人が挑む場所だが、
   * ここは育てるために通う場所なので、周回の手が止まるほど上げてはいけない。
   */
  speedScale: number;
}

/**
 * 各階の中身。
 *
 * 経験値の額は**必要経験値から逆算**してある(勘で決めていない)。
 * ★6を Lv1 から Lv60 まで上げるのに要るのは 436,915。
 * 5階を1日5回まわすと 1体あたり 260,000 なので、★6 Lv1から約2日で1体が仕上がる。
 * 1〜3階は以前の初級・中級・上級におおむね対応する強さで、額だけを引き上げてある
 * (回数制限を課したぶん、1回の価値を上げないと以前より痩せる)。
 *
 * ピッグは3階から★6のまま据え置く。**ここを下げると、前から遊んでいる人にとっては劣化**になる。
 * 上の階の伸びしろは、この場所の存在理由そのものである経験値で出す。
 *
 * 4階・5階の倍率は**振って測って決めた**(通常4体・★6Lv60・24回ずつ):
 *
 * | powerScale | 4階 ★5装備 / ★6装備 | 5階 ★5装備 / ★6装備 |
 * |---|---|---|
 * | 1.05 | 83% / 100% | 67% / 92% |
 * | 1.20 | 33% / 100% | 29% / 88% |
 * | 1.35 |  8% /  67% |  0% / 50% |
 *
 * 4階を1.05、5階を1.20にしてある。**★5装備なら4階、★6装備を整えて5階**という段差。
 * ここは腕試しの場所ではなく育てるために通う場所で、1日5回の制限がある。
 * 半々で落ちる階に貴重な1回を賭けさせるのは、挑戦ではなくただの取り上げになる。
 */
const TIER_CONFIG: Record<LevelDungeonTier, TierConfig> = {
  F1: { star: 2, level: 20, powerScale: 0.45, expReward: 3000, goldReward: 1200, pigStar: 2, speedScale: 1 },
  F2: { star: 4, level: 40, powerScale: 0.8, expReward: 9000, goldReward: 2600, pigStar: 4, speedScale: 1.06 },
  F3: { star: 5, level: 50, powerScale: 1.35, expReward: 20000, goldReward: 4500, pigStar: 6, speedScale: 1.12 },
  F4: { star: 6, level: 55, powerScale: 1.05, expReward: 34000, goldReward: 7000, pigStar: 6, speedScale: 1.18 },
  F5: { star: 6, level: 60, powerScale: 1.2, expReward: 52000, goldReward: 10000, pigStar: 6, speedScale: 1.24 },
};

export const LEVEL_DUNGEON_DEFS: LevelDungeonDef[] = LEVEL_DUNGEON_TIERS.map((tier) => {
  const cfg = TIER_CONFIG[tier];
  return {
    tier,
    name: `レベル上げダンジョン ${LEVEL_DUNGEON_TIER_JA[tier]}`,
    enemies: buildEnemies(cfg.star, cfg.level),
    powerScale: cfg.powerScale,
    speedScale: cfg.speedScale,
    expReward: cfg.expReward,
    goldReward: cfg.goldReward,
    pigStar: cfg.pigStar,
  };
});

export function findLevelDungeonDef(tier: LevelDungeonTier): LevelDungeonDef | undefined {
  return LEVEL_DUNGEON_DEFS.find((d) => d.tier === tier);
}
