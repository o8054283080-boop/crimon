import { describe, expect, it } from "vitest";
import { BATTLE_SCREENS, bgmSceneOf } from "../src/web/audio/bgmScene.js";
import type { ScreenName } from "../src/web/views/bottomNav.js";

/**
 * 画面とBGMの対応。
 *
 * **足し忘れは音でしか気づけない。**目覚の深域の戦闘を足した時、
 * ここへ加え忘れて、その戦闘だけ拠点のBGMが流れていた。
 * 型もテストも通り、巡回でも拾えない(画面は正しく描かれている)。
 */

/**
 * 戦闘の画面の全部。**`bottomNav.ts` の `ScreenName` から手で写す。**
 *
 * 型から自動で取れないので、新しい戦闘画面を足した人がここも足すことになる。
 * 写し忘れた場合は下の「名前で拾う」テストが気づく。
 */
const KNOWN_BATTLE_SCREENS: ScreenName[] = [
  "BATTLE",
  "DUNGEON_BATTLE",
  "LEVEL_DUNGEON_BATTLE",
  "GOLD_DUNGEON_BATTLE",
  "ARENA_BATTLE",
  "TOWER_BATTLE",
  "AWAKENING_DEPTH_BATTLE",
];

describe("画面ごとのBGM", () => {
  it("戦闘の画面はすべて戦闘のBGM", () => {
    for (const screen of KNOWN_BATTLE_SCREENS) {
      expect(bgmSceneOf(screen), `${screen} が戦闘のBGMになっていない`).toBe("battle");
    }
  });

  it("戦闘以外は拠点のBGM", () => {
    const others: ScreenName[] = [
      "HOME", "STAGES", "PARTY", "MONSTERS", "EQUIPMENT", "SUMMON", "SHOP",
      "MONSTER_CREATE", "MONSTER_TRAINING", "AWAKENING_DEPTH", "TRIAL_TOWER", "ARENA",
    ];
    for (const screen of others) {
      expect(bgmSceneOf(screen), `${screen} が拠点のBGMになっていない`).toBe("home");
    }
  });

  /*
   * **名前で拾う。**`_BATTLE` で終わる画面は戦闘のはずで、
   * 一覧から漏れていれば「戦闘なのに拠点のBGM」になる。
   * 例外を作りたくなったら、その理由をここへ書くこと。
   */
  it("名前が `_BATTLE` で終わる画面は、ひとつ残らず一覧に入っている", () => {
    const missing = KNOWN_BATTLE_SCREENS.filter((s) => !BATTLE_SCREENS.has(s));
    expect(missing, `戦闘のBGMになっていない画面: ${missing.join(", ")}`).toEqual([]);
    for (const screen of BATTLE_SCREENS) {
      expect(screen.endsWith("_BATTLE") || screen === "BATTLE", `${screen} は戦闘の画面ではない`).toBe(true);
    }
  });
});
