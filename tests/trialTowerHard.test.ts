import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import {
  CRIMOARK_CLONE_PROFILE,
  CRIMOARK_CLONE_DEATH_ATK,
  CRIMOARK_CLONE_DEATH_SPD,
  CRIMOARK_CLONE_HP_FLOOR,
  CRIMOARK_CLONE_HP_RATIO,
} from "../src/data/crimoark.js";
import { trialTowerHardMultipliers } from "../src/data/trialTowerHard.js";
import { findTowerFloor } from "../src/data/trialTower.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { createInitialState, ensureTowerMonthlyState, type PlayerState } from "../src/game/playerState.js";
import {
  applyTowerFloorResult,
  beginTowerRun,
  claimTowerFloorReward,
  setupTowerBattle,
  towerBlockReason,
  towerRewardForMode,
} from "../src/game/trialTower.js";

function unlockedState(): PlayerState {
  const state = createInitialState();
  const monster = createMonsterInstance("golem_WATER", 6, 60);
  state.monsters = [monster];
  state.towerPartyIds = [monster.id];
  state.stamina = 500;
  state.maxStamina = 500;
  state.trialTowerLifetimeBestFloor = 100;
  return state;
}

describe("試練の塔HARD: モードと進行", () => {
  it("NORMAL 100階の歴代到達で解放し、未到達なら開始できない", () => {
    const state = unlockedState();
    state.trialTowerLifetimeBestFloor = 99;
    expect(towerBlockReason(state, "HARD")).toContain("NORMAL 100階");
    expect(beginTowerRun(state, "HARD")).toBeNull();

    state.trialTowerLifetimeBestFloor = 100;
    expect(towerBlockReason(state, "HARD")).toBeNull();
    expect(beginTowerRun(state, "HARD")?.mode).toBe("HARD");
  });

  it("NORMALとHARDの途中登坂・到達階・報酬を独立して持つ", () => {
    const state = unlockedState();
    const normal = beginTowerRun(state, "NORMAL")!;
    const hard = beginTowerRun(state, "HARD")!;
    expect(state.trialTowerRun).toBe(normal);
    expect(state.trialTowerHardRun).toBe(hard);

    const setup = setupTowerBattle(state, hard)!;
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, {
      initialPlayerHp: setup.initialPlayerHp,
      initialCooldowns: setup.initialCooldowns,
      trialTowerFloor: setup.floor.floor,
      trialTowerHardMultipliers: setup.hardMultipliers,
    });
    const outcome = applyTowerFloorResult(state, hard, setup, engine, true, () => 0.5);
    expect(outcome.cleared).toBe(true);
    expect(state.trialTowerHardBestFloor).toBe(1);
    expect(state.trialTowerBestFloor).toBe(0);
    expect(state.trialTowerHardClaimedFloors).toEqual([1]);
    expect(state.trialTowerClaimedFloors).toEqual([]);
    expect(state.trialTowerRun).toBe(normal);

    const normalReward = claimTowerFloorReward(state, 1, () => 0.5, "NORMAL");
    expect(normalReward.crystal).toBe(outcome.reward.crystal);
    expect(state.trialTowerClaimedFloors).toEqual([1]);
  });

  it("HARDはゴールドだけNORMALの3倍にし、ほかの報酬は変えない", () => {
    const base = findTowerFloor(15)!.firstClearReward;
    expect(towerRewardForMode(base, "NORMAL")).toBe(base);
    expect(towerRewardForMode(base, "HARD")).toEqual({ ...base, gold: base.gold! * 3 });

    const normal = unlockedState();
    const hard = unlockedState();
    const normalGoldBefore = normal.gold;
    const hardGoldBefore = hard.gold;
    const normalReward = claimTowerFloorReward(normal, 15, () => 0.5, "NORMAL");
    const hardReward = claimTowerFloorReward(hard, 15, () => 0.5, "HARD");
    expect(normalReward.gold).toBe(base.gold);
    expect(hardReward.gold).toBe(base.gold! * 3);
    expect(normal.gold - normalGoldBefore).toBe(base.gold);
    expect(hard.gold - hardGoldBefore).toBe(base.gold! * 3);
    expect(hardReward.crystal).toBe(normalReward.crystal);
    expect(hardReward.awakeningOrbs).toBe(normalReward.awakeningOrbs);
  });

  it("月替わりで両モードの月間進行だけを戻し、歴代最高は残す", () => {
    const state = unlockedState();
    state.trialTowerSeason = "2026-08";
    state.trialTowerBestFloor = 80;
    state.trialTowerHardBestFloor = 40;
    state.trialTowerHardLifetimeBestFloor = 55;
    state.trialTowerClaimedFloors = [1, 80];
    state.trialTowerHardClaimedFloors = [1, 40];
    state.trialTowerHardMonthlyOrbClaimedFloors = [15, 30];
    state.trialTowerHardRun = {
      mode: "HARD",
      floor: 41,
      members: [{ instanceId: state.towerPartyIds[0], hp: -1, cooldowns: [0, 0, 0] }],
    };

    expect(ensureTowerMonthlyState(state, new Date("2026-08-31T15:00:00.000Z"))).toBe(true);
    expect(state.trialTowerBestFloor).toBe(0);
    expect(state.trialTowerHardBestFloor).toBe(0);
    expect(state.trialTowerClaimedFloors).toEqual([]);
    expect(state.trialTowerHardClaimedFloors).toEqual([]);
    expect(state.trialTowerHardMonthlyOrbClaimedFloors).toEqual([]);
    expect(state.trialTowerHardRun).toBeNull();
    expect(state.trialTowerLifetimeBestFloor).toBe(100);
    expect(state.trialTowerHardLifetimeBestFloor).toBe(55);
  });
});

describe("試練の塔HARD: 完成済みNORMALステータスへの倍率", () => {
  it.each([1, 40, 50, 51, 70, 90, 100])("%d階で完成済みNORMAL敵へだけHARD倍率を掛ける", (floor) => {
    const state = unlockedState();
    state.trialTowerHardBestFloor = floor - 1;
    const run = beginTowerRun(state, "HARD")!;
    run.floor = floor;
    const setup = setupTowerBattle(state, run)!;
    const normal = buildDungeonEnemyTeam(findTowerFloor(floor)!);
    const scale = trialTowerHardMultipliers(floor);

    expect(setup.enemyDefs).toHaveLength(normal.length);
    setup.enemyDefs.forEach((enemy, index) => {
      const base = normal[index];
      expect(enemy.templateId).toBe(base.templateId);
      expect(enemy.skills).toEqual(base.skills);
      expect(enemy.stats).toMatchObject({
        hp: Math.max(1, Math.round(base.stats.hp * scale.hp)),
        def: Math.max(1, Math.round(base.stats.def * scale.def)),
        atk: Math.max(1, Math.round(base.stats.atk * scale.atk)),
        spd: Math.max(1, Math.round(base.stats.spd * scale.spd)),
      });
      expect(enemy.stats.criRate).toBe(base.stats.criRate);
      expect(enemy.stats.accuracy).toBe(base.stats.accuracy);
    });
  });

  it("100階の生成分身にもHARD倍率を掛け、撃破時の本体強化を維持する", () => {
    const state = unlockedState();
    state.trialTowerHardBestFloor = 99;
    const run = beginTowerRun(state, "HARD")!;
    run.floor = 100;
    const setup = setupTowerBattle(state, run)!;
    const hard = setup.hardMultipliers!;
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, {
      rng: () => 0,
      maxTurns: 1,
      trialTowerFloor: 100,
      trialTowerHardMultipliers: hard,
    });
    const enemies = engine.getUnits().filter((unit) => unit.team === "ENEMY");
    const boss = enemies[0];

    (engine as unknown as { applyTower100Copy(unit: unknown): void }).applyTower100Copy(boss);
    const clone = enemies.slice(1).find((unit) => unit.alive)!;
    expect(clone.maxHp).toBe(Math.max(
      Math.round(CRIMOARK_CLONE_HP_FLOOR * hard.hp),
      Math.round(boss.currentHp * CRIMOARK_CLONE_HP_RATIO),
    ));
    expect(clone.def.stats.atk).toBe(Math.round(CRIMOARK_CLONE_PROFILE.ATTACK.atk * hard.atk));
    expect(clone.def.stats.def).toBe(Math.round(CRIMOARK_CLONE_PROFILE.ATTACK.def * hard.def));
    expect(clone.def.stats.spd).toBe(Math.round(CRIMOARK_CLONE_PROFILE.ATTACK.spd * hard.spd));

    clone.alive = false;
    clone.currentHp = 0;
    (engine as unknown as { applyTrialBossAction(unit: unknown): void }).applyTrialBossAction(boss);
    expect(boss.effects.find((effect) => effect.kind === "BUFF" && effect.stat === "atk")?.amount)
      .toBeCloseTo(CRIMOARK_CLONE_DEATH_ATK);
    expect(boss.effects.find((effect) => effect.kind === "BUFF" && effect.stat === "spd")?.amount)
      .toBeCloseTo(CRIMOARK_CLONE_DEATH_SPD);
  });
});
