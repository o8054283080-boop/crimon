import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { Skill } from "../src/core/skill.js";
import { findMonster } from "../src/data/monsters.js";

function withSkills(def: MonsterDefinition, skills: [Skill, Skill, Skill]): MonsterDefinition {
  return { ...def, skills };
}

const gaugeSkill: Skill = {
  id: "test_gauge",
  name: "テスト行動ゲージ",
  description: "テスト用",
  target: "ALL_ALLIES",
  cooldownTurns: 0,
  effects: [{ kind: "GAUGE", amount: 0.2 }],
};

describe("GAUGE効果(行動ゲージ操作)", () => {
  it("味方全体の行動ゲージがamount分だけ即座に進む", () => {
    const caster = withSkills(findMonster("wolf", "FIRE")!, [gaugeSkill, gaugeSkill, gaugeSkill]);
    const ally = findMonster("golem", "WATER")!;
    const enemy = findMonster("slime", "GRASS")!;

    const engine = new BattleEngine([caster, ally], [enemy], { rng: () => 0.999, maxTurns: 1 });
    const units = engine.getUnits();
    const casterUnit = units.find((u) => u.instanceId === "P1")!;
    const allyUnit = units.find((u) => u.instanceId === "P2")!;

    const gaugeBefore = allyUnit.gauge;
    engine.resolveTurn(casterUnit, { skillIndex: 0 });

    expect(allyUnit.gauge).toBeCloseTo(gaugeBefore + 20, 5);
  });

  it("行動ゲージが100を超えて進んでも、他ユニットのゲージを巻き戻さない(負のticks回避)", () => {
    const bigGaugeSkill: Skill = { ...gaugeSkill, effects: [{ kind: "GAUGE", amount: 1.5 }] };
    const caster = withSkills(findMonster("wolf", "FIRE")!, [bigGaugeSkill, bigGaugeSkill, bigGaugeSkill]);
    const ally = findMonster("golem", "WATER")!;
    const enemy = findMonster("slime", "GRASS")!;

    const engine = new BattleEngine([caster, ally], [enemy], { rng: () => 0.999, maxTurns: 1 });
    const units = engine.getUnits();
    const casterUnit = units.find((u) => u.instanceId === "P1")!;
    const enemyUnit = units.find((u) => u.instanceId === "E1")!;

    const enemyGaugeBefore = enemyUnit.gauge;
    engine.resolveTurn(casterUnit, { skillIndex: 0 });

    // 敵のゲージは減らず(負のticksによる巻き戻りが起きない)、0以上のまま
    expect(enemyUnit.gauge).toBeGreaterThanOrEqual(enemyGaugeBefore);
  });
});

describe("最大HPスケーリングダメージ(scaleBonus stat:hp)", () => {
  it("自身の最大HPが高いほどダメージが増える", () => {
    const hpScaleDamageSkill: Skill = {
      id: "test_hp_scale_damage",
      name: "テスト最大HPスケールダメージ",
      description: "テスト用",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 2.0, scaleBonus: { stat: "hp", bonusAtReference: 0.9 } }],
    };
    const plainDamageSkill: Skill = {
      id: "test_plain_damage",
      name: "テスト通常ダメージ",
      description: "テスト用",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 2.0 }],
    };

    const attacker = withSkills(findMonster("dragon", "FIRE")!, [hpScaleDamageSkill, hpScaleDamageSkill, hpScaleDamageSkill]);
    const plainAttacker = withSkills(findMonster("dragon", "FIRE")!, [plainDamageSkill, plainDamageSkill, plainDamageSkill]);
    const defender = findMonster("golem", "WATER")!;
    const noCrit = () => 0.999;

    const engineScaled = new BattleEngine([attacker], [defender], { rng: noCrit, maxTurns: 1 });
    const unitsScaled = engineScaled.getUnits();
    const recordScaled = engineScaled.resolveTurn(unitsScaled.find((u) => u.team === "PLAYER")!, {
      skillIndex: 0,
      targetId: unitsScaled.find((u) => u.team === "ENEMY")!.instanceId,
    });
    const scaledDamage = recordScaled.events.find((e) => e.kind === "DAMAGE")!.amount!;

    const enginePlain = new BattleEngine([plainAttacker], [defender], { rng: noCrit, maxTurns: 1 });
    const unitsPlain = enginePlain.getUnits();
    const recordPlain = enginePlain.resolveTurn(unitsPlain.find((u) => u.team === "PLAYER")!, {
      skillIndex: 0,
      targetId: unitsPlain.find((u) => u.team === "ENEMY")!.instanceId,
    });
    const plainDamage = recordPlain.events.find((e) => e.kind === "DAMAGE")!.amount!;

    expect(scaledDamage).toBeGreaterThan(plainDamage);
  });
});
