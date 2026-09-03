/**
 * レートの増減。
 *
 * **数字はすべてここの定数。** 依頼の目安をそのまま置いてある。
 *
 *   同格   勝ち +15 / 負け -10
 *   格上   勝ち +20〜25 / 負け -5
 *   格下   勝ち +8〜12 / 負け -15
 *
 * これを「勝つと +15」の1本で書くと格差が反映されないので、
 * レート差から連続的に出す。差がゼロなら必ず同格の値になり、
 * 差が開くほど格上/格下の値へ寄る(段差を作らない)。
 */

export interface ArenaRatingRules {
  /** 同格での勝ち幅・負け幅 */
  evenWin: number;
  evenLoss: number;
  /** 格上に勝った時の上限・格上に負けた時の下限 */
  maxWin: number;
  minLoss: number;
  /** 格下に勝った時の下限・格下に負けた時の上限 */
  minWin: number;
  maxLoss: number;
  /**
   * 「格上/格下」と見なすレート差。
   * この差でちょうど上限・下限へ届く。
   */
  spread: number;
  /** レートの下限。ここより下へは落ちない */
  floor: number;
}

export const ARENA_RATING_RULES: ArenaRatingRules = {
  evenWin: 15,
  evenLoss: 10,
  maxWin: 25,
  minLoss: 5,
  minWin: 8,
  maxLoss: 15,
  spread: 300,
  floor: 0,
};

/**
 * 防衛側の増減は攻撃側より小さくする。
 *
 * **寝ている間に大量に落ちる状態を避ける。** 防衛は自分で選べない戦いなので、
 * 同じ幅で動かすと「触っていないのに順位が溶ける」ことになる。
 */
export const ARENA_DEFENSE_RATING_SCALE = 0.5;

/** 1日に防衛で減らせるレートの上限。これ以上は寝ている間に落ちない */
export const ARENA_DEFENSE_DAILY_LOSS_CAP = 60;

export interface ArenaRatingChange {
  /** 増減。勝ちは正、負けは負 */
  delta: number;
  /** 適用後のレート */
  rating: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 1戦ぶんのレート増減。
 *
 * `opponentRating - myRating` が正なら格上。
 * 差の大きさを `spread` で 0〜1 に潰してから、同格の値と上限/下限の間を取る。
 */
export function arenaRatingDelta(
  myRating: number,
  opponentRating: number,
  won: boolean,
  rules: ArenaRatingRules = ARENA_RATING_RULES,
): number {
  const diff = opponentRating - myRating;
  const t = Math.min(1, Math.abs(diff) / rules.spread);
  const upward = diff > 0;
  if (won) {
    const target = upward ? rules.maxWin : rules.minWin;
    return Math.round(lerp(rules.evenWin, target, t));
  }
  const target = upward ? rules.minLoss : rules.maxLoss;
  return -Math.round(lerp(rules.evenLoss, target, t));
}

/** 攻撃側の1戦を適用する */
export function applyArenaRating(
  myRating: number,
  opponentRating: number,
  won: boolean,
  rules: ArenaRatingRules = ARENA_RATING_RULES,
): ArenaRatingChange {
  const delta = arenaRatingDelta(myRating, opponentRating, won, rules);
  return { delta, rating: Math.max(rules.floor, myRating + delta) };
}

/**
 * 防衛側の1戦を適用する。
 * `won` は**防衛側から見た勝敗**(攻撃を退けたら true)。
 */
export function applyArenaDefenseRating(
  myRating: number,
  attackerRating: number,
  won: boolean,
  rules: ArenaRatingRules = ARENA_RATING_RULES,
  scale: number = ARENA_DEFENSE_RATING_SCALE,
): ArenaRatingChange {
  const raw = arenaRatingDelta(myRating, attackerRating, won, rules);
  // 0にはしない。防衛でも動いたことが分かる方がよい
  const delta = raw === 0 ? 0 : Math.sign(raw) * Math.max(1, Math.round(Math.abs(raw) * scale));
  return { delta, rating: Math.max(rules.floor, myRating + delta) };
}
