import { describe, expect, it } from "vitest";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { TOWER_FLOOR_COUNT } from "../src/data/trialTower.js";
import { createInitialState, PlayerState } from "../src/game/playerState.js";
import {
  beginTowerRun,
  isTowerClimbFinished,
  nextTowerFloor,
  setupTowerReplayBattle,
  towerBlockReason,
  towerReplayBlockReason,
  towerReplayMaxFloor,
} from "../src/game/trialTower.js";

/*
 * 依頼主の指摘(2026-09-29):
 *   - 100階に到達した後、101階は無いのに「101階から登る」が出ていた
 *   - クリアした階は、スタミナ0・報酬なしで再挑戦できるようにしたい
 */

function stateWithTowerParty(): PlayerState {
  const state = createInitialState();
  state.monsters = [];
  state.towerPartyIds = [];
  for (let i = 0; i < 4; i++) {
    const instance = createMonsterInstance("golem_WATER", 6, 60);
    state.monsters.push(instance);
    state.towerPartyIds.push(instance.id);
  }
  state.stamina = 0;
  state.maxStamina = 500;
  return state;
}

describe("100階を登り切った後", () => {
  it("次の階は100階を越えない(101階は出さない)", () => {
    const state = stateWithTowerParty();
    state.trialTowerBestFloor = 100;
    state.trialTowerLifetimeBestFloor = 100;
    expect(nextTowerFloor(state, "NORMAL")).toBeLessThanOrEqual(TOWER_FLOOR_COUNT);
    expect(isTowerClimbFinished(state, "NORMAL")).toBe(true);
  });

  it("登る階が残っていないので、登坂は始められない", () => {
    const state = stateWithTowerParty();
    state.stamina = 500;
    state.trialTowerBestFloor = 100;
    state.trialTowerLifetimeBestFloor = 100;
    expect(towerBlockReason(state, "NORMAL")).toContain("登り切りました");
    expect(beginTowerRun(state, "NORMAL")).toBeNull();
  });

  it("99階まではこれまでどおり節から登れる", () => {
    const state = stateWithTowerParty();
    state.trialTowerBestFloor = 99;
    expect(isTowerClimbFinished(state, "NORMAL")).toBe(false);
    expect(nextTowerFloor(state, "NORMAL")).toBe(91);
  });

  it("HARDも同じ", () => {
    const state = stateWithTowerParty();
    state.trialTowerLifetimeBestFloor = 100;
    state.trialTowerHardBestFloor = 100;
    state.trialTowerHardLifetimeBestFloor = 100;
    expect(nextTowerFloor(state, "HARD")).toBe(TOWER_FLOOR_COUNT);
    expect(isTowerClimbFinished(state, "HARD")).toBe(true);
  });
});

describe("クリア済みの階への再挑戦", () => {
  it("スタミナ0でも挑める", () => {
    const state = stateWithTowerParty();
    state.trialTowerLifetimeBestFloor = 42;
    expect(state.stamina).toBe(0);
    expect(towerReplayBlockReason(state, "NORMAL", 42)).toBeNull();
    expect(setupTowerReplayBattle(state, "NORMAL", 42)).not.toBeNull();
  });

  it("まだ越えていない階には挑めない", () => {
    const state = stateWithTowerParty();
    state.trialTowerLifetimeBestFloor = 42;
    expect(towerReplayBlockReason(state, "NORMAL", 43)).not.toBeNull();
    expect(towerReplayBlockReason(state, "NORMAL", 0)).not.toBeNull();
    expect(setupTowerReplayBattle(state, "NORMAL", 43)).toBeNull();
  });

  it("月が替わって今月の到達が浅くても、歴代で越えた階なら挑める", () => {
    const state = stateWithTowerParty();
    state.trialTowerBestFloor = 0;
    state.trialTowerLifetimeBestFloor = 100;
    expect(towerReplayMaxFloor(state, "NORMAL")).toBe(100);
    expect(towerReplayBlockReason(state, "NORMAL", 100)).toBeNull();
  });

  it("全員が満タン・クールタイム0から始まる", () => {
    const state = stateWithTowerParty();
    state.trialTowerLifetimeBestFloor = 30;
    const setup = setupTowerReplayBattle(state, "NORMAL", 30)!;
    expect(setup.initialPlayerHp).toEqual(setup.playerDefs.map((def) => def.stats.hp));
    expect(setup.initialCooldowns.every((cd) => cd.every((v) => v === 0))).toBe(true);
    expect(setup.floor.floor).toBe(30);
  });

  it("登坂の途中経過・到達階・報酬・スタミナを一切動かさない", () => {
    const state = stateWithTowerParty();
    state.stamina = 500;
    state.trialTowerBestFloor = 25;
    state.trialTowerLifetimeBestFloor = 25;
    const run = beginTowerRun(state, "NORMAL")!;
    run.members[0].hp = 123;
    const before = JSON.stringify({
      run: state.trialTowerRun,
      best: state.trialTowerBestFloor,
      lifetime: state.trialTowerLifetimeBestFloor,
      claimed: state.trialTowerClaimedFloors,
      stamina: state.stamina,
      crystal: state.crystal,
      gold: state.gold,
    });
    setupTowerReplayBattle(state, "NORMAL", 20);
    expect(JSON.stringify({
      run: state.trialTowerRun,
      best: state.trialTowerBestFloor,
      lifetime: state.trialTowerLifetimeBestFloor,
      claimed: state.trialTowerClaimedFloors,
      stamina: state.stamina,
      crystal: state.crystal,
      gold: state.gold,
    })).toBe(before);
  });

  it("編成が空なら挑めない", () => {
    const state = stateWithTowerParty();
    state.trialTowerLifetimeBestFloor = 10;
    state.towerPartyIds = [];
    expect(towerReplayBlockReason(state, "NORMAL", 10)).toContain("編成");
  });

  it("HARDはNORMAL 100階クリア前には挑めない", () => {
    const state = stateWithTowerParty();
    state.trialTowerLifetimeBestFloor = 99;
    state.trialTowerHardLifetimeBestFloor = 5;
    expect(towerReplayBlockReason(state, "HARD", 5)).not.toBeNull();
  });
});
