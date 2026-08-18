import { describe, expect, it } from "vitest";
import { GOLD_DUNGEON_DAILY_LIMIT, GOLD_DUNGEON_FLOORS } from "../src/data/goldDungeon.js";
import {
  createInitialState,
  getParty,
  goldDungeonChallengesRemaining,
  trySpendGoldDungeonChallenge,
} from "../src/game/playerState.js";
import { applyGoldDungeonClearRewards } from "../src/game/rewards.js";

describe("ゴールドダンジョンのデータ", () => {
  it("5階まで存在し、階層が上がるほどゴールド報酬が大きい", () => {
    expect(GOLD_DUNGEON_FLOORS).toHaveLength(5);
    for (let i = 1; i < GOLD_DUNGEON_FLOORS.length; i++) {
      expect(GOLD_DUNGEON_FLOORS[i].goldReward).toBeGreaterThan(GOLD_DUNGEON_FLOORS[i - 1].goldReward);
    }
  });

  it("各階層はプレイヤー側と同じ4体編成になる(モンスター種の追加で増えていないこと)", () => {
    for (const floor of GOLD_DUNGEON_FLOORS) {
      expect(floor.enemies).toHaveLength(4);
    }
  });

  it("階層が上がるほど敵が強くなる", () => {
    for (let i = 1; i < GOLD_DUNGEON_FLOORS.length; i++) {
      expect(GOLD_DUNGEON_FLOORS[i].powerScale).toBeGreaterThan(GOLD_DUNGEON_FLOORS[i - 1].powerScale);
    }
  });
});

describe("ゴールドダンジョンの1日の挑戦回数制限 (trySpendGoldDungeonChallenge)", () => {
  it("初期状態では上限まで挑戦できる", () => {
    const state = createInitialState();
    const now = Date.parse("2026-01-01T09:00:00Z");
    expect(goldDungeonChallengesRemaining(state, now)).toBe(GOLD_DUNGEON_DAILY_LIMIT);
  });

  it("上限回数までは消費でき、それを超えると失敗する", () => {
    const state = createInitialState();
    const now = Date.parse("2026-01-01T09:00:00Z");

    for (let i = 0; i < GOLD_DUNGEON_DAILY_LIMIT; i++) {
      expect(trySpendGoldDungeonChallenge(state, now).ok).toBe(true);
    }
    const result = trySpendGoldDungeonChallenge(state, now);
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("日付が変わると回数がリセットされる", () => {
    const state = createInitialState();
    const day1 = Date.parse("2026-01-01T09:00:00Z");
    const day2 = Date.parse("2026-01-02T09:00:00Z");

    for (let i = 0; i < GOLD_DUNGEON_DAILY_LIMIT; i++) {
      trySpendGoldDungeonChallenge(state, day1);
    }
    expect(goldDungeonChallengesRemaining(state, day1)).toBe(0);
    expect(goldDungeonChallengesRemaining(state, day2)).toBe(GOLD_DUNGEON_DAILY_LIMIT);
  });
});

describe("ゴールドダンジョンクリア報酬 (applyGoldDungeonClearRewards)", () => {
  it("階層のゴールド報酬がそのまま加算される", () => {
    const state = createInitialState();
    const floor = GOLD_DUNGEON_FLOORS[0];
    const party = getParty(state);
    const before = state.gold;

    const result = applyGoldDungeonClearRewards(state, floor, party);

    expect(result.goldEarned).toBe(floor.goldReward);
    expect(state.gold).toBe(before + floor.goldReward);
  });

  it("装備ドロップ・ピッグドロップ・ダイヤ報酬はない", () => {
    const state = createInitialState();
    const floor = GOLD_DUNGEON_FLOORS[0];
    const party = getParty(state);

    const result = applyGoldDungeonClearRewards(state, floor, party);

    expect(result.equipmentDrop).toBeNull();
    expect(result.pigDrop).toBeNull();
    expect(result.crystalEarned).toBe(0);
  });
});
