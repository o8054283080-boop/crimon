import { describe, expect, it } from "vitest";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";
import {
  TUTORIAL_CHAPTER_TITLES,
  TUTORIAL_MISSIONS,
  claimTutorialMission,
  nextTutorialMission,
  tutorialChapterViews,
  tutorialMissionProgress,
} from "../src/game/tutorialMissions.js";

describe("10章80個の初心者ロードマップ", () => {
  it("全10章×8個でSTEP1〜80が連番になっている", () => {
    expect(TUTORIAL_CHAPTER_TITLES).toHaveLength(10);
    expect(TUTORIAL_MISSIONS).toHaveLength(80);
    expect(TUTORIAL_MISSIONS.map((mission) => mission.step)).toEqual(Array.from({ length: 80 }, (_, index) => index + 1));
    for (let chapter = 1; chapter <= 10; chapter += 1) {
      expect(TUTORIAL_MISSIONS.filter((mission) => mission.chapter === chapter)).toHaveLength(8);
    }
  });

  it("新規データはSTEP1から始まり、順番を飛ばせない", () => {
    const player = createInitialState();
    expect(nextTutorialMission(player)?.step).toBe(1);
    expect(claimTutorialMission(player, "beginner-step-002")).toBe(false);
  });

  it("報酬は二重受取できない", () => {
    const player = createInitialState();
    expect(claimTutorialMission(player, "beginner-step-001")).toBe(true);
    const wallet = [player.gold, player.crystal, player.summonScrolls];
    expect(claimTutorialMission(player, "beginner-step-001")).toBe(false);
    expect([player.gold, player.crystal, player.summonScrolls]).toEqual(wallet);
  });

  it("旧セーブにtutorialMissionsが無くても安全に補完する", () => {
    const old: Partial<ReturnType<typeof createInitialState>> = createInitialState();
    delete old.tutorialMissions;
    const loaded = normalizeLoadedState(old as ReturnType<typeof createInitialState>);
    expect(loaded.tutorialMissions).toEqual({ claimedIds: [], partyChanged: false, createOpened: false });
  });

  it("旧30件の受取印を保持しつつ、新80件はSTEP1から始められる", () => {
    const old = createInitialState();
    old.tutorialMissions.claimedIds = ["tutorial-step-1", "tutorial-step-2", "tutorial-step-30"];
    const loaded = normalizeLoadedState(old);
    expect(loaded.tutorialMissions.claimedIds).toEqual(expect.arrayContaining(["tutorial-step-1", "tutorial-step-2", "tutorial-step-30"]));
    expect(nextTutorialMission(loaded)?.step).toBe(1);
  });

  it("豪華報酬の総量を固定し、通常召喚書を十分配る", () => {
    const total = TUTORIAL_MISSIONS.reduce((sum, mission) => ({
      gold: sum.gold + (mission.reward.gold ?? 0),
      crystal: sum.crystal + (mission.reward.crystal ?? 0),
      scrolls: sum.scrolls + (mission.reward.summonScrolls ?? 0),
      fourStar: sum.fourStar + (mission.reward.fourStarSummonScrolls ?? 0),
      lightDark: sum.lightDark + (mission.reward.lightDarkFourStarSummonScrolls ?? 0),
      fiveStar: sum.fiveStar + (mission.reward.fiveStarSummonScrolls ?? 0),
    }), { gold: 0, crystal: 0, scrolls: 0, fourStar: 0, lightDark: 0, fiveStar: 0 });
    expect(total).toEqual({ gold: 5_400_000, crystal: 5_625, scrolls: 245, fourStar: 5, lightDark: 2, fiveStar: 1 });
  });

  it("経験ピッグ報酬は★5・★6だけを使う", () => {
    const expPigRewards = TUTORIAL_MISSIONS.flatMap((mission) => [mission.reward.expPig5 ?? 0, mission.reward.expPig6 ?? 0]);
    expect(expPigRewards.some((count) => count > 0)).toBe(true);
    expect(TUTORIAL_MISSIONS.some((mission) => "expPig3" in mission.reward || "expPig4" in mission.reward)).toBe(false);
  });

  it("各章の8件目に章クリア報酬が入り、別の受取フラグを必要としない", () => {
    for (let step = 8; step <= 80; step += 8) {
      const mission = TUTORIAL_MISSIONS[step - 1];
      expect(mission.chapter).toBe(step / 8);
      expect(Object.keys(mission.reward).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("章表示は現在の一本道進行と同期する", () => {
    const player = createInitialState();
    player.tutorialMissions.claimedIds = TUTORIAL_MISSIONS.slice(0, 8).map((mission) => mission.id);
    const chapters = tutorialChapterViews(player);
    expect(chapters[0]).toMatchObject({ chapter: 1, claimed: 8, complete: true, active: false });
    expect(chapters[1]).toMatchObject({ chapter: 2, claimed: 0, complete: false, active: true });
  });

  it("途中値を持つ条件は現在状態から遡及して表示する", () => {
    const player = createInitialState();
    const mission = TUTORIAL_MISSIONS[1]; // パーティ4体
    player.partyIds = player.monsters.slice(0, 2).map((monster) => monster.id);
    expect(tutorialMissionProgress(player, mission)).toEqual({ current: 2, target: 4 });
    player.partyIds = player.monsters.slice(0, 4).map((monster) => monster.id);
    expect(tutorialMissionProgress(player, mission)).toEqual({ current: 4, target: 4 });
  });

  it("途中値を持たない条件は0/1で表示する", () => {
    const player = createInitialState();
    const mission = TUTORIAL_MISSIONS[2]; // 1-1
    expect(tutorialMissionProgress(player, mission)).toEqual({ current: 0, target: 1 });
    player.clearedStageIds.push("1-1");
    expect(tutorialMissionProgress(player, mission)).toEqual({ current: 1, target: 1 });
  });

  it("最終STEP80には★5召喚書を含む卒業報酬がある", () => {
    const finalMission = TUTORIAL_MISSIONS[79];
    expect(finalMission.reward.fiveStarSummonScrolls).toBe(1);
    expect(finalMission.reward.expPig6).toBeGreaterThanOrEqual(1);
    expect(finalMission.reward.reincarnationPig5).toBeGreaterThanOrEqual(1);
  });
});
