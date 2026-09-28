import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { stripBuffs } from "../src/battle/unit.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import {
  CRIMOARK_CLONE_PROFILE,
  CRIMOARK_CLONE_DEATH_ATK,
  CRIMOARK_CLONE_DEATH_SPD,
  CRIMOARK_CLONE_HP_FLOOR,
  CRIMOARK_CLONE_HP_RATIO,
} from "../src/data/crimoark.js";
import { TRIAL_TOWER_HARD_80_IMMUNITY_GUARD, TRIAL_TOWER_HARD_BOSS_INTERRUPTS, TRIAL_TOWER_HARD_BOSS_STATS, TRIAL_TOWER_HARD_BOSS_TRAITS, TRIAL_TOWER_HARD_MINION_HP_OF_BOSS, TRIAL_TOWER_HARD_NORMAL_CURVE, trialTowerHardCurveAt, trialTowerHardMultipliers } from "../src/data/trialTowerHard.js";
import { trialTowerEnemyInfo } from "../src/data/trialTowerEnemyInfo.js";
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
  // 通常階は「自然な線」、70〜100階のボスは実数で決める。倍率がそのまま効くのは10〜60階のボス階
  it.each([10, 20, 30, 40, 50, 60])("%d階で完成済みNORMAL敵へだけHARD倍率を掛ける", (floor) => {
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

describe("試練の塔HARD: 80・90階の割り込み技", () => {
  function hardEngine(floor: number) {
    const state = unlockedState();
    state.trialTowerHardBestFloor = floor - 1;
    const run = beginTowerRun(state, "HARD")!;
    run.floor = floor;
    const setup = setupTowerBattle(state, run)!;
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng: () => 0.5, maxTurns: 1, trialTowerFloor: floor });
    const internals = engine as unknown as { applyBossInterrupts(): void; log: string[]; stun(unit: unknown, turns: number): void };
    const enemies = engine.getUnits().filter((unit) => unit.team === "ENEMY");
    const boss = enemies.find((unit) => unit.def.isBoss)!;
    return { setup, internals, enemies, boss, fired: (name: string) => internals.log.filter((line) => line.includes(`「${name}」`)).length };
  }

  it("80階と90階のボスにだけ付く。70階・100階・NORMALには付かない", () => {
    for (const floor of [80, 90]) {
      const boss = hardEngine(floor).setup.enemyDefs.find((e) => e.isBoss)!;
      expect(boss.bossTraits?.interrupt).toEqual(TRIAL_TOWER_HARD_BOSS_INTERRUPTS[floor]);
    }
    for (const floor of [70, 100]) {
      expect(hardEngine(floor).setup.enemyDefs.some((e) => e.bossTraits?.interrupt)).toBe(false);
    }
    const state = unlockedState();
    const run = beginTowerRun(state, "NORMAL")!;
    run.floor = 80;
    expect(setupTowerBattle(state, run)!.enemyDefs.some((e) => e.bossTraits?.interrupt)).toBe(false);
  });

  it("80階はHP50%を下回った時に1回だけ撃ち、当てた相手の強化を消す。気絶中でも撃つ", () => {
    const { internals, boss, fired } = hardEngine(80);
    const player = (internals as unknown as { units: { team: string; maxHp: number; currentHp: number; effects: { stat: string; amount: number; remainingTurns: number; kind: string }[] }[] }).units.find((u) => u.team === "PLAYER")!;
    // 1発で倒れると解除まで進まないので、耐えられるだけのHPを持たせる
    player.maxHp = 10_000_000;
    player.currentHp = 10_000_000;
    player.effects.push({ stat: "def", amount: 0.5, remainingTurns: 3, kind: "BUFF" });
    internals.applyBossInterrupts();
    expect(fired("聖光の裁き")).toBe(0);

    boss.currentHp = Math.floor(boss.maxHp * 0.49);
    internals.stun(boss, 1);
    internals.applyBossInterrupts();
    expect(fired("聖光の裁き")).toBe(1);
    expect(player.effects.some((e) => e.kind === "BUFF")).toBe(false);

    internals.applyBossInterrupts();
    boss.currentHp = Math.floor(boss.maxHp * 0.1);
    internals.applyBossInterrupts();
    expect(fired("聖光の裁き")).toBe(1);
  });

  it("90階はお供が倒れた時に撃ち、1戦に2回まで", () => {
    const { internals, enemies, fired } = hardEngine(90);
    internals.applyBossInterrupts();
    expect(fired("報復の冥炎")).toBe(0);
    const minions = enemies.filter((unit) => !unit.def.isBoss);
    for (const minion of minions) {
      minion.alive = false;
      minion.currentHp = 0;
      internals.applyBossInterrupts();
    }
    expect(minions.length).toBeGreaterThan(2);
    expect(fired("報復の冥炎")).toBe(2);
  });

  it("敵情報はHARDの時だけボスの特性と割り込み技を載せる", () => {
    const hardNames = (floor: number) => trialTowerEnemyInfo(floor, "HARD")[0].passives.map((p) => p.name);
    expect(hardNames(80)).toContain("聖光の裁き(HARD)");
    expect(hardNames(90)).toContain("報復の冥炎(HARD)");
    expect(hardNames(70)).toContain("反動の加速(HARD)");
    expect(hardNames(70).some((name) => name.includes("聖光") || name.includes("報復"))).toBe(false);
    expect(trialTowerEnemyInfo(80)[0].passives.map((p) => p.name).some((name) => name.includes("HARD"))).toBe(false);
    expect(trialTowerEnemyInfo(90, "HARD")[1].passives.map((p) => p.name).some((name) => name.includes("HARD"))).toBe(false);
  });
});

describe("試練の塔HARD: 70〜100階のボスは実数、お供のHPはボスの半分", () => {
  function hardSetup(floor: number) {
    const state = unlockedState();
    state.trialTowerHardBestFloor = floor - 1;
    const run = beginTowerRun(state, "HARD")!;
    run.floor = floor;
    return setupTowerBattle(state, run)!;
  }

  it("依頼主の指定した値がそのまま入る", () => {
    expect(TRIAL_TOWER_HARD_BOSS_STATS).toEqual({
      70: { hp: 250_000, atk: 60_000, def: 3_500, spd: 200 },
      80: { hp: 350_000, atk: 65_000, def: 4_000, spd: 225 },
      90: { hp: 500_000, atk: 70_000, def: 3_800, spd: 250 },
      100: { hp: 700_000, atk: 80_000, def: 5_500, spd: 280 },
    });
  });

  it.each([70, 80, 90, 100])("%d階のボスは実数、会心・的中・抵抗は元のまま", (floor) => {
    const setup = hardSetup(floor);
    const normal = buildDungeonEnemyTeam(findTowerFloor(floor)!);
    const index = setup.enemyDefs.findIndex((e) => e.isBoss);
    expect(setup.enemyDefs[index].stats).toMatchObject(TRIAL_TOWER_HARD_BOSS_STATS[floor]);
    expect(setup.enemyDefs[index].stats.criRate).toBe(normal[index].stats.criRate);
    expect(setup.enemyDefs[index].stats.accuracy).toBe(normal[index].stats.accuracy);
    expect(setup.enemyDefs[index].stats.resistance).toBe(normal[index].stats.resistance);
  });

  it.each([70, 80, 90])("%d階のお供はHPの平均がボスの半分で、差は残り、攻撃・防御・速度は倍率のまま", (floor) => {
    const setup = hardSetup(floor);
    const normal = buildDungeonEnemyTeam(findTowerFloor(floor)!);
    const scale = trialTowerHardMultipliers(floor);
    const minions = setup.enemyDefs.map((e, i) => ({ e, base: normal[i] })).filter(({ e }) => !e.isBoss);
    const mean = minions.reduce((sum, { e }) => sum + e.stats.hp, 0) / minions.length;
    expect(mean).toBeCloseTo(TRIAL_TOWER_HARD_BOSS_STATS[floor].hp * TRIAL_TOWER_HARD_MINION_HP_OF_BOSS, -1);
    const ratios = minions.map(({ e, base }) => e.stats.hp / base.stats.hp);
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[0], 3);
    for (const { e, base } of minions) {
      expect(e.stats.atk).toBe(Math.round(base.stats.atk * scale.atk));
      expect(e.stats.def).toBe(Math.round(base.stats.def * scale.def));
      expect(e.stats.spd).toBe(Math.round(base.stats.spd * scale.spd));
    }
  });

  it("100階の分身の空席は触らない(戦闘中にボスの今のHPから生まれる)", () => {
    const setup = hardSetup(100);
    const normal = buildDungeonEnemyTeam(findTowerFloor(100)!);
    const scale = trialTowerHardMultipliers(100);
    setup.enemyDefs.forEach((e, i) => {
      if (!e.isBoss) expect(e.stats.hp).toBe(Math.max(1, Math.round(normal[i].stats.hp * scale.hp)));
    });
  });

  it("NORMALは変わらない", () => {
    const state = unlockedState();
    const run = beginTowerRun(state, "NORMAL")!;
    run.floor = 80;
    const normal = buildDungeonEnemyTeam(findTowerFloor(80)!);
    expect(setupTowerBattle(state, run)!.enemyDefs.map((e) => e.stats)).toEqual(normal.map((e) => e.stats));
  });
});

describe("試練の塔HARD: 80階の聖竜は免疫の前に強化を張り、免疫中は速い", () => {
  function hardEngine(mode: "NORMAL" | "HARD") {
    const state = unlockedState();
    state.trialTowerHardBestFloor = 79;
    state.trialTowerBestFloor = 79;
    const run = beginTowerRun(state, mode)!;
    run.floor = 80;
    const setup = setupTowerBattle(state, run)!;
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng: () => 0.5, maxTurns: 1, trialTowerFloor: 80 });
    const enemies = engine.getUnits().filter((unit) => unit.team === "ENEMY");
    return { engine, enemies, boss: enemies.find((unit) => unit.def.isBoss)! };
  }

  it("開幕の免疫より先に攻撃UP・防御UPが付き、1個解除では免疫が残る", () => {
    const { enemies } = hardEngine("HARD");
    for (const enemy of enemies) {
      expect(enemy.immuneTurns).toBeGreaterThan(0);
      expect(enemy.effects.filter((e) => e.kind === "BUFF").map((e) => e.stat).sort()).toEqual(["atk", "def"]);
      stripBuffs(enemy, 2);
      expect(enemy.immuneTurns).toBeGreaterThan(0);
      stripBuffs(enemy, 1);
      expect(enemy.immuneTurns).toBe(0);
    }
  });

  it("免疫が付いている間は速度が30%上がり、剥がすと戻る", () => {
    const { engine, enemies } = hardEngine("HARD");
    for (const enemy of enemies) expect(enemy.flatStatBonus.spd).toBe(Math.round(enemy.def.stats.spd * TRIAL_TOWER_HARD_80_IMMUNITY_GUARD.spdWhileImmune));
    for (const enemy of enemies) stripBuffs(enemy);
    (engine as unknown as { syncTower80Boss(): void }).syncTower80Boss();
    for (const enemy of enemies) expect(enemy.flatStatBonus.spd ?? 0).toBe(0);
  });

  it("NORMALの80階には付かない", () => {
    const { enemies } = hardEngine("NORMAL");
    for (const enemy of enemies) {
      expect(enemy.effects.some((e) => e.kind === "BUFF")).toBe(false);
      expect(enemy.flatStatBonus.spd ?? 0).toBe(0);
    }
  });
});

describe("試練の塔HARD: 通常階は1〜99階を自然に強くなる線に合わせる(C案)", () => {
  const passRate = (def: number) => 1000 / (1000 + 1.2 * def);
  function hardEnemies(floor: number) {
    const state = unlockedState();
    state.trialTowerHardBestFloor = floor - 1;
    const run = beginTowerRun(state, "HARD")!;
    run.floor = floor;
    return setupTowerBattle(state, run)!.enemyDefs;
  }
  const normalFloors = Array.from({ length: 99 }, (_, i) => i + 1).filter((f) => f % 10 !== 0);

  it.each(normalFloors)("%d階の平均の攻撃・防御・速度と倒しにくさが線の上にある", (floor) => {
    const enemies = hardEnemies(floor);
    const mean = (f: (e: typeof enemies[number]) => number) => enemies.reduce((a, e) => a + f(e), 0) / enemies.length;
    const curve = TRIAL_TOWER_HARD_NORMAL_CURVE;
    expect(mean((e) => e.stats.atk) / trialTowerHardCurveAt(curve.atk, floor)).toBeCloseTo(1, 2);
    expect(mean((e) => e.stats.def) / trialTowerHardCurveAt(curve.def, floor)).toBeCloseTo(1, 2);
    expect(mean((e) => e.stats.spd) / trialTowerHardCurveAt(curve.spd, floor)).toBeCloseTo(1, 1);
    expect(mean((e) => e.stats.hp / passRate(e.stats.def)) / trialTowerHardCurveAt(curve.toughness, floor)).toBeCloseTo(1, 2);
  });

  it("攻撃・防御・速度は1〜99階で下がらない(のこぎり型にしない)", () => {
    for (const key of ["atk", "def", "spd"] as const) {
      const values = normalFloors.map((f) => trialTowerHardCurveAt(TRIAL_TOWER_HARD_NORMAL_CURVE[key], f));
      for (let i = 1; i < values.length; i += 1) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
    // 防御は2,500で止める(防御DOWNの効き目が大きくなりすぎないように)
    expect(Math.max(...normalFloors.map((f) => trialTowerHardCurveAt(TRIAL_TOWER_HARD_NORMAL_CURVE.def, f)))).toBe(2_500);
  });

  it("敵どうしの差は残す(同じ階の攻撃の比は元のまま)", () => {
    const floor = 57;
    const hard = hardEnemies(floor);
    const normal = buildDungeonEnemyTeam(findTowerFloor(floor)!);
    const ratio = (list: { stats: { atk: number } }[]) => list.map((e) => e.stats.atk / list[0].stats.atk);
    ratio(hard).forEach((r, i) => expect(r).toBeCloseTo(ratio(normal)[i], 2));
  });

  it("NORMALの通常階は変わらない", () => {
    const state = unlockedState();
    const run = beginTowerRun(state, "NORMAL")!;
    run.floor = 57;
    expect(setupTowerBattle(state, run)!.enemyDefs.map((e) => e.stats)).toEqual(buildDungeonEnemyTeam(findTowerFloor(57)!).map((e) => e.stats));
  });
});
