/**
 * アリーナのレート増減。**サーバ(`supabase/migrations/*_arena_rebalance_2026_09.sql`)と同じ式。**
 *
 * ## 3つに分けてある
 *
 *   攻撃側の勝ち … `arenaAttackWinGain`。格上に勝つほど大きく、差1500で最大+250。
 *                  格下に勝った時は小さく、差400以上で+1(格下狩りでレートが膨らまない)
 *   攻撃側の負け … `arenaAttackLossAmount`。格下に負けたら v1 のまま(互角−10 → 差300以上で−15)。
 *                  格上に負けたら、実力どおりの人の期待値がほぼ0になる量(差250まで−10、500で−5、900以上で−1)
 *   防衛側       … v1 の半分(最低1)、1日の減少は60まで。**攻撃側のボーナスとは切り離す**
 *                  (格下に1回破られただけで−200、を起こさない)。500以上格上に破られたら−1
 *   同じ相手への連勝 … 20時間以内の2回目以降は「半分(切り捨て)かつ v1 が上限」
 *
 * ## 整数だけで計算する
 *
 * 小数で書くと、JavaScript と Postgres で四捨五入が1点ずれることがある
 * (`0.1` が2進で割り切れないため。9.5 が 9.4999… になる)。
 * **画面の予告とサーバの結果が食い違う事故をこの案件で何度も出している**ので、
 * 分子と分母を整数で持ち、四捨五入も整数の割り算でする。SQL も同じ形で書く。
 *
 * ## なぜ v1 が「今の式」なのか(2026-09-25 の調査)
 *
 * リポジトリには v2 のカーブ(`20260912120000_arena_rating_gap_rebalance.sql`)があったが、
 * **本番には一度も流れていなかった**(アリーナのSQLは自動で流れる経路が無かった)。
 * 本番で効いていたのは `arena_rpc.sql` の v1 で、防衛の倍率も 0.6 ではなく 0.5。
 * 画面側だけが v2 を見ていたので、オフラインの予告と本番の結果がずれていた。
 * 今回はここを本番に合わせたうえで、攻撃側の勝ちだけを新しい式にする。
 */

export interface ArenaRatingChange {
  delta: number;
  rating: number;
}

/** レートの下限 */
export const ARENA_RATING_FLOOR = 0;

/** 格上撃破で得られる最大値。差1500以上で頭打ち */
export const ARENA_GIANT_KILL_MAX = 250;

/**
 * 同じ実プレイヤーに続けて勝った時、増加を絞る時間(時間)。
 *
 * この時間内の**2回目以降の勝利**は「増加量の半分(切り捨て)」かつ「v1 の値が上限」。
 *
 *   ・身内の弱い防衛を殴り続けて +250 を重ねる、を止める(2回目からは最大+25)
 *   ・大幅な格下(+1)を狩り続けてレートを積む、を止める(2回目からは+0)
 *     ——±300の制限を外すと、最上位の人から見える実プレイヤーは全員格下になる。
 *     シミュレーションで、実力4500の人が30日で+368流れた(旧は+166)
 *
 * 1回目の勝利は満額。NPC は毎回別の相手として生成されるので対象外。
 */
export const ARENA_REPEAT_WIN_WINDOW_HOURS = 20;

/**
 * 防衛側が、これ以上格上の攻撃側に負けた時は −1 にする。
 *
 * ±300の制限を外すと、上位の人が下位の防衛を好きなだけ殴れる。
 * 格上に負けるのは当然なので、**狩られる側のレートを削らない**
 * (v1 のままだと毎回 −3、1日で最大 −60)。
 */
export const ARENA_DEFENSE_OUTCLASSED_GAP = 500;

/** 防衛は攻撃戦(v1)の半分。**本番の設定値(0.5)に合わせた**(前はここだけ 0.6 だった) */
export const ARENA_DEFENSE_RATING_SCALE = 0.5;

/** 1日に防衛で減らせるレートの上限 */
export const ARENA_DEFENSE_DAILY_LOSS_CAP = 60;

/** 正の整数の割り算を、四捨五入(0.5は切り上げ)で返す。SQL の `(n*2 + d) / (d*2)` と同じ */
function roundDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator * 2 + denominator) / (denominator * 2));
}

/**
 * 攻撃側が勝った時の増加量。`diff = 相手 − 自分`(正なら格上)。**連続した1本の式。**
 *
 *   diff ≤ −400      … +1
 *   −400 < diff < 0  … 10 × ((400 + diff) / 400)²   (格下ほど小さく。−100で+6、−200で+3)
 *   0 ≤ diff ≤ 300   … 10 + diff/10 + diff²/9000     (100で+21、200で+34、300で+50)
 *   300 < diff       … diff / 6                       (500で+83、1000で+167)、最大+250(差1500)
 *
 * 300の継ぎ目では値も傾きも一致する(50、1/6)。0の継ぎ目は値が一致する(10)。
 */
export function arenaAttackWinGain(diff: number): number {
  const d = Math.round(diff);
  if (d <= -400) return 1;
  if (d < 0) {
    const x = 400 + d;
    return Math.max(1, roundDiv(10 * x * x, 160_000));
  }
  if (d <= 300) return roundDiv(d * d + 900 * d + 90_000, 9_000);
  return Math.min(ARENA_GIANT_KILL_MAX, roundDiv(d, 6));
}

/**
 * v1(本番でずっと効いていた式)。攻撃側の負けと、防衛側に使う。
 *
 *   勝ち: 互角+15 → 格上(差300以上)+25 / 格下(差300以上)+8
 *   負け: 互角−10 → 格上に負けて−5 / 格下に負けて−15
 *
 * 差300までの間は直線でつなぐ。SQL の `arena__rating_delta_v1` と同じ。
 */
export function arenaLegacyRatingDelta(myRating: number, opponentRating: number, won: boolean): number {
  const diff = Math.round(opponentRating) - Math.round(myRating);
  const t = Math.min(300, Math.abs(diff));
  const up = diff > 0;
  if (won) {
    const target = up ? 25 : 8;
    // 15 + (target − 15) × t/300 を、300倍した整数で
    const num = 15 * 300 + (target - 15) * t;
    return roundDiv(num, 300);
  }
  const target = up ? 5 : 15;
  const num = 10 * 300 + (target - 10) * t;
  return -roundDiv(num, 300);
}

/**
 * 攻撃側が**格上に負けた**時の減少量の表(差, 減少)。間は直線でつなぎ、900より先は1。
 *
 * ## なぜ v1 のままにしなかったのか
 *
 * 格上撃破のボーナスだけを大きくすると、**実力どおりのレートに居る人でも
 * 少し格上に挑み続けるだけで期待値がプラスになる**(v1 は格上に負けても−5〜−10)。
 * シミュレーションで、実力3000・レート3000の人が30日で+176流れた(旧は+161)。
 *
 * そこで、実力どおりの人の期待値がほぼ0になる量(勝率をロジスティックで見た
 * `増加 × 相手に負ける見込み ÷ 勝つ見込み`)にした。ただし**互角に負けた時の10は超えない**
 * ——格上に負けて互角より減るのは理不尽に感じるため。0〜250はその上限に張り付く。
 */
export const ARENA_ATTACK_LOSS_TO_STRONGER: readonly (readonly [number, number])[] = [
  [0, 10], [250, 10], [300, 9], [400, 7], [500, 5], [600, 3], [750, 2], [900, 1],
];

/** 攻撃側が負けた時の減少量(正の数)。`diff = 相手 − 自分` */
export function arenaAttackLossAmount(diff: number): number {
  const d = Math.round(diff);
  // 格下に負けた時は v1 のまま(互角10 → 差300以上で15)
  if (d < 0) return -arenaLegacyRatingDelta(0, d, false);
  const table = ARENA_ATTACK_LOSS_TO_STRONGER;
  const last = table[table.length - 1];
  if (d >= last[0]) return last[1];
  for (let i = 1; i < table.length; i += 1) {
    const [d1, v1] = table[i];
    if (d > d1) continue;
    const [d0, v0] = table[i - 1];
    const span = d1 - d0;
    // v0 + (v1 − v0) × (d − d0) / span を、整数で四捨五入
    return roundDiv(v0 * span + (v1 - v0) * (d - d0), span);
  }
  return last[1];
}

/**
 * 攻撃側の1戦ぶんの増減。
 *
 * @param repeatWin 同じ実プレイヤーに `ARENA_REPEAT_WIN_WINDOW_HOURS` 以内に勝っていたか。
 *                  その時は「新しい式の半分(切り捨て)」と v1 の小さい方
 */
export function arenaRatingDelta(
  myRating: number,
  opponentRating: number,
  won: boolean,
  options: { repeatWin?: boolean } = {},
): number {
  if (!won) return -arenaAttackLossAmount(Math.round(opponentRating) - Math.round(myRating));
  const gain = arenaAttackWinGain(Math.round(opponentRating) - Math.round(myRating));
  if (options.repeatWin) return Math.min(Math.floor(gain / 2), arenaLegacyRatingDelta(myRating, opponentRating, true));
  return gain;
}

/** 攻撃側の1戦を適用する */
export function applyArenaRating(
  myRating: number,
  opponentRating: number,
  won: boolean,
  options: { repeatWin?: boolean } = {},
): ArenaRatingChange {
  const delta = arenaRatingDelta(myRating, opponentRating, won, options);
  const rating = Math.max(ARENA_RATING_FLOOR, myRating + delta);
  return { delta: rating - myRating, rating };
}

/**
 * 防衛側の1戦を適用する。won は防衛側から見た勝敗。
 *
 * **v1 の半分(最低1)。新しい格上ボーナスは使わない。**
 * 使うと、格上に攻められて守り切っただけで +125 が入る(寝ている間に膨らむ)。
 * 1日の減少上限は呼ぶ側(`capDefenseLoss` / サーバ)が掛ける。
 */
export function applyArenaDefenseRating(
  myRating: number,
  attackerRating: number,
  won: boolean,
  scale: number = ARENA_DEFENSE_RATING_SCALE,
): ArenaRatingChange {
  // 大幅に格上の攻撃側に破られた時は −1(狩られる側を削らない)
  if (!won && Math.round(attackerRating) - Math.round(myRating) >= ARENA_DEFENSE_OUTCLASSED_GAP) {
    const rating = Math.max(ARENA_RATING_FLOOR, myRating - 1);
    return { delta: rating - myRating, rating };
  }
  const raw = arenaLegacyRatingDelta(myRating, attackerRating, won);
  const delta = raw === 0 ? 0 : Math.sign(raw) * Math.max(1, Math.round(Math.abs(raw) * scale));
  const rating = Math.max(ARENA_RATING_FLOOR, myRating + delta);
  return { delta: rating - myRating, rating };
}
