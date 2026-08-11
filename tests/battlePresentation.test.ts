import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { Skill } from "../src/core/skill.js";
import { findMonster } from "../src/data/monsters.js";

function withSkills(def: MonsterDefinition, skills: [Skill, Skill, Skill]): MonsterDefinition {
  return { ...def, skills };
}

const debuffSkill: Skill = {
  id: "test_debuff",
  name: "テストデバフ",
  description: "テスト用",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [{ kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 1 }],
};

const damageSkill: Skill = {
  id: "test_damage",
  name: "テストダメージ",
  description: "テスト用",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [{ kind: "DAMAGE", multiplier: 1.0 }],
};

describe("UnitSnapshot(演出用のバフ/デバフ/スタン/火傷情報)", () => {
  it("デバフを受けたユニットのスナップショットにeffectsが反映される", () => {
    const attacker = withSkills(findMonster("slime", "FIRE")!, [debuffSkill, debuffSkill, debuffSkill]);
    const defender = findMonster("golem", "WATER")!;
    const rng = () => 0; // chance/的中判定とも必ず成功させる

    const engine = new BattleEngine([attacker], [defender], { rng, maxTurns: 1 });
    const units = engine.getUnits();
    const player = units.find((u) => u.team === "PLAYER")!;
    const enemy = units.find((u) => u.team === "ENEMY")!;

    const record = engine.resolveTurn(player, { skillIndex: 0, targetId: enemy.instanceId });
    const enemySnapshot = record.snapshot.find((s) => s.instanceId === enemy.instanceId)!;
    expect(enemySnapshot.effects).toHaveLength(1);
    expect(enemySnapshot.effects[0]).toMatchObject({ stat: "def", kind: "DEBUFF", remainingTurns: 2 });
  });

  it("スタン中・火傷中のユニットはstunTurns/burnTurnsがスナップショットに反映される", () => {
    const stunSkill: Skill = {
      id: "test_stun",
      name: "テストスタン",
      description: "テスト用",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [{ kind: "STUN", durationTurns: 1, chance: 1 }],
    };
    const attacker = withSkills(findMonster("slime", "FIRE")!, [stunSkill, stunSkill, stunSkill]);
    const defender = findMonster("golem", "WATER")!;
    const rng = () => 0;

    const engine = new BattleEngine([attacker], [defender], { rng, maxTurns: 1 });
    const units = engine.getUnits();
    const player = units.find((u) => u.team === "PLAYER")!;
    const enemy = units.find((u) => u.team === "ENEMY")!;

    const record = engine.resolveTurn(player, { skillIndex: 0, targetId: enemy.instanceId });
    const enemySnapshot = record.snapshot.find((s) => s.instanceId === enemy.instanceId)!;
    expect(enemySnapshot.stunTurns).toBe(1);
  });
});

describe("TurnRecord.events(演出用のダメージ/回復イベント)", () => {
  it("ダメージを与えるとDAMAGEイベントが記録される", () => {
    const attacker = withSkills(findMonster("wolf", "FIRE")!, [damageSkill, damageSkill, damageSkill]);
    const defender = findMonster("golem", "WATER")!;
    const rng = () => 0.999; // クリティカルにならないように

    const engine = new BattleEngine([attacker], [defender], { rng, maxTurns: 1 });
    const units = engine.getUnits();
    const player = units.find((u) => u.team === "PLAYER")!;
    const enemy = units.find((u) => u.team === "ENEMY")!;

    const record = engine.resolveTurn(player, { skillIndex: 0, targetId: enemy.instanceId });
    const damageEvents = record.events.filter((e) => e.kind === "DAMAGE" && e.targetId === enemy.instanceId);
    expect(damageEvents).toHaveLength(1);
    expect(damageEvents[0].amount).toBeGreaterThan(0);
    expect(damageEvents[0].isCrit).toBe(false);
  });

  it("倒した場合はDEATHイベントも記録される", () => {
    const bigDamageSkill: Skill = {
      id: "test_bigdamage",
      name: "テスト大ダメージ",
      description: "テスト用",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 50 }],
    };
    const attacker = withSkills(findMonster("wolf", "FIRE")!, [bigDamageSkill, bigDamageSkill, bigDamageSkill]);
    const defender = findMonster("golem", "WATER")!;
    const rng = () => 0.999;

    const engine = new BattleEngine([attacker], [defender], { rng, maxTurns: 1 });
    const units = engine.getUnits();
    const player = units.find((u) => u.team === "PLAYER")!;
    const enemy = units.find((u) => u.team === "ENEMY")!;

    const record = engine.resolveTurn(player, { skillIndex: 0, targetId: enemy.instanceId });
    expect(record.events.some((e) => e.kind === "DEATH" && e.targetId === enemy.instanceId)).toBe(true);
  });

  it("回復するとHEALイベントが記録される", () => {
    const healSkill: Skill = {
      id: "test_heal",
      name: "テスト回復",
      description: "テスト用",
      target: "SINGLE_ALLY",
      cooldownTurns: 0,
      effects: [{ kind: "HEAL", healRate: 0.2 }],
    };
    const healer = withSkills(findMonster("fairy", "GRASS")!, [healSkill, healSkill, healSkill]);
    const enemy = findMonster("golem", "WATER")!;
    const rng = () => 0.999;

    const engine = new BattleEngine([healer], [enemy], { rng, maxTurns: 1 });
    const units = engine.getUnits();
    const player = units.find((u) => u.team === "PLAYER")!;
    player.currentHp = Math.round(player.maxHp * 0.5);

    const record = engine.resolveTurn(player, { skillIndex: 0, targetId: player.instanceId });
    const healEvents = record.events.filter((e) => e.kind === "HEAL" && e.targetId === player.instanceId);
    expect(healEvents).toHaveLength(1);
    expect(healEvents[0].amount).toBeGreaterThan(0);
  });
});
