import { describe, expect, it } from "vitest";
import { ELEMENTS } from "../src/core/element.js";
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

describe("ガチャ限定モンスター(SR/SSR)の全属性対応", () => {
  it("グリフォン・ドラゴン・セラフ・ネメシスはすべて全6属性で生成される", () => {
    expect(GACHA_SR_COMMON_DEX).toHaveLength(ELEMENTS.length);
    expect(GACHA_SSR_COMMON_DEX).toHaveLength(ELEMENTS.length);
    expect(GACHA_SR_RARE_DEX).toHaveLength(ELEMENTS.length);
    expect(GACHA_SSR_RARE_DEX).toHaveLength(ELEMENTS.length);
    for (const dex of [...GACHA_SR_COMMON_DEX, ...GACHA_SSR_COMMON_DEX, ...GACHA_SR_RARE_DEX, ...GACHA_SSR_RARE_DEX]) {
      expect(ELEMENTS).toContain(dex.element);
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

  it("セラフ/ネメシスは同格のグリフォン/ドラゴンよりステータスが高い(素の基礎値で比較)", () => {
    expect(GACHA_SR_RARE_TEMPLATE.baseStats.hp).toBeGreaterThan(GACHA_SR_COMMON_TEMPLATE.baseStats.hp);
    expect(GACHA_SSR_RARE_TEMPLATE.baseStats.atk).toBeGreaterThan(GACHA_SSR_COMMON_TEMPLATE.baseStats.atk);
  });
});
