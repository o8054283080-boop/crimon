/**
 * シーズンと報酬。
 *
 * **4週間待たないと何も貰えない状態にしない。** 週ごとの報酬を先に置き、
 * シーズン報酬はその上に重ねる。始めたばかりの人が「4週間後に何かある」
 * だけでは、参加する理由が今日ぶんも無い。
 */
import { ArenaTierId } from "./ranks.js";

/** 1シーズンの長さ(週)。ここを変えれば期間が変わる */
export const ARENA_SEASON_WEEKS = 4;

/** 週の区切り。JSTの月曜4時を境にする(日付が変わった直後の混乱を避ける) */
export const ARENA_WEEK_ANCHOR_HOUR_JST = 4;

/**
 * シーズン1の開始。ここから4週ごとに区切る。
 * **過去にしておくこと。** 未来だとシーズン0が延々続く。
 */
export const ARENA_SEASON_EPOCH_UTC = Date.UTC(2026, 8, 7, 19, 0, 0); // 2026-09-08 04:00 JST

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** その時刻が何週目か(エポックからの通し番号) */
export function arenaWeekIndex(now: number): number {
  return Math.floor((now - ARENA_SEASON_EPOCH_UTC) / WEEK_MS);
}

/** その時刻が何シーズン目か(1始まり) */
export function arenaSeasonNumber(now: number): number {
  return Math.floor(arenaWeekIndex(now) / ARENA_SEASON_WEEKS) + 1;
}

/** そのシーズンが終わる時刻 */
export function arenaSeasonEndsAt(now: number): number {
  const season = arenaSeasonNumber(now);
  return ARENA_SEASON_EPOCH_UTC + season * ARENA_SEASON_WEEKS * WEEK_MS;
}

/** その週が終わる時刻 */
export function arenaWeekEndsAt(now: number): number {
  return ARENA_SEASON_EPOCH_UTC + (arenaWeekIndex(now) + 1) * WEEK_MS;
}

/**
 * シーズンをまたぐ時のレート圧縮。**完全に0へ戻さない。**
 *
 * 積み上げたものが毎回消えると、シーズンをまたいで遊ぶ理由が無くなる。
 * かといって据え置きだと新規が永久に追いつけない。
 * **基準点へ寄せる**式にして、上ほど大きく落ち、基準より下は落とさない。
 *
 *   2500 → 1800 / 2100 → 1667 / 1600 → 1500 / 1200 → 1200
 *
 * `anchor` より上のぶんを `keep` だけ残す。式を1行で持っておけば、
 * 「もっと落とす/残す」の調整が1文字で済む。
 */
export const ARENA_SOFT_RESET = {
  /**
   * ここより下は落とさない。
   *
   * 依頼の3点(2500→1800 / 2100→1700 / 1600→1500)を連立して解くと
   * **基準1450・残り1/3**にちょうど乗る。数字を当てずに式で合わせてある。
   */
  anchor: 1450,
  /** 基準より上のぶんを何割残すか */
  keep: 1 / 3,
} as const;

export function arenaSoftResetRating(rating: number): number {
  const { anchor, keep } = ARENA_SOFT_RESET;
  if (rating <= anchor) return rating;
  return Math.round(anchor + (rating - anchor) * keep);
}

/* ==========================================================================
 * 報酬
 * ========================================================================== */

export interface ArenaRewardBundle {
  crystal?: number;
  gold?: number;
  arenaCoins?: number;
  summonScrolls?: number;
  fourStarSummonScrolls?: number;
  lightDarkFourStarSummonScrolls?: number;
  /** 見た目だけの報酬。称号・フレーム・アイコン */
  cosmeticId?: string;
  cosmeticName?: string;
}

export interface ArenaTierReward {
  tierId: ArenaTierId;
  reward: ArenaRewardBundle;
}

/**
 * 週間報酬。**軽くする。** 毎週配るものなので、ここを厚くすると
 * シーズン報酬が霞み、経済も壊れる。
 */
export const ARENA_WEEKLY_REWARDS: readonly ArenaTierReward[] = [
  { tierId: "BRONZE_3", reward: { crystal: 30, gold: 20_000, arenaCoins: 20 } },
  { tierId: "BRONZE_2", reward: { crystal: 40, gold: 25_000, arenaCoins: 25 } },
  { tierId: "BRONZE_1", reward: { crystal: 50, gold: 30_000, arenaCoins: 30 } },
  { tierId: "SILVER_3", reward: { crystal: 70, gold: 40_000, arenaCoins: 40 } },
  { tierId: "SILVER_2", reward: { crystal: 85, gold: 45_000, arenaCoins: 45 } },
  { tierId: "SILVER_1", reward: { crystal: 100, gold: 50_000, arenaCoins: 50 } },
  { tierId: "GOLD_3", reward: { crystal: 130, gold: 65_000, arenaCoins: 65 } },
  { tierId: "GOLD_2", reward: { crystal: 150, gold: 75_000, arenaCoins: 75 } },
  { tierId: "GOLD_1", reward: { crystal: 175, gold: 85_000, arenaCoins: 85 } },
  { tierId: "PLATINUM_3", reward: { crystal: 210, gold: 100_000, arenaCoins: 105 } },
  { tierId: "PLATINUM_2", reward: { crystal: 240, gold: 115_000, arenaCoins: 120 } },
  { tierId: "PLATINUM_1", reward: { crystal: 275, gold: 130_000, arenaCoins: 135 } },
  { tierId: "MASTER", reward: { crystal: 340, gold: 160_000, arenaCoins: 170 } },
  { tierId: "LEGEND", reward: { crystal: 420, gold: 200_000, arenaCoins: 210 } },
];

/**
 * シーズン報酬。週間より明確に豪華にする。
 *
 * **上位限定の「強力な限定モンスター」は置かない。** 上位がさらに強くなる
 * 報酬は、追う側が永久に追いつけない構造を作る。
 * 上位だけのものは称号・フレーム・アイコンに限る。
 */
export const ARENA_SEASON_REWARDS: readonly ArenaTierReward[] = [
  { tierId: "BRONZE_3", reward: { crystal: 200, gold: 100_000, arenaCoins: 100, summonScrolls: 3 } },
  { tierId: "BRONZE_2", reward: { crystal: 250, gold: 120_000, arenaCoins: 120, summonScrolls: 4 } },
  { tierId: "BRONZE_1", reward: { crystal: 300, gold: 150_000, arenaCoins: 150, summonScrolls: 5 } },
  { tierId: "SILVER_3", reward: { crystal: 400, gold: 200_000, arenaCoins: 200, summonScrolls: 7 } },
  { tierId: "SILVER_2", reward: { crystal: 480, gold: 240_000, arenaCoins: 240, summonScrolls: 8 } },
  { tierId: "SILVER_1", reward: { crystal: 560, gold: 280_000, arenaCoins: 280, summonScrolls: 10, fourStarSummonScrolls: 1 } },
  { tierId: "GOLD_3", reward: { crystal: 700, gold: 350_000, arenaCoins: 350, summonScrolls: 12, fourStarSummonScrolls: 1 } },
  { tierId: "GOLD_2", reward: { crystal: 800, gold: 400_000, arenaCoins: 400, summonScrolls: 14, fourStarSummonScrolls: 2 } },
  {
    tierId: "GOLD_1",
    reward: { crystal: 900, gold: 450_000, arenaCoins: 450, summonScrolls: 16, fourStarSummonScrolls: 2, cosmeticId: "frame_gold", cosmeticName: "黄金の額縁" },
  },
  {
    tierId: "PLATINUM_3",
    reward: { crystal: 1100, gold: 550_000, arenaCoins: 550, summonScrolls: 18, fourStarSummonScrolls: 3, cosmeticId: "frame_platinum", cosmeticName: "白金の額縁" },
  },
  {
    tierId: "PLATINUM_2",
    reward: { crystal: 1250, gold: 620_000, arenaCoins: 620, summonScrolls: 20, fourStarSummonScrolls: 3, lightDarkFourStarSummonScrolls: 1, cosmeticId: "frame_platinum", cosmeticName: "白金の額縁" },
  },
  {
    tierId: "PLATINUM_1",
    reward: { crystal: 1400, gold: 700_000, arenaCoins: 700, summonScrolls: 22, fourStarSummonScrolls: 4, lightDarkFourStarSummonScrolls: 1, cosmeticId: "title_champion", cosmeticName: "闘技場の覇者" },
  },
  {
    tierId: "MASTER",
    reward: { crystal: 1700, gold: 850_000, arenaCoins: 850, summonScrolls: 26, fourStarSummonScrolls: 5, lightDarkFourStarSummonScrolls: 2, cosmeticId: "title_master", cosmeticName: "闘神" },
  },
  {
    tierId: "LEGEND",
    reward: { crystal: 2000, gold: 1_000_000, arenaCoins: 1000, summonScrolls: 30, fourStarSummonScrolls: 6, lightDarkFourStarSummonScrolls: 2, cosmeticId: "title_legend", cosmeticName: "伝説" },
  },
];

export function arenaWeeklyReward(tierId: ArenaTierId): ArenaRewardBundle {
  return ARENA_WEEKLY_REWARDS.find((entry) => entry.tierId === tierId)?.reward ?? {};
}

export function arenaSeasonReward(tierId: ArenaTierId): ArenaRewardBundle {
  return ARENA_SEASON_REWARDS.find((entry) => entry.tierId === tierId)?.reward ?? {};
}
