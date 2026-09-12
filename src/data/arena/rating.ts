/**
 * アリーナのレート増減。
 *
 * 相手との差を強く反映する。格下狩りではほとんど伸びず、
 * 格上に勝った時は後発でも追いつけるだけ大きく伸びる。
 *
 * 差 = 相手レート - 自分レート。
 * 表の間は線形補間し、表の外は端の値で固定する。
 */

export interface ArenaRatingPoint {
  diff: number;
  value: number;
}

export interface ArenaRatingRules {
  /** 勝利時の増加量。value は正数 */
  winCurve: readonly ArenaRatingPoint[];
  /** 敗北時の減少量。value は正数 */
  lossCurve: readonly ArenaRatingPoint[];
  /** レートの下限 */
  floor: number;
}

/**
 * 確定バランス。
 *
 * 勝利:
 * -300以下:+1 / -200:+3 / -100:+6 / 0:+12 / +100:+18 /
 * +200:+26 / +300:+34 / +500以上:+40
 *
 * 敗北:
 * +500以上:-1 / +400:-2 / +300:-3 / +200:-5 / +100:-9 /
 * 0:-13 / -100:-18 / -200:-24 / -300:-30 / -400以下:-32
 */
export const ARENA_RATING_RULES: ArenaRatingRules = {
  winCurve: [
    { diff: -300, value: 1 },
    { diff: -250, value: 2 },
    { diff: -200, value: 3 },
    { diff: -150, value: 4 },
    { diff: -100, value: 6 },
    { diff: -50, value: 9 },
    { diff: 0, value: 12 },
    { diff: 50, value: 15 },
    { diff: 100, value: 18 },
    { diff: 150, value: 22 },
    { diff: 200, value: 26 },
    { diff: 250, value: 30 },
    { diff: 300, value: 34 },
    { diff: 400, value: 38 },
    { diff: 500, value: 40 },
  ],
  lossCurve: [
    { diff: -400, value: 32 },
    { diff: -300, value: 30 },
    { diff: -250, value: 27 },
    { diff: -200, value: 24 },
    { diff: -150, value: 21 },
    { diff: -100, value: 18 },
    { diff: -50, value: 15 },
    { diff: 0, value: 13 },
    { diff: 50, value: 11 },
    { diff: 100, value: 9 },
    { diff: 150, value: 7 },
    { diff: 200, value: 5 },
    { diff: 250, value: 4 },
    { diff: 300, value: 3 },
    { diff: 400, value: 2 },
    { diff: 500, value: 1 },
  ],
  floor: 0,
};

/**
 * 防衛は自分で相手を選べないため、攻撃戦の60%。
 * 0にはせず、動いたことが分かるよう最低1は残す。
 */
export const ARENA_DEFENSE_RATING_SCALE = 0.6;

/** 1日に防衛で減らせるレートの上限。既存の安全弁は維持する */
export const ARENA_DEFENSE_DAILY_LOSS_CAP = 60;

export interface ArenaRatingChange {
  delta: number;
  rating: number;
}

function interpolateCurve(diff: number, curve: readonly ArenaRatingPoint[]): number {
  if (curve.length === 0) return 0;
  if (diff <= curve[0].diff) return curve[0].value;
  const last = curve[curve.length - 1];
  if (diff >= last.diff) return last.value;

  for (let i = 1; i < curve.length; i += 1) {
    const high = curve[i];
    if (diff > high.diff) continue;
    const low = curve[i - 1];
    const span = high.diff - low.diff;
    const t = span <= 0 ? 0 : (diff - low.diff) / span;
    return Math.round(low.value + (high.value - low.value) * t);
  }
  return last.value;
}

/** 1戦ぶんのレート増減。diff が正なら格上。 */
export function arenaRatingDelta(
  myRating: number,
  opponentRating: number,
  won: boolean,
  rules: ArenaRatingRules = ARENA_RATING_RULES,
): number {
  const diff = opponentRating - myRating;
  const amount = interpolateCurve(diff, won ? rules.winCurve : rules.lossCurve);
  return won ? amount : -amount;
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

/** 防衛側の1戦を適用する。won は防衛側から見た勝敗。 */
export function applyArenaDefenseRating(
  myRating: number,
  attackerRating: number,
  won: boolean,
  rules: ArenaRatingRules = ARENA_RATING_RULES,
  scale: number = ARENA_DEFENSE_RATING_SCALE,
): ArenaRatingChange {
  const raw = arenaRatingDelta(myRating, attackerRating, won, rules);
  const delta = raw === 0 ? 0 : Math.sign(raw) * Math.max(1, Math.round(Math.abs(raw) * scale));
  return { delta, rating: Math.max(rules.floor, myRating + delta) };
}
