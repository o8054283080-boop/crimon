import { Stats } from "./stats.js";

export type Star = 1 | 2 | 3 | 4 | 5 | 6;

export const STARS: Star[] = [1, 2, 3, 4, 5, 6];

/** 星ごとの最大レベル */
export const STAR_MAX_LEVEL: Record<Star, number> = {
  1: 15,
  2: 20,
  3: 30,
  4: 40,
  5: 50,
  6: 60,
};

/** ランクアップ(星を1つ上げる)に必要な、同じ星の素材モンスターの数 */
export const RANK_UP_SACRIFICE_COUNT: Record<Star, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 0, // 星6は上限。ランクアップ不可
};

/**
 * ランクアップ時のステータス倍率(星2で1.4倍、星3で1.4^2倍…と複利で効く)。
 * レベル成長(levelMultiplier)が最大レベルで2.0倍になる設計と組み合わさることで、
 * ランクアップ直後(新しい星のレベル1)の実効ステータスは、進化前(旧星の最大レベル)の
 * 70%(= 1.4 / 2.0)からスタートするようになっている。
 */
const RANK_UP_MULTIPLIER = 1.4;

export function starMultiplier(star: Star): number {
  return RANK_UP_MULTIPLIER ** (star - 1);
}

/** そのレベルにおけるレベル成長倍率。1レベルで1.0倍、そのランクの最大レベルで2.0倍になるよう線形補間する */
export function levelMultiplier(star: Star, level: number): number {
  const maxLevel = STAR_MAX_LEVEL[star];
  if (maxLevel <= 1) return 1;
  const clampedLevel = Math.max(1, Math.min(level, maxLevel));
  return 1 + ((clampedLevel - 1) / (maxLevel - 1)) * 1.0;
}

/** 星・レベルを反映した実効ステータスを計算する */
export function computeEffectiveStats(baseStats: Stats, star: Star, level: number): Stats {
  const multiplier = starMultiplier(star) * levelMultiplier(star, level);
  return {
    hp: Math.round(baseStats.hp * multiplier),
    atk: Math.round(baseStats.atk * multiplier),
    def: Math.round(baseStats.def * multiplier),
    spd: baseStats.spd, // SPDは星・レベルによる変化なし(常に基礎値のまま)
    criRate: baseStats.criRate,
    criDmg: baseStats.criDmg,
    resistance: baseStats.resistance,
    accuracy: baseStats.accuracy,
  };
}

/** そのレベルからレベルアップに必要な累積経験値 */
export function requiredExpForLevel(level: number): number {
  return Math.round(40 * level ** 1.5);
}

export function canRankUp(star: Star, level: number): boolean {
  return star < 6 && level >= STAR_MAX_LEVEL[star];
}
