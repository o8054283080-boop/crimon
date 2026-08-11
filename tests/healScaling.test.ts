import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { Skill } from "../src/core/skill.js";
import { findMonster } from "../src/data/monsters.js";

function withSkills(def: MonsterDefinition, skills: [Skill, Skill, Skill]): MonsterDefinition {
  return { ...def, skills };
}

const defScaleHealSkill: Skill = {
  id: "test_def_heal",
  name: "テスト防御回復",
  description: "テスト用",
  target: "SELF",
  cooldownTurns: 0,
  effects: [{ kind: "HEAL", scaleStat: "def", healRate: 1.8 }],
};

const atkScaleHealSkill: Skill = {
  id: "test_atk_heal",
  name: "テスト攻撃回復",
  description: "テスト用",
  target: "SELF",
  cooldownTurns: 0,
  effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 1.0 }],
};

describe("回復スキルの能力値依存(scaleStat)", () => {
  it("DEF依存の回復は自身の防御力×healRateで計算される(最大HP依存ではない)", () => {
    const dragon = withSkills(findMonster("dragon", "ELECTRIC")!, [defScaleHealSkill, defScaleHealSkill, defScaleHealSkill]);
    const weakEnemy = findMonster("slime", "FIRE")!;
    const engine = new BattleEngine([dragon], [weakEnemy], { rng: () => 0.999 });

    const actor = engine.getNextActor();
    expect(actor).not.toBeNull();
    const dragonUnit = actor!;
    dragonUnit.currentHp = 1; // 最大HP依存の回復なら極端に少ない量になるはず

    const record = engine.resolveTurn(dragonUnit, { skillIndex: 0 });
    const expectedHeal = Math.round(dragonUnit.def.stats.def * 1.8);
    const snapshot = record.snapshot.find((s) => s.instanceId === dragonUnit.instanceId)!;

    expect(snapshot.currentHp).toBe(Math.min(dragonUnit.maxHp, 1 + expectedHeal));
    // 最大HPの何割か、という回復量よりずっと大きい(防御力ベースの回復が効いていることの確認)
    expect(expectedHeal).toBeGreaterThan(dragonUnit.maxHp * 0.05);
  });

  it("ATK依存の回復は自身の攻撃力×healRateで計算される", () => {
    const nemesis = withSkills(findMonster("nemesis", "LIGHT")!, [atkScaleHealSkill, atkScaleHealSkill, atkScaleHealSkill]);
    const weakEnemy = findMonster("slime", "FIRE")!;
    const engine = new BattleEngine([nemesis], [weakEnemy], { rng: () => 0.999 });

    const actor = engine.getNextActor();
    const nemesisUnit = actor!;
    nemesisUnit.currentHp = 1;

    const record = engine.resolveTurn(nemesisUnit, { skillIndex: 0 });
    const expectedHeal = Math.round(nemesisUnit.def.stats.atk * 1.0);
    const snapshot = record.snapshot.find((s) => s.instanceId === nemesisUnit.instanceId)!;

    expect(snapshot.currentHp).toBe(Math.min(nemesisUnit.maxHp, 1 + expectedHeal));
  });
});
