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
import { EXP_PIG_DEX, REINCARNATION_PIG_DEX, SKILL_PIG_DEX } from "../../data/monsters.js";
import { STAR_MAX_LEVEL } from "../../core/rarity.js";
import { ARENA_SHOP_ITEMS, ArenaShopItem, ArenaShopPeriod, findArenaShopItem } from "../../data/arena/shop.js";
import { ARENA_SEASON_EPOCH_UTC, arenaSeasonNumber } from "../../data/arena/season.js";
import { PlayerState, addMonster, addSummonScrolls } from "../playerState.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/*
 * 週の区切りに使う原点。**`data/arena/season.ts` から直接もらう。**
 * 同じ日付を書き写していて8日ずれていた——トップの「今週の締めまで」を見て
 * ショップへ行くと、上限の数え直しが1日後だった。写さず参照する。
 */
const WEEK_EPOCH_UTC = ARENA_SEASON_EPOCH_UTC;

/** その周期の通し番号。番号が変われば上限が数え直しになる */
export function arenaShopPeriodKey(period: ArenaShopPeriod, now: number = Date.now()): number {
  if (period === "WEEKLY") return Math.floor((now - WEEK_EPOCH_UTC) / WEEK_MS);
  if (period === "SEASON") return arenaSeasonNumber(now);
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
  alreadyFulfilled?: boolean;
}

/** 経験・転生ピッグはレベル上限、スキルピッグは素材として★1 Lv1で渡す。 */
function grantPig(state: PlayerState, kind: "EXP_PIG" | "REINCARNATION_PIG" | "SKILL_PIG", star: Star, seed: number): void {
  const pool = kind === "EXP_PIG" ? EXP_PIG_DEX : kind === "REINCARNATION_PIG" ? REINCARNATION_PIG_DEX : SKILL_PIG_DEX;
  const dex = pool[seed % pool.length];
  addMonster(state, dex.id, kind === "SKILL_PIG" ? 1 : star, kind === "SKILL_PIG" ? 1 : STAR_MAX_LEVEL[star]);
}

/** 商品を付与する。購入可否やコインは呼び出し側が確定してからここへ来る。 */
function grantItem(state: PlayerState, item: ArenaShopItem, quantity: number, seed: number): void {
  const amount = item.amount * quantity;
  switch (item.kind) {
    case "SUMMON_SCROLL": addSummonScrolls(state, amount); break;
    case "FOUR_STAR_SCROLL": state.fourStarSummonScrolls += amount; break;
    case "LIGHT_DARK_SCROLL": state.lightDarkFourStarSummonScrolls += amount; break;
    case "FIVE_STAR_SCROLL": state.fiveStarSummonScrolls += amount; break;
    case "GOLD": state.gold += amount; break;
    case "AWAKENING_ORB": state.awakeningOrbs += amount; break;
    case "EXP_PIG":
    case "REINCARNATION_PIG":
    case "SKILL_PIG":
      for (let i = 0; i < amount; i += 1) grantPig(state, item.kind, item.star ?? 3, seed + i);
      break;
  }
}

function recordPurchase(state: PlayerState, item: ArenaShopItem, quantity: number, now: number): void {
  const key = arenaShopPeriodKey(item.period, now);
  const record = state.arenaShopPurchases.find(
    (entry) => entry.itemId === item.id && entry.period === item.period && entry.periodKey === key,
  );
  if (record) record.count += quantity;
  else state.arenaShopPurchases.push({ itemId: item.id, period: item.period, periodKey: key, count: quantity });
  state.arenaShopPurchases = state.arenaShopPurchases.filter(
    (entry) => entry.periodKey >= arenaShopPeriodKey(entry.period as ArenaShopPeriod, now) - 1,
  );
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
    const period = item.period === "WEEKLY" ? "今週" : item.period === "MONTHLY" ? "今月" : "今シーズン";
    return { ok: false, reason: `${period}の上限に達しています`, item };
  }
  if (state.arenaCoins < item.price) return { ok: false, reason: "アリーナコインが足りません", item };

  state.arenaCoins -= item.price;

  recordPurchase(state, item, 1, now);
  grantItem(state, item, 1, now);
  return { ok: true, item };
}

/**
 * サーバで成立した購入を手元へ付与する。
 *
 * コインはサーバですでに引かれているため、ここでは引かない。
 * 購入IDを控えへ一緒に保存すれば、保存後の通信断で同じ領収書が再送されても
 * 品物は二重に増えない。
 */
export function fulfillArenaShopPurchase(
  state: PlayerState,
  itemId: string,
  purchaseId: string,
  quantity = 1,
  purchasedAt: number = Date.now(),
): ArenaShopPurchaseResult {
  if (!purchaseId) return { ok: false, reason: "購入IDがありません" };
  const item = findArenaShopItem(itemId);
  if (!item) return { ok: false, reason: "未対応の商品です" };
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
    return { ok: false, reason: "購入数が正しくありません", item };
  }
  if (state.arenaShopFulfilledPurchaseIds.includes(purchaseId)) {
    return { ok: true, item, alreadyFulfilled: true };
  }

  recordPurchase(state, item, quantity, purchasedAt);
  grantItem(state, item, quantity, purchasedAt);
  state.arenaShopFulfilledPurchaseIds.push(purchaseId);
  if (state.arenaShopFulfilledPurchaseIds.length > 500) {
    state.arenaShopFulfilledPurchaseIds.splice(0, state.arenaShopFulfilledPurchaseIds.length - 500);
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
