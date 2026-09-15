/**
 * スタミナポーションの入手導線。
 *
 * **既存の場所に控えめに載せる。**新しい画面を増やさない。
 * いまの導線は2つ——アリーナショップの週商品と、
 * 「スタミナを消費する」週次・月次ミッションの添え物。
 */
import { describe, expect, it } from "vitest";
import { ARENA_SHOP_ITEMS } from "../src/data/arena/shop.js";
import { SHOP_ROTATION_MS, SHOP_STAMINA_POTION_OFFERS, ShopEntry, buildShopLineup } from "../src/game/shop.js";
import { buyShopEntry, getShop } from "../src/game/playerState.js";
import { buyArenaShopItem } from "../src/game/arena/shop.js";
import { DAILY_MISSIONS, MONTHLY_MISSIONS, WEEKLY_MISSIONS, grantMissionReward, missionRewardText } from "../src/game/missions.js";
import { createInitialState, staminaPotionsOwned } from "../src/game/playerState.js";

describe("アリーナショップ", () => {
  const item = ARENA_SHOP_ITEMS.find((entry) => entry.kind === "STAMINA_POTION");

  it("週の商品として並んでいる", () => {
    expect(item).toBeDefined();
    expect(item!.period).toBe("WEEKLY");
    // **控えめに。**ここを厚くすると自動周回がコインでいくらでも伸びる
    expect(item!.limit).toBeLessThanOrEqual(2);
  });

  it("買うとコインが減り、ポーションが増える", () => {
    const player = createInitialState();
    player.arenaCoins = item!.price;
    expect(buyArenaShopItem(player, item!.id).ok).toBe(true);
    expect(staminaPotionsOwned(player)).toBe(item!.amount);
    expect(player.arenaCoins).toBe(0);
  });

  it("ポーション欄のない旧セーブでも買える(0で埋めてから足す)", () => {
    const player = createInitialState() as unknown as Record<string, unknown>;
    delete player.staminaPotions;
    (player as { arenaCoins: number }).arenaCoins = item!.price;
    expect(buyArenaShopItem(player as never, item!.id).ok).toBe(true);
    expect(staminaPotionsOwned(player as never)).toBe(item!.amount);
  });

  it("週の上限を超えて買えない", () => {
    const player = createInitialState();
    player.arenaCoins = item!.price * (item!.limit + 1);
    for (let i = 0; i < item!.limit; i += 1) expect(buyArenaShopItem(player, item!.id).ok).toBe(true);
    expect(buyArenaShopItem(player, item!.id).ok).toBe(false);
  });
});

describe("ミッション報酬", () => {
  it("週次・月次の「スタミナ消費」に添えてある", () => {
    expect(WEEKLY_MISSIONS.find((m) => m.id === "weekly-stamina")!.reward.staminaPotions).toBeGreaterThan(0);
    expect(MONTHLY_MISSIONS.find((m) => m.id === "monthly-stamina")!.reward.staminaPotions).toBeGreaterThan(0);
  });

  /*
   * **日次にも入れる**(依頼主の指定で方針が変わった)。
   * 以前はここに「日次には入れない」と書いてあったが、
   * 実際に見ていたのは週次の件数で、名前と中身がずれていた。
   *
   * 配る口は、どの周期も**「スタミナを消費する」の1本に絞る。**
   * 複数のミッションへ散らすと、1日に受け取れる量が読めなくなる。
   */
  it.each([
    ["日次", DAILY_MISSIONS],
    ["週次", WEEKLY_MISSIONS],
    ["月次", MONTHLY_MISSIONS],
  ])("%s で配るのは1件だけ", (_name, missions) => {
    const withPotion = missions.filter((m) => m.reward.staminaPotions);
    expect(withPotion).toHaveLength(1);
    expect(withPotion[0].counter).toBe("staminaSpent");
  });

  it("受け取るとポーションが増える。旧セーブでも欠けない", () => {
    const player = createInitialState() as unknown as Record<string, unknown>;
    delete player.staminaPotions;
    grantMissionReward(player as never, { staminaPotions: 3 });
    expect(staminaPotionsOwned(player as never)).toBe(3);
  });

  it("報酬の文言に出る", () => {
    expect(missionRewardText({ staminaPotions: 2 })).toContain("スタミナポーション×2");
  });
});


/* ==========================================================================
 * ゴールドの棚(毎時入れ替わり)
 *
 * **ダイヤショップではなくこちら**(依頼主の指定)。
 * ダイヤ → スタミナ → 周回 → ダイヤ の輪を閉じないため。
 * ========================================================================== */

describe("ゴールドの棚のスタミナポーション", () => {
  /** いくつかの時間帯を回して、並んだポーションの札を集める */
  function collectPotionEntries(hours: number): Extract<ShopEntry, { kind: "STAMINA_POTION" }>[] {
    const found: Extract<ShopEntry, { kind: "STAMINA_POTION" }>[] = [];
    for (let i = 0; i < hours; i += 1) {
      const lineup = buildShopLineup(i * SHOP_ROTATION_MS, 30, 10);
      for (const entry of lineup.entries) {
        if (entry.kind === "STAMINA_POTION") found.push(entry);
      }
    }
    return found;
  }

  it("並ぶ数は1個・3個・5個のどれか", () => {
    const counts = new Set(collectPotionEntries(300).map((e) => e.count));
    expect([...counts].sort((a, b) => a - b)).toEqual([1, 3, 5]);
  });

  it("値段は棚の定義とぴったり一致する(画面と請求で別々に決めない)", () => {
    const byCount = new Map(SHOP_STAMINA_POTION_OFFERS.map((o) => [o.count, o.price]));
    for (const entry of collectPotionEntries(200)) {
      expect(entry.price).toBe(byCount.get(entry.count));
    }
  });

  it("まとめ買いほど1個あたりが安い", () => {
    const perOne = SHOP_STAMINA_POTION_OFFERS.map((o) => o.price / o.count);
    for (let i = 1; i < perOne.length; i += 1) expect(perOne[i]).toBeLessThan(perOne[i - 1]);
  });

  it("常設にはしない。並ばない時間帯がある", () => {
    let withPotion = 0;
    for (let i = 0; i < 100; i += 1) {
      const lineup = buildShopLineup(i * SHOP_ROTATION_MS, 30, 10);
      if (lineup.entries.some((e) => e.kind === "STAMINA_POTION")) withPotion += 1;
    }
    expect(withPotion).toBeGreaterThan(0);
    expect(withPotion).toBeLessThan(100);
  });

  it("覚醒素材と枠を取り合わない(同じ時間帯に両方並べる)", () => {
    let both = 0;
    for (let i = 0; i < 200; i += 1) {
      const lineup = buildShopLineup(i * SHOP_ROTATION_MS, 30, 10);
      const hasPotion = lineup.entries.some((e) => e.kind === "STAMINA_POTION");
      const hasMaterial = lineup.entries.some((e) => e.kind === "AWAKENING_MATERIAL");
      if (hasPotion && hasMaterial) both += 1;
    }
    expect(both).toBeGreaterThan(0);
  });

  it("買うとゴールドが減り、ポーションが増える", () => {
    // ポーションが並ぶ時間帯を探してから買う
    for (let i = 0; i < 300; i += 1) {
      const at = i * SHOP_ROTATION_MS;
      const player = createInitialState();
      player.fighterLevel = 30;
      player.shopSlotsUnlocked = 10;
      const shop = getShop(player, at);
      const slot = shop.entries.findIndex((e) => e.kind === "STAMINA_POTION");
      if (slot < 0) continue;
      const entry = shop.entries[slot] as Extract<ShopEntry, { kind: "STAMINA_POTION" }>;
      player.gold = entry.price;
      const result = buyShopEntry(player, slot, at);
      expect(result.ok).toBe(true);
      expect(result.label).toContain(`スタミナポーションを${entry.count}個`);
      expect(staminaPotionsOwned(player)).toBe(entry.count);
      expect(player.gold).toBe(0);
      return;
    }
    throw new Error("ポーションが並ぶ時間帯が1つも無かった");
  });

  it("ポーション欄のない旧セーブでも買える(0で埋めてから足す)", () => {
    for (let i = 0; i < 300; i += 1) {
      const at = i * SHOP_ROTATION_MS;
      const player = createInitialState() as unknown as Record<string, unknown>;
      delete player.staminaPotions;
      (player as { fighterLevel: number }).fighterLevel = 30;
      (player as { shopSlotsUnlocked: number }).shopSlotsUnlocked = 10;
      const shop = getShop(player as never, at);
      const slot = shop.entries.findIndex((e) => e.kind === "STAMINA_POTION");
      if (slot < 0) continue;
      (player as { gold: number }).gold = shop.entries[slot].price;
      expect(buyShopEntry(player as never, slot, at).ok).toBe(true);
      expect(staminaPotionsOwned(player as never)).toBeGreaterThan(0);
      return;
    }
    throw new Error("ポーションが並ぶ時間帯が1つも無かった");
  });

  it("ゴールドが足りなければ買えず、手持ちも減らない", () => {
    for (let i = 0; i < 300; i += 1) {
      const at = i * SHOP_ROTATION_MS;
      const player = createInitialState();
      player.fighterLevel = 30;
      player.shopSlotsUnlocked = 10;
      const shop = getShop(player, at);
      const slot = shop.entries.findIndex((e) => e.kind === "STAMINA_POTION");
      if (slot < 0) continue;
      player.gold = shop.entries[slot].price - 1;
      expect(buyShopEntry(player, slot, at).ok).toBe(false);
      expect(staminaPotionsOwned(player)).toBe(0);
      expect(player.gold).toBe(shop.entries[slot].price - 1);
      return;
    }
    throw new Error("ポーションが並ぶ時間帯が1つも無かった");
  });
});

describe("配る量の並び", () => {
  const daily = DAILY_MISSIONS.find((m) => m.id === "daily-stamina")!.reward.staminaPotions ?? 0;
  const weekly = WEEKLY_MISSIONS.find((m) => m.id === "weekly-stamina")!.reward.staminaPotions ?? 0;
  const monthly = MONTHLY_MISSIONS.find((m) => m.id === "monthly-stamina")!.reward.staminaPotions ?? 0;

  it("デイリー3・ウィークリー10(依頼主の指定)", () => {
    expect(daily).toBe(3);
    expect(weekly).toBe(10);
  });

  /*
   * **周期が長いほど1回の取り分を大きくする。**
   * 月次が週次より少ないと、月末に受け取る意味が無くなる
   * (週10に対して月3のまま置き忘れていた)。
   */
  it("月次は週次より多い", () => expect(monthly).toBeGreaterThan(weekly));
});
