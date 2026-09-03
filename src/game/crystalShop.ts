/**
 * ダイヤショップの購入。
 *
 * ## 上限は「押せなくする」だけでは守れない
 *
 * 画面のボタンを消すのは案内であって、制限ではない。
 * **買う処理そのものが上限を数えて弾く**(アリーナショップと同じ考え方)。
 *
 * ## 順番が大事
 *
 *   商品がある → 周期の上限 → 残高 → 引き落とし → 記録 → 付与
 *
 * 付与を先にすると、記録に失敗した時にタダで配れる。
 * 引き落としを先にすると、付与できなかった時にダイヤだけ消える。
 * **全部の断る理由が消えてから、初めて数字を動かす。**
 *
 * ## 時計を戻されても回数が戻らないようにする
 *
 * サーバを通していないので、周期の判定はこの端末の時計に頼るしかない。
 * ただし**進めた跡は残せる。** 見た中でいちばん新しい周期の番号を控えておき、
 * それより古い番号が出てきたら控えの方を使う。
 * これで「時計を先月へ戻して月1の商品をもう一度」は通らなくなる
 * (先へ進める不正は防げない——それは時間を待つのと同じなので害が小さい)。
 */
import { STAR_MAX_LEVEL, Star } from "../core/rarity.js";
import {
  CRYSTAL_SHOP_ITEMS,
  CrystalShopItem,
  CrystalShopPeriod,
  findCrystalShopItem,
} from "../data/crystalShop.js";
import { REINCARNATION_PIG_DEX } from "../data/monsters.js";
import { PlayerState, addMonster } from "./playerState.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 週の区切りの原点。**アリーナと同じ刻**を使う。
 *
 * 別の原点にすると、「今週」がショップごとに違う日に切り替わる。
 * 遊ぶ側からは同じ「週」に見えるので、ずれていると必ず混乱する。
 */
import { ARENA_SEASON_EPOCH_UTC } from "../data/arena/season.js";

/** その周期の通し番号。番号が変われば上限が数え直しになる */
export function crystalShopPeriodKey(period: CrystalShopPeriod, now: number = Date.now()): number {
  if (period === "UNLIMITED") return 0;
  if (period === "WEEKLY") return Math.floor((now - ARENA_SEASON_EPOCH_UTC) / WEEK_MS);
  const date = new Date(now);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/**
 * 実際に数えるのに使う番号。
 *
 * **控えてある最大より前へは戻さない。** 時計を巻き戻しても、
 * 前の周期の枠が復活しない。
 */
function effectivePeriodKey(state: PlayerState, period: CrystalShopPeriod, now: number): number {
  const raw = crystalShopPeriodKey(period, now);
  if (period === "UNLIMITED") return 0;
  const seen = period === "WEEKLY" ? state.crystalShopMaxWeekKey : state.crystalShopMaxMonthKey;
  return Math.max(raw, seen ?? raw);
}

/** 見た中でいちばん新しい周期を控える。**進んだ跡は残す** */
function rememberPeriod(state: PlayerState, now: number): void {
  const week = crystalShopPeriodKey("WEEKLY", now);
  const month = crystalShopPeriodKey("MONTHLY", now);
  state.crystalShopMaxWeekKey = Math.max(week, state.crystalShopMaxWeekKey ?? week);
  state.crystalShopMaxMonthKey = Math.max(month, state.crystalShopMaxMonthKey ?? month);
}

/** その商品を今の周期で何回買ったか */
export function crystalShopPurchasedCount(
  state: PlayerState,
  item: CrystalShopItem,
  now: number = Date.now(),
): number {
  if (item.period === "UNLIMITED") return 0;
  const key = effectivePeriodKey(state, item.period, now);
  const record = state.crystalShopPurchases.find(
    (entry) => entry.itemId === item.id && entry.period === item.period && entry.periodKey === key,
  );
  return record?.count ?? 0;
}

/** あと何回買えるか。無制限なら null(「残り∞」は出さない) */
export function crystalShopRemaining(
  state: PlayerState,
  item: CrystalShopItem,
  now: number = Date.now(),
): number | null {
  if (item.period === "UNLIMITED" || item.limit === undefined) return null;
  return Math.max(0, item.limit - crystalShopPurchasedCount(state, item, now));
}

export interface CrystalShopPurchaseResult {
  ok: boolean;
  reason?: string;
  item?: CrystalShopItem;
}

/** 転生ピッグは**その星のレベル上限**で渡す。素材なので、低いと意味が変わる */
function grantReincarnationPig(state: PlayerState, star: Star, seed: number): void {
  /*
   * **既存の定義から選ぶ。** 名前で別のモンスターを作らない。
   * `REINCARNATION_PIG_DEX` は属性ぶんの並びなので、そこから1つ取る。
   */
  const dex = REINCARNATION_PIG_DEX[seed % REINCARNATION_PIG_DEX.length];
  addMonster(state, dex.id, star, STAR_MAX_LEVEL[star]);
}

/**
 * 1つ買う。
 *
 * **成功した時だけダイヤが減る。** 断る時は理由を言葉で返す
 * (押せないボタンだけでは、何を満たせばよいのか分からない)。
 */
export function buyCrystalShopItem(
  state: PlayerState,
  itemId: string,
  now: number = Date.now(),
): CrystalShopPurchaseResult {
  const item = findCrystalShopItem(itemId);
  if (!item) return { ok: false, reason: "その商品はありません" };

  // 触った時点の周期を控える。買えなくても、時計が進んだ事実は残す
  rememberPeriod(state, now);

  const remaining = crystalShopRemaining(state, item, now);
  if (remaining !== null && remaining <= 0) {
    return {
      ok: false,
      reason: item.period === "WEEKLY" ? "今週の購入上限に達しています" : "今月の購入上限に達しています",
      item,
    };
  }
  if (state.crystal < item.price) {
    return { ok: false, reason: `ダイヤが足りません（${item.price.toLocaleString("ja-JP")}💎 必要）`, item };
  }

  // ここから先は断らない。引き落とし → 記録 → 付与
  state.crystal -= item.price;

  if (item.period !== "UNLIMITED") {
    const key = effectivePeriodKey(state, item.period, now);
    const record = state.crystalShopPurchases.find(
      (entry) => entry.itemId === item.id && entry.period === item.period && entry.periodKey === key,
    );
    if (record) record.count += 1;
    else state.crystalShopPurchases.push({ itemId: item.id, period: item.period, periodKey: key, count: 1 });

    /*
     * 古い周期の行は溜め続けない。数えるのは今の周期だけなので落としてよい。
     * **1つ前までは残す**——月をまたいだ直後に時計が少し戻った時、
     * その場で枠が復活しないようにするため。
     */
    state.crystalShopPurchases = state.crystalShopPurchases.filter(
      (entry) => entry.periodKey >= effectivePeriodKey(state, entry.period as CrystalShopPeriod, now) - 1,
    );
  }

  switch (item.kind) {
    case "GOLD":
      state.gold += item.amount;
      break;
    case "REINCARNATION_PIG":
      for (let i = 0; i < item.amount; i += 1) grantReincarnationPig(state, item.star ?? 3, now + i);
      break;
    case "FOUR_STAR_SCROLL":
      state.fourStarSummonScrolls += item.amount;
      break;
    case "LIGHT_DARK_SCROLL":
      state.lightDarkFourStarSummonScrolls += item.amount;
      break;
  }
  return { ok: true, item };
}

/** 画面に出す1行ぶん */
export interface CrystalShopRow {
  item: CrystalShopItem;
  /** 無制限なら null */
  remaining: number | null;
  affordable: boolean;
}

export function crystalShopRows(state: PlayerState, now: number = Date.now()): CrystalShopRow[] {
  return CRYSTAL_SHOP_ITEMS.map((item) => ({
    item,
    remaining: crystalShopRemaining(state, item, now),
    affordable: state.crystal >= item.price,
  }));
}
