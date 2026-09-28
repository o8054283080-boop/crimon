import { describe, expect, it } from "vitest";
import { claimGift, giftsFor, openGifts, recipientKey, unclaimedGiftCount, type GiftDefinition } from "../src/game/gift.js";
import { GIFT_DEFINITIONS } from "../src/data/gifts.js";
import { createInitialState } from "../src/game/playerState.js";

/*
 * 宛先付きのプレゼント。**本人にだけ出て、ほかの人の一覧には1件も出ない。**
 *
 * クリエイトの仕様(移し替えが1体1つだった)で消えた★6素材を、
 * その人にだけ返すために足した。全員宛ての配布とは混ぜない。
 */

const EVERYONE: GiftDefinition = {
  giftId: "test_everyone",
  title: "全員宛て",
  description: "説明",
  rewards: [{ kind: "CRYSTAL", amount: 100 }],
  startsAt: "2026-09-14T00:00:00+09:00",
  expiresAt: null,
};
const ONLY_DORA: GiftDefinition = {
  ...EVERYONE,
  giftId: "test_only_dora",
  title: "ドラさんへ",
  rewards: [{ kind: "MONSTER", dexId: "kobold_LIGHT", star: 6, amount: 1 }],
  recipients: [recipientKey("dora123")],
};
const NOW = new Date("2026-09-29T12:00:00+09:00").getTime();

describe("宛先付きのプレゼント", () => {
  it("本人の復旧IDなら一覧に出て、受け取ると★6光コボルトが1体増える", () => {
    const state = createInitialState();
    const gifts = giftsFor([EVERYONE, ONLY_DORA], "dora123");
    expect(openGifts(gifts, state, NOW).map((g) => g.giftId)).toEqual(["test_everyone", "test_only_dora"]);

    const before = state.monsters.length;
    const result = claimGift(gifts, state, "test_only_dora", { now: NOW });
    expect(result.ok).toBe(true);
    expect(state.monsters.length).toBe(before + 1);
    const got = state.monsters.at(-1)!;
    expect(got.dexId).toBe("kobold_LIGHT");
    expect(got.star).toBe(6);
    // 二度目は受け取れない
    expect(claimGift(gifts, state, "test_only_dora", { now: NOW }).ok).toBe(false);
  });

  it("ほかの人・未登録の人の一覧には出ず、数にも入らず、受け取れもしない", () => {
    for (const recoveryId of ["someone", null, undefined, ""]) {
      const state = createInitialState();
      const gifts = giftsFor([EVERYONE, ONLY_DORA], recoveryId);
      expect(gifts.map((g) => g.giftId)).toEqual(["test_everyone"]);
      expect(unclaimedGiftCount(gifts, state, NOW)).toBe(1);
      expect(claimGift(gifts, state, "test_only_dora", { now: NOW }).ok).toBe(false);
    }
  });

  it("復旧IDの前後の空白と大文字小文字は同じ人として扱う", () => {
    expect(recipientKey(" Dora123 ")).toBe(recipientKey("dora123"));
    expect(recipientKey("dora124")).not.toBe(recipientKey("dora123"));
  });

  it("配信コードには復旧IDそのものを書かない(宛先は変換後の値だけ)", () => {
    for (const gift of GIFT_DEFINITIONS) {
      for (const key of gift.recipients ?? []) expect(key).toMatch(/^[0-9a-f]{14}$/);
    }
  });

  it("ドラさんへの★6光コボルトは、ドラさんの復旧IDの時だけ出る", () => {
    const id = "create_slot_refund_dora_20260929";
    const refund = GIFT_DEFINITIONS.find((g) => g.giftId === id)!;
    expect(refund.rewards).toEqual([{ kind: "MONSTER", dexId: "kobold_LIGHT", star: 6, amount: 1 }]);
    expect(giftsFor(GIFT_DEFINITIONS, "dora1129").some((g) => g.giftId === id)).toBe(true);
    for (const other of [null, "dora1128", "someone"]) {
      expect(giftsFor(GIFT_DEFINITIONS, other).some((g) => g.giftId === id)).toBe(false);
    }
    const state = createInitialState();
    expect(claimGift(giftsFor(GIFT_DEFINITIONS, "dora1129"), state, id, { now: NOW }).ok).toBe(true);
    expect(state.monsters.at(-1)).toMatchObject({ dexId: "kobold_LIGHT", star: 6 });
  });

  it("宛先の無い配布は、復旧IDがあってもなくても全員に出る", () => {
    const everyone = GIFT_DEFINITIONS.filter((g) => !g.recipients).map((g) => g.giftId);
    expect(giftsFor(GIFT_DEFINITIONS, null).map((g) => g.giftId)).toEqual(everyone);
    expect(giftsFor(GIFT_DEFINITIONS, "someone").map((g) => g.giftId)).toEqual(everyone);
  });
});
