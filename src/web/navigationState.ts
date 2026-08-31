import { ScreenName } from "./views/bottomNav.js";
import { DIFFICULTIES } from "../data/stages.js";
import { LEVEL_DUNGEON_TIERS } from "../data/levelDungeon.js";
import type { DungeonReturnContext } from "./uxHelpers.js";

export const NAVIGATION_STORAGE_KEY = "crimon.ui.navigation.v1";

export interface NavigationState {
  screen: ScreenName;
  monsterDetailId?: string;
  equipmentDetailId?: string;
  selectedDexEntryId?: string;
  monsterTrainingTargetId?: string;
  createTargetId?: string;
  returnContext?: DungeonReturnContext;
}

export function isReturnContext(value: unknown): value is DungeonReturnContext {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DungeonReturnContext>;
  return typeof candidate.screen === "string" && SCREENS.has(candidate.screen as ScreenName)
    && typeof candidate.label === "string"
    && (candidate.selectedDifficulty === undefined || DIFFICULTIES.includes(candidate.selectedDifficulty))
    && (candidate.selectedLevelDungeonTier === undefined || LEVEL_DUNGEON_TIERS.includes(candidate.selectedLevelDungeonTier));
}

const SCREENS = new Set<ScreenName>([
  "HOME", "SUMMON", "MONSTERS", "EQUIPMENT", "PARTY", "STAGES", "BATTLE", "STAGE_RESULT",
  "EQUIP_DUNGEON", "DUNGEON_BATTLE", "LEVEL_DUNGEON", "LEVEL_DUNGEON_BATTLE", "GOLD_DUNGEON",
  "GOLD_DUNGEON_BATTLE", "MONSTER_DEX", "SHOP", "MONSTER_TRAINING", "MONSTER_CREATE",
  "AUTO_FARM_RESULT", "ARENA", "ARENA_BATTLE", "TRIAL_TOWER", "TOWER_BATTLE", "HOW_TO_PLAY",
]);

/**
 * 完全終了・再読込後は必ずHOMEから始める。
 *
 * 画面位置はゲーム進行ではないため、古いUI状態や途中の編集状態を復元して
 * 操作不能画面へ張り付く危険を負うより、常に安全なHOMEへ戻す。
 * バックグラウンドからの通常復帰ではページ自体が再読込されないので、
 * 遊んでいる最中の画面はそのまま維持される。
 */
export function safeRestoredScreen(_screen: ScreenName): ScreenName {
  return "HOME";
}

export function saveNavigationState(value: NavigationState, storage: Storage = localStorage): void {
  try { storage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(value)); } catch { /* UI位置の保存失敗はゲーム本体を止めない */ }
}

export function loadNavigationState(storage: Storage = localStorage): NavigationState | null {
  try {
    const raw = storage.getItem(NAVIGATION_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<NavigationState>;
    if (typeof value.screen !== "string" || !SCREENS.has(value.screen as ScreenName)) return null;

    // UIの途中状態は本体セーブではない。完全終了後に復元しないことで、
    // 壊れた詳細画面・編成画面・古い画面状態による起動ループを防ぐ。
    return { screen: "HOME" };
  } catch {
    return null;
  }
}
