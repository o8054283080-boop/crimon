import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { Skill, SkillEffect } from "../src/core/skill.js";
import { getEffectiveStat } from "../src/battle/unit.js";
import { trialBossTraitsForFloor } from "../src/game/trialTower.js";

const hit: Skill = { id: "hit", name: "攻撃", description: "test", target: "SINGLE_ENEMY", cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.01 }] };

function skill(name: string, effect: SkillEffect): Skill {
  return { id: name, name, description: "test", target: "SINGLE_ENEMY", cooldownTurns: 0, effects: [effect] };
}

function monster(id: string, skills: [Skill, Skill, Skill] = [hit, hit, hit], floor?: 70 | 80 | 90 | 100): MonsterDefinition {
  return {
    id, templateId: id, name: id, element: "FIRE", color: "#000", role: "test", emoji: "?",
    stats: { hp: 10_000, atk: 100, def: 100, spd: 100, criRate: 0, criDmg: 0.5, resistance: 0, accuracy: 100 },
    skills, bossTraits: floor ? { trialBossFloor: floor } : undefined,
  };
}

function engineFor(floor: 70 | 80 | 90 | 100, playerSkills: [Skill, Skill, Skill] = [hit, hit, hit]) {
  const engine = new BattleEngine([monster("player", playerSkills)], [monster("boss", [hit, hit, hit], floor)], { rng: () => 0 });
  return { engine, player: engine.getUnits()[0], boss: engine.getUnits()[1] };
}

describe("試練の塔 特殊ボス", () => {
  it("70Fは被弾時でなく自身の手番開始時に超再生し、治癒阻害で抑えられる", () => {
    const block = skill("治癒阻害", { kind: "HEAL_BLOCK", durationTurns: 2, healMultiplier: 0, chance: 1 });
    const { engine, player, boss } = engineFor(70, [hit, block, hit]);
    boss.currentHp = 2_000;
    engine.resolveTurn(player, { skillIndex: 0, targetId: boss.instanceId });
    expect(boss.currentHp).toBeLessThan(2_000); // 被弾では回復しない
    engine.resolveTurn(player, { skillIndex: 1, targetId: boss.instanceId });
    const blockedHp = boss.currentHp;
    const record = engine.resolveTurn(boss, { skillIndex: 0, targetId: player.instanceId });
    expect(boss.currentHp).toBe(blockedHp);
    expect(record.lines.some((line) => line.includes("超再生"))).toBe(true);
  });

  it("70Fではスタンとゲージ減少が従来通り機能する", () => {
    const stun = skill("気絶", { kind: "STUN", durationTurns: 2, chance: 1 });
    const gauge = skill("遅延", { kind: "GAUGE", amount: -0.5 });
    const { engine, player, boss } = engineFor(70, [stun, gauge, hit]);
    boss.gauge = 80;
    engine.resolveTurn(player, { skillIndex: 0, targetId: boss.instanceId });
    expect(boss.stunTurns).toBe(2);
    engine.resolveTurn(player, { skillIndex: 1, targetId: boss.instanceId });
    expect(boss.gauge).toBe(30);
  });

  it("80Fは有限免疫を持ち、剥がした後はデバフを受ける", () => {
    const poison = skill("毒", { kind: "POISON", durationTurns: 2, damageRatePerStack: 0.05, chance: 1 });
    const strip = skill("剥がし", { kind: "STRIP", chance: 1 });
    const { engine, player, boss } = engineFor(80, [poison, strip, hit]);
    expect(boss.immuneTurns).toBe(3);
    engine.resolveTurn(player, { skillIndex: 0, targetId: boss.instanceId });
    expect(boss.poisonStacks).toBe(0);
    engine.resolveTurn(player, { skillIndex: 1, targetId: boss.instanceId });
    expect(boss.immuneTurns).toBe(0);
    engine.resolveTurn(player, { skillIndex: 0, targetId: boss.instanceId });
    expect(boss.poisonStacks).toBe(1);
    for (let i = 0; i < 4; i += 1) engine.resolveTurn(boss, { skillIndex: 0, targetId: player.instanceId });
    expect(boss.immuneTurns).toBeGreaterThan(0); // 一定CTで再展開
  });

  it("90Fは8手目に狂化しATK/SPDが大幅上昇する", () => {
    const { engine, player, boss } = engineFor(90);
    const atk = getEffectiveStat(boss, "atk");
    const spd = getEffectiveStat(boss, "spd");
    for (let i = 0; i < 8; i += 1) engine.resolveTurn(boss, { skillIndex: 0, targetId: player.instanceId });
    expect(boss.bossPhases).toContain("ENRAGED");
    expect(getEffectiveStat(boss, "atk")).toBeGreaterThanOrEqual(atk * 3);
    expect(getEffectiveStat(boss, "spd")).toBeGreaterThanOrEqual(spd * 2);
  });

  it("100FはHP帯で再生・免疫・狂化・最終試練を複合する", () => {
    const { engine, player, boss } = engineFor(100);
    boss.currentHp = 7_500;
    engine.resolveTurn(boss, { skillIndex: 0, targetId: player.instanceId });
    expect(boss.currentHp).toBe(10_000);
    boss.currentHp = 3_500;
    while (boss.bossTurnsTaken < 4) engine.resolveTurn(boss, { skillIndex: 0, targetId: player.instanceId });
    expect(boss.immuneTurns).toBeGreaterThan(0);
    expect(boss.bossPhases).toContain("ENRAGED");
    boss.currentHp = 900;
    engine.resolveTurn(boss, { skillIndex: 0, targetId: player.instanceId });
    expect(boss.bossPhases).toContain("LAST_STAND");
  });

  it("特殊特性は指定4階だけに割り当てる", () => {
    expect(trialBossTraitsForFloor(69)).toBeUndefined();
    expect(trialBossTraitsForFloor(70)?.trialBossFloor).toBe(70);
    expect(trialBossTraitsForFloor(80)?.trialBossFloor).toBe(80);
    expect(trialBossTraitsForFloor(90)?.trialBossFloor).toBe(90);
    expect(trialBossTraitsForFloor(100)?.trialBossFloor).toBe(100);
  });
});
