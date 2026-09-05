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

/**
 * ★6のLv50以降は完成育成帯として必要経験値を大きく引き上げる。
 * Lv50→60の合計は1,200,000 EXP。
 * Lv49以下は従来式を維持し、既存の序盤〜中盤育成テンポは変えない。
 */
const LATE_GAME_EXP: Record<number, number> = {
  50: 60_000,
  51: 70_000,
  52: 80_000,
  53: 90_000,
  54: 105_000,
  55: 120_000,
  56: 135_000,
  57: 155_000,
  58: 180_000,
  59: 205_000,
};

/** そのレベルから次のレベルへ上がるために必要な経験値 */
export function requiredExpForLevel(level: number): number {
  return LATE_GAME_EXP[level] ?? Math.round(40 * level ** 1.5);
}

export function canRankUp(star: Star, level: number): boolean {
  return star < 6 && level >= STAR_MAX_LEVEL[star];
}
