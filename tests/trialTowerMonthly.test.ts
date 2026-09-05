import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState, ensureTowerMonthlyState, normalizeLoadedState, towerSeasonKeyAt } from "../src/game/playerState.js";
import { claimTowerFloorReward } from "../src/game/trialTower.js";

const AUGUST = new Date("2026-08-31T14:59:59.999Z");
const SEPTEMBER = new Date("2026-08-31T15:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("試練の塔のJST月間シーズン", () => {
  it("JSTの毎月1日00:00を境にYYYY-MMを切り替える", () => {
    expect(towerSeasonKeyAt(AUGUST)).toBe("2026-08");
    expect(towerSeasonKeyAt(SEPTEMBER)).toBe("2026-09");
  });

  it("同月は維持し、翌月は塔だけを1階からに戻す", () => {
    const state = createInitialState();
    state.trialTowerSeason = "2026-08";
    state.trialTowerBestFloor = 20;
    state.trialTowerLifetimeBestFloor = 73;
    state.trialTowerClaimedFloors = [1, 15, 20];
    state.trialTowerMonthlyOrbClaimedFloors = [15];
    state.awakeningOrbs = 7;
    state.gold = 12345;
    const monsters = JSON.stringify(state.monsters);
    const equipment = JSON.stringify(state.equipment);

    expect(ensureTowerMonthlyState(state, AUGUST)).toBe(false);
    expect(state.trialTowerBestFloor).toBe(20);
    expect(ensureTowerMonthlyState(state, SEPTEMBER)).toBe(true);
    expect(state).toMatchObject({
      trialTowerSeason: "2026-09",
      trialTowerBestFloor: 0,
      trialTowerLifetimeBestFloor: 73,
      trialTowerClaimedFloors: [],
      trialTowerMonthlyOrbClaimedFloors: [],
      trialTowerRun: null,
      awakeningOrbs: 7,
      gold: 12345,
    });
    expect(JSON.stringify(state.monsters)).toBe(monsters);
    expect(JSON.stringify(state.equipment)).toBe(equipment);
  });

  it("15階と30階を各月1回だけ受け取り、翌月は再取得できる", () => {
    vi.useFakeTimers();
    vi.setSystemTime(AUGUST);
    const state = createInitialState();
    state.trialTowerSeason = "2026-08";
    expect(claimTowerFloorReward(state, 15).awakeningOrbs).toBe(1);
    expect(claimTowerFloorReward(state, 15).awakeningOrbs).toBe(0);
    expect(claimTowerFloorReward(state, 30).awakeningOrbs).toBe(1);
    expect(state.awakeningOrbs).toBe(2);

    vi.setSystemTime(SEPTEMBER);
    expect(ensureTowerMonthlyState(state, SEPTEMBER)).toBe(true);
    expect(claimTowerFloorReward(state, 15).awakeningOrbs).toBe(1);
    expect(claimTowerFloorReward(state, 30).awakeningOrbs).toBe(1);
    expect(state.awakeningOrbs).toBe(4);
  });

  it("新フィールドのない旧セーブを既存データを保ったまま補完する", () => {
    const legacy = createInitialState() as any;
    legacy.trialTowerBestFloor = 20;
    delete legacy.trialTowerSeason;
    delete legacy.trialTowerMonthlyOrbClaimedFloors;
    delete legacy.trialTowerLifetimeBestFloor;
    const loaded = normalizeLoadedState(legacy, SEPTEMBER);
    expect(loaded.trialTowerSeason).toBe("2026-09");
    expect(loaded.trialTowerBestFloor).toBe(20);
    expect(loaded.trialTowerLifetimeBestFloor).toBe(20);
    expect(loaded.trialTowerMonthlyOrbClaimedFloors).toEqual([15]);
  });
});
