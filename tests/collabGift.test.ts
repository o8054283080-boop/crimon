/**
 * コラボ開催記念の配布。
 *
 * **プレゼントボックスに任せてある。**
 * あの仕組みが既に「受け取ったかどうかを giftId で覚える」を持っていて、
 * 再ログインでも、端末を変えてセーブを復旧しても、二重には配られない。
 * 受け取る前なら一覧に残り続ける。
 */
import { describe, expect, it } from "vitest";
import { GIFT_DEFINITIONS } from "../src/data/gifts.js";
import { claimGift, openGifts, unclaimedGiftCount } from "../src/game/gift.js";
import { COLLAB_GIFT_DEX_ID } from "../src/data/collabEvent.js";
import { createInitialState } from "../src/game/playerState.js";
import { decodeSave, encodeSave } from "../src/game/saveCodec.js";

/** 開催期間の中の1日 */
const DURING = new Date("2026-09-25T03:00:00+09:00").getTime();

const COLLAB_GIFT_ID = "collab_celebration_20260919";
const gift = () => GIFT_DEFINITIONS.find((g) => g.giftId === COLLAB_GIFT_ID)!;

describe("配る中身", () => {
  it("依頼どおりの4点が入っている", () => {
    const rewards = gift().rewards;
    expect(rewards.find((r) => r.kind === "MONSTER")).toMatchObject({ dexId: COLLAB_GIFT_DEX_ID, star: 4, amount: 1 });
    expect(rewards.find((r) => r.kind === "CRYSTAL")).toMatchObject({ amount: 3_000 });
    expect(rewards.find((r) => r.kind === "SUMMON_SCROLL")).toMatchObject({ amount: 30 });
    expect(rewards.find((r) => r.kind === "COLLAB_FOUR_STAR_SUMMON_SCROLL")).toMatchObject({ amount: 1 });
  });

  /** 配る電気スエゾーは、召喚で引いたものとまったく同じ図鑑ID */
  it("配られるのは通常の電気スエゾー", () => {
    expect(COLLAB_GIFT_DEX_ID).toBe("suezo_ELECTRIC");
  });
});

describe("受け取り", () => {
  it("開催中はプレゼントボックスに並ぶ", () => {
    const state = createInitialState();
    const list = openGifts(GIFT_DEFINITIONS, state, DURING);
    expect(list.some((g) => g.giftId === COLLAB_GIFT_ID), "一覧に出ていない").toBe(true);
    expect(unclaimedGiftCount(GIFT_DEFINITIONS, state, DURING)).toBeGreaterThan(0);
  });

  it("4点がそのまま手持ちへ入る", () => {
    const state = createInitialState();
    const before = state.monsters.length;
    const crystal = state.crystal;
    const scrolls = state.summonScrolls;

    const result = claimGift(GIFT_DEFINITIONS, state, COLLAB_GIFT_ID, { now: DURING });
    expect(result.ok, "受け取れなかった").toBe(true);

    expect(state.crystal).toBe(crystal + 3_000);
    expect(state.summonScrolls).toBe(scrolls + 30);
    expect(state.collabFourStarSummonScrolls).toBe(1);
    expect(state.monsters.length).toBe(before + 1);
    expect(state.monsters.some((m) => m.dexId === COLLAB_GIFT_DEX_ID && m.star === 4)).toBe(true);
  });

  /** **何度押しても増えない。**受け取り済みの印が giftId で残る */
  it("二度目以降は受け取れない", () => {
    const state = createInitialState();
    expect(claimGift(GIFT_DEFINITIONS, state, COLLAB_GIFT_ID, { now: DURING }).ok).toBe(true);
    const crystal = state.crystal;
    const monsters = state.monsters.length;

    for (let i = 0; i < 5; i += 1) {
      expect(claimGift(GIFT_DEFINITIONS, state, COLLAB_GIFT_ID, { now: DURING }).ok, "二重に受け取れてしまった").toBe(false);
    }
    expect(state.crystal).toBe(crystal);
    expect(state.monsters.length).toBe(monsters);
    expect(state.collabFourStarSummonScrolls).toBe(1);
  });

  /*
   * **セーブを跨いでも配られない。**
   * 別端末で復旧した時にここが効く(受け取り済みの印はセーブに入っている)。
   */
  it("セーブして読み戻した後も、もう一度は配られない", () => {
    const state = createInitialState();
    claimGift(GIFT_DEFINITIONS, state, COLLAB_GIFT_ID, { now: DURING });
    const restored = decodeSave(encodeSave(state))!;
    expect(restored).not.toBeNull();

    const crystal = restored.crystal;
    const monsters = restored.monsters.length;
    expect(claimGift(GIFT_DEFINITIONS, restored, COLLAB_GIFT_ID, { now: DURING }).ok).toBe(false);
    expect(restored.crystal).toBe(crystal);
    expect(restored.monsters.length).toBe(monsters);
    expect(restored.collabFourStarSummonScrolls).toBe(1);
  });

  /** 受け取る前なら一覧に残り続ける */
  it("受け取るまでは一覧に出続ける", () => {
    const state = createInitialState();
    const inList = () => openGifts(GIFT_DEFINITIONS, state, DURING).some((g) => g.giftId === COLLAB_GIFT_ID);
    expect(inList()).toBe(true);
    // 何度覗いても消えない
    expect(inList()).toBe(true);
    claimGift(GIFT_DEFINITIONS, state, COLLAB_GIFT_ID, { now: DURING });
    expect(inList()).toBe(false);
  });
});

describe("前から遊んでいる人のセーブ", () => {
  /** コラボ召喚書の欄そのものが無いセーブでも、0から足せる */
  it("コラボ召喚書の欄が無くても受け取れる", () => {
    const state = createInitialState();
    delete (state as { collabFourStarSummonScrolls?: number }).collabFourStarSummonScrolls;
    expect(claimGift(GIFT_DEFINITIONS, state, COLLAB_GIFT_ID, { now: DURING }).ok).toBe(true);
    expect(state.collabFourStarSummonScrolls).toBe(1);
  });

  /*
   * 既存の所持品を**減らさない。**
   * ちょうどの値ではなく「以上」で見るのは、同じ日に受け取れる配布が
   * コラボの1件だけではないため。
   */
  it("配布で他の所持品が減ったりしない", () => {
    const state = createInitialState();
    state.gold = 123_456;
    state.fourStarSummonScrolls = 7;
    state.awakeningOrbs = 3;
    claimGift(GIFT_DEFINITIONS, state, COLLAB_GIFT_ID, { now: DURING });
    expect(state.gold).toBeGreaterThanOrEqual(123_456);
    expect(state.fourStarSummonScrolls).toBeGreaterThanOrEqual(7);
    expect(state.awakeningOrbs).toBeGreaterThanOrEqual(3);
  });
});
