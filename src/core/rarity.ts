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

/**
 * 各ランクをLv1からそのランクの育成区切りまで上げるのに必要な総EXP。
 * ★6だけはLv1→50を900,000、Lv50→60を1,200,000に分ける。
 */
export const STAR_EARLY_TOTAL_EXP: Record<Star, number> = {
  1: 40_000,
  2: 80_000,
  3: 220_000,
  4: 420_000,
  5: 700_000,
  6: 900_000,
};

export const STAR_MAX_TOTAL_EXP: Record<Star, number> = {
  1: 40_000,
  2: 80_000,
  3: 220_000,
  4: 420_000,
  5: 700_000,
  6: 2_100_000,
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
    spd: baseStats.spd,
    criRate: baseStats.criRate,
    criDmg: baseStats.criDmg,
    resistance: baseStats.resistance,
    accuracy: baseStats.accuracy,
  };
}

/**
 * ★6のLv50以降は完成育成帯。
 * Lv50→60の合計は1,200,000 EXPで据え置く。
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

/**
 * 星1〜5の全育成帯と、★6のLv1→50を滑らかに配分するカーブ。
 * 累積値の差分で計算するため、丸めを含めても各ランクの合計EXPは必ず設計値に一致する。
 */
const EARLY_EXP_CURVE_POWER = 1.35;

function cumulativeEarlyExp(totalExp: number, step: number, stepCount: number): number {
  if (step <= 0) return 0;
  if (step >= stepCount) return totalExp;
  return Math.round(totalExp * (step / stepCount) ** EARLY_EXP_CURVE_POWER);
}

/**
 * 星ランクを含めた実際のモンスター育成用必要EXP。
 * level は「そのレベルから次のレベルへ上がる」際の現在レベル。
 */
export function requiredExpForStarLevel(star: Star, level: number): number {
  const safeLevel = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));

  if (star === 6 && safeLevel >= 50) {
    return LATE_GAME_EXP[safeLevel] ?? 0;
  }

  const earlyMaxLevel = star === 6 ? 50 : STAR_MAX_LEVEL[star];
  if (safeLevel >= earlyMaxLevel) return 0;

  const stepCount = earlyMaxLevel - 1;
  const totalExp = STAR_EARLY_TOTAL_EXP[star];
  return (
    cumulativeEarlyExp(totalExp, safeLevel, stepCount) -
    cumulativeEarlyExp(totalExp, safeLevel - 1, stepCount)
  );
}

/**
 * 星情報を持たない旧来の汎用計算。
 * 素材価値など既存仕様の互換用に残し、実際のモンスターレベルアップは
 * requiredExpForStarLevel を使う。
 */
export function requiredExpForLevel(level: number): number {
  return LATE_GAME_EXP[level] ?? Math.round(40 * level ** 1.5);
}

export function canRankUp(star: Star, level: number): boolean {
  return star < 6 && level >= STAR_MAX_LEVEL[star];
}
