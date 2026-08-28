import { describe, expect, it } from "vitest";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";
import { generateEquipment } from "../src/core/equipment.js";
import { TUTORIAL_MISSIONS, claimTutorialMission, nextTutorialMission, tutorialMissionProgress } from "../src/game/tutorialMissions.js";

describe("30段階の初心者ロードマップ", () => {
  it("新規データはSTEP 1から始まり、順番を飛ばせない", () => {
    const player = createInitialState();
    expect(TUTORIAL_MISSIONS).toHaveLength(30);
    expect(nextTutorialMission(player)?.step).toBe(1);
    expect(claimTutorialMission(player, "tutorial-step-2")).toBe(false);
  });

  it("報酬は二重受取できない", () => {
    const player = createInitialState();
    player.clearedStageIds.push("stage-1");
    expect(claimTutorialMission(player, "tutorial-step-1")).toBe(true);
    const wallet = [player.gold, player.crystal];
    expect(claimTutorialMission(player, "tutorial-step-1")).toBe(false);
    expect([player.gold, player.crystal]).toEqual(wallet);
  });

  it("旧セーブにtutorialMissionsが無くても安全に補完する", () => {
    const old: Partial<ReturnType<typeof createInitialState>> = createInitialState();
    delete old.tutorialMissions;
    const loaded = normalizeLoadedState(old as ReturnType<typeof createInitialState>);
    expect(loaded.tutorialMissions).toEqual({ claimedIds: [], partyChanged: false, createOpened: false });
  });

  it("⑦版の受取済み件数を先頭STEPへ移行して再受取を防ぐ", () => {
    const old = createInitialState();
    old.tutorialMissions.claimedIds = ["first_battle", "level_up", "party_edit"];
    const loaded = normalizeLoadedState(old);
    expect(loaded.tutorialMissions.claimedIds).toEqual(expect.arrayContaining([
      "first_battle", "level_up", "party_edit", "tutorial-step-1", "tutorial-step-2", "tutorial-step-3",
    ]));
    expect(nextTutorialMission(loaded)?.step).toBe(4);
  });

  it("全報酬の合計を固定する", () => {
    const total = TUTORIAL_MISSIONS.reduce((sum, x) => ({
      gold: sum.gold + (x.reward.gold ?? 0), crystal: sum.crystal + (x.reward.crystal ?? 0),
      scrolls: sum.scrolls + (x.reward.summonScrolls ?? 0),
    }), { gold: 0, crystal: 0, scrolls: 0 });
    expect(total).toEqual({ gold: 1_387_000, crystal: 1_690, scrolls: 55 });
  });

  it.each([
    [10, "fourStarSummonScrolls", 1],
    [20, "lightDarkFourStarSummonScrolls", 1],
    [30, "fiveStarSummonScrolls", 1],
  ] as const)("STEP%d大型報酬は保存再読込後も一度だけ", (step, field, amount) => {
    const player = createInitialState();
    player.tutorialMissions.claimedIds = TUTORIAL_MISSIONS.slice(0, step - 1).map((mission) => mission.id);
    const mission = TUTORIAL_MISSIONS[step - 1];
    // 条件だけを満たす代わりにテスト対象の判定を差し替えず、必要な進捗を用意する。
    if (step === 10) { const equipment = generateEquipment({ star: 1, subStatCount: 0 }); equipment.level = 1; player.equipment.push(equipment); }
    if (step === 20) player.monsters[0].star = 5;
    if (step === 30) { player.monsters[0].star = 6; player.monsters[0].development.type = "ATTACK"; player.monsters[0].development.abilityPoints.hp = 1; }
    expect(claimTutorialMission(player, mission.id)).toBe(true);
    expect(player[field]).toBe(amount);
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(player)));
    expect(claimTutorialMission(loaded, mission.id)).toBe(false);
    expect(loaded[field]).toBe(amount);
  });

  it("STEP25まで★6育成、STEP26以降クリエイトの順序を維持する", () => {
    expect(TUTORIAL_MISSIONS.map((mission) => mission.step)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
    expect(TUTORIAL_MISSIONS[24].condition).toContain("★6");
    expect(TUTORIAL_MISSIONS.slice(25).map((mission) => mission.destination)).toContain("MONSTER_CREATE");
    expect(TUTORIAL_MISSIONS[25].destination).toBe("MONSTER_CREATE");
  });

  it("3種類クリア条件は既存のclearedStageIdsから途中進捗を表示する", () => {
    const player = createInitialState();
    const mission = TUTORIAL_MISSIONS[4];
    player.clearedStageIds = ["1-1_NORMAL", "1-2_NORMAL"];
    expect(tutorialMissionProgress(player, mission)).toEqual({ current: 2, target: 3 });
    player.clearedStageIds.push("1-3_NORMAL", "1-4_NORMAL");
    expect(tutorialMissionProgress(player, mission)).toEqual({ current: 3, target: 3 });
  });

  it("途中値を持たない条件は従来どおり0/1で表示する", () => {
    const player = createInitialState();
    const mission = TUTORIAL_MISSIONS[3];
    expect(tutorialMissionProgress(player, mission)).toEqual({ current: 0, target: 1 });
    player.tutorialMissions.partyChanged = true;
    expect(tutorialMissionProgress(player, mission)).toEqual({ current: 1, target: 1 });
  });
});
