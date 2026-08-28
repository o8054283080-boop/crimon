import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { findMonster } from "../src/data/monsters.js";
import { TOWER_FLOOR_COUNT, findTowerFloor, isTowerBossFloor, towerStartFloor } from "../src/data/trialTower.js";
import { createInitialState } from "../src/game/playerState.js";
import { claimTowerFloorReward } from "../src/game/trialTower.js";

describe("100F試練の塔統合", () => {
  it("1..100だけを生成し、10階ごとだけがボス", () => {
    expect(TOWER_FLOOR_COUNT).toBe(100);
    expect(findTowerFloor(100)).toBeDefined();
    expect(findTowerFloor(101)).toBeUndefined();
    for (let floor = 1; floor <= 100; floor++) expect(isTowerBossFloor(floor)).toBe(floor % 10 === 0);
    expect(towerStartFloor(90)).toBe(91);
    expect(towerStartFloor(100)).toBe(101);
  });

  it("70F/90Fはトークンでなくスキルピッグ実個体を重複なく付与", () => {
    const state = createInitialState();
    expect(claimTowerFloorReward(state, 70, () => 0).skillPigs).toBe(1);
    expect(claimTowerFloorReward(state, 70, () => 0).skillPigs).toBe(0);
    expect(claimTowerFloorReward(state, 90, () => 0).skillPigs).toBe(3);
    expect(state.monsters.filter((m) => m.dexId.startsWith("skill_pig_")).length).toBe(4);
    expect((state as unknown as Record<string, unknown>).towerSkillPigTokens).toBeUndefined();
  });

  it("STRIPはIMMUNITY中でも命中判定後に免疫を剥がす", () => {
    const wolf = findMonster("wolf", "WATER")!;
    const strip = { id: "test_strip", name: "解除", description: "test", target: "SINGLE_ENEMY" as const, cooldownTurns: 0, effects: [{ kind: "STRIP" as const, chance: 1 }] };
    const sourceDef = { ...wolf, skills: [strip, strip, strip] as typeof wolf.skills };
    const wisp = findMonster("wisp", "WATER")!;
    const engine = new BattleEngine([sourceDef], [wisp], { rng: () => 0 });
    const [source, target] = engine.getUnits();
    target.immuneTurns = 3;
    engine.resolveTurn(source, { skillIndex: 0, targetId: target.instanceId });
    expect(target.immuneTurns).toBe(0);
  });

  it("70F超再生は実行可能な行動でのみ発生し、回復封じが効く", () => {
    const player = findMonster("wolf", "FIRE")!;
    const boss = { ...findMonster("ancient_demon", "FIRE")!, victoryTarget: true };
    const engine = new BattleEngine([player], [boss], { trialTowerFloor: 70 });
    const enemy = engine.getUnits()[1];
    enemy.currentHp = Math.floor(enemy.maxHp * 0.2);
    enemy.stunTurns = 1;
    (engine as any).takeTurn(enemy);
    const stunnedHp = enemy.currentHp;
    expect(stunnedHp).toBe(Math.floor(enemy.maxHp * 0.2));
    enemy.healBlockTurns = 2;
    enemy.healBlockMultiplier = 0;
    (engine as any).takeTurn(enemy);
    expect(enemy.currentHp).toBe(stunnedHp);
  });

  it("90Fは8回目の実行可能なボスターンで永続狂化する", () => {
    const player = findMonster("wolf", "FIRE")!;
    const boss = { ...findMonster("ancient_demon", "FIRE")!, victoryTarget: true };
    const engine = new BattleEngine([player], [boss], { trialTowerFloor: 90 });
    const enemy = engine.getUnits()[1];
    for (let i = 0; i < 8; i++) (engine as any).applyTrialBossAction(enemy);
    expect(enemy.effects.some((e) => e.stat === "atk" && e.remainingTurns === 999)).toBe(true);
    expect(enemy.effects.some((e) => e.stat === "spd" && e.remainingTurns === 999)).toBe(true);
  });
});
