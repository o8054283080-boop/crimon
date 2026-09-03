import { describe, expect, it } from "vitest";
import { STAR_MAX_LEVEL } from "../src/core/rarity.js";
import { EXP_PIG, REINCARNATION_PIG, findMonsterById } from "../src/data/monsters.js";
import { claimCompensations, COMPENSATIONS } from "../src/game/compensation.js";
import {
  RELEASE_CAMPAIGN_MILESTONES,
  RELEASE_CAMPAIGN_MISSIONS,
  claimReleaseCampaignMilestone,
  claimReleaseCampaignMission,
  getReleaseCampaignView,
  missionStateFor,
  recordMissionProgress,
} from "../src/game/missions.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";

const DURING = new Date("2026-09-03T03:00:00.000Z"); // 日本時間 9/3 12:00
const AFTER = new Date("2026-10-03T15:00:00.000Z"); // 日本時間 10/4 00:00

describe("X公開記念プレゼント", () => {
  const gift = COMPENSATIONS.find((entry) => entry.id === "2026-09-03-x-release-gift")!;

  it("期間中にダイヤ2,000・50万G・召喚の書10枚を1度だけ配る", () => {
    const player = createInitialState();
    for (const entry of COMPENSATIONS) if (entry.id !== gift.id) player.claimedCompensationIds.push(entry.id);
    const before = { crystal: player.crystal, gold: player.gold, scrolls: player.summonScrolls };

    expect(claimCompensations(player, DURING).map((claim) => claim.compensation.id)).toEqual([gift.id]);
    expect(player.crystal).toBe(before.crystal + 2_000);
    expect(player.gold).toBe(before.gold + 500_000);
    expect(player.summonScrolls).toBe(before.scrolls + 10);
    expect(claimCompensations(player, DURING)).toHaveLength(0);

    const reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(player)));
    expect(claimCompensations(reloaded, DURING)).toHaveLength(0);
  });

  it("1週間の配布期間を過ぎると受け取れない", () => {
    const player = createInitialState();
    expect(claimCompensations(player, new Date("2026-09-10T15:00:00.000Z")).some((claim) => claim.compensation.id === gift.id)).toBe(false);
  });
});

describe("1か月限定の公開記念ミッション", () => {
  it("30ミッションと10・20・25・30個の節目報酬を定義する", () => {
    expect(RELEASE_CAMPAIGN_MISSIONS).toHaveLength(30);
    expect(RELEASE_CAMPAIGN_MILESTONES.map((entry) => entry.target)).toEqual([10, 20, 25, 30]);
    expect(RELEASE_CAMPAIGN_MILESTONES[2].reward).toMatchObject({
      reincarnationPig4: 1,
      gold: 1_000_000,
      lightDarkFourStarSummonScrolls: 1,
    });
    expect(RELEASE_CAMPAIGN_MILESTONES[3].reward).toMatchObject({
      lightDarkFourStarSummonScrolls: 1,
      crystal: 1_000,
      fiveStarSummonScrolls: 1,
    });
  });

  it("開始日のログインを1日目として数え、終了後は表示・受取できない", () => {
    const player = createInitialState();
    const during = getReleaseCampaignView(player, DURING)!;
    expect(during.missions[0]).toMatchObject({ current: 1, complete: true, claimed: false });
    expect(getReleaseCampaignView(player, AFTER)).toBeNull();
    expect(claimReleaseCampaignMission(player, during.missions[0].id, AFTER)).toBeNull();
  });

  it("ダンジョンクリアだけを1回ずつ公開記念の進捗へ加える", () => {
    const player = createInitialState();
    getReleaseCampaignView(player, DURING);
    recordMissionProgress(player, "dungeonClears", 19, DURING);
    expect(getReleaseCampaignView(player, DURING)!.missions.find((entry) => entry.id === "release-dungeon-20")?.current).toBe(19);
    recordMissionProgress(player, "dungeonClears", 1, DURING);
    expect(getReleaseCampaignView(player, DURING)!.missions.find((entry) => entry.id === "release-dungeon-20")?.complete).toBe(true);
  });

  it("経験ピッグ報酬は指定の星のMAXレベルで、保存後も二重受取できない", () => {
    const player = createInitialState();
    getReleaseCampaignView(player, DURING);
    const state = missionStateFor(player, DURING);
    state.counters.levelsGained = state.releaseCampaign!.baseline.levelsGained + 20;

    expect(claimReleaseCampaignMission(player, "release-level-20", DURING)?.expPig3).toBe(2);
    const pigs = player.monsters.filter((monster) => findMonsterById(monster.dexId)?.templateId === EXP_PIG.templateId);
    expect(pigs).toHaveLength(2);
    expect(pigs.every((pig) => pig.star === 3 && pig.level === STAR_MAX_LEVEL[3])).toBe(true);
    expect(claimReleaseCampaignMission(player, "release-level-20", DURING)).toBeNull();

    const reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(player)));
    expect(claimReleaseCampaignMission(reloaded, "release-level-20", DURING)).toBeNull();
  });

  it("25個達成報酬を一度だけ付与する", () => {
    const player = createInitialState();
    getReleaseCampaignView(player, DURING);
    const state = missionStateFor(player, DURING);
    for (const key of Object.keys(state.counters) as (keyof typeof state.counters)[]) {
      state.counters[key] = state.releaseCampaign!.baseline[key] + 10_000;
    }
    player.trialTowerBestFloor = 30;
    player.equipment.push({ id: "release-max", star: 6, level: 15 } as never);
    expect(getReleaseCampaignView(player, DURING)!.completedCount).toBe(30);

    const before = { gold: player.gold, lightDark: player.lightDarkFourStarSummonScrolls };
    expect(claimReleaseCampaignMilestone(player, 25, DURING)).toMatchObject({ lightDarkFourStarSummonScrolls: 1 });
    expect(player.gold).toBe(before.gold + 1_000_000);
    expect(player.lightDarkFourStarSummonScrolls).toBe(before.lightDark + 1);
    const pig = player.monsters.find((monster) => findMonsterById(monster.dexId)?.templateId === REINCARNATION_PIG.templateId);
    expect(pig).toMatchObject({ star: 4, level: STAR_MAX_LEVEL[4] });
    expect(claimReleaseCampaignMilestone(player, 25, DURING)).toBeNull();
  });
});
