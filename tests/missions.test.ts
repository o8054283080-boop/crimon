import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/playerState.js";
import {
  claimPeriodClear,
  getCumulativeMissionViews,
  getPeriodMissionView,
  missionStateFor,
} from "../src/game/missions.js";
import { REINCARNATION_PIG, findMonsterById } from "../src/data/monsters.js";
import { STAR_MAX_LEVEL } from "../src/core/rarity.js";

const NOW = new Date("2026-09-01T00:30:00.000Z"); // JST 2026-09-01 09:30

function cumulative(player: ReturnType<typeof createInitialState>, key: string) {
  const view = getCumulativeMissionViews(player, NOW).find((mission) => mission.key === key);
  if (!view) throw new Error(`累計ミッションが見つかりません: ${key}`);
  return view;
}

describe("デイリー・ウィークリー・マンスリーミッション", () => {
  it("デイリーは全部ではなく4個達成でクリア報酬を受け取れる", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    // 初回同期でログイン1個が達成されるので、他に3条件を進めれば4個到達する。
    state.counters.levelsGained = 5;
    state.counters.shopPurchases = 1;
    state.counters.equipmentEnhancements = 3;
    const view = getPeriodMissionView(player, "DAILY", NOW);
    expect(view.completedCount).toBe(4);
    expect(view.missions).toHaveLength(6);
    expect(view.canClaimClear).toBe(true);
  });

  it("週間は6個、月間は7個でクリア扱いになる", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    Object.assign(state.counters, {
      loginDays: 25,
      levelsGained: 500,
      staminaSpent: 3_000,
      arenaBattles: 100,
      equipmentEnhancements: 100,
      shopPurchases: 30,
      rankUps: 10,
      summons: 100,
      star6Raised: 2,
    });
    const weekly = getPeriodMissionView(player, "WEEKLY", NOW);
    const monthly = getPeriodMissionView(player, "MONTHLY", NOW);
    expect(weekly.completedCount).toBeGreaterThanOrEqual(6);
    expect(weekly.requiredCount).toBe(6);
    expect(monthly.completedCount).toBeGreaterThanOrEqual(7);
    expect(monthly.requiredCount).toBe(7);
  });

  it("週間クリア報酬の覚醒オーブは1個で二重受取できない", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    Object.assign(state.counters, {
      loginDays: 5,
      levelsGained: 100,
      staminaSpent: 500,
      arenaBattles: 20,
      equipmentEnhancements: 20,
      shopPurchases: 10,
    });
    const before = player.awakeningOrbs;
    expect(claimPeriodClear(player, "WEEKLY", NOW)?.awakeningOrbs).toBe(1);
    expect(player.awakeningOrbs).toBe(before + 1);
    expect(claimPeriodClear(player, "WEEKLY", NOW)).toBeNull();
    expect(player.awakeningOrbs).toBe(before + 1);
  });

  it("デイリークリア報酬の★3転生ピッグはMAXレベルで入手する", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    Object.assign(state.counters, { levelsGained: 5, shopPurchases: 1, equipmentEnhancements: 3 });
    expect(claimPeriodClear(player, "DAILY", NOW)).not.toBeNull();
    const pig = player.monsters.find((monster) => findMonsterById(monster.dexId)?.templateId === REINCARNATION_PIG.templateId);
    expect(pig?.star).toBe(3);
    expect(pig?.level).toBe(STAR_MAX_LEVEL[3]);
  });
});

describe("上限なし累計ミッション", () => {
  it("召喚は500回の次から100回ごとに続く", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    state.cumulative.summons = { lastClaimedTarget: 500 };
    expect(cumulative(player, "summons").target).toBe(600);
    state.cumulative.summons.lastClaimedTarget = 600;
    expect(cumulative(player, "summons").target).toBe(700);
  });

  it("指定された短い間隔で次の累計目標が続く", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    state.cumulative.levels = { lastClaimedTarget: 500 };
    state.cumulative.rankups = { lastClaimedTarget: 25 };
    state.cumulative.star6 = { lastClaimedTarget: 25 };
    state.cumulative.arena = { lastClaimedTarget: 150 };
    state.cumulative.equipment = { lastClaimedTarget: 200 };
    expect(cumulative(player, "levels").target).toBe(1_000);
    expect(cumulative(player, "rankups").target).toBe(50);
    expect(cumulative(player, "star6").target).toBe(35);
    expect(cumulative(player, "arena").target).toBe(300);
    expect(cumulative(player, "equipment").target).toBe(400);
  });

  it("★6育成は25体以降10体ごと、50体ごとの大台報酬は別に続く", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    state.cumulative.star6 = { lastClaimedTarget: 25 };
    state.cumulative["star6-milestone"] = { lastClaimedTarget: 0 };
    expect(cumulative(player, "star6").target).toBe(35);
    expect(cumulative(player, "star6-milestone").target).toBe(50);
  });
});
