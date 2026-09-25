import { describe, expect, it } from "vitest";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../src/core/rarity.js";
import { AWAKENING_DEPTH_FLOORS, findAwakeningDepthFloor } from "../src/data/awakeningDepths.js";
import { RUIN_KINDS, findRuinFloor, ruinFloors } from "../src/data/ruins.js";
import { grantAwakeningDepthReward } from "../src/game/awakeningDepths.js";
import { emptyResult, mergeReward } from "../src/game/autoFarm.js";
import { createInitialState } from "../src/game/playerState.js";
import { grantRuinReward } from "../src/game/ruins.js";

/**
 * 目覚の深域と遺跡にも、ゴールドと経験値を付けた(依頼主の指定)。
 * どちらも素材が主役の場所なので量は控えめだが、**勝てば必ず入る。**
 */

describe("目覚の深域のゴールドと経験値", () => {
  it("どの階にもゴールド・モンスターEXP・ファイターEXPがあり、深い階ほど多い", () => {
    for (let i = 0; i < AWAKENING_DEPTH_FLOORS.length; i += 1) {
      const floor = AWAKENING_DEPTH_FLOORS[i];
      expect(floor.goldReward).toBeGreaterThan(0);
      expect(floor.expReward).toBeGreaterThan(0);
      expect(floor.fighterExp).toBeGreaterThan(0);
      if (i > 0) {
        const prev = AWAKENING_DEPTH_FLOORS[i - 1];
        expect(floor.goldReward).toBeGreaterThan(prev.goldReward);
        expect(floor.expReward).toBeGreaterThan(prev.expReward);
      }
    }
  });

  it("勝つとゴールド・ファイターEXPが入り、編成の育成中の1体へ経験値が入る", () => {
    const state = createInitialState();
    const gold = state.gold;
    const fighterBefore = state.fighterExp + state.fighterLevel * 1_000_000;
    const member = createMonsterInstance("slime_FIRE", 3, 1);
    const floor = findAwakeningDepthFloor(5)!;
    const reward = grantAwakeningDepthReward(state, floor, [member], () => 0.5);
    expect(reward.goldEarned).toBe(floor.goldReward);
    expect(state.gold).toBe(gold + floor.goldReward);
    expect(reward.expTotal).toBe(floor.expReward);
    expect(reward.expAwards?.[0]).toMatchObject({ instanceId: member.id, total: floor.expReward });
    expect(member.level).toBeGreaterThan(1);
    expect(reward.fighterExp).toBe(floor.fighterExp);
    expect(state.fighterExp + state.fighterLevel * 1_000_000).toBeGreaterThan(fighterBefore);
    // 素材は今までどおり
    expect(reward.shards).toBeGreaterThan(0);
  });

  it("最大レベルの仲間のぶんは、育成中の仲間へ回る(他の場所と同じ)", () => {
    const state = createInitialState();
    const maxed = createMonsterInstance("slime_FIRE", 3, STAR_MAX_LEVEL[3]);
    const trainee = createMonsterInstance("slime_WATER", 3, 1);
    const floor = findAwakeningDepthFloor(1)!;
    const reward = grantAwakeningDepthReward(state, floor, [maxed, trainee], () => 0.5);
    expect(reward.expAwards).toHaveLength(1);
    expect(reward.expAwards?.[0]).toMatchObject({ instanceId: trainee.id, total: floor.expReward * 2 });
  });

  it("周回の集計にゴールドと経験値が積まれる", () => {
    const state = createInitialState();
    const result = emptyResult();
    const floor = findAwakeningDepthFloor(3)!;
    for (let i = 0; i < 3; i += 1) mergeReward(result, grantAwakeningDepthReward(state, floor, [], () => 0.5), 0);
    expect(result.totalGold).toBe(floor.goldReward * 3);
    expect(result.totalExp).toBe(floor.expReward * 3);
  });
});

describe("遺跡のゴールドと経験値", () => {
  it("両方の遺跡の全階にあり、深い階ほど多い", () => {
    for (const kind of RUIN_KINDS) {
      const floors = ruinFloors(kind);
      for (let i = 0; i < floors.length; i += 1) {
        expect(floors[i].goldReward).toBeGreaterThan(0);
        expect(floors[i].expReward).toBeGreaterThan(0);
        expect(floors[i].fighterExp).toBeGreaterThan(0);
        if (i > 0) expect(floors[i].goldReward).toBeGreaterThan(floors[i - 1].goldReward);
      }
    }
    // 同じ階なら、力と守護で同じ額
    expect(findRuinFloor("POWER", 4)!.goldReward).toBe(findRuinFloor("GUARDIAN", 4)!.goldReward);
  });

  it("勝つとゴールドと経験値が入る", () => {
    const state = createInitialState();
    const gold = state.gold;
    const member = createMonsterInstance("slime_FIRE", 3, 1);
    const floor = findRuinFloor("POWER", 2)!;
    const reward = grantRuinReward(state, floor, [member], () => 0.5);
    expect(state.gold).toBe(gold + floor.goldReward);
    expect(reward.expAwards?.[0]).toMatchObject({ instanceId: member.id, total: floor.expReward });
    expect(member.level).toBeGreaterThan(1);
    expect(reward.fighterExp).toBe(floor.fighterExp);
  });

  it("周回の集計にゴールドと経験値が積まれる", () => {
    const state = createInitialState();
    const result = emptyResult();
    const floor = findRuinFloor("GUARDIAN", 5)!;
    for (let i = 0; i < 2; i += 1) mergeReward(result, grantRuinReward(state, floor, [], () => 0.5), 0);
    expect(result.totalGold).toBe(floor.goldReward * 2);
    expect(result.totalExp).toBe(floor.expReward * 2);
  });
});
