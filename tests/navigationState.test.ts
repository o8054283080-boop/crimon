import { describe, expect, it } from "vitest";
import { loadNavigationState, NAVIGATION_STORAGE_KEY, safeRestoredScreen, saveNavigationState } from "../src/web/navigationState.js";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

describe("navigation state", () => {
  it.each([
    "HOME", "STAGES", "MONSTERS", "EQUIPMENT", "PARTY", "SHOP", "MONSTER_TRAINING", "MONSTER_CREATE",
    "BATTLE", "DUNGEON_BATTLE", "ARENA_BATTLE", "TOWER_BATTLE", "STAGE_RESULT", "AUTO_FARM_RESULT",
  ] as const)("cold-starts from HOME instead of restoring %s", (screen) => {
    const storage = new MemoryStorage();
    saveNavigationState({ screen }, storage);
    expect(loadNavigationState(storage)).toEqual({ screen: "HOME" });
    expect(safeRestoredScreen(screen)).toBe("HOME");
  });

  it("drops transient detail and return context on cold start", () => {
    const storage = new MemoryStorage();
    saveNavigationState({
      screen: "EQUIPMENT",
      monsterDetailId: "monster-1",
      equipmentDetailId: "equipment-1",
      returnContext: { screen: "EQUIP_DUNGEON", label: "装備ダンジョン10F", selectedDungeonFloor: 10 },
    }, storage);
    expect(loadNavigationState(storage)).toEqual({ screen: "HOME" });
  });

  it("旧形式や壊れたreturn contextでも安全なHOMEへ戻す", () => {
    const storage = new MemoryStorage();
    storage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({ screen: "PARTY", returnContext: { screen: "REMOVED", label: 7 } }));
    expect(loadNavigationState(storage)).toEqual({ screen: "HOME" });
  });

  it("rejects unknown and malformed saved routes", () => {
    const storage = new MemoryStorage();
    storage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({ screen: "REMOVED_SCREEN" }));
    expect(loadNavigationState(storage)).toBeNull();
    storage.setItem(NAVIGATION_STORAGE_KEY, "{");
    expect(loadNavigationState(storage)).toBeNull();
  });
});
