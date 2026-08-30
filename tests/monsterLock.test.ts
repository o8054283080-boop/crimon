import { describe, expect, it } from "vitest";
import { createInitialState, normalizeLoadedState, setMonsterLocked } from "../src/game/playerState.js";

describe("モンスターロック", () => {
  it("切り替えた状態を保存・再読込後も維持する", () => {
    const state = createInitialState();
    const target = state.monsters[0];
    expect(setMonsterLocked(state, target.id, true)).toBe(true);

    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)));
    expect(loaded.monsters[0].locked).toBe(true);
    expect(setMonsterLocked(loaded, target.id, false)).toBe(true);
    expect(loaded.monsters[0].locked).toBe(false);
  });

  it("古いセーブの未設定値と欠損IDを安全に扱う", () => {
    const state = createInitialState();
    delete state.monsters[0].locked;
    expect(normalizeLoadedState(state).monsters[0].locked).toBe(false);
    expect(setMonsterLocked(state, "missing", true)).toBe(false);
  });
});
