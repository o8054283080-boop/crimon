import { describe, expect, it } from "vitest";
import {
  SHOP_EQUIPMENT_PRICE,
  SHOP_INITIAL_SLOTS,
  SHOP_MAX_SLOTS,
  SHOP_MONSTER_PRICE,
  SHOP_ROTATION_MS,
  SHOP_SCROLL_PRICES,
  SHOP_SLOT_UNLOCK_COSTS,
  buildShopLineup,
  msUntilRotation,
  nextSlotUnlockCost,
  shopEquipmentPrice,
} from "../src/game/shop.js";
import { MONSTER_TEMPLATES } from "../src/data/monsters.js";
import { buyShopEntry, createInitialState, getShop, unlockShopSlot } from "../src/game/playerState.js";

const HOUR = Date.parse("2026-05-01T09:00:00Z");
const NEXT_HOUR = HOUR + SHOP_ROTATION_MS;

describe("ショップの品揃え", () => {
  it("初期の枠数ぶんだけ並ぶ", () => {
    const lineup = buildShopLineup(HOUR, 1, SHOP_INITIAL_SLOTS);
    expect(lineup.entries).toHaveLength(SHOP_INITIAL_SLOTS);
  });

  it("同じ時間帯なら何度開いても同じ並びになる(保存せずに再現できる)", () => {
    const a = buildShopLineup(HOUR, 10, 5);
    const b = buildShopLineup(HOUR + SHOP_ROTATION_MS - 1, 10, 5);
    expect(JSON.stringify(a.entries)).toBe(JSON.stringify(b.entries));
  });

  it("1時間経つと品揃えが入れ替わる", () => {
    const a = buildShopLineup(HOUR, 10, 5);
    const b = buildShopLineup(NEXT_HOUR, 10, 5);
    expect(a.rotationKey).not.toBe(b.rotationKey);
    expect(JSON.stringify(a.entries)).not.toBe(JSON.stringify(b.entries));
  });

  it("枠を増やしても、すでに並んでいた品は変わらない(解放した瞬間に欲しい品が消えない)", () => {
    const before = buildShopLineup(HOUR, 20, 5);
    const after = buildShopLineup(HOUR, 20, 8);
    expect(after.entries).toHaveLength(8);
    expect(JSON.stringify(after.entries.slice(0, 5))).toBe(JSON.stringify(before.entries));
  });

  it("値段は指定どおりの表になっている", () => {
    for (let level = 1; level <= 50; level += 7) {
      for (const entry of buildShopLineup(HOUR + level * SHOP_ROTATION_MS, level, SHOP_MAX_SLOTS).entries) {
        if (entry.kind === "EQUIPMENT") {
          // ★とサブOPの初期本数だけで決まる。**中身では変えない**(依頼主の指定)
          expect(entry.price).toBe(SHOP_EQUIPMENT_PRICE[entry.equipment.star][entry.equipment.subStats.length]);
          expect(entry.price).toBe(shopEquipmentPrice(entry.equipment));
        }
        if (entry.kind === "MONSTER") expect(entry.price).toBe(SHOP_MONSTER_PRICE[entry.star]);
        if (entry.kind === "SCROLL") {
          expect(SHOP_SCROLL_PRICES).toContainEqual({ count: entry.count, price: entry.price });
        }
      }
    }
  });

  it("モンスターは星1〜3で、ダンジョンで手に入る通常モンスターに限られる(ガチャ限定は出ない)", () => {
    const normalIds = new Set(MONSTER_TEMPLATES.map((t) => t.templateId));
    for (let hour = 0; hour < 400; hour++) {
      for (const entry of buildShopLineup(HOUR + hour * SHOP_ROTATION_MS, 30, SHOP_MAX_SLOTS).entries) {
        if (entry.kind !== "MONSTER") continue;
        expect(entry.star).toBeGreaterThanOrEqual(1);
        expect(entry.star).toBeLessThanOrEqual(3);
        expect(normalIds.has(entry.dexId.split("_")[0])).toBe(true);
      }
    }
  });

  it("ファイターレベルが高いほど、星の高い装備が出やすくなる", () => {
    function averageStar(level: number): number {
      let sum = 0;
      let count = 0;
      for (let hour = 0; hour < 600; hour++) {
        for (const entry of buildShopLineup(HOUR + hour * SHOP_ROTATION_MS, level, SHOP_MAX_SLOTS).entries) {
          if (entry.kind !== "EQUIPMENT") continue;
          sum += entry.equipment.star;
          count += 1;
        }
      }
      return sum / count;
    }
    const low = averageStar(1);
    const mid = averageStar(25);
    const high = averageStar(50);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it("高レベルでも低い星が出なくなるわけではない(買えない品ばかりにならない)", () => {
    const stars = new Set<number>();
    for (let hour = 0; hour < 400; hour++) {
      for (const entry of buildShopLineup(HOUR + hour * SHOP_ROTATION_MS, 50, SHOP_MAX_SLOTS).entries) {
        if (entry.kind === "EQUIPMENT") stars.add(entry.equipment.star);
      }
    }
    expect(stars.has(1)).toBe(true);
    expect(stars.has(6)).toBe(true);
  });

  it("次の入れ替えまでの残り時間は1時間以内", () => {
    expect(msUntilRotation(HOUR)).toBeGreaterThan(0);
    expect(msUntilRotation(HOUR)).toBeLessThanOrEqual(SHOP_ROTATION_MS);
  });
});

describe("ショップの購入", () => {
  it("ゴールドが足りていれば買えて、所持品が増える", () => {
    const state = createInitialState();
    state.gold = 500000;
    const shop = getShop(state, HOUR);
    const before = {
      equipment: state.equipment.length,
      monsters: state.monsters.length,
      scrolls: state.summonScrolls,
    };
    const entry = shop.entries[0];
    const result = buyShopEntry(state, 0, HOUR);

    expect(result.ok).toBe(true);
    expect(state.gold).toBe(500000 - entry.price);
    if (entry.kind === "EQUIPMENT") expect(state.equipment.length).toBe(before.equipment + 1);
    if (entry.kind === "MONSTER") expect(state.monsters.length).toBe(before.monsters + 1);
    if (entry.kind === "SCROLL") expect(state.summonScrolls).toBe(before.scrolls + entry.count);
  });

  it("ゴールドが足りなければ買えず、所持金も減らない", () => {
    const state = createInitialState();
    state.gold = 0;
    const result = buyShopEntry(state, 0, HOUR);
    expect(result.ok).toBe(false);
    expect(state.gold).toBe(0);
  });

  it("同じ枠は二度買えない", () => {
    const state = createInitialState();
    state.gold = 500000;
    expect(buyShopEntry(state, 0, HOUR).ok).toBe(true);
    const second = buyShopEntry(state, 0, HOUR);
    expect(second.ok).toBe(false);
    expect(second.reason).toBeTruthy();
  });

  it("開いていない枠は買えない", () => {
    const state = createInitialState();
    state.gold = 500000;
    expect(buyShopEntry(state, SHOP_INITIAL_SLOTS, HOUR).ok).toBe(false);
  });

  it("品揃えが変わると購入済みが流れて、また買えるようになる", () => {
    const state = createInitialState();
    state.gold = 500000;
    expect(buyShopEntry(state, 0, HOUR).ok).toBe(true);
    expect(getShop(state, NEXT_HOUR).purchasedSlots).toEqual([]);
    expect(buyShopEntry(state, 0, NEXT_HOUR).ok).toBe(true);
  });
});

describe("ショップの枠開放", () => {
  it("初期は5枠で、ダイヤを払うと1つずつ増える", () => {
    const state = createInitialState();
    expect(state.shopSlotsUnlocked).toBe(SHOP_INITIAL_SLOTS);
    state.crystal = 100000;
    expect(unlockShopSlot(state).ok).toBe(true);
    expect(state.shopSlotsUnlocked).toBe(SHOP_INITIAL_SLOTS + 1);
    expect(getShop(state, HOUR).entries).toHaveLength(SHOP_INITIAL_SLOTS + 1);
  });

  it("開放するほど値段が上がり、10枠で打ち止めになる", () => {
    const state = createInitialState();
    state.crystal = 100000;
    const paid: number[] = [];
    for (let i = 0; i < SHOP_SLOT_UNLOCK_COSTS.length; i++) {
      const cost = nextSlotUnlockCost(state.shopSlotsUnlocked)!;
      paid.push(cost);
      expect(unlockShopSlot(state).ok).toBe(true);
    }
    expect(paid).toEqual(SHOP_SLOT_UNLOCK_COSTS);
    expect([...paid].sort((a, b) => a - b)).toEqual(paid);
    expect(state.shopSlotsUnlocked).toBe(SHOP_MAX_SLOTS);
    expect(nextSlotUnlockCost(state.shopSlotsUnlocked)).toBeNull();
    expect(unlockShopSlot(state).ok).toBe(false);
  });

  it("ダイヤが足りなければ開放できず、所持ダイヤも減らない", () => {
    const state = createInitialState();
    state.crystal = 0;
    expect(unlockShopSlot(state).ok).toBe(false);
    expect(state.crystal).toBe(0);
    expect(state.shopSlotsUnlocked).toBe(SHOP_INITIAL_SLOTS);
  });
});
