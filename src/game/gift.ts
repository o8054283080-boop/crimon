import { SKILL_PIG_DEX } from "../data/monsters.js";
import { Star } from "../core/rarity.js";
import { PlayerState, addMonster } from "./playerState.js";

/**
 * プレゼントボックス。**運営から配ったものを、本人が受け取るまで預かる場所。**
 *
 * ## なぜ既存の「お知らせ配布」と別に作るのか
 *
 * 既存の `compensation.ts` は、**期間中に一度開けば自動で所持品へ入る。**
 * 受け取ったことに気づかないまま画面を閉じても増えている。手軽な代わりに:
 *
 *   ・モンスターを配れない(通貨と召喚書しか足せない)
 *   ・「今は受け取らない」が選べない
 *   ・何をもらったのかを後から一覧で確かめられない
 *
 * こちらは逆で、**押した時に初めて所持品へ入る。**そのぶん
 * モンスターも配れるし、受け取った中身が履歴に残る。
 *
 * ## 受け取りは「プレゼント1件ぶんが丸ごと入るか、何も入らないか」
 *
 * 途中で失敗して「ダイヤだけ入ってスキルピッグが入らない」という形にはしない。
 * 先に入れられるかを全部確かめ、駄目なら**何も触らずに理由を返す。**
 *
 * ## 端末に保存できて初めて「受け取った」
 *
 * このゲームの持ち物は端末の保存が正で、サーバには置いていない
 * (クラウドは復旧用の控え)。だから**保存に失敗したら受け取らなかったことにする。**
 * 召喚が「書を減らしたのに保存できずモンスターだけ消える」事故を出した時と同じ扱い。
 * 受け取りの記録と所持品は同じ保存の中にあるので、**片方だけ残ることはない。**
 */

/* ------------------------------------------------------------------ 報酬 */

/**
 * 配れるもの。**種類を足せる形にしてある。**
 * 装備を配りたくなった時は `{ kind: "EQUIPMENT", ... }` を足して、
 * `canReceive` と `applyReward` の2か所に枝を増やす。
 */
export type GiftReward =
  | { kind: "CRYSTAL"; amount: number }
  | { kind: "GOLD"; amount: number }
  | { kind: "SUMMON_SCROLL"; amount: number }
  | { kind: "FOUR_STAR_SUMMON_SCROLL"; amount: number }
  | { kind: "LIGHT_DARK_FOUR_STAR_SUMMON_SCROLL"; amount: number }
  | { kind: "FIVE_STAR_SUMMON_SCROLL"; amount: number }
  | { kind: "AWAKENING_ORB"; amount: number }
  /** モンスター。`dexId` は図鑑のID。スキルピッグなら `SKILL_PIG_DEX` のもの */
  | { kind: "MONSTER"; dexId: string; star: Star; amount: number }
  /** スキルピッグ。6属性を順に配るので、種類を指定せずに数だけ書ける */
  | { kind: "SKILL_PIG"; amount: number };

export interface GiftDefinition {
  giftId: string;
  title: string;
  description: string;
  rewards: readonly GiftReward[];
  /** 配布が始まる時刻(ISO8601)。これより前は一覧に出さない */
  startsAt: string;
  /**
   * 受取期限(ISO8601)。**過ぎたら受け取れない。**
   * `null` は無期限。画面には「受取期限：なし」と出す
   */
  expiresAt: string | null;
}

/** 受け取った記録。**セーブに残る**ので、形を変える時は互換に気をつける */
export interface GiftClaimRecord {
  giftId: string;
  /** 受け取った時刻(ミリ秒epoch) */
  claimedAt: number;
}

/* ------------------------------------------------------------------ 表示 */

export const GIFT_REWARD_ICON: Record<GiftReward["kind"], string> = {
  CRYSTAL: "💎",
  GOLD: "💰",
  SUMMON_SCROLL: "📜",
  FOUR_STAR_SUMMON_SCROLL: "📜",
  LIGHT_DARK_FOUR_STAR_SUMMON_SCROLL: "📜",
  FIVE_STAR_SUMMON_SCROLL: "📜",
  AWAKENING_ORB: "🔮",
  MONSTER: "🥚",
  SKILL_PIG: "🐽",
};

export const GIFT_REWARD_LABEL: Record<GiftReward["kind"], string> = {
  CRYSTAL: "ダイヤ",
  GOLD: "ゴールド",
  SUMMON_SCROLL: "召喚の書",
  FOUR_STAR_SUMMON_SCROLL: "★4以上召喚書",
  LIGHT_DARK_FOUR_STAR_SUMMON_SCROLL: "光闇★4以上召喚書",
  FIVE_STAR_SUMMON_SCROLL: "★5召喚書",
  AWAKENING_ORB: "覚醒オーブ",
  MONSTER: "モンスター",
  SKILL_PIG: "スキルピッグ",
};

/** 「💎 ダイヤ ×5,000」の1行 */
export function describeReward(reward: GiftReward): string {
  const count = reward.amount.toLocaleString("ja-JP");
  return `${GIFT_REWARD_ICON[reward.kind]} ${GIFT_REWARD_LABEL[reward.kind]} ×${count}`;
}

/** 受取期限の表示。**日本時間で出す。**無期限は「なし」 */
export function describeExpiry(gift: GiftDefinition): string {
  if (!gift.expiresAt) return "受取期限：なし";
  return `受取期限：${formatJst(gift.expiresAt)}`;
}

/** ISO8601 を「2026/10/14 23:59」の形へ。**日本時間に直してから**出す */
export function formatJst(iso: string | number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

/* ------------------------------------------------------------------ 状態 */

export type GiftAvailability =
  /** 受け取れる */
  | "OPEN"
  /** まだ配布が始まっていない */
  | "NOT_STARTED"
  /** 期限が過ぎた。**もう受け取れない** */
  | "EXPIRED"
  /** すでに受け取った */
  | "CLAIMED";

export function giftAvailability(
  gift: GiftDefinition,
  state: PlayerState,
  now: number = Date.now(),
): GiftAvailability {
  if (claimRecordOf(state, gift.giftId)) return "CLAIMED";
  if (new Date(gift.startsAt).getTime() > now) return "NOT_STARTED";
  if (gift.expiresAt && new Date(gift.expiresAt).getTime() < now) return "EXPIRED";
  return "OPEN";
}

export function claimRecordOf(state: PlayerState, giftId: string): GiftClaimRecord | undefined {
  return state.claimedGifts?.find((record) => record.giftId === giftId);
}

/** 受け取れるものだけ。**配布前と期限切れと受取済みは外す** */
export function openGifts(
  gifts: readonly GiftDefinition[],
  state: PlayerState,
  now: number = Date.now(),
): GiftDefinition[] {
  return gifts.filter((gift) => giftAvailability(gift, state, now) === "OPEN");
}

/**
 * ホームの赤い印に出す数。**受け取れるものだけ**を数える。
 * 期限切れと受取済みは入れない(指示どおり)。
 */
export function unclaimedGiftCount(
  gifts: readonly GiftDefinition[],
  state: PlayerState,
  now: number = Date.now(),
): number {
  return openGifts(gifts, state, now).length;
}

/** 受け取った履歴。新しい順 */
export function claimedGiftHistory(
  gifts: readonly GiftDefinition[],
  state: PlayerState,
): { gift: GiftDefinition; claimedAt: number }[] {
  const byId = new Map(gifts.map((gift) => [gift.giftId, gift]));
  return (state.claimedGifts ?? [])
    .map((record) => {
      const gift = byId.get(record.giftId);
      return gift ? { gift, claimedAt: record.claimedAt } : null;
    })
    .filter((entry): entry is { gift: GiftDefinition; claimedAt: number } => entry !== null)
    .sort((a, b) => b.claimedAt - a.claimedAt);
}

/* ------------------------------------------------------------------ 受け取り */

export type GiftClaimFailure =
  | { reason: "NOT_FOUND" }
  | { reason: "ALREADY_CLAIMED" }
  | { reason: "NOT_STARTED" }
  | { reason: "EXPIRED" }
  /** モンスターの置き場所が足りない。**何も受け取らない** */
  | { reason: "MONSTER_CAPACITY"; needed: number }
  /** 端末に保存できなかった。**受け取らなかったことにして戻した** */
  | { reason: "SAVE_FAILED" };

export type GiftClaimResult =
  | { ok: true; gift: GiftDefinition; rewards: readonly GiftReward[] }
  | ({ ok: false; gift?: GiftDefinition } & GiftClaimFailure);

export const GIFT_FAILURE_MESSAGE: Record<GiftClaimFailure["reason"], string> = {
  NOT_FOUND: "このプレゼントは見つかりませんでした。",
  ALREADY_CLAIMED: "このプレゼントはすでに受け取っています。",
  NOT_STARTED: "このプレゼントはまだ受け取れません。",
  EXPIRED: "このプレゼントは受取期限を過ぎています。",
  MONSTER_CAPACITY: "モンスターの置き場所が足りません。整理してから受け取ってください。",
  SAVE_FAILED: "受取に失敗しました。通信状態と端末の空き容量を確認して、もう一度お試しください。",
};

/** そのプレゼントで増えるモンスターの数 */
export function monsterCountOf(gift: GiftDefinition): number {
  return gift.rewards.reduce((sum, reward) => {
    if (reward.kind === "SKILL_PIG" || reward.kind === "MONSTER") return sum + reward.amount;
    return sum;
  }, 0);
}

/**
 * 受け取れるかを先に全部確かめる。**ここを通ってから初めて所持品を触る。**
 *
 * いまモンスターの所持数に上限は無いので、ここで落ちるのは
 * 上限が入った時だけ。**先に置き場所を作っておく**ための入口として置いてある。
 */
function canReceive(gift: GiftDefinition, state: PlayerState): GiftClaimFailure | null {
  const needed = monsterCountOf(gift);
  if (needed > 0 && !hasRoomForMonsters(state, needed)) return { reason: "MONSTER_CAPACITY", needed };
  return null;
}

/**
 * モンスターを `count` 体増やせるか。
 *
 * **いまのCRIMONに所持上限は無い**ので常に true。
 * 上限を入れる日が来たら、ここだけを直せば受け取りの判定もついてくる。
 */
export function hasRoomForMonsters(_state: PlayerState, _count: number): boolean {
  return true;
}

/** 報酬1つを所持品へ足す。**`canReceive` を通った後にだけ呼ぶ** */
function applyReward(state: PlayerState, reward: GiftReward): void {
  switch (reward.kind) {
    case "CRYSTAL": state.crystal += reward.amount; break;
    case "GOLD": state.gold += reward.amount; break;
    case "SUMMON_SCROLL": state.summonScrolls += reward.amount; break;
    case "FOUR_STAR_SUMMON_SCROLL": state.fourStarSummonScrolls += reward.amount; break;
    case "LIGHT_DARK_FOUR_STAR_SUMMON_SCROLL": state.lightDarkFourStarSummonScrolls += reward.amount; break;
    case "FIVE_STAR_SUMMON_SCROLL": state.fiveStarSummonScrolls += reward.amount; break;
    case "AWAKENING_ORB": state.awakeningOrbs += reward.amount; break;
    case "MONSTER":
      for (let i = 0; i < reward.amount; i += 1) addMonster(state, reward.dexId, reward.star, 1);
      break;
    case "SKILL_PIG":
      // 塔の報酬・ポイント交換と同じ配り方。6属性を順に回す
      for (let i = 0; i < reward.amount; i += 1) {
        addMonster(state, SKILL_PIG_DEX[i % SKILL_PIG_DEX.length].id, 1, 1);
      }
      break;
  }
}

/**
 * プレゼントを1件受け取る。**丸ごと入るか、何も入らないか。**
 *
 * `save` は端末への保存。**保存できなかったら受け取りを取り消す。**
 * 渡さない時は保存を試みない(テストや、呼び出し側がまとめて保存する場合)。
 */
export function claimGift(
  gifts: readonly GiftDefinition[],
  state: PlayerState,
  giftId: string,
  options: { now?: number; save?: (state: PlayerState) => boolean } = {},
): GiftClaimResult {
  const now = options.now ?? Date.now();
  const gift = gifts.find((entry) => entry.giftId === giftId);
  if (!gift) return { ok: false, reason: "NOT_FOUND" };

  const availability = giftAvailability(gift, state, now);
  if (availability === "CLAIMED") return { ok: false, gift, reason: "ALREADY_CLAIMED" };
  if (availability === "NOT_STARTED") return { ok: false, gift, reason: "NOT_STARTED" };
  if (availability === "EXPIRED") return { ok: false, gift, reason: "EXPIRED" };

  const blocked = canReceive(gift, state);
  if (blocked) return { ok: false, gift, ...blocked };

  /*
   * ここから所持品を触る。**戻せるように控えを取っておく。**
   * モンスターは「増えたぶんだけ末尾から外す」で戻せる
   * (`addMonster` は末尾へ足すため)。
   */
  const before = {
    crystal: state.crystal,
    gold: state.gold,
    summonScrolls: state.summonScrolls,
    fourStarSummonScrolls: state.fourStarSummonScrolls,
    lightDarkFourStarSummonScrolls: state.lightDarkFourStarSummonScrolls,
    fiveStarSummonScrolls: state.fiveStarSummonScrolls,
    awakeningOrbs: state.awakeningOrbs,
    monsterCount: state.monsters.length,
  };

  for (const reward of gift.rewards) applyReward(state, reward);
  if (!state.claimedGifts) state.claimedGifts = [];
  state.claimedGifts.push({ giftId: gift.giftId, claimedAt: now });

  if (options.save && !options.save(state)) {
    // 保存できなかった。**受け取らなかったことにする**
    state.crystal = before.crystal;
    state.gold = before.gold;
    state.summonScrolls = before.summonScrolls;
    state.fourStarSummonScrolls = before.fourStarSummonScrolls;
    state.lightDarkFourStarSummonScrolls = before.lightDarkFourStarSummonScrolls;
    state.fiveStarSummonScrolls = before.fiveStarSummonScrolls;
    state.awakeningOrbs = before.awakeningOrbs;
    state.monsters.length = before.monsterCount;
    state.claimedGifts = state.claimedGifts.filter((record) => record.giftId !== gift.giftId);
    return { ok: false, gift, reason: "SAVE_FAILED" };
  }

  return { ok: true, gift, rewards: gift.rewards };
}

export interface GiftClaimAllResult {
  claimed: { gift: GiftDefinition; rewards: readonly GiftReward[] }[];
  /** 受け取れなかったもの。**残したまま**にする */
  skipped: { gift: GiftDefinition; reason: GiftClaimFailure["reason"] }[];
}

/**
 * 受け取れるものを順に受け取る。
 *
 * **1件ずつ独立して扱う。**置き場所が足りなくて受け取れないものがあっても、
 * 他のものは受け取れる。ただし**同じプレゼントの中身を分けて渡すことはしない。**
 */
export function claimAllGifts(
  gifts: readonly GiftDefinition[],
  state: PlayerState,
  options: { now?: number; save?: (state: PlayerState) => boolean } = {},
): GiftClaimAllResult {
  const now = options.now ?? Date.now();
  const result: GiftClaimAllResult = { claimed: [], skipped: [] };
  for (const gift of openGifts(gifts, state, now)) {
    const one = claimGift(gifts, state, gift.giftId, options);
    if (one.ok) result.claimed.push({ gift: one.gift, rewards: one.rewards });
    else result.skipped.push({ gift, reason: one.reason });
  }
  return result;
}

/** 「3件受け取りました。1件は…」の1行 */
export function describeClaimAll(result: GiftClaimAllResult): string {
  if (result.claimed.length === 0 && result.skipped.length === 0) return "受け取れるプレゼントはありませんでした。";
  const lines: string[] = [];
  if (result.claimed.length > 0) lines.push(`${result.claimed.length}件受け取りました。`);
  const capacity = result.skipped.filter((entry) => entry.reason === "MONSTER_CAPACITY").length;
  const failed = result.skipped.length - capacity;
  if (capacity > 0) lines.push(`${capacity}件はモンスターの置き場所が足りないため受け取れませんでした。`);
  if (failed > 0) lines.push(`${failed}件は受け取れませんでした。`);
  return lines.join("");
}
