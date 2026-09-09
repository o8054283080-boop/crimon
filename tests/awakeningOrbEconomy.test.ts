import { describe, expect, it } from "vitest";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";
import { applyDungeonClearRewards } from "../src/game/rewards.js";
import { claimTowerFloorReward } from "../src/game/trialTower.js";
import { claimTutorialMission, TUTORIAL_MISSIONS } from "../src/game/tutorialMissions.js";

describe("覚醒オーブの達成報酬", () => {
  it("80個版初心者ミッションではSTEP60とSTEP64に1個ずつ配置する", () => {
    expect(TUTORIAL_MISSIONS[59].reward.awakeningOrbs).toBe(1);
    expect(TUTORIAL_MISSIONS[63].reward.awakeningOrbs).toBe(1);
  });

  it("STEP60は一本道の受取と二重取得防止が機能する", () => {
    const state = createInitialState();
    state.tutorialMissions.claimedIds = TUTORIAL_MISSIONS.slice(0, 59).map((mission) => mission.id);
    state.monsters[0].development.type = "ATTACK";
    expect(claimTutorialMission(state, "beginner-step-060")).toBe(true);
    expect(state.awakeningOrbs).toBe(1);
    expect(claimTutorialMission(state, "beginner-step-060")).toBe(false);
    expect(state.awakeningOrbs).toBe(1);
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

  it("旧30件版の達成者への追給は新80件導入後も失わない", () => {
    const legacy = createInitialState() as ReturnType<typeof createInitialState> & { claimedAwakeningOrbRewardIds?: string[] };
    legacy.tutorialMissions.claimedIds = ["tutorial-step-26", "tutorial-step-30"];
    legacy.clearedDungeonFloors = [10];
    legacy.trialTowerBestFloor = 30;
    delete (legacy as Partial<typeof legacy>).claimedAwakeningOrbRewardIds;

    const migrated = normalizeLoadedState(legacy);
    expect(migrated.awakeningOrbs).toBe(5);
    expect(migrated.claimedAwakeningOrbRewardIds).toHaveLength(5);

    const reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(migrated)));
    expect(reloaded.awakeningOrbs).toBe(5);
    // 恒久の旧「初回」印とは別に、導入月の月間報酬を受け取れる。
    expect(claimTowerFloorReward(reloaded, 15).awakeningOrbs).toBe(1);
    applyDungeonClearRewards(reloaded, EQUIPMENT_DUNGEON_FLOORS[9], reloaded.monsters);
    expect(reloaded.awakeningOrbs).toBe(6);
  });

  it("達成履歴のない旧セーブは0個で安全に補完する", () => {
    const legacy = createInitialState() as ReturnType<typeof createInitialState> & { claimedAwakeningOrbRewardIds?: string[] };
    delete (legacy as Partial<typeof legacy>).claimedAwakeningOrbRewardIds;
    const migrated = normalizeLoadedState(legacy);
    expect(migrated.awakeningOrbs).toBe(0);
    expect(migrated.claimedAwakeningOrbRewardIds).toEqual([]);
  });
});
