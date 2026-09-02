/**
 * アリーナショップ。
 *
 * ## 上限は「押せなくする」だけでは守れない
 *
 * 画面のボタンを消すのは案内であって、制限ではない。
 * **買う処理そのものが上限を数えて弾く。**
 * 週・月の区切りは「その周期の通し番号」で持つので、番号が変われば
 * 数えている行が対象外になり、上限が自動でリセットされる
 * (リセット用の後片付け処理を持たない。動かない後始末は必ず腐る)。
 */
import { Star } from "../../core/rarity.js";
import { EXP_PIG_DEX, REINCARNATION_PIG_DEX } from "../../data/monsters.js";
import { STAR_MAX_LEVEL } from "../../core/rarity.js";
import { ARENA_SHOP_ITEMS, ArenaShopItem, ArenaShopPeriod, findArenaShopItem } from "../../data/arena/shop.js";
import { PlayerState, addMonster, addSummonScrolls } from "../playerState.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** 週の区切りに使う原点。`data/arena/season.ts` と揃えてある */
const WEEK_EPOCH_UTC = Date.UTC(2026, 8, 7, 19, 0, 0);

/** その周期の通し番号。番号が変われば上限が数え直しになる */
export function arenaShopPeriodKey(period: ArenaShopPeriod, now: number = Date.now()): number {
  if (period === "WEEKLY") return Math.floor((now - WEEK_EPOCH_UTC) / WEEK_MS);
  const date = new Date(now);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/** その商品を今の周期で何回買ったか */
export function arenaShopPurchasedCount(state: PlayerState, item: ArenaShopItem, now: number = Date.now()): number {
  const key = arenaShopPeriodKey(item.period, now);
  const record = state.arenaShopPurchases.find(
    (entry) => entry.itemId === item.id && entry.period === item.period && entry.periodKey === key,
  );
  return record?.count ?? 0;
}

export function arenaShopRemaining(state: PlayerState, item: ArenaShopItem, now: number = Date.now()): number {
  return Math.max(0, item.limit - arenaShopPurchasedCount(state, item, now));
}

export interface ArenaShopPurchaseResult {
  ok: boolean;
  reason?: string;
  item?: ArenaShopItem;
}

/** ピッグは**レベル上限で渡す。** 素材なので、レベルが低いと意味が変わる */
function grantPig(state: PlayerState, kind: "EXP_PIG" | "REINCARNATION_PIG", star: Star, seed: number): void {
  const pool = kind === "EXP_PIG" ? EXP_PIG_DEX : REINCARNATION_PIG_DEX;
  const dex = pool[seed % pool.length];
  addMonster(state, dex.id, star, STAR_MAX_LEVEL[star]);
}

/**
 * 1つ買う。
 *
 * **順番が大事。** 上限 → 残高 → 引き落とし → 記録 → 付与。
 * 付与を先にすると、記録に失敗した時にタダで配れる。
 */
export function buyArenaShopItem(
  state: PlayerState,
  itemId: string,
  now: number = Date.now(),
): ArenaShopPurchaseResult {
  const item = findArenaShopItem(itemId);
  if (!item) return { ok: false, reason: "その商品はありません" };
  if (arenaShopRemaining(state, item, now) <= 0) {
    return { ok: false, reason: item.period === "WEEKLY" ? "今週の上限に達しています" : "今月の上限に達しています", item };
  }
  if (state.arenaCoins < item.price) return { ok: false, reason: "アリーナコインが足りません", item };

  state.arenaCoins -= item.price;

  const key = arenaShopPeriodKey(item.period, now);
  const record = state.arenaShopPurchases.find(
    (entry) => entry.itemId === item.id && entry.period === item.period && entry.periodKey === key,
  );
  if (record) record.count += 1;
  else state.arenaShopPurchases.push({ itemId: item.id, period: item.period, periodKey: key, count: 1 });
  // 古い周期の行は溜め続けない。数えるのは今の周期だけなので落としてよい
  state.arenaShopPurchases = state.arenaShopPurchases.filter(
    (entry) => entry.periodKey >= arenaShopPeriodKey(entry.period as ArenaShopPeriod, now) - 1,
  );

  switch (item.kind) {
    case "SUMMON_SCROLL": addSummonScrolls(state, item.amount); break;
    case "FOUR_STAR_SCROLL": state.fourStarSummonScrolls += item.amount; break;
    case "LIGHT_DARK_SCROLL": state.lightDarkFourStarSummonScrolls += item.amount; break;
    case "GOLD": state.gold += item.amount; break;
    case "AWAKENING_ORB": state.awakeningOrbs += item.amount; break;
    case "EXP_PIG":
    case "REINCARNATION_PIG":
      for (let i = 0; i < item.amount; i += 1) grantPig(state, item.kind, item.star ?? 3, now + i);
      break;
  }
  return { ok: true, item };
}

/** 画面に出す1行ぶん */
export interface ArenaShopRow {
  item: ArenaShopItem;
  remaining: number;
  affordable: boolean;
}

export function arenaShopRows(state: PlayerState, now: number = Date.now()): ArenaShopRow[] {
  return ARENA_SHOP_ITEMS.map((item) => ({
    item,
    remaining: arenaShopRemaining(state, item, now),
    affordable: state.arenaCoins >= item.price,
  }));
}
