import { describe, expect, it } from "vitest";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { STAGES } from "../src/data/stages.js";
import {
  createInitialState,
  FIGHTER_LEVEL_UP_CRYSTAL_REWARD,
  getParty,
  FIRST_CLEAR_CRYSTAL_REWARD,
  REPEAT_CLEAR_CRYSTAL_CHANCE,
  REPEAT_CLEAR_CRYSTAL_REWARD,
} from "../src/game/playerState.js";
import { applyDungeonClearRewards, applyExpAndLevelUps, applyStageClearRewards } from "../src/game/rewards.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";

describe("ダイヤ報酬 (applyStageClearRewards)", () => {
  it("初回クリアはダイヤ200もらえる", () => {
    const state = createInitialState();
    const stage = STAGES[0];
    const party = getParty(state);
    const before = state.crystal;

    const result = applyStageClearRewards(state, stage, stage.waves.length, party);

    expect(result.crystalEarned).toBe(FIRST_CLEAR_CRYSTAL_REWARD);
    expect(state.crystal).toBe(
      before + FIRST_CLEAR_CRYSTAL_REWARD + result.fighterLevelsGained * FIGHTER_LEVEL_UP_CRYSTAL_REWARD,
    );
  });

  it("2回目以降のクリアは3%の確率でダイヤ50がもらえる(当選時)", () => {
    const state = createInitialState();
    const stage = STAGES[0];
    const party = getParty(state);

    applyStageClearRewards(state, stage, stage.waves.length, party);
    const before = state.crystal;
    const result = applyStageClearRewards(state, stage, stage.waves.length, party, "NORMAL", () => 0);

    expect(result.crystalEarned).toBe(REPEAT_CLEAR_CRYSTAL_REWARD);
    expect(state.crystal).toBe(
      before + REPEAT_CLEAR_CRYSTAL_REWARD + result.fighterLevelsGained * FIGHTER_LEVEL_UP_CRYSTAL_REWARD,
    );
  });

  it("2回目以降のクリアは外れれば0ダイヤになる", () => {
    const state = createInitialState();
    const stage = STAGES[0];
    const party = getParty(state);

    applyStageClearRewards(state, stage, stage.waves.length, party);
    const before = state.crystal;
    const result = applyStageClearRewards(state, stage, stage.waves.length, party, "NORMAL", () => REPEAT_CLEAR_CRYSTAL_CHANCE);

    expect(result.crystalEarned).toBe(0);
    expect(state.crystal).toBe(before + result.fighterLevelsGained * FIGHTER_LEVEL_UP_CRYSTAL_REWARD);
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
    expect(state.crystal).toBe(
      before + FIRST_CLEAR_CRYSTAL_REWARD + result.fighterLevelsGained * FIGHTER_LEVEL_UP_CRYSTAL_REWARD,
    );
  });

  it("2回目以降のクリアは3%の確率でダイヤ50がもらえる(当選時)", () => {
    const state = createInitialState();
    const floor = EQUIPMENT_DUNGEON_FLOORS[0];
    const party = getParty(state);

    applyDungeonClearRewards(state, floor, party);
    const before = state.crystal;
    const result = applyDungeonClearRewards(state, floor, party, () => 0);

    expect(result.crystalEarned).toBe(REPEAT_CLEAR_CRYSTAL_REWARD);
    expect(state.crystal).toBe(
      before + REPEAT_CLEAR_CRYSTAL_REWARD + result.fighterLevelsGained * FIGHTER_LEVEL_UP_CRYSTAL_REWARD,
    );
  });

  it("2回目以降のクリアは外れれば0ダイヤになる", () => {
    const state = createInitialState();
    const floor = EQUIPMENT_DUNGEON_FLOORS[0];
    const party = getParty(state);

    applyDungeonClearRewards(state, floor, party);
    const before = state.crystal;
    const result = applyDungeonClearRewards(state, floor, party, () => REPEAT_CLEAR_CRYSTAL_CHANCE);

    expect(result.crystalEarned).toBe(0);
    expect(state.crystal).toBe(before + result.fighterLevelsGained * FIGHTER_LEVEL_UP_CRYSTAL_REWARD);
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

describe("LvMAXメンバー分EXP再分配", () => {
  const member = (max = false) => createMonsterInstance("slime_FIRE", 6, max ? 60 : 1);

  it("MAX3体・育成2体なら基本10,000に15,000ずつ加算する", () => {
    const result = applyExpAndLevelUps([member(true), member(true), member(true), member(), member()], 10_000);
    expect(result.expAwards.map((award) => award.total)).toEqual([25_000, 25_000]);
    expect(result.expAwards.map((award) => award.maxMemberBonus)).toEqual([15_000, 15_000]);
  });

  it("MAX4体・育成1体なら5体分を育成対象へ付与する", () => {
    const result = applyExpAndLevelUps([member(true), member(true), member(true), member(true), member()], 10_000);
    expect(result.expAwards[0].total).toBe(50_000);
  });

  it("全員MAXは何も付与せず、少人数では空き枠分を生成しない", () => {
    expect(applyExpAndLevelUps([member(true), member(true), member(true)], 10_000).expAwards).toEqual([]);
    const result = applyExpAndLevelUps([member(true), member(), member()], 10_000);
    expect(result.expAwards.reduce((sum, award) => sum + award.total, 0)).toBe(30_000);
  });
});

describe("⑧-5-1 EXPバランス", () => {
  it("通常最終面はNORMAL 15,000、HARD 22,500、HELL 30,000 EXP", () => {
    const stage = STAGES.at(-1)!;
    const values = (["NORMAL", "HARD", "HELL"] as const).map((difficulty) => {
      const state = createInitialState();
      return applyStageClearRewards(state, stage, 3, getParty(state), difficulty).expTotal;
    });
    expect(values).toEqual([15_000, 22_500, 30_000]);
  });

  it("通常最終面のモンスターEXPは維持し、ファイターEXPだけ25%に分離する", () => {
    const stage = STAGES.at(-1)!;
    const values = (["NORMAL", "HARD", "HELL"] as const).map((difficulty) => {
      const state = createInitialState();
      const reward = applyStageClearRewards(state, stage, 3, getParty(state), difficulty);
      return [reward.expTotal, reward.fighterExp];
    });
    expect(values).toEqual([[15_000, 3_750], [22_500, 5_625], [30_000, 7_500]]);
  });

  it("装備ダンジョンは階層ごとに500増え、10階は5,000 EXP", () => {
    const values = EQUIPMENT_DUNGEON_FLOORS.map((floor) => {
      const state = createInitialState();
      return applyDungeonClearRewards(state, floor, getParty(state)).expTotal;
    });
    expect(values).toEqual([500, 1_000, 1_500, 2_000, 2_500, 3_000, 3_500, 4_000, 4_500, 5_000]);
  });

  it("装備ダンジョン10階はモンスター5,000 EXPのまま、ファイター750 EXP", () => {
    const state = createInitialState();
    const reward = applyDungeonClearRewards(state, EQUIPMENT_DUNGEON_FLOORS.at(-1)!, getParty(state));
    expect([reward.expTotal, reward.fighterExp]).toEqual([5_000, 750]);
  });
});
