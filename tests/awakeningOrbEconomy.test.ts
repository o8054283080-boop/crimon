import { describe, expect, it } from "vitest";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";
import { applyDungeonClearRewards } from "../src/game/rewards.js";
import { claimTowerFloorReward } from "../src/game/trialTower.js";
import { claimTutorialMission, TUTORIAL_MISSIONS } from "../src/game/tutorialMissions.js";

function prepareMission(step: number) {
  const state = createInitialState();
  state.tutorialMissions.claimedIds = TUTORIAL_MISSIONS.slice(0, step - 1).map((mission) => mission.id);
  if (step === 26) state.tutorialMissions.createOpened = true;
  if (step === 30) {
    state.monsters[0].star = 6;
    state.monsters[0].development.type = "ATTACK";
    state.monsters[0].development.abilityPoints.hp = 1;
  }
  return state;
}

describe("覚醒オーブの達成報酬", () => {
  it("初心者STEP26と全達成STEP30で1個ずつ受け取る", () => {
    const midway = prepareMission(26);
    expect(claimTutorialMission(midway, "tutorial-step-26")).toBe(true);
    expect(midway.awakeningOrbs).toBe(1);

    const complete = prepareMission(30);
    expect(claimTutorialMission(complete, "tutorial-step-30")).toBe(true);
    expect(complete.awakeningOrbs).toBe(1);
    expect(complete.fiveStarSummonScrolls).toBe(1);
  });

  it("装備ダンジョン10階は初回だけ1個付与する", () => {
    const state = createInitialState();
    const floor10 = EQUIPMENT_DUNGEON_FLOORS[9];
    applyDungeonClearRewards(state, floor10, state.monsters);
    expect(state.awakeningOrbs).toBe(1);
    applyDungeonClearRewards(state, floor10, state.monsters, () => 1);
    expect(state.awakeningOrbs).toBe(1);
  });

  it("30階建ての塔は15階と30階で各1個、同じ階では二重取得できない", () => {
    const state = createInitialState();
    expect(claimTowerFloorReward(state, 15).awakeningOrbs).toBe(1);
    expect(claimTowerFloorReward(state, 15).awakeningOrbs).toBe(0);
    expect(claimTowerFloorReward(state, 30).awakeningOrbs).toBe(1);
    expect(state.awakeningOrbs).toBe(2);
  });

  it("既存達成者へ追給し、再ロード後も所持数と受取印を維持する", () => {
    const legacy = createInitialState() as ReturnType<typeof createInitialState> & { claimedAwakeningOrbRewardIds?: string[] };
    legacy.tutorialMissions.claimedIds = TUTORIAL_MISSIONS.map((mission) => mission.id);
    legacy.clearedDungeonFloors = [10];
    legacy.trialTowerBestFloor = 30;
    delete (legacy as Partial<typeof legacy>).claimedAwakeningOrbRewardIds;

    const migrated = normalizeLoadedState(legacy);
    expect(migrated.awakeningOrbs).toBe(5);
    expect(migrated.claimedAwakeningOrbRewardIds).toHaveLength(5);

    const reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(migrated)));
    expect(reloaded.awakeningOrbs).toBe(5);
    expect(claimTowerFloorReward(reloaded, 15).awakeningOrbs).toBe(0);
    applyDungeonClearRewards(reloaded, EQUIPMENT_DUNGEON_FLOORS[9], reloaded.monsters);
    expect(reloaded.awakeningOrbs).toBe(5);
  });

  it("達成履歴のない旧セーブは0個で安全に補完する", () => {
    const legacy = createInitialState() as ReturnType<typeof createInitialState> & { claimedAwakeningOrbRewardIds?: string[] };
    delete (legacy as Partial<typeof legacy>).claimedAwakeningOrbRewardIds;
    const migrated = normalizeLoadedState(legacy);
    expect(migrated.awakeningOrbs).toBe(0);
    expect(migrated.claimedAwakeningOrbRewardIds).toEqual([]);
  });
});
