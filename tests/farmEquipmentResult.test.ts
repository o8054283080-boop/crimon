import { describe, expect, it } from "vitest";
import { equipmentSellPrice, generateEquipment } from "../src/core/equipment.js";
import { emptyResult, mergeReward } from "../src/game/autoFarm.js";
import { createInitialState, normalizeLoadedState, sellEquipment, setEquipmentLocked } from "../src/game/playerState.js";
import type { ClearRewardResult } from "../src/game/rewards.js";

function rewardWithEquipment(idSuffix: number): ClearRewardResult {
  const equipment = generateEquipment({ slot: ((idSuffix % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6, star: 5, subStatCount: 2 });
  return { goldEarned: 0, crystalEarned: 0, expTotal: 0, levelUps: [], expAwards: [], dropDexId: null, dropStar: null, equipmentDrop: equipment, pigDrop: null, summonScrollDropped: false, fighterLevelsGained: 0 };
}

describe("周回で獲得済みの装備ID追跡", () => {
  it("1周分の正式報酬に含まれる装備IDだけを記録する", () => {
    const result = emptyResult();
    const reward = rewardWithEquipment(1);
    mergeReward(result, reward, 0);
    expect(result.earnedEquipmentIds).toEqual([reward.equipmentDrop!.id]);
    expect(result.equipmentDropCount).toBe(1);
  });

  it("10周分を追跡しても装備を生成・追加せずIDを10件集計する", () => {
    const result = emptyResult();
    const rewards = Array.from({ length: 10 }, (_, index) => rewardWithEquipment(index));
    rewards.forEach((reward) => mergeReward(result, reward, 0));
    expect(result.earnedEquipmentIds).toEqual(rewards.map((reward) => reward.equipmentDrop!.id));
    expect(result.earnedEquipmentIds).toHaveLength(10);
  });

  it("ID一覧のない旧セーブを空配列として復旧する", () => {
    const state = createInitialState();
    state.backgroundFarmJob = {
      id: "old", kind: "EQUIP_DUNGEON", targetId: "9", targetName: "9階", requestedRuns: 1, completedRuns: 1,
      startedAt: 0, lastProcessedAt: 0, referenceRunSeconds: 150, referenceFromManual: false, sessionDate: "2026-01-01",
      partyIds: [], status: "COMPLETED", stopReason: "COMPLETED", staminaSpent: 10, result: emptyResult(), inFlight: false,
    };
    delete state.backgroundFarmJob.result.earnedEquipmentIds;
    expect(normalizeLoadedState(state).backgroundFarmJob!.result.earnedEquipmentIds).toEqual([]);
  });
});

describe("装備ロックと二重売却防止", () => {
  it("ロック状態を正式PlayerStateへ保存し売却を拒否する", () => {
    const state = createInitialState();
    const equipment = generateEquipment({ slot: 1, star: 5, subStatCount: 2 });
    state.equipment.push(equipment);
    expect(setEquipmentLocked(state, equipment.id, true)).toBe(true);
    expect(normalizeLoadedState(state).equipment[0].locked).toBe(true);
    expect(sellEquipment(state, equipment.id)).toMatchObject({ ok: false, goldEarned: 0 });
  });

  it("売却済みIDは再売却できずゴールドを二重加算しない", () => {
    const state = createInitialState();
    const equipment = generateEquipment({ slot: 2, star: 4, subStatCount: 1 });
    state.equipment.push(equipment);
    const before = state.gold;
    expect(sellEquipment(state, equipment.id).ok).toBe(true);
    expect(state.gold).toBe(before + equipmentSellPrice(equipment));
    expect(sellEquipment(state, equipment.id).ok).toBe(false);
    expect(state.gold).toBe(before + equipmentSellPrice(equipment));
  });
});
