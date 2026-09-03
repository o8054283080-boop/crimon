import { describe, expect, it } from "vitest";
import { CRYSTAL_SHOP_ITEMS, findCrystalShopItem } from "../src/data/crystalShop.js";
import {
  buyCrystalShopItem,
  crystalShopPeriodKey,
  crystalShopRemaining,
  crystalShopRows,
} from "../src/game/crystalShop.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";
import { REINCARNATION_PIG_DEX } from "../src/data/monsters.js";
import { STAR_MAX_LEVEL } from "../src/core/rarity.js";

/*
 * ダイヤショップ。
 *
 * **上限は「ボタンを消す」ではなく「買う処理が数える」で守る。**
 * 画面を経由せずに `buyCrystalShopItem` を叩いて確かめる。
 */

/** 2026-09-03 12:00 UTC。テストの中で時計を動かすための起点 */
const NOW = Date.UTC(2026, 8, 3, 12);
const DAY = 24 * 60 * 60 * 1000;

function richState(crystal = 100_000) {
  const state = createInitialState();
  state.crystal = crystal;
  state.gold = 0;
  return state;
}

describe("棚の中身", () => {
  it("依頼どおりの7品が、指定の値段と上限で並んでいる", () => {
    const expected = [
      { id: "gold_200k", price: 100, period: "UNLIMITED", limit: undefined },
      { id: "gold_1200k", price: 500, period: "UNLIMITED", limit: undefined },
      { id: "gold_3000k", price: 1_000, period: "UNLIMITED", limit: undefined },
      { id: "reincarnation_pig_3_max", price: 150, period: "WEEKLY", limit: 1 },
      { id: "reincarnation_pig_4_max", price: 400, period: "MONTHLY", limit: 1 },
      { id: "four_star_scroll", price: 350, period: "MONTHLY", limit: 2 },
      { id: "light_dark_scroll", price: 700, period: "MONTHLY", limit: 1 },
    ];
    expect(CRYSTAL_SHOP_ITEMS).toHaveLength(expected.length);
    for (const want of expected) {
      const item = findCrystalShopItem(want.id);
      expect(item, `${want.id} が無い`).toBeDefined();
      expect([item!.price, item!.period, item!.limit]).toEqual([want.price, want.period, want.limit]);
    }
  });

  it("今回入れないと決めたものは並べない", () => {
    /*
     * スタミナ・所持枠・アリーナ挑戦券・経験ピッグ・潜在覚醒アイテム・
     * サブOP変更アイテム・各種ブースト・属性召喚書は今回対象外(依頼主の指定)。
     * **手に入らない物を棚に置くと、買えたのに何も増えない**が起きる。
     */
    const kinds = new Set(CRYSTAL_SHOP_ITEMS.map((item) => item.kind));
    expect([...kinds].sort()).toEqual(["FOUR_STAR_SCROLL", "GOLD", "LIGHT_DARK_SCROLL", "REINCARNATION_PIG"]);
  });

  it("まとめ買いほど1ダイヤあたりが得になる", () => {
    const rate = (id: string) => {
      const item = findCrystalShopItem(id)!;
      return item.amount / item.price;
    };
    expect(rate("gold_1200k")).toBeGreaterThan(rate("gold_200k"));
    expect(rate("gold_3000k")).toBeGreaterThan(rate("gold_1200k"));
  });
});

describe("買う", () => {
  it("ゴールド交換はダイヤを引いてゴールドを足す", () => {
    const state = richState(1_600);
    expect(buyCrystalShopItem(state, "gold_200k", NOW).ok).toBe(true);
    expect([state.crystal, state.gold]).toEqual([1_500, 200_000]);
    expect(buyCrystalShopItem(state, "gold_1200k", NOW).ok).toBe(true);
    expect([state.crystal, state.gold]).toEqual([1_000, 1_400_000]);
    expect(buyCrystalShopItem(state, "gold_3000k", NOW).ok).toBe(true);
    expect([state.crystal, state.gold]).toEqual([0, 4_400_000]);
  });

  it("ゴールド交換に回数の上限は無い", () => {
    const state = richState(1_000);
    for (let i = 0; i < 10; i += 1) expect(buyCrystalShopItem(state, "gold_200k", NOW).ok).toBe(true);
    expect([state.crystal, state.gold]).toEqual([0, 2_000_000]);
    expect(crystalShopRemaining(state, findCrystalShopItem("gold_200k")!, NOW)).toBeNull();
  });

  it("ダイヤが足りないと、何も動かさずに理由を返す", () => {
    const state = richState(99);
    const result = buyCrystalShopItem(state, "gold_200k", NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ダイヤが足りません");
    expect([state.crystal, state.gold]).toEqual([99, 0]);
  });

  it("無い商品IDは断る", () => {
    const state = richState();
    expect(buyCrystalShopItem(state, "stamina_100", NOW).ok).toBe(false);
    expect(state.crystal).toBe(100_000);
  });

  it("転生ピッグは、その星のレベル上限で手元に増える", () => {
    const state = richState();
    const before = state.monsters.length;
    expect(buyCrystalShopItem(state, "reincarnation_pig_3_max", NOW).ok).toBe(true);
    expect(state.monsters).toHaveLength(before + 1);
    const pig = state.monsters[state.monsters.length - 1];
    expect(REINCARNATION_PIG_DEX.some((dex) => dex.id === pig.dexId)).toBe(true);
    expect([pig.star, pig.level]).toEqual([3, STAR_MAX_LEVEL[3]]);
  });

  it("召喚書は枚数で増える", () => {
    const state = richState();
    expect(buyCrystalShopItem(state, "four_star_scroll", NOW).ok).toBe(true);
    expect(state.fourStarSummonScrolls).toBe(1);
    expect(buyCrystalShopItem(state, "light_dark_scroll", NOW).ok).toBe(true);
    expect(state.lightDarkFourStarSummonScrolls).toBe(1);
  });
});

describe("週1・月1の上限", () => {
  it("週1の品は、その週は2回目を断る", () => {
    const state = richState();
    const item = findCrystalShopItem("reincarnation_pig_3_max")!;
    expect(buyCrystalShopItem(state, item.id, NOW).ok).toBe(true);
    expect(crystalShopRemaining(state, item, NOW)).toBe(0);
    const crystal = state.crystal;
    const second = buyCrystalShopItem(state, item.id, NOW);
    expect(second.ok).toBe(false);
    expect(second.reason).toContain("今週");
    expect(state.crystal).toBe(crystal);
  });

  it("週が変われば、また買える", () => {
    const state = richState();
    const item = findCrystalShopItem("reincarnation_pig_3_max")!;
    expect(buyCrystalShopItem(state, item.id, NOW).ok).toBe(true);
    const nextWeek = NOW + 8 * DAY;
    expect(crystalShopPeriodKey("WEEKLY", nextWeek)).toBeGreaterThan(crystalShopPeriodKey("WEEKLY", NOW));
    expect(crystalShopRemaining(state, item, nextWeek)).toBe(1);
    expect(buyCrystalShopItem(state, item.id, nextWeek).ok).toBe(true);
  });

  it("月2の品は、その月に2回まで", () => {
    const state = richState();
    const item = findCrystalShopItem("four_star_scroll")!;
    expect(crystalShopRemaining(state, item, NOW)).toBe(2);
    expect(buyCrystalShopItem(state, item.id, NOW).ok).toBe(true);
    expect(buyCrystalShopItem(state, item.id, NOW + DAY).ok).toBe(true);
    const third = buyCrystalShopItem(state, item.id, NOW + 2 * DAY);
    expect(third.ok).toBe(false);
    expect(third.reason).toContain("今月");
    expect(state.fourStarSummonScrolls).toBe(2);
  });

  it("月が変われば数え直す", () => {
    const state = richState();
    const item = findCrystalShopItem("light_dark_scroll")!;
    expect(buyCrystalShopItem(state, item.id, NOW).ok).toBe(true);
    const nextMonth = Date.UTC(2026, 9, 1, 0);
    expect(crystalShopRemaining(state, item, nextMonth)).toBe(1);
    expect(buyCrystalShopItem(state, item.id, nextMonth).ok).toBe(true);
    expect(state.lightDarkFourStarSummonScrolls).toBe(2);
  });

  it("上限は品ごとに別。1つ買い切っても他は残る", () => {
    const state = richState();
    expect(buyCrystalShopItem(state, "light_dark_scroll", NOW).ok).toBe(true);
    expect(crystalShopRemaining(state, findCrystalShopItem("four_star_scroll")!, NOW)).toBe(2);
    expect(crystalShopRemaining(state, findCrystalShopItem("reincarnation_pig_3_max")!, NOW)).toBe(1);
  });
});

describe("端末の時計を戻されても枠が復活しない", () => {
  it("先の月で買ってから時計を戻しても、上限は戻らない", () => {
    /*
     * サーバを通していないので周期は端末の時計に頼るしかないが、
     * **進めた跡は残せる。** 見た中でいちばん新しい周期より前へは戻さない。
     */
    const state = richState();
    const item = findCrystalShopItem("light_dark_scroll")!;
    const future = Date.UTC(2026, 11, 1, 0);
    expect(buyCrystalShopItem(state, item.id, future).ok).toBe(true);
    expect(crystalShopRemaining(state, item, NOW)).toBe(0);
    expect(buyCrystalShopItem(state, item.id, NOW).ok).toBe(false);
  });

  it("週の品でも同じ", () => {
    const state = richState();
    const item = findCrystalShopItem("reincarnation_pig_3_max")!;
    const future = NOW + 60 * DAY;
    expect(buyCrystalShopItem(state, item.id, future).ok).toBe(true);
    expect(buyCrystalShopItem(state, item.id, NOW).ok).toBe(false);
  });
});

describe("セーブ", () => {
  it("購入記録は保存され、読み込み後も上限が効く", () => {
    const state = richState();
    expect(buyCrystalShopItem(state, "reincarnation_pig_3_max", NOW).ok).toBe(true);
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)));
    expect(crystalShopRemaining(loaded, findCrystalShopItem("reincarnation_pig_3_max")!, NOW)).toBe(0);
    expect(buyCrystalShopItem(loaded, "reincarnation_pig_3_max", NOW).ok).toBe(false);
  });

  it("記録の無い旧セーブでも壊れず、上限は満タンから始まる", () => {
    const state = createInitialState();
    state.crystal = 10_000;
    delete (state as Partial<typeof state>).crystalShopPurchases;
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)));
    expect(loaded.crystalShopPurchases).toEqual([]);
    expect(crystalShopRemaining(loaded, findCrystalShopItem("four_star_scroll")!, NOW)).toBe(2);
    expect(buyCrystalShopItem(loaded, "four_star_scroll", NOW).ok).toBe(true);
  });

  it("壊れた記録は落として読み込む", () => {
    const state = createInitialState();
    state.crystal = 10_000;
    (state as { crystalShopPurchases: unknown }).crystalShopPurchases = [
      { itemId: "four_star_scroll", period: "MONTHLY", periodKey: 1, count: 1 },
      null,
      { itemId: 5, period: "MONTHLY", periodKey: "x", count: "many" },
      "こわれている",
    ];
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)));
    expect(loaded.crystalShopPurchases).toHaveLength(1);
    expect(loaded.crystalShopPurchases[0].itemId).toBe("four_star_scroll");
  });
});

describe("画面へ渡す行", () => {
  it("残り回数と、買えるかどうかが付いてくる", () => {
    const state = richState(200);
    const rows = crystalShopRows(state, NOW);
    expect(rows).toHaveLength(CRYSTAL_SHOP_ITEMS.length);
    const pig4 = rows.find((row) => row.item.id === "reincarnation_pig_4_max")!;
    expect(pig4.remaining).toBe(1);
    expect(pig4.affordable).toBe(false); // 400💎 に届かない
    const gold = rows.find((row) => row.item.id === "gold_200k")!;
    expect(gold.remaining).toBeNull(); // 無制限に「残り」は出さない
    expect(gold.affordable).toBe(true);
  });

  it("買った直後に残りが減る", () => {
    const state = richState();
    buyCrystalShopItem(state, "four_star_scroll", NOW);
    const row = crystalShopRows(state, NOW).find((entry) => entry.item.id === "four_star_scroll")!;
    expect(row.remaining).toBe(1);
  });
});
