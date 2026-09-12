import { describe, expect, it } from "vitest";
import { createInitialState, addMonster } from "../src/game/playerState.js";
import { depositMonsters, exchangeStoredMonstersForPoints, storableOwnedGroups, withdrawMonsters } from "../src/game/monsterStorage.js";

describe("monster storage", () => {
  it("stacks eligible level 1 monsters and restores fresh instances", () => {
    const state = createInitialState();
    addMonster(state, "slime_FIRE", 3, 1);
    addMonster(state, "slime_FIRE", 3, 1);
    expect(storableOwnedGroups(state).find((x) => x.dexId === "slime_FIRE" && x.star === 3)?.count).toBe(2);
    expect(depositMonsters(state, "slime_FIRE", 3, 2)).toBe(2);
    expect(state.monsterStorage?.[0]).toMatchObject({ dexId: "slime_FIRE", star: 3, count: 2 });
    expect(withdrawMonsters(state, "slime_FIRE", 3, 1)).toBe(1);
    expect(state.monsterStorage?.[0]?.count).toBe(1);
  });

  it("does not store locked or developed monsters", () => {
    const state = createInitialState();
    const locked = addMonster(state, "slime_FIRE", 3, 1);
    locked.locked = true;
    const developed = addMonster(state, "slime_FIRE", 3, 1);
    developed.development.abilityPoints.atk = 1;
    expect(depositMonsters(state, "slime_FIRE", 3, 99)).toBe(0);
  });

  it("marks withdrawn monsters as already observed so missions do not count them as summons", () => {
    const state = createInitialState() as ReturnType<typeof createInitialState> & {
      missionState?: { observed?: { monsters?: Record<string, { star: number; level: number }> } };
    };
    state.monsterStorage = [{ dexId: "slime_FIRE", star: 3, count: 2 }];
    state.missionState = { observed: { monsters: {} } };
    expect(withdrawMonsters(state, "slime_FIRE", 3, 2)).toBe(2);
    const restored = state.monsters.filter((monster) => monster.dexId === "slime_FIRE" && monster.star === 3);
    expect(restored).toHaveLength(2);
    for (const monster of restored) expect(state.missionState?.observed?.monsters?.[monster.id]).toEqual({ star: 3, level: 1 });
  });

  it("converts a chosen stored quantity directly into existing monster points", () => {
    const state = createInitialState();
    state.monsterStorage = [{ dexId: "slime_FIRE", star: 3, count: 10 }];
    state.monsterPoints = 7;
    expect(exchangeStoredMonstersForPoints(state, "slime_FIRE", 3, 4)).toEqual({ sent: 4, gained: 12, total: 19 });
    expect(state.monsterStorage?.[0]?.count).toBe(6);
  });
});
