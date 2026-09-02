/**
 * 1戦の結果を記録する。攻撃と防衛で同じ入口を通す。
 *
 * レートの増減・コイン・履歴・リベンジの可否を1か所で決めるのは、
 * **画面が「勝ちました」と言えば通る経路を作らない**ため。
 * 画面から渡せるのは「誰と / 勝ったか / どちら側か」だけで、
 * いくら動くかはここが決める。
 * (Supabaseへ載せる時も同じ設計にする。増減幅はサーバ側で計算する)
 */
import { PlayerState, ARENA_HISTORY_MAX } from "../playerState.js";
import { arenaTierForRating } from "../../data/arena/ranks.js";
import {
  ARENA_DEFENSE_DAILY_LOSS_CAP,
  applyArenaDefenseRating,
  applyArenaRating,
} from "../../data/arena/rating.js";
import { addArenaCoins, arenaCoinsFor } from "./progress.js";
import { ArenaMatchRecord, ArenaOpponentEntry, ArenaRevengeBlock } from "./types.js";
import { rememberArenaOpponent } from "./matchmaking.js";

export interface ArenaMatchInput {
  opponent: Pick<ArenaOpponentEntry, "id" | "kind" | "name" | "rating">;
  won: boolean;
  side: "OFFENSE" | "DEFENSE";
  now?: number;
}

export interface ArenaMatchOutcome {
  record: ArenaMatchRecord;
  ratingBefore: number;
  ratingAfter: number;
  tierChanged: boolean;
}

/** JSTの日付。防衛で失ったレートを1日ぶん数えるのに使う */
function jstDateKey(now: number): string {
  const jst = new Date(now + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${jst.getUTCMonth() + 1}-${jst.getUTCDate()}`;
}

/**
 * 防衛で1日に落とせるレートに上限を掛ける。
 *
 * **寝ている間に大量に落ちる状態を避ける。** 上限に達した後は0にする
 * (勝ったぶんは上限に関係なく入る)。
 */
function capDefenseLoss(state: PlayerState, delta: number, now: number): number {
  if (delta >= 0) return delta;
  const day = jstDateKey(now);
  if (state.arenaDefenseLossDate !== day) {
    state.arenaDefenseLossDate = day;
    state.arenaDefenseLossToday = 0;
  }
  const room = Math.max(0, ARENA_DEFENSE_DAILY_LOSS_CAP - state.arenaDefenseLossToday);
  const allowed = Math.min(Math.abs(delta), room);
  state.arenaDefenseLossToday += allowed;
  return -allowed;
}

/**
 * 結果を反映する。
 *
 * 反映する順番は、レート → コイン → 戦績 → 履歴。
 * 途中で落ちても「配ったのに記録が無い」が起きにくい向きに並べてある。
 */
export function recordArenaMatch(state: PlayerState, input: ArenaMatchInput): ArenaMatchOutcome {
  const now = input.now ?? Date.now();
  /*
   * **項目が丸ごと無い控えでも落ちないようにする。**
   * 読み込み時の整形(`normalizeLoadedState`)で埋まる想定だが、
   * ここで前提にすると「整形を通らない経路が1つでもあれば全員が落ちる」。
   * アリーナが開けないより、その場で作り直す方がよい。
   */
  if (!Array.isArray(state.arenaMatchHistory)) state.arenaMatchHistory = [];
  if (!Array.isArray(state.arenaRecentOpponentIds)) state.arenaRecentOpponentIds = [];
  if (typeof state.arenaCoins !== "number") state.arenaCoins = 0;
  if (typeof state.arenaDefenseLossToday !== "number") state.arenaDefenseLossToday = 0;
  if (typeof state.arenaDefenseLossDate !== "string") state.arenaDefenseLossDate = "";
  if (typeof state.arenaSeasonBestPoints !== "number") state.arenaSeasonBestPoints = state.arenaPoints;
  const before = state.arenaPoints;
  const beforeTier = arenaTierForRating(before).id;

  const change = input.side === "OFFENSE"
    ? applyArenaRating(before, input.opponent.rating, input.won)
    : applyArenaDefenseRating(before, input.opponent.rating, input.won);

  const delta = input.side === "DEFENSE" ? capDefenseLoss(state, change.delta, now) : change.delta;
  state.arenaPoints = Math.max(0, before + delta);
  if (state.arenaPoints > state.arenaSeasonBestPoints) state.arenaSeasonBestPoints = state.arenaPoints;

  const coins = arenaCoinsFor(input.won, input.side);
  addArenaCoins(state, coins);

  if (input.side === "OFFENSE") {
    state.arenaSeasonBattles += 1;
    if (input.won) state.arenaSeasonWins += 1;
    state.arenaRecentOpponentIds = rememberArenaOpponent(state.arenaRecentOpponentIds, input.opponent.id);
  }

  const record: ArenaMatchRecord = {
    id: `am_${now.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    at: now,
    side: input.side,
    opponentKind: input.opponent.kind,
    opponentName: input.opponent.name,
    opponentRating: input.opponent.rating,
    won: input.won,
    ratingDelta: delta,
    ratingAfter: state.arenaPoints,
    coins,
  };
  state.arenaMatchHistory.unshift(record);
  if (state.arenaMatchHistory.length > ARENA_HISTORY_MAX) state.arenaMatchHistory.length = ARENA_HISTORY_MAX;

  return {
    record,
    ratingBefore: before,
    ratingAfter: state.arenaPoints,
    tierChanged: arenaTierForRating(state.arenaPoints).id !== beforeTier,
  };
}

/* ==========================================================================
 * リベンジ
 * ========================================================================== */

/**
 * その記録からリベンジできるか。
 *
 * **同じ記録からは1回まで。** 無制限に挑めると、勝てる相手を履歴から
 * 何度でも呼び出して延々狩れる。挑める条件は
 * 「攻められた記録」で「負けた」もの、かつ「まだリベンジしていない」。
 */
export function arenaRevengeBlock(record: ArenaMatchRecord, tickets: number): ArenaRevengeBlock {
  if (record.side !== "DEFENSE") return "NOT_DEFENSE";
  if (record.won) return "WON";
  if (record.revenged) return "ALREADY";
  if (tickets <= 0) return "NO_TICKET";
  return null;
}

export function canRevenge(record: ArenaMatchRecord, tickets: number): boolean {
  return arenaRevengeBlock(record, tickets) === null;
}

/** リベンジに出た印を付ける。**戦う前に付ける**(結果で変えない) */
export function markArenaRevenged(state: PlayerState, recordId: string): boolean {
  const record = state.arenaMatchHistory.find((entry) => entry.id === recordId);
  if (!record || record.revenged) return false;
  record.revenged = true;
  return true;
}

/** 防衛だけの履歴。画面の「防衛履歴」に出す */
export function arenaDefenseHistory(state: PlayerState): ArenaMatchRecord[] {
  return state.arenaMatchHistory.filter((record) => record.side === "DEFENSE");
}
