import { ScreenName } from "./views/bottomNav.js";

export const NAVIGATION_STORAGE_KEY = "crimon.ui.navigation.v1";

export interface NavigationState {
  screen: ScreenName;
  monsterDetailId?: string;
  equipmentDetailId?: string;
  selectedDexEntryId?: string;
  monsterTrainingTargetId?: string;
  createTargetId?: string;
  returnContext?: ReturnContext;
}

export interface ReturnContext {
  screen: ScreenName;
  label: string;
  selectedStageId?: string;
  selectedDifficulty?: string;
  selectedDungeonFloor?: number;
  selectedLevelDungeonTier?: string;
  selectedGoldDungeonFloor?: number;
}

export function isReturnContext(value: unknown): value is ReturnContext {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReturnContext>;
  return typeof candidate.screen === "string" && SCREENS.has(candidate.screen as ScreenName) && typeof candidate.label === "string";
}

const SCREENS = new Set<ScreenName>([
  "HOME", "SUMMON", "MONSTERS", "EQUIPMENT", "PARTY", "STAGES", "BATTLE", "STAGE_RESULT",
  "EQUIP_DUNGEON", "DUNGEON_BATTLE", "LEVEL_DUNGEON", "LEVEL_DUNGEON_BATTLE", "GOLD_DUNGEON",
  "GOLD_DUNGEON_BATTLE", "MONSTER_DEX", "SHOP", "MONSTER_TRAINING", "MONSTER_CREATE",
  "AUTO_FARM_RESULT", "ARENA", "ARENA_BATTLE", "TRIAL_TOWER", "TOWER_BATTLE", "HOW_TO_PLAY",
]);

/** 戦闘エンジンを復元せず、保存済みのゲーム進行から再開できる安全な親画面へ戻す。 */
export function safeRestoredScreen(screen: ScreenName): ScreenName {
  switch (screen) {
    case "BATTLE": return "STAGES";
    case "DUNGEON_BATTLE": return "EQUIP_DUNGEON";
    case "LEVEL_DUNGEON_BATTLE": return "LEVEL_DUNGEON";
    case "GOLD_DUNGEON_BATTLE": return "GOLD_DUNGEON";
    case "ARENA_BATTLE": return "ARENA";
    case "TOWER_BATTLE": return "TRIAL_TOWER";
    case "STAGE_RESULT":
    case "AUTO_FARM_RESULT": return "HOME";
    default: return screen;
  }
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
    return { ...value, screen: safeRestoredScreen(value.screen as ScreenName), returnContext: isReturnContext(value.returnContext) ? value.returnContext : undefined } as NavigationState;
  } catch {
    return null;
  }
}
