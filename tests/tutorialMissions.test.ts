import { describe, expect, it } from "vitest";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";
import { TUTORIAL_MISSIONS, claimTutorialMission, nextTutorialMission } from "../src/game/tutorialMissions.js";

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
    expect(total).toEqual({ gold: 1_387_000, crystal: 1_690, scrolls: 25 });
  });
});
