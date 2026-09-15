/**
 * スタミナポーションの入手導線。
 *
 * **既存の場所に控えめに載せる。**新しい画面を増やさない。
 * いまの導線は2つ——アリーナショップの週商品と、
 * 「スタミナを消費する」週次・月次ミッションの添え物。
 */
import { describe, expect, it } from "vitest";
import { ARENA_SHOP_ITEMS } from "../src/data/arena/shop.js";
import { buyArenaShopItem } from "../src/game/arena/shop.js";
import { MONTHLY_MISSIONS, WEEKLY_MISSIONS, grantMissionReward, missionRewardText } from "../src/game/missions.js";
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

  it("日次には入れない(毎日配ると自動周回が止まらなくなる)", () => {
    expect(WEEKLY_MISSIONS.filter((m) => m.reward.staminaPotions).length).toBeLessThanOrEqual(1);
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
