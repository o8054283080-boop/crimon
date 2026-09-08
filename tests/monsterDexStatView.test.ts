import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeEffectiveStats } from "../src/core/rarity.js";
import { applyPlayerStatBoost } from "../src/core/playerStatBoost.js";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
import { findMonsterById } from "../src/data/monsters.js";

/**
 * 図鑑のステータスを★6でも見られるようにした。
 *
 * Lv1の基礎値しか出ていなかったので、**育て切ったらどうなるかが分からない**。
 * 図鑑は「引く前に決める」ための場所なので、そこがいちばん知りたいことになる。
 */

const SOURCE = readFileSync(new URL("../src/web/views/monsterDex.ts", import.meta.url), "utf8");

describe("図鑑の見方の切り替え", () => {
  it("Lv1と★6 Lv60の2つを持っている", () => {
    expect(SOURCE).toContain('BASE: "Lv1"');
    expect(SOURCE).toContain('MAX: "★6 Lv60"');
  });

  it("★6側はプレイヤー側の補正を通す", () => {
    // ここを外すと、図鑑の数字と手持ちの数字が食い違う
    expect(SOURCE).toContain("applyPlayerStatBoost(computeEffectiveStats(dex.stats, 6, 60), dex.templateId)");
  });

  /*
   * **浮かせない。**この案件では浮遊パネルで押せないボタンを3回作っている。
   * 切り替えの帯は画面の流れの中に置く。
   */
  it("切り替えの帯を浮かせていない", () => {
    const css = readFileSync(new URL("../src/web/ui/monsterDex.css", import.meta.url), "utf8");
    const rule = css.slice(css.indexOf(".monster-dex-detail__stat-switch {"));
    const block = rule.slice(0, rule.indexOf("}"));
    expect(block).not.toContain("position:fixed");
    expect(block).not.toContain("position:absolute");
  });

  it("注記も見方に合わせて変わる", () => {
    expect(SOURCE).toContain("表示値はLv1の基礎値です");
    expect(SOURCE).toContain("★6 Lv60・装備なしの値です");
  });
});

/**
 * **図鑑と手持ちで同じ数字が出ること。**
 *
 * 図鑑は星を渡さずに満額を掛ける(`playerStatBoostOf` の星なし呼び出し)。
 * 手持ちの★6は星を渡して満額になる。この2つが一致していないと、
 * 図鑑を見て引いたのに手持ちの数字が違う、という事故になる。
 */
describe("図鑑の★6と、手持ちの★6が一致する", () => {
  for (const id of ["dragon_FIRE", "fairy_WATER", "wolf_GRASS", "fenrir_DARK", "nemesis_ELECTRIC"]) {
    it(id, () => {
      const dex = findMonsterById(id)!;
      const fromDex = applyPlayerStatBoost(computeEffectiveStats(dex.stats, 6, 60), dex.templateId);
      const fromInstance = toBattleDefinition(createMonsterInstance(id, 6, 60), dex).stats;
      expect(fromDex.hp).toBe(fromInstance.hp);
      expect(fromDex.atk).toBe(fromInstance.atk);
      expect(fromDex.def).toBe(fromInstance.def);
      expect(fromDex.spd).toBe(fromInstance.spd);
    });
  }
});
