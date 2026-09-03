/**
 * アリーナコインとアリーナショップ。
 *
 * **並んでいるのは既に実装済みのものだけ。** 存在しない道具を勝手に作らない。
 * ここに出せるのは、いまプレイヤーが実際に持てるもの——
 * 召喚の書 / ★4以上召喚書 / 光闇召喚書 / ★5召喚書 /
 * 経験ピッグ / 転生ピッグ / スキルピッグ / ゴールド / 覚醒オーブ、に限る。
 */
import { Star } from "../../core/rarity.js";
import { ARENA_TICKET_MAX, ARENA_TICKET_REGEN_MINUTES } from "../pvpArena.js";

/* ==========================================================================
 * コイン
 * ========================================================================== */

/**
 * 1戦で貰えるコイン。
 * **負けても0にしない。** 勝てない人ほど参加する理由が要る。
 */
export const ARENA_COIN_WIN = 10;
export const ARENA_COIN_LOSS = 3;
/** 防衛で退けた時。自分で挑んでいないので控えめ */
export const ARENA_COIN_DEFENSE_WIN = 4;
/** 防衛だけで際限なく増えないようにするJST1日ぶんの上限 */
export const ARENA_COIN_DEFENSE_DAILY_CAP = 40;

/* ==========================================================================
 * 挑戦権
 * ========================================================================== */

/*
 * **挑戦権の上限と回復間隔は `data/pvpArena.ts` が持つ。**
 *
 * ここに別の値を置いていたせいで、画面が10・処理が5を見ていた。
 * 実機では「5 / 10」「回復待ち」のまま止まり、満タンなのに
 * 「💎で全回復」が押せて「挑戦券は満タンです」と返る状態だった。
 * 数字を2か所に置かない。再輸出だけにする。
 */
export { ARENA_TICKET_MAX as ARENA_TICKET_MAX_V2, ARENA_TICKET_REGEN_MINUTES as ARENA_TICKET_REGEN_MINUTES_V2 } from "../pvpArena.js";

/* ==========================================================================
 * ショップ
 * ========================================================================== */

/** 買えるものの種類。**ここに無いものは売らない** */
export type ArenaShopKind =
  | "SUMMON_SCROLL"
  | "FOUR_STAR_SCROLL"
  | "LIGHT_DARK_SCROLL"
  | "FIVE_STAR_SCROLL"
  | "GOLD"
  | "AWAKENING_ORB"
  | "EXP_PIG"
  | "REINCARNATION_PIG"
  | "SKILL_PIG";

/** 買える周期。上限のリセット単位でもある */
export type ArenaShopPeriod = "WEEKLY" | "MONTHLY" | "SEASON";

export interface ArenaShopItem {
  id: string;
  name: string;
  note: string;
  kind: ArenaShopKind;
  /** 1回の購入で手に入る数 */
  amount: number;
  /** ピッグを買う時の星。それ以外では未使用 */
  star?: Star;
  price: number;
  period: ArenaShopPeriod;
  /** その周期の中で買える回数 */
  limit: number;
}

/**
 * 棚。
 *
 * 値付けの考え方:
 * - 1戦で 10 / 3 コイン、防衛成功は4コイン(1日40まで)。
 * - 週の商品を全部取るには1,365コイン。全部を軽く買わせず、
 *   覚醒オーブを取るかシーズン商品へ貯めるかを選べる額にする
 * - **転生ピッグは別格に高くする。** ランクアップの頭数をそのまま買えるので、
 *   安いと育成の順番そのものが壊れる。月1回・700コイン(ほぼ1週ぶんの稼ぎ)
 */
export const ARENA_SHOP_ITEMS: readonly ArenaShopItem[] = [
  {
    id: "summon_scroll",
    name: "召喚の書",
    note: "通常召喚を1回ぶん",
    kind: "SUMMON_SCROLL", amount: 1, price: 60, period: "WEEKLY", limit: 5,
  },
  {
    id: "gold_small",
    name: "ゴールド 50,000",
    note: "強化と装備の費用に",
    kind: "GOLD", amount: 50_000, price: 25, period: "WEEKLY", limit: 10,
  },
  {
    id: "exp_pig_3",
    name: "経験ピッグ★3",
    note: "モンスター強化の素材",
    kind: "EXP_PIG", amount: 1, star: 3, price: 45, period: "WEEKLY", limit: 3,
  },
  {
    id: "awakening_orb",
    name: "覚醒オーブ",
    note: "潜在覚醒の候補を1つ選べる",
    kind: "AWAKENING_ORB", amount: 1, price: 500, period: "WEEKLY", limit: 1,
  },
  {
    id: "exp_pig_4",
    name: "経験ピッグ★4",
    note: "レベル上限で届く上級強化素材",
    kind: "EXP_PIG", amount: 1, star: 4, price: 180, period: "WEEKLY", limit: 1,
  },
  {
    id: "four_star_scroll",
    name: "★4以上召喚書",
    note: "★4以上が確定で出る",
    kind: "FOUR_STAR_SCROLL", amount: 1, price: 400, period: "MONTHLY", limit: 1,
  },
  {
    id: "light_dark_scroll",
    name: "光闇★4以上召喚書",
    note: "光か闇の★4以上が確定で出る",
    kind: "LIGHT_DARK_SCROLL", amount: 1, price: 600, period: "MONTHLY", limit: 1,
  },
  {
    id: "reincarnation_pig_4",
    name: "転生ピッグ★4",
    note: "ランクアップの素材。レベル上限で届く",
    kind: "REINCARNATION_PIG", amount: 1, star: 4, price: 700, period: "MONTHLY", limit: 1,
  },
  {
    id: "skill_pig",
    name: "スキルピッグ",
    note: "同じ種族を使わずスキルレベルを上げられる",
    kind: "SKILL_PIG", amount: 1, price: 900, period: "MONTHLY", limit: 1,
  },
  {
    id: "reincarnation_pig_5",
    name: "転生ピッグ★5",
    note: "ランクアップの上級素材。レベル上限で届く",
    kind: "REINCARNATION_PIG", amount: 1, star: 5, price: 1_500, period: "MONTHLY", limit: 1,
  },
  {
    id: "five_star_scroll",
    name: "★5召喚書",
    note: "★5モンスターを確定召喚。貯めて狙う目玉商品",
    kind: "FIVE_STAR_SCROLL", amount: 1, price: 2_500, period: "SEASON", limit: 1,
  },
  {
    id: "skill_pig_bundle",
    name: "スキルピッグ×3",
    note: "スキル育成をまとめて進めるシーズン商品",
    kind: "SKILL_PIG", amount: 3, price: 2_000, period: "SEASON", limit: 1,
  },
];

export function findArenaShopItem(id: string): ArenaShopItem | undefined {
  return ARENA_SHOP_ITEMS.find((item) => item.id === id);
}
