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
import { TRIAL_TOWER_HARD_BOSS_TRAITS, TRIAL_TOWER_HARD_UPPER_HP_BOOST, trialTowerHardMultipliers } from "../src/data/trialTowerHard.js";
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

/*
 * 2026-09-27: 上位の5体が1回の登頂で4〜5回しか負けず、楽に100階へ届いていた。
 * 依頼主の目標「1回で10回くらい負ける」に合わせ、51〜99階の通常階のHPと、ボス階の主の特性を足した。
 */
describe("試練の塔HARD: 51〜99階のHPとボス特性", () => {
  function hardSetup(floor: number) {
    const state = unlockedState();
    state.trialTowerHardBestFloor = floor - 1;
    const run = beginTowerRun(state, "HARD")!;
    run.floor = floor;
    return setupTowerBattle(state, run)!;
  }

  it("HPの上乗せは51〜99階の通常階だけ。ボス階と50階までは表のまま", () => {
    expect(TRIAL_TOWER_HARD_UPPER_HP_BOOST).toBe(1.2);
    expect(trialTowerHardMultipliers(51).hp).toBeCloseTo(3 * 1.2);
    expect(trialTowerHardMultipliers(99).hp).toBeCloseTo(2 * 1.2);
    expect(trialTowerHardMultipliers(49).hp).toBe(3);
    expect(trialTowerHardMultipliers(50).hp).toBe(0.7);
    expect(trialTowerHardMultipliers(60).hp).toBe(1.5);
    expect(trialTowerHardMultipliers(100).hp).toBe(1.6);
    // HP以外は動かしていない
    expect(trialTowerHardMultipliers(55)).toMatchObject({ def: 1, atk: 24, spd: 1.50 });
  });

  it.each([10, 50, 70, 90, 100])("%d階はボス階の主にだけ特性が付き、取り巻きには付かない", (floor) => {
    const setup = hardSetup(floor);
    const bosses = setup.enemyDefs.filter((enemy) => enemy.isBoss);
    expect(bosses).toHaveLength(1);
    expect(bosses[0].bossTraits).toMatchObject(TRIAL_TOWER_HARD_BOSS_TRAITS);
    for (const enemy of setup.enemyDefs.filter((e) => !e.isBoss)) {
      expect(enemy.bossTraits?.gaugeResist).toBeUndefined();
      expect(enemy.bossTraits?.stunHaste).toBeUndefined();
    }
  });

  it("通常階とNORMALのボスには付かない", () => {
    for (const enemy of hardSetup(55).enemyDefs) expect(enemy.bossTraits?.gaugeResist).toBeUndefined();
    const state = unlockedState();
    const run = beginTowerRun(state, "NORMAL")!;
    run.floor = 10;
    for (const enemy of setupTowerBattle(state, run)!.enemyDefs) expect(enemy.bossTraits?.gaugeResist).toBeUndefined();
  });

  it("ゲージの減少は半分、気絶した瞬間に速度+50%(3ターン)。気絶中の掛け直しでは重ならない", () => {
    const setup = hardSetup(10);
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng: () => 0, maxTurns: 1, trialTowerFloor: 10 });
    const hooks = engine as unknown as { loseGauge(unit: unknown, ratio: number): number; stun(unit: unknown, turns: number): void };
    const enemies = engine.getUnits().filter((unit) => unit.team === "ENEMY");
    const boss = enemies.find((unit) => unit.def.isBoss)!;
    const minion = enemies.find((unit) => !unit.def.isBoss)!;

    boss.gauge = 80;
    minion.gauge = 80;
    expect(hooks.loseGauge(boss, 0.4)).toBeCloseTo(0.2);
    expect(hooks.loseGauge(minion, 0.4)).toBeCloseTo(0.4);
    expect(boss.gauge).toBeCloseTo(60);
    expect(minion.gauge).toBeCloseTo(40);

    hooks.stun(boss, 1);
    expect(boss.stunTurns).toBe(1);
    const haste = boss.effects.filter((e) => e.kind === "BUFF" && e.stat === "spd");
    expect(haste).toEqual([expect.objectContaining({ amount: 0.5, remainingTurns: 3 })]);
    const lines = () => (engine as unknown as { log: string[] }).log.filter((line) => line.includes("気絶の反動")).length;
    expect(lines()).toBe(1);
    hooks.stun(boss, 1);
    expect(lines()).toBe(1);

    hooks.stun(minion, 1);
    expect(minion.effects.some((e) => e.kind === "BUFF" && e.stat === "spd")).toBe(false);
  });
});
