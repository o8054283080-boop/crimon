import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { getEffectiveStat } from "../src/battle/unit.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { Skill } from "../src/core/skill.js";
import { findMonster } from "../src/data/monsters.js";

/**
 * 「術者や味方に向いた効果」が、全体技で対象の数だけ重ねがけされないことの検証。
 *
 * 効果の解決は対象1体ごとに走るため、素直に書くと敵4体の全体技で
 * 自己バフが4重にかかっていた。グレイヴナイトの「たてうけ」は
 * 防御+50%のつもりが、味方4体ぶんで+200%になっていた。
 */

const idle: Skill = {
  id: "test_idle",
  name: "テスト待機",
  description: "テスト用",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [],
};

/** 検証したい1手だけを見たいので、術者を最速にして最初に行動させる */
function caster(skill: Skill): MonsterDefinition {
  const def = findMonster("knight", "WATER")!;
  return { ...def, skills: [skill, skill, skill], stats: { ...def.stats, spd: 300 } };
}

function bystander(templateId: string, element: string): MonsterDefinition {
  const def = findMonster(templateId, element)!;
  return { ...def, skills: [idle, idle, idle], stats: { ...def.stats, spd: 50 } };
}

const ALLY_IDS = ["golem", "fairy", "wolf"];
const ENEMY_IDS = ["slime", "wolf", "golem", "fairy"];

describe("術者に向いた効果は1回だけ乗る", () => {
  it("味方全体を対象にした技の applyTo:SELF は、味方の数だけ重ならない", () => {
    const skill: Skill = {
      id: "test_self_buff",
      name: "テスト自己バフ",
      description: "テスト用",
      target: "ALL_ALLIES",
      cooldownTurns: 0,
      effects: [{ kind: "BUFF", stat: "def", amount: 0.5, durationTurns: 3, applyTo: "SELF" }],
    };

    const engine = new BattleEngine(
      [caster(skill), ...ALLY_IDS.map((id) => bystander(id, "WATER"))],
      [bystander("slime", "FIRE")],
      { rng: () => 0.5, maxTurns: 1 },
    );
    engine.run();

    const unit = engine.getUnits().find((u) => u.def.templateId === "knight")!;
    expect(unit.effects.filter((e) => e.stat === "def")).toHaveLength(1);
    expect(getEffectiveStat(unit, "def")).toBe(Math.round(unit.def.stats.def * 1.5));
  });

  it("敵全体を対象にした技の applyTo:ALLIES は、敵の数だけ重ならない", () => {
    const skill: Skill = {
      id: "test_ally_buff",
      name: "テスト味方バフ",
      description: "テスト用",
      target: "ALL_ENEMIES",
      cooldownTurns: 0,
      effects: [{ kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 3, applyTo: "ALLIES" }],
    };

    const engine = new BattleEngine(
      [caster(skill)],
      ENEMY_IDS.map((id) => bystander(id, "FIRE")),
      { rng: () => 0.5, maxTurns: 1 },
    );
    engine.run();

    const unit = engine.getUnits().find((u) => u.def.templateId === "knight")!;
    expect(unit.effects.filter((e) => e.stat === "atk")).toHaveLength(1);
  });

  it("敵全体を対象にした技の自己回復は、敵の数だけ回復しない", () => {
    const skill: Skill = {
      id: "test_self_heal",
      name: "テスト自己回復",
      description: "テスト用",
      target: "ALL_ENEMIES",
      cooldownTurns: 0,
      effects: [{ kind: "HEAL", healRate: 0.1, toSelf: true }],
    };

    const engine = new BattleEngine(
      [caster(skill)],
      ENEMY_IDS.map((id) => bystander(id, "FIRE")),
      { rng: () => 0.5, maxTurns: 1 },
    );
    const unit = engine.getUnits().find((u) => u.def.templateId === "knight")!;
    unit.currentHp = 1;
    engine.run();

    // 最大HPの10%を1回ぶんだけ回復している(4回なら40%を超える)
    expect(unit.currentHp).toBe(1 + Math.round(unit.maxHp * 0.1));
  });

  it("ライフスティールは対象ごとに乗る(与えたダメージに比例するため)", () => {
    const single: Skill = {
      id: "test_drain_single",
      name: "テスト吸収(単体)",
      description: "テスト用",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [
        { kind: "DAMAGE", multiplier: 1.0 },
        { kind: "LIFESTEAL", healRate: 0.5 },
      ],
    };
    const all: Skill = { ...single, id: "test_drain_all", name: "テスト吸収(全体)", target: "ALL_ENEMIES" };

    const healed = (skill: Skill) => {
      const engine = new BattleEngine(
        [caster(skill)],
        ENEMY_IDS.map((id) => bystander(id, "GRASS")),
        { rng: () => 0.5, maxTurns: 1 },
      );
      const unit = engine.getUnits().find((u) => u.def.templateId === "knight")!;
      unit.currentHp = 1;
      engine.run();
      return unit.currentHp - 1;
    };

    // 4体を殴った方が明確に多く回復する。ここを1回に丸めてしまうと、
    // 全体攻撃+吸収のスキルが単体攻撃と同じ回復量になってしまう
    expect(healed(all)).toBeGreaterThan(healed(single));
  });
});
