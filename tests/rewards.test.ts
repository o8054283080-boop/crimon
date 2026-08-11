import { describe, expect, it } from "vitest";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { STAGES } from "../src/data/stages.js";
import {
  createInitialState,
  getParty,
  FIRST_CLEAR_CRYSTAL_REWARD,
  REPEAT_CLEAR_CRYSTAL_CHANCE,
  REPEAT_CLEAR_CRYSTAL_REWARD,
} from "../src/game/playerState.js";
import { applyDungeonClearRewards, applyStageClearRewards } from "../src/game/rewards.js";

describe("ダイヤ報酬 (applyStageClearRewards)", () => {
  it("初回クリアはダイヤ200もらえる", () => {
    const state = createInitialState();
    const stage = STAGES[0];
    const party = getParty(state);
    const before = state.crystal;

    const result = applyStageClearRewards(state, stage, stage.waves.length, party);

    expect(result.crystalEarned).toBe(FIRST_CLEAR_CRYSTAL_REWARD);
    expect(state.crystal).toBe(before + FIRST_CLEAR_CRYSTAL_REWARD);
  });

  it("2回目以降のクリアは3%の確率でダイヤ50がもらえる(当選時)", () => {
    const state = createInitialState();
    const stage = STAGES[0];
    const party = getParty(state);

    applyStageClearRewards(state, stage, stage.waves.length, party);
    const before = state.crystal;
    const result = applyStageClearRewards(state, stage, stage.waves.length, party, "NORMAL", () => 0);

    // crystalEarnedがステージクリア分のダイヤ。state.crystalの増分にはこれに加えて
    // ファイターレベルアップ報酬が乗ることがあるため、結果フィールド側だけを厳密に検証する
    expect(result.crystalEarned).toBe(REPEAT_CLEAR_CRYSTAL_REWARD);
    expect(state.crystal).toBeGreaterThanOrEqual(before + REPEAT_CLEAR_CRYSTAL_REWARD);
  });

  it("2回目以降のクリアは外れれば0ダイヤになる", () => {
    const state = createInitialState();
    const stage = STAGES[0];
    const party = getParty(state);

    applyStageClearRewards(state, stage, stage.waves.length, party);
    const before = state.crystal;
    const result = applyStageClearRewards(state, stage, stage.waves.length, party, "NORMAL", () => REPEAT_CLEAR_CRYSTAL_CHANCE);

    expect(result.crystalEarned).toBe(0);
    expect(state.crystal).toBeGreaterThanOrEqual(before);
  });
});

describe("ダイヤ報酬 (applyDungeonClearRewards)", () => {
  it("初回クリアはダイヤ200もらえる", () => {
    const state = createInitialState();
    const floor = EQUIPMENT_DUNGEON_FLOORS[0];
    const party = getParty(state);
    const before = state.crystal;

    const result = applyDungeonClearRewards(state, floor, party);

    expect(result.crystalEarned).toBe(FIRST_CLEAR_CRYSTAL_REWARD);
    expect(state.crystal).toBe(before + FIRST_CLEAR_CRYSTAL_REWARD);
  });

  it("2回目以降のクリアは3%の確率でダイヤ50がもらえる(当選時)", () => {
    const state = createInitialState();
    const floor = EQUIPMENT_DUNGEON_FLOORS[0];
    const party = getParty(state);

    applyDungeonClearRewards(state, floor, party);
    const before = state.crystal;
    const result = applyDungeonClearRewards(state, floor, party, () => 0);

    expect(result.crystalEarned).toBe(REPEAT_CLEAR_CRYSTAL_REWARD);
    expect(state.crystal).toBe(before + REPEAT_CLEAR_CRYSTAL_REWARD);
  });

  it("2回目以降のクリアは外れれば0ダイヤになる", () => {
    const state = createInitialState();
    const floor = EQUIPMENT_DUNGEON_FLOORS[0];
    const party = getParty(state);

    applyDungeonClearRewards(state, floor, party);
    const before = state.crystal;
    const result = applyDungeonClearRewards(state, floor, party, () => REPEAT_CLEAR_CRYSTAL_CHANCE);

    expect(result.crystalEarned).toBe(0);
    expect(state.crystal).toBe(before);
  });

  it("階層が異なればそれぞれ初回扱いになる", () => {
    const state = createInitialState();
    const party = getParty(state);

    const r1 = applyDungeonClearRewards(state, EQUIPMENT_DUNGEON_FLOORS[0], party);
    const r2 = applyDungeonClearRewards(state, EQUIPMENT_DUNGEON_FLOORS[1], party);

    expect(r1.crystalEarned).toBe(FIRST_CLEAR_CRYSTAL_REWARD);
    expect(r2.crystalEarned).toBe(FIRST_CLEAR_CRYSTAL_REWARD);
  });
});
