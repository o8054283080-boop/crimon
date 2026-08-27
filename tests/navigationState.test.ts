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
  it.each(["STAGES", "MONSTERS", "EQUIPMENT"] as const)("restores %s", (screen) => {
    const storage = new MemoryStorage();
    saveNavigationState({ screen }, storage);
    expect(loadNavigationState(storage)).toEqual({ screen });
  });

  it("restores a monster detail target", () => {
    const storage = new MemoryStorage();
    saveNavigationState({ screen: "MONSTERS", monsterDetailId: "monster-1" }, storage);
    expect(loadNavigationState(storage)).toEqual({ screen: "MONSTERS", monsterDetailId: "monster-1" });
  });

  it.each([
    ["BATTLE", "STAGES"], ["DUNGEON_BATTLE", "EQUIP_DUNGEON"], ["ARENA_BATTLE", "ARENA"],
    ["TOWER_BATTLE", "TRIAL_TOWER"],
  ] as const)("falls back from %s to %s", (screen, parent) => expect(safeRestoredScreen(screen)).toBe(parent));

  it("rejects unknown and malformed saved routes", () => {
    const storage = new MemoryStorage();
    storage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({ screen: "REMOVED_SCREEN" }));
    expect(loadNavigationState(storage)).toBeNull();
    storage.setItem(NAVIGATION_STORAGE_KEY, "{");
    expect(loadNavigationState(storage)).toBeNull();
  });
});
