/**
 * シーズンの進行と、週間・シーズン報酬とアリーナコイン。
 *
 * ## 二重受取は「気をつける」で防がない
 *
 * 受け取った週の番号・シーズンの番号を控えに持ち、**番号が同じなら
 * 何度呼んでも何も渡さない**。押した回数や画面の状態に依存させない。
 * (Supabase側でも一意制約で同じことを担保する。片方だけでは守れない
 *  ——ローカルは書き換えられるし、通信は失敗する)
 */
import { PlayerState, addSummonScrolls } from "../playerState.js";
import { arenaTierForRating } from "../../data/arena/ranks.js";
import {
  ARENA_SEASON_WEEKS,
  ArenaRewardBundle,
  arenaSeasonEndsAt,
  arenaSeasonNumber,
  arenaSeasonReward,
  arenaSoftResetRating,
  arenaWeekEndsAt,
  arenaWeekIndex,
  arenaWeeklyReward,
} from "../../data/arena/season.js";
import { ARENA_COIN_DEFENSE_WIN, ARENA_COIN_LOSS, ARENA_COIN_WIN } from "../../data/arena/shop.js";

/* ==========================================================================
 * コイン
 * ========================================================================== */

/** 1戦ぶんのコイン。負けても0にしない */
export function arenaCoinsFor(won: boolean, side: "OFFENSE" | "DEFENSE"): number {
  if (side === "DEFENSE") return won ? ARENA_COIN_DEFENSE_WIN : 0;
  return won ? ARENA_COIN_WIN : ARENA_COIN_LOSS;
}

export function addArenaCoins(state: PlayerState, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.arenaCoins = Math.max(0, Math.round(state.arenaCoins + amount));
}

/* ==========================================================================
 * シーズンの切り替え
 * ========================================================================== */

export interface ArenaSeasonRollover {
  /** 切り替わったか */
  changed: boolean;
  /** 終わったシーズンの番号 */
  previousSeason: number;
  /** 圧縮前後のレート */
  ratingBefore: number;
  ratingAfter: number;
}

/**
 * シーズンが変わっていたら締める。
 *
 * **レートを0へは戻さない。** 積み上げたものが毎回消えると、
 * シーズンをまたいで遊ぶ理由が無くなる。基準点(1200)より上のぶんだけ
 * 圧縮する(`arenaSoftResetRating`)。
 *
 * 初回(`arenaSeasonNumber === 0`)は締めない。いま居るシーズンを覚えるだけ。
 * ここで締めると、初めてアリーナを開いた人がいきなりレートを削られる。
 */
export function applyArenaSeasonRollover(state: PlayerState, now: number = Date.now()): ArenaSeasonRollover {
  const season = arenaSeasonNumber(now);
  const before = state.arenaPoints;
  if (state.arenaSeasonNumber === 0) {
    state.arenaSeasonNumber = season;
    return { changed: false, previousSeason: season, ratingBefore: before, ratingAfter: before };
  }
  if (state.arenaSeasonNumber === season) {
    return { changed: false, previousSeason: season, ratingBefore: before, ratingAfter: before };
  }
  const previousSeason = state.arenaSeasonNumber;
  state.arenaPoints = arenaSoftResetRating(before);
  state.arenaSeasonNumber = season;
  state.arenaSeasonBattles = 0;
  state.arenaSeasonWins = 0;
  state.arenaSeasonBestPoints = state.arenaPoints;
  return { changed: true, previousSeason, ratingBefore: before, ratingAfter: state.arenaPoints };
}

/* ==========================================================================
 * 報酬
 * ========================================================================== */

export interface ArenaRewardClaim {
  ok: boolean;
  reason?: string;
  reward?: ArenaRewardBundle;
  tierName?: string;
}

function grantReward(state: PlayerState, reward: ArenaRewardBundle): void {
  if (reward.crystal) state.crystal += reward.crystal;
  if (reward.gold) state.gold += reward.gold;
  if (reward.arenaCoins) addArenaCoins(state, reward.arenaCoins);
  if (reward.summonScrolls) addSummonScrolls(state, reward.summonScrolls);
  if (reward.fourStarSummonScrolls) state.fourStarSummonScrolls += reward.fourStarSummonScrolls;
  if (reward.lightDarkFourStarSummonScrolls) state.lightDarkFourStarSummonScrolls += reward.lightDarkFourStarSummonScrolls;
  if (reward.cosmeticId && !state.arenaCosmetics.includes(reward.cosmeticId)) {
    state.arenaCosmetics.push(reward.cosmeticId);
  }
}

/** 週間報酬を受け取れるか(受け取らずに確かめるだけ) */
export function canClaimArenaWeekly(state: PlayerState, now: number = Date.now()): boolean {
  return state.arenaWeeklyClaimedWeek !== arenaWeekIndex(now);
}

/**
 * 週間報酬。**4週間待たないと何も貰えない状態にしない。**
 *
 * 受け取る額は**その週の最高レート**で決める(下がっても取り上げない)。
 */
export function claimArenaWeeklyReward(state: PlayerState, now: number = Date.now()): ArenaRewardClaim {
  const week = arenaWeekIndex(now);
  if (state.arenaWeeklyClaimedWeek === week) return { ok: false, reason: "今週のぶんは受け取り済みです" };
  const tier = arenaTierForRating(Math.max(state.arenaPoints, state.arenaSeasonBestPoints));
  const reward = arenaWeeklyReward(tier.id);
  // **先に印を付けてから配る。** 逆にすると、配った直後に落ちた時へ二重に配れる
  state.arenaWeeklyClaimedWeek = week;
  grantReward(state, reward);
  return { ok: true, reward, tierName: tier.name };
}

export function canClaimArenaSeason(state: PlayerState, now: number = Date.now()): boolean {
  const season = arenaSeasonNumber(now);
  // 進行中のシーズンぶんは受け取れない。終わったシーズンだけ
  return state.arenaSeasonClaimedNumber < season - 1 && season > 1;
}

/**
 * シーズン報酬。終わったシーズンぶんを1回だけ。
 *
 * 判定に使うのは**終わったシーズンでの最高レート**。
 * ソフトリセット後の値で配ると、上位ほど損をする逆転が起きる。
 */
export function claimArenaSeasonReward(
  state: PlayerState,
  bestRatingOfEndedSeason: number,
  now: number = Date.now(),
): ArenaRewardClaim {
  const season = arenaSeasonNumber(now);
  if (season <= 1) return { ok: false, reason: "まだ終わったシーズンがありません" };
  if (state.arenaSeasonClaimedNumber >= season - 1) return { ok: false, reason: "受け取り済みです" };
  const tier = arenaTierForRating(bestRatingOfEndedSeason);
  const reward = arenaSeasonReward(tier.id);
  state.arenaSeasonClaimedNumber = season - 1;
  grantReward(state, reward);
  return { ok: true, reward, tierName: tier.name };
}

/* ==========================================================================
 * 画面に出す期間の情報
 * ========================================================================== */

export interface ArenaPeriodInfo {
  seasonNumber: number;
  /** シーズン終了までのミリ秒 */
  seasonRemainingMs: number;
  /** 週の終わりまでのミリ秒 */
  weekRemainingMs: number;
  /** シーズンの何週目か(1始まり) */
  weekOfSeason: number;
  totalWeeks: number;
}

export function arenaPeriodInfo(now: number = Date.now()): ArenaPeriodInfo {
  const seasonNumber = arenaSeasonNumber(now);
  const week = arenaWeekIndex(now);
  return {
    seasonNumber,
    seasonRemainingMs: Math.max(0, arenaSeasonEndsAt(now) - now),
    weekRemainingMs: Math.max(0, arenaWeekEndsAt(now) - now),
    weekOfSeason: (((week % ARENA_SEASON_WEEKS) + ARENA_SEASON_WEEKS) % ARENA_SEASON_WEEKS) + 1,
    totalWeeks: ARENA_SEASON_WEEKS,
  };
}
