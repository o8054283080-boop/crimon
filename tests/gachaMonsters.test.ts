import { describe, expect, it } from "vitest";
import {
  GACHA_SR_COMMON_DEX,
  GACHA_SR_COMMON_TEMPLATE,
  GACHA_SR_RARE_DEX,
  GACHA_SR_RARE_TEMPLATE,
  GACHA_SSR_COMMON_DEX,
  GACHA_SSR_COMMON_TEMPLATE,
  GACHA_SSR_RARE_DEX,
  GACHA_SSR_RARE_TEMPLATE,
  findMonster,
} from "../src/data/monsters.js";

describe("ガチャ限定モンスター(SR/SSR)のelements制限", () => {
  it("通常枠(グリフォン・ドラゴン)は火水電草の4属性のみ生成される", () => {
    expect(GACHA_SR_COMMON_DEX).toHaveLength(4);
    expect(GACHA_SSR_COMMON_DEX).toHaveLength(4);
    for (const dex of [...GACHA_SR_COMMON_DEX, ...GACHA_SSR_COMMON_DEX]) {
      expect(["FIRE", "WATER", "ELECTRIC", "GRASS"]).toContain(dex.element);
    }
  });

  it("レア枠(セラフ・ネメシス)は光闇の2属性のみ生成される", () => {
    expect(GACHA_SR_RARE_DEX).toHaveLength(2);
    expect(GACHA_SSR_RARE_DEX).toHaveLength(2);
    for (const dex of [...GACHA_SR_RARE_DEX, ...GACHA_SSR_RARE_DEX]) {
      expect(["LIGHT", "DARK"]).toContain(dex.element);
    }
  });

  it("SSRはSRよりステータスが高い(同属性グループ内で比較)", () => {
    const sr = findMonster(GACHA_SR_COMMON_TEMPLATE.templateId, "FIRE")!;
    const ssr = findMonster(GACHA_SSR_COMMON_TEMPLATE.templateId, "FIRE")!;
    expect(ssr.stats.atk).toBeGreaterThan(sr.stats.atk);
    expect(ssr.stats.hp).toBeGreaterThan(sr.stats.hp);

    const srRare = findMonster(GACHA_SR_RARE_TEMPLATE.templateId, "LIGHT")!;
    const ssrRare = findMonster(GACHA_SSR_RARE_TEMPLATE.templateId, "LIGHT")!;
    expect(ssrRare.stats.atk).toBeGreaterThan(srRare.stats.atk);
  });

  it("光闇専用モンスターは同格の通常枠モンスターよりステータスが高い(素の基礎値で比較)", () => {
    expect(GACHA_SR_RARE_TEMPLATE.baseStats.hp).toBeGreaterThan(GACHA_SR_COMMON_TEMPLATE.baseStats.hp);
    expect(GACHA_SSR_RARE_TEMPLATE.baseStats.atk).toBeGreaterThan(GACHA_SSR_COMMON_TEMPLATE.baseStats.atk);
  });
});
