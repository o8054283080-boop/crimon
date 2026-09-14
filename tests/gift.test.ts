import { describe, expect, it } from "vitest";
import {
  claimAllGifts, claimGift, claimedGiftHistory, describeClaimAll, describeExpiry, describeReward,
  formatJst, giftAvailability, monsterCountOf, openGifts, unclaimedGiftCount,
  type GiftDefinition,
} from "../src/game/gift.js";
import { GIFT_DEFINITIONS } from "../src/data/gifts.js";
import { createInitialState, normalizeLoadedState, type PlayerState } from "../src/game/playerState.js";
import { SKILL_PIG_DEX } from "../src/data/monsters.js";
import { decodeSave, encodeSave } from "../src/game/saveCodec.js";

/*
 * プレゼントボックス。
 *
 * **いちばん守りたいのは「二度渡さない」こと。**
 * 受け取りの印と所持品は同じ保存の中にあるので、片方だけ残ることはない。
 * 保存に失敗した時に**何も増えていない**ことも、ここで見張る。
 */

const OPEN: GiftDefinition = {
  giftId: "test_open",
  title: "検査用のプレゼント",
  description: "説明",
  rewards: [
    { kind: "CRYSTAL", amount: 5_000 },
    { kind: "GOLD", amount: 1_500_000 },
    { kind: "SUMMON_SCROLL", amount: 30 },
    { kind: "SKILL_PIG", amount: 2 },
  ],
  startsAt: "2026-09-14T00:00:00+09:00",
  expiresAt: "2026-10-14T23:59:59+09:00",
};
const NO_LIMIT: GiftDefinition = { ...OPEN, giftId: "test_unlimited", expiresAt: null, rewards: [{ kind: "CRYSTAL", amount: 100 }] };
const FUTURE: GiftDefinition = { ...OPEN, giftId: "test_future", startsAt: "2027-01-01T00:00:00+09:00" };

const ALL = [OPEN, NO_LIMIT, FUTURE];
/** 期限内のある時刻(2026/09/20 12:00 JST) */
const DURING = new Date("2026-09-20T12:00:00+09:00").getTime();
/** 期限を過ぎた時刻(2026/10/15 00:00 JST) */
const AFTER = new Date("2026-10-15T00:00:00+09:00").getTime();

const fresh = (): PlayerState => createInitialState();

describe("受け取れるかの判定", () => {
  it("期限内なら受け取れる", () => {
    expect(giftAvailability(OPEN, fresh(), DURING)).toBe("OPEN");
  });

  it("**期限を過ぎたら受け取れない**", () => {
    expect(giftAvailability(OPEN, fresh(), AFTER)).toBe("EXPIRED");
    const state = fresh();
    expect(claimGift(ALL, state, OPEN.giftId, { now: AFTER })).toMatchObject({ ok: false, reason: "EXPIRED" });
    expect(state.crystal).toBe(fresh().crystal);
  });

  it("配布前は一覧に出ない", () => {
    expect(giftAvailability(FUTURE, fresh(), DURING)).toBe("NOT_STARTED");
    expect(openGifts(ALL, fresh(), DURING).map((g) => g.giftId)).toEqual([OPEN.giftId, NO_LIMIT.giftId]);
  });

  it("無期限は期限切れにならない", () => {
    expect(giftAvailability(NO_LIMIT, fresh(), AFTER)).toBe("OPEN");
    expect(describeExpiry(NO_LIMIT)).toBe("受取期限：なし");
  });
});

describe("受け取り", () => {
  it("ダイヤ・ゴールド・召喚書・スキルピッグが正しく増える", () => {
    const state = fresh();
    const before = { crystal: state.crystal, gold: state.gold, scrolls: state.summonScrolls, monsters: state.monsters.length };
    const result = claimGift(ALL, state, OPEN.giftId, { now: DURING });
    expect(result.ok).toBe(true);
    expect(state.crystal).toBe(before.crystal + 5_000);
    expect(state.gold).toBe(before.gold + 1_500_000);
    expect(state.summonScrolls).toBe(before.scrolls + 30);
    expect(state.monsters.length).toBe(before.monsters + 2);
  });

  it("**増えるのは正式なスキルピッグ。**新しい別モンスターを作らない", () => {
    const state = fresh();
    const before = state.monsters.length;
    claimGift(ALL, state, OPEN.giftId, { now: DURING });
    const added = state.monsters.slice(before);
    const pigIds = new Set(SKILL_PIG_DEX.map((dex) => dex.id));
    expect(added).toHaveLength(2);
    for (const monster of added) expect(pigIds.has(monster.dexId), monster.dexId).toBe(true);
  });

  it("**一度受け取ったら二度目は受け取れない**", () => {
    const state = fresh();
    expect(claimGift(ALL, state, OPEN.giftId, { now: DURING }).ok).toBe(true);
    const crystal = state.crystal;
    expect(claimGift(ALL, state, OPEN.giftId, { now: DURING })).toMatchObject({ ok: false, reason: "ALREADY_CLAIMED" });
    expect(state.crystal, "二度目で増えない").toBe(crystal);
  });

  it("**連打しても1回ぶんしか増えない**", () => {
    const state = fresh();
    const before = state.crystal;
    for (let i = 0; i < 10; i += 1) claimGift(ALL, state, OPEN.giftId, { now: DURING });
    expect(state.crystal).toBe(before + 5_000);
    expect(state.claimedGifts).toHaveLength(1);
  });

  it("**保存に失敗したら、何も増えていない**", () => {
    const state = fresh();
    const before = {
      crystal: state.crystal, gold: state.gold,
      scrolls: state.summonScrolls, monsters: state.monsters.length,
    };
    const result = claimGift(ALL, state, OPEN.giftId, { now: DURING, save: () => false });
    expect(result).toMatchObject({ ok: false, reason: "SAVE_FAILED" });
    expect(state.crystal).toBe(before.crystal);
    expect(state.gold).toBe(before.gold);
    expect(state.summonScrolls).toBe(before.scrolls);
    expect(state.monsters.length).toBe(before.monsters);
    expect(state.claimedGifts ?? []).toHaveLength(0);
  });

  it("保存に失敗した後、もう一度試せば受け取れる(取り逃がさない)", () => {
    const state = fresh();
    claimGift(ALL, state, OPEN.giftId, { now: DURING, save: () => false });
    const result = claimGift(ALL, state, OPEN.giftId, { now: DURING, save: () => true });
    expect(result.ok).toBe(true);
    expect(state.crystal).toBe(fresh().crystal + 5_000);
  });

  it("保存に成功した後に再試行しても二重に増えない", () => {
    const state = fresh();
    claimGift(ALL, state, OPEN.giftId, { now: DURING, save: () => true });
    const crystal = state.crystal;
    claimGift(ALL, state, OPEN.giftId, { now: DURING, save: () => true });
    expect(state.crystal).toBe(crystal);
  });

  it("**受け取りの印はセーブに残る。**読み込み直しても二度目は受け取れない", () => {
    const state = fresh();
    claimGift(ALL, state, OPEN.giftId, { now: DURING });
    const reloaded = normalizeLoadedState(decodeSave(encodeSave(state))!);
    expect(giftAvailability(OPEN, reloaded, DURING)).toBe("CLAIMED");
    const crystal = reloaded.crystal;
    claimGift(ALL, reloaded, OPEN.giftId, { now: DURING });
    expect(reloaded.crystal).toBe(crystal);
  });
});

describe("すべて受け取る", () => {
  it("受け取れるものを全部受け取る", () => {
    const state = fresh();
    const result = claimAllGifts(ALL, state, { now: DURING });
    expect(result.claimed.map((entry) => entry.gift.giftId)).toEqual([OPEN.giftId, NO_LIMIT.giftId]);
    expect(result.skipped).toEqual([]);
    expect(state.crystal).toBe(fresh().crystal + 5_000 + 100);
  });

  it("配布前のものは残る", () => {
    const state = fresh();
    claimAllGifts(ALL, state, { now: DURING });
    expect(giftAvailability(FUTURE, state, DURING)).toBe("NOT_STARTED");
    // 配布が始まれば受け取れる
    const later = new Date("2027-02-01T00:00:00+09:00").getTime();
    expect(giftAvailability(FUTURE, state, later)).toBe("EXPIRED");
  });

  it("結果の文言が件数を伝える", () => {
    const state = fresh();
    expect(describeClaimAll(claimAllGifts(ALL, state, { now: DURING }))).toBe("2件受け取りました。");
    expect(describeClaimAll(claimAllGifts(ALL, state, { now: DURING }))).toBe("受け取れるプレゼントはありませんでした。");
  });
});

describe("バッジの件数", () => {
  it("受け取れるものだけを数える", () => {
    const state = fresh();
    expect(unclaimedGiftCount(ALL, state, DURING)).toBe(2);
    claimGift(ALL, state, OPEN.giftId, { now: DURING });
    expect(unclaimedGiftCount(ALL, state, DURING)).toBe(1);
  });

  it("**期限切れは数えない**", () => {
    // 期限切れの OPEN と、無期限の NO_LIMIT が残っている状態
    expect(unclaimedGiftCount(ALL, fresh(), AFTER)).toBe(1);
  });

  it("配布前は数えない", () => {
    const beforeStart = new Date("2026-09-01T00:00:00+09:00").getTime();
    expect(unclaimedGiftCount(ALL, fresh(), beforeStart)).toBe(0);
  });
});

describe("受取履歴", () => {
  it("受け取った日時と中身が残る", () => {
    const state = fresh();
    claimGift(ALL, state, OPEN.giftId, { now: DURING });
    const history = claimedGiftHistory(ALL, state);
    expect(history).toHaveLength(1);
    expect(history[0].gift.title).toBe(OPEN.title);
    expect(history[0].claimedAt).toBe(DURING);
    expect(history[0].gift.rewards.map(describeReward)).toEqual([
      "💎 ダイヤ ×5,000", "💰 ゴールド ×1,500,000", "📜 召喚の書 ×30", "🐽 スキルピッグ ×2",
    ]);
  });

  it("新しい順に並ぶ", () => {
    const state = fresh();
    claimGift(ALL, state, NO_LIMIT.giftId, { now: DURING });
    claimGift(ALL, state, OPEN.giftId, { now: DURING + 1000 });
    expect(claimedGiftHistory(ALL, state).map((entry) => entry.gift.giftId)).toEqual([OPEN.giftId, NO_LIMIT.giftId]);
  });
});

describe("表示", () => {
  it("期限は日本時間で出す", () => {
    expect(formatJst("2026-10-14T23:59:59+09:00")).toBe("2026/10/14 23:59");
    expect(describeExpiry(OPEN)).toBe("受取期限：2026/10/14 23:59");
  });

  it("モンスターの数を数えられる", () => {
    expect(monsterCountOf(OPEN)).toBe(2);
    expect(monsterCountOf(NO_LIMIT)).toBe(0);
  });
});

describe("本番の配布定義", () => {
  it("おわび配布の中身が依頼どおり", () => {
    const gift = GIFT_DEFINITIONS.find((entry) => entry.giftId === "balance_apology_20260914");
    expect(gift, "balance_apology_20260914 がある").toBeDefined();
    expect(gift!.title).toBe("大規模バランス調整のおわび");
    expect(gift!.expiresAt).toBe("2026-10-14T23:59:59+09:00");
    expect(gift!.rewards).toEqual([
      { kind: "CRYSTAL", amount: 5_000 },
      { kind: "GOLD", amount: 1_500_000 },
      { kind: "SUMMON_SCROLL", amount: 30 },
      { kind: "SKILL_PIG", amount: 2 },
    ]);
  });

  it("**giftIdが重複していない**", () => {
    const ids = GIFT_DEFINITIONS.map((gift) => gift.giftId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("本番の定義でも受け取りが通る", () => {
    const state = fresh();
    const result = claimGift(GIFT_DEFINITIONS, state, "balance_apology_20260914", { now: DURING });
    expect(result.ok).toBe(true);
    expect(state.crystal).toBe(fresh().crystal + 5_000);
    expect(state.monsters.length).toBe(fresh().monsters.length + 2);
  });
});

describe("既存の配布を壊していない", () => {
  it("お知らせ配布の受取印とは別枠", () => {
    const state = fresh();
    claimGift(ALL, state, OPEN.giftId, { now: DURING });
    expect(state.claimedCompensationIds).toEqual([]);
    expect(state.claimedGifts).toHaveLength(1);
  });
});
