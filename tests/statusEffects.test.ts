import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { Skill } from "../src/core/skill.js";
import { findMonster } from "../src/data/monsters.js";

function withStats(def: MonsterDefinition, overrides: Partial<MonsterDefinition["stats"]>): MonsterDefinition {
  return { ...def, stats: { ...def.stats, ...overrides } };
}

function withSkills(def: MonsterDefinition, skills: [Skill, Skill, Skill]): MonsterDefinition {
  return { ...def, skills };
}

const debuffSkill: Skill = {
  id: "test_debuff",
  name: "テストデバフ",
  description: "テスト用",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [{ kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2 }],
};

describe("状態異常の命中率計算(命中率/抵抗率)", () => {
  it("命中率100%・抵抗率50%の相手には約75%の確率で成功する(境界値でちょうど切り替わる)", () => {
    const attacker = withSkills(withStats(findMonster("slime", "FIRE")!, { accuracy: 1 }), [debuffSkill, debuffSkill, debuffSkill]);
    const defender = withStats(findMonster("golem", "WATER")!, { resistance: 0.5 });

    // rollEffectSuccessは1回目にchance判定(chance未指定=常に成功する)、
    // 2回目に的中率判定を行う。的中率は (1-0.5+1)/(1+1) = 0.75。
    const succeedRng = (() => {
      const values = [0, 0.74999];
      let i = 0;
      return () => values[Math.min(i++, values.length - 1)];
    })();
    const failRng = (() => {
      const values = [0, 0.75001];
      let i = 0;
      return () => values[Math.min(i++, values.length - 1)];
    })();

    const engineSucceed = new BattleEngine([attacker], [defender], { rng: succeedRng, maxTurns: 1 });
    const unitsSucceed = engineSucceed.getUnits();
    const target1 = unitsSucceed.find((u) => u.team === "ENEMY")!;
    engineSucceed.resolveTurn(unitsSucceed.find((u) => u.team === "PLAYER")!, { skillIndex: 0, targetId: target1.instanceId });
    expect(target1.effects.some((e) => e.stat === "def" && e.amount < 0)).toBe(true);

    const engineFail = new BattleEngine([attacker], [defender], { rng: failRng, maxTurns: 1 });
    const unitsFail = engineFail.getUnits();
    const target2 = unitsFail.find((u) => u.team === "ENEMY")!;
    engineFail.resolveTurn(unitsFail.find((u) => u.team === "PLAYER")!, { skillIndex: 0, targetId: target2.instanceId });
    expect(target2.effects.some((e) => e.stat === "def" && e.amount < 0)).toBe(false);
  });

  it("命中率・抵抗率がともに0なら状態異常は必ず成功する", () => {
    const attacker = withSkills(withStats(findMonster("slime", "FIRE")!, { accuracy: 0 }), [debuffSkill, debuffSkill, debuffSkill]);
    const defender = withStats(findMonster("golem", "WATER")!, { resistance: 0 });

    const rng = () => 0.99; // chance判定・的中判定とも常に成功する側
    const engine = new BattleEngine([attacker], [defender], { rng, maxTurns: 1 });
    const units = engine.getUnits();
    const target = units.find((u) => u.team === "ENEMY")!;
    engine.resolveTurn(units.find((u) => u.team === "PLAYER")!, { skillIndex: 0, targetId: target.instanceId });
    expect(target.effects.some((e) => e.stat === "def" && e.amount < 0)).toBe(true);
  });

  it("抵抗率100%・命中率0%なら状態異常は絶対に成功しない", () => {
    const attacker = withSkills(withStats(findMonster("slime", "FIRE")!, { accuracy: 0 }), [debuffSkill, debuffSkill, debuffSkill]);
    const defender = withStats(findMonster("golem", "WATER")!, { resistance: 1 });

    const rng = () => 0; // chance判定は成功させるが、的中率0%なので絶対に外れる
    const engine = new BattleEngine([attacker], [defender], { rng, maxTurns: 1 });
    const units = engine.getUnits();
    const target = units.find((u) => u.team === "ENEMY")!;
    engine.resolveTurn(units.find((u) => u.team === "PLAYER")!, { skillIndex: 0, targetId: target.instanceId });
    expect(target.effects.some((e) => e.stat === "def" && e.amount < 0)).toBe(false);
  });
});

const burnSkill: Skill = {
  id: "test_burn",
  name: "テスト火傷",
  description: "テスト用",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [{ kind: "BURN", durationTurns: 1, chance: 1 }],
};

describe("火傷(BURN)", () => {
  it("付与された相手は自分の手番終了時に自身の攻撃力分のダメージを受ける(付与した側のターンでは発動しない)", () => {
    const attacker = withSkills(findMonster("slime", "FIRE")!, [burnSkill, burnSkill, burnSkill]);
    const defender = findMonster("golem", "WATER")!;

    const engine = new BattleEngine([attacker], [defender], { rng: () => 0, maxTurns: 1 });
    const units = engine.getUnits();
    const player = units.find((u) => u.team === "PLAYER")!;
    const enemy = units.find((u) => u.team === "ENEMY")!;

    engine.resolveTurn(player, { skillIndex: 0, targetId: enemy.instanceId });
    expect(enemy.burnTurns).toBe(1); // 付与された直後(自身のターンはまだ来ていないので未発動)

    const hpBefore = enemy.currentHp;
    engine.resolveTurn(enemy);
    expect(enemy.burnTurns).toBe(0);
    expect(enemy.currentHp).toBeLessThan(hpBefore);
  });
});

const lifestealSkill: Skill = {
  id: "test_lifesteal",
  name: "テストライフスティール",
  description: "テスト用",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [
    { kind: "DAMAGE", multiplier: 1.0 },
    { kind: "LIFESTEAL", healRate: 0.5 },
  ],
};

describe("ライフスティール(LIFESTEAL)", () => {
  it("敵単体攻撃スキルでも、ダメージを与えた自分自身が回復する(攻撃対象ではなく)", () => {
    const attacker = withSkills(findMonster("wolf", "FIRE")!, [lifestealSkill, lifestealSkill, lifestealSkill]);
    const defender = findMonster("golem", "WATER")!;

    const engine = new BattleEngine([attacker], [defender], { rng: () => 0.999, maxTurns: 1 });
    const units = engine.getUnits();
    const player = units.find((u) => u.team === "PLAYER")!;
    const enemy = units.find((u) => u.team === "ENEMY")!;

    player.currentHp = Math.round(player.maxHp * 0.5);
    const hpBefore = player.currentHp;
    const enemyHpBefore = enemy.currentHp;

    engine.resolveTurn(player, { skillIndex: 0, targetId: enemy.instanceId });

    expect(enemy.currentHp).toBeLessThan(enemyHpBefore);
    expect(player.currentHp).toBeGreaterThan(hpBefore);
  });
});
