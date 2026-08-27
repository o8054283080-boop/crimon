import { describe, expect, it } from "vitest";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";
import { claimTutorialMission, currentTutorialMission, TUTORIAL_MISSIONS, tutorialMissionProgress } from "../src/game/tutorialMissions.js";

describe("初心者ミッション", () => {
  it("新規データは最初のミッションから始まり、未達成では受け取れない", () => {
    const state = createInitialState();
    expect(currentTutorialMission(state)?.id).toBe("clear_battle");
    expect(claimTutorialMission(state)).toBe(false);
  });

  it("報酬を一度だけ受け取り、次のミッションへ進む", () => {
    const state = createInitialState();
    state.clearedStageIds.push("stage-1");
    const before = state.gold;
    expect(claimTutorialMission(state)).toBe(true);
    expect(state.gold).toBe(before + 1000);
    expect(currentTutorialMission(state)?.id).toBe("level_up");
    expect(state.tutorialMissions.claimedIds).toEqual(["clear_battle"]);
    expect(claimTutorialMission(state)).toBe(false);
    expect(state.gold).toBe(before + 1000);
  });

  it("既存セーブの所持状態から過去の達成を判定する", () => {
    const state = createInitialState();
    delete (state as Partial<typeof state>).tutorialMissions;
    state.monsters[0].level = 12;
    state.monsters[0].star = 3;
    state.monsters[0].skillLevels[0] = 2;
    state.monsters[0].development.abilityPoints.atk = 1;
    state.equipment.push({ id: "old", slot: 1, star: 1, level: 2, set: "POWER", mainStat: { type: "ATK_FLAT", value: 1 }, subStats: [] });
    state.monsters[0].equipment[1] = "old";
    state.clearedDungeonFloors = [1, 2, 3];
    const loaded = normalizeLoadedState(state);
    for (const mission of ["level_up", "rank_three", "equip", "enhance_equipment", "ability", "skill", "challenge_equipment_dungeon", "clear_equipment_floor_3"] as const) {
      const definition = TUTORIAL_MISSIONS.find((item) => item.id === mission)!;
      expect(tutorialMissionProgress(loaded, definition)).toBeGreaterThanOrEqual(definition.target);
    }
  });
});
