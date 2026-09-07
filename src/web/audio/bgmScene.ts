import type { ScreenName } from "../views/bottomNav.js";
import type { BgmScene } from "./bgm.js";

/**
 * 画面ごとに敷くBGMの場面。
 *
 * **main.ts から切り出してある。**あちらに置いていた時、
 * 目覚の深域の戦闘を足したのに一覧へ加え忘れ、
 * **その戦闘だけ拠点のBGMが流れていた。**
 * ここに置けばテストから触れるので、名前に `BATTLE` を持つ画面が
 * 漏れていないかを機械的に見張れる(`tests/bgmScene.test.ts`)。
 *
 * 焼いてあるのは拠点と戦闘の2つ(戦闘はボス戦で差し替わる)。
 * 場面をこれ以上刻んでも、中身の差を作れなければ切り替わりが目立つだけ。
 */
export const BATTLE_SCREENS: ReadonlySet<ScreenName> = new Set<ScreenName>([
  "BATTLE",
  "DUNGEON_BATTLE",
  "LEVEL_DUNGEON_BATTLE",
  "GOLD_DUNGEON_BATTLE",
  "ARENA_BATTLE",
  "TOWER_BATTLE",
  "AWAKENING_DEPTH_BATTLE",
]);

export function bgmSceneOf(screen: ScreenName): BgmScene {
  return BATTLE_SCREENS.has(screen) ? "battle" : "home";
}
