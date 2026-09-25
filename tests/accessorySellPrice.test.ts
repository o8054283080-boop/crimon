import { describe, expect, it } from "vitest";
import { type Accessory, accessoryEnhanceTotalCost, accessorySellPrice } from "../src/core/accessory.js";

const acc = (star: 4 | 5 | 6, rarity: Accessory["rarity"], level = 1) => ({ star, rarity, level }) as Accessory;

describe("アクセサリーの売値", () => {
  it("★4・★5は装備の7割、★6は装備と同じ(依頼主の指定)", () => {
    expect(accessorySellPrice(acc(4, "HERO"))).toBe(5_600);
    expect(accessorySellPrice(acc(5, "HERO"))).toBe(14_000);
    expect(accessorySellPrice(acc(6, "HERO"))).toBe(40_000);
  });

  it("レア度はヒーロー1倍・レジェンド1.25倍・エピック1.5倍のまま", () => {
    expect(accessorySellPrice(acc(4, "LEGEND"))).toBe(7_000);
    expect(accessorySellPrice(acc(4, "EPIC"))).toBe(8_400);
    expect(accessorySellPrice(acc(5, "EPIC"))).toBe(21_000);
  });

  it("強化に使ったゴールドの3割は、下げた★でも戻る", () => {
    const invested = accessoryEnhanceTotalCost(5, 1, 15);
    expect(accessorySellPrice(acc(5, "HERO", 15))).toBe(Math.round(14_000 + invested * 0.3));
  });
});
