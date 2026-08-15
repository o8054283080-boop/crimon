import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { getEffectiveStat } from "../src/battle/unit.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { Skill } from "../src/core/skill.js";
import { findMonster } from "../src/data/monsters.js";

function withSkills(def: MonsterDefinition, skills: [Skill, Skill, Skill]): MonsterDefinition {
  return { ...def, skills };
}

function withStats(def: MonsterDefinition, overrides: Partial<MonsterDefinition["stats"]>): MonsterDefinition {
  return { ...def, stats: { ...def.stats, ...overrides } };
}

const plainAttackSkill: Skill = {
  id: "test_plain_attack",
  name: "テスト攻撃",
  description: "テスト用",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [{ kind: "DAMAGE", multiplier: 1.0 }],
};

describe("シールド(SHIELD)", () => {
  const shieldSkill: Skill = {
    id: "test_shield",
    name: "テストシールド",
    description: "テスト用",
    target: "SINGLE_ALLY",
    cooldownTurns: 0,
    effects: [{ kind: "SHIELD", shieldRate: 0.1, durationTurns: 2 }],
  };

  it("シールドはHPより先にダメージを吸収する", () => {
    const caster = withSkills(findMonster("fairy", "GRASS")!, [shieldSkill, shieldSkill, shieldSkill]);
    // 味方が自分でシールドを張り直すと残りターンの検証にならないので、何もしないスキルにしておく
    const idleSkill: Skill = {
      id: "test_idle",
      name: "テスト待機",
      description: "テスト用",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [],
    };
    const ally = withSkills(findMonster("golem", "WATER")!, [idleSkill, idleSkill, idleSkill]);
    const attacker = withSkills(findMonster("wolf", "FIRE")!, [plainAttackSkill, plainAttackSkill, plainAttackSkill]);

    const engine = new BattleEngine([caster, ally], [attacker], { rng: () => 0.999, maxTurns: 1 });
    const units = engine.getUnits();
    const casterUnit = units.find((u) => u.instanceId === "P1")!;
    const allyUnit = units.find((u) => u.instanceId === "P2")!;
    const attackerUnit = units.find((u) => u.instanceId === "E1")!;

    engine.resolveTurn(casterUnit, { skillIndex: 0, targetId: allyUnit.instanceId });
    expect(allyUnit.shieldValue).toBe(Math.round(allyUnit.maxHp * 0.1));

    const hpBefore = allyUnit.currentHp;
    const shieldBefore = allyUnit.shieldValue;
    engine.resolveTurn(attackerUnit, { skillIndex: 0, targetId: allyUnit.instanceId });

    // シールドで防いだ分だけダメージが減り、シールド自体も削れる
    expect(allyUnit.shieldValue).toBeLessThan(shieldBefore);
    if (allyUnit.shieldValue > 0) {
      expect(allyUnit.currentHp).toBe(hpBefore);
    }
  });

  it("シールドの残りターンが尽きると消滅する", () => {
    const caster = withSkills(findMonster("fairy", "GRASS")!, [shieldSkill, shieldSkill, shieldSkill]);
    // 味方が自分でシールドを張り直すと残りターンの検証にならないので、何もしないスキルにしておく
    const idleSkill: Skill = {
      id: "test_idle",
      name: "テスト待機",
      description: "テスト用",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [],
    };
    const ally = withSkills(findMonster("golem", "WATER")!, [idleSkill, idleSkill, idleSkill]);
    const enemy = findMonster("slime", "FIRE")!;

    const engine = new BattleEngine([caster, ally], [enemy], { rng: () => 0.999, maxTurns: 1 });
    const units = engine.getUnits();
    const casterUnit = units.find((u) => u.instanceId === "P1")!;
    const allyUnit = units.find((u) => u.instanceId === "P2")!;

    engine.resolveTurn(casterUnit, { skillIndex: 0, targetId: allyUnit.instanceId });
    expect(allyUnit.shieldTurns).toBe(2);

    engine.resolveTurn(allyUnit);
    expect(allyUnit.shieldTurns).toBe(1);
    engine.resolveTurn(allyUnit);
    expect(allyUnit.shieldTurns).toBe(0);
    expect(allyUnit.shieldValue).toBe(0);
  });
});

describe("状態異常免疫(IMMUNITY)", () => {
  const immunitySkill: Skill = {
    id: "test_immunity",
    name: "テスト免疫",
    description: "テスト用",
    target: "SELF",
    cooldownTurns: 0,
    effects: [{ kind: "IMMUNITY", durationTurns: 2 }],
  };
  const stunSkill: Skill = {
    id: "test_stun",
    name: "テストスタン",
    description: "テスト用",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "STUN", durationTurns: 1, chance: 1 }],
  };
  const debuffSkill: Skill = {
    id: "test_immunity_debuff",
    name: "テストデバフ",
    description: "テスト用",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2 }],
  };

  it("免疫中はスタンが付与されない", () => {
    const defender = withSkills(findMonster("golem", "WATER")!, [immunitySkill, immunitySkill, immunitySkill]);
    const attacker = withSkills(findMonster("wolf", "FIRE")!, [stunSkill, stunSkill, stunSkill]);

    const engine = new BattleEngine([defender], [attacker], { rng: () => 0, maxTurns: 1 });
    const units = engine.getUnits();
    const defenderUnit = units.find((u) => u.team === "PLAYER")!;
    const attackerUnit = units.find((u) => u.team === "ENEMY")!;

    engine.resolveTurn(defenderUnit, { skillIndex: 0 });
    expect(defenderUnit.immuneTurns).toBe(2);

    engine.resolveTurn(attackerUnit, { skillIndex: 0, targetId: defenderUnit.instanceId });
    expect(defenderUnit.stunTurns).toBe(0);
  });

  it("免疫中は新しいデバフが付与されない", () => {
    const defender = withSkills(findMonster("golem", "WATER")!, [immunitySkill, immunitySkill, immunitySkill]);
    const attacker = withSkills(findMonster("wolf", "FIRE")!, [debuffSkill, debuffSkill, debuffSkill]);

    const engine = new BattleEngine([defender], [attacker], { rng: () => 0, maxTurns: 1 });
    const units = engine.getUnits();
    const defenderUnit = units.find((u) => u.team === "PLAYER")!;
    const attackerUnit = units.find((u) => u.team === "ENEMY")!;

    engine.resolveTurn(defenderUnit, { skillIndex: 0 });
    engine.resolveTurn(attackerUnit, { skillIndex: 0, targetId: defenderUnit.instanceId });

    expect(defenderUnit.effects.some((e) => e.stat === "atk" && e.amount < 0)).toBe(false);
  });
});

describe("防御力無視ダメージ (ignoreDefense)", () => {
  it("ignoreDefenseが付いたスキルは、通常攻撃より防御力の高い相手に大きいダメージを与える", () => {
    const ignoreDefSkill: Skill = {
      id: "test_ignore_def",
      name: "テスト防御無視",
      description: "テスト用",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 1.0, ignoreDefense: true }],
    };

    const attacker1 = withSkills(findMonster("wolf", "FIRE")!, [ignoreDefSkill, ignoreDefSkill, ignoreDefSkill]);
    const attacker2 = withSkills(findMonster("wolf", "FIRE")!, [plainAttackSkill, plainAttackSkill, plainAttackSkill]);
    const defender = withStats(findMonster("golem", "WATER")!, { def: 2000 });
    const noCrit = () => 0.999;

    const engine1 = new BattleEngine([attacker1], [defender], { rng: noCrit, maxTurns: 1 });
    const units1 = engine1.getUnits();
    const record1 = engine1.resolveTurn(units1.find((u) => u.team === "PLAYER")!, {
      skillIndex: 0,
      targetId: units1.find((u) => u.team === "ENEMY")!.instanceId,
    });
    const ignoreDefDamage = record1.events.find((e) => e.kind === "DAMAGE")!.amount!;

    const engine2 = new BattleEngine([attacker2], [defender], { rng: noCrit, maxTurns: 1 });
    const units2 = engine2.getUnits();
    const record2 = engine2.resolveTurn(units2.find((u) => u.team === "PLAYER")!, {
      skillIndex: 0,
      targetId: units2.find((u) => u.team === "ENEMY")!.instanceId,
    });
    const normalDamage = record2.events.find((e) => e.kind === "DAMAGE")!.amount!;

    expect(ignoreDefDamage).toBeGreaterThan(normalDamage);
  });
});

describe("継続回復(REGEN)", () => {
  const regenSkill: Skill = {
    id: "test_regen",
    name: "テスト継続回復",
    description: "テスト用",
    target: "SINGLE_ALLY",
    cooldownTurns: 0,
    effects: [{ kind: "REGEN", healRate: 0.1, durationTurns: 2 }],
  };

  it("自分の手番開始時に最大HPのhealRate分回復する", () => {
    const caster = withSkills(findMonster("fairy", "GRASS")!, [regenSkill, regenSkill, regenSkill]);
    const ally = findMonster("golem", "WATER")!;
    const enemy = findMonster("slime", "FIRE")!;

    const engine = new BattleEngine([caster, ally], [enemy], { rng: () => 0.999, maxTurns: 1 });
    const units = engine.getUnits();
    const casterUnit = units.find((u) => u.instanceId === "P1")!;
    const allyUnit = units.find((u) => u.instanceId === "P2")!;

    engine.resolveTurn(casterUnit, { skillIndex: 0, targetId: allyUnit.instanceId });
    expect(allyUnit.regenTurns).toBe(2);

    allyUnit.currentHp = Math.round(allyUnit.maxHp * 0.5);
    const hpBefore = allyUnit.currentHp;
    engine.resolveTurn(allyUnit);

    expect(allyUnit.currentHp).toBe(hpBefore + Math.round(allyUnit.maxHp * 0.1));
    expect(allyUnit.regenTurns).toBe(1);
  });
});

describe("デバフ解除(CLEANSE)", () => {
  it("対象にかかっているデバフを全て取り除く", () => {
    const cleanseSkill: Skill = {
      id: "test_cleanse",
      name: "テストデバフ解除",
      description: "テスト用",
      target: "SELF",
      cooldownTurns: 0,
      effects: [{ kind: "CLEANSE" }],
    };
    const target = withSkills(findMonster("golem", "WATER")!, [cleanseSkill, cleanseSkill, cleanseSkill]);
    const enemy = findMonster("slime", "FIRE")!;

    const engine = new BattleEngine([target], [enemy], { rng: () => 0.999, maxTurns: 1 });
    const units = engine.getUnits();
    const targetUnit = units.find((u) => u.team === "PLAYER")!;

    targetUnit.effects.push({ stat: "atk", amount: -0.5, remainingTurns: 3, kind: "DEBUFF" });
    targetUnit.effects.push({ stat: "spd", amount: 0.3, remainingTurns: 3, kind: "BUFF" });

    engine.resolveTurn(targetUnit, { skillIndex: 0 });

    expect(targetUnit.effects.some((e) => e.kind === "DEBUFF")).toBe(false);
    // バフは解除対象外
    expect(targetUnit.effects.some((e) => e.kind === "BUFF")).toBe(true);
  });
});

describe("クリ率/クリダメバフ (criRate/criDmg)", () => {
  it("クリ率バフを乗せると、通常なら外れる乱数値でも会心になる", () => {
    const critRateBuffSkill: Skill = {
      id: "test_crit_rate_buff",
      name: "テストクリ率バフ",
      description: "テスト用",
      target: "SELF",
      cooldownTurns: 0,
      effects: [{ kind: "BUFF", stat: "criRate", amount: 0.5, durationTurns: 2 }],
    };
    const attacker = withSkills(
      withStats(findMonster("wolf", "FIRE")!, { criRate: 0.2 }),
      [critRateBuffSkill, plainAttackSkill, plainAttackSkill],
    );
    const defender = findMonster("golem", "WATER")!;

    // rng=0.5は素のクリ率0.2では外れるが、+50%バフ後の0.7なら当たる
    const rng = () => 0.5;
    const engine = new BattleEngine([attacker], [defender], { rng, maxTurns: 1 });
    const units = engine.getUnits();
    const attackerUnit = units.find((u) => u.team === "PLAYER")!;
    const defenderUnit = units.find((u) => u.team === "ENEMY")!;

    engine.resolveTurn(attackerUnit, { skillIndex: 0 });
    expect(attackerUnit.effects.some((e) => e.stat === "criRate")).toBe(true);

    const record = engine.resolveTurn(attackerUnit, { skillIndex: 1, targetId: defenderUnit.instanceId });
    const damageEvent = record.events.find((e) => e.kind === "DAMAGE")!;
    expect(damageEvent.isCrit).toBe(true);
  });

  it("クリダメバフを乗せると、会心時のダメージがより大きくなる", () => {
    const critDmgBuffSkill: Skill = {
      id: "test_crit_dmg_buff",
      name: "テストクリダメバフ",
      description: "テスト用",
      target: "SELF",
      cooldownTurns: 0,
      effects: [{ kind: "BUFF", stat: "criDmg", amount: 0.5, durationTurns: 2 }],
    };
    const attacker = withSkills(
      withStats(findMonster("wolf", "FIRE")!, { criRate: 1 }),
      [critDmgBuffSkill, plainAttackSkill, plainAttackSkill],
    );
    const defender = findMonster("golem", "WATER")!;
    const alwaysCrit = () => 0;

    const engineBuffed = new BattleEngine([attacker], [defender], { rng: alwaysCrit, maxTurns: 1 });
    const unitsBuffed = engineBuffed.getUnits();
    const attackerBuffed = unitsBuffed.find((u) => u.team === "PLAYER")!;
    engineBuffed.resolveTurn(attackerBuffed, { skillIndex: 0 });
    const recordBuffed = engineBuffed.resolveTurn(attackerBuffed, {
      skillIndex: 1,
      targetId: unitsBuffed.find((u) => u.team === "ENEMY")!.instanceId,
    });
    const buffedDamage = recordBuffed.events.find((e) => e.kind === "DAMAGE")!.amount!;

    const plainAttacker = withSkills(withStats(findMonster("wolf", "FIRE")!, { criRate: 1 }), [
      plainAttackSkill,
      plainAttackSkill,
      plainAttackSkill,
    ]);
    const enginePlain = new BattleEngine([plainAttacker], [defender], { rng: alwaysCrit, maxTurns: 1 });
    const unitsPlain = enginePlain.getUnits();
    const recordPlain = enginePlain.resolveTurn(unitsPlain.find((u) => u.team === "PLAYER")!, {
      skillIndex: 0,
      targetId: unitsPlain.find((u) => u.team === "ENEMY")!.instanceId,
    });
    const plainDamage = recordPlain.events.find((e) => e.kind === "DAMAGE")!.amount!;

    expect(buffedDamage).toBeGreaterThan(plainDamage);
  });
});

describe("クールタイム延長 (COOLDOWN_EXTEND)", () => {
  it("対象の全スキルのクールタイムが延長される", () => {
    const cooldownExtendSkill: Skill = {
      id: "test_cooldown_extend",
      name: "テストクールタイム延長",
      description: "テスト用",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [{ kind: "COOLDOWN_EXTEND", turns: 2 }],
    };
    const caster = withSkills(findMonster("wolf", "FIRE")!, [cooldownExtendSkill, cooldownExtendSkill, cooldownExtendSkill]);
    const target = findMonster("golem", "WATER")!;

    const engine = new BattleEngine([caster], [target], { rng: () => 0.999, maxTurns: 1 });
    const units = engine.getUnits();
    const casterUnit = units.find((u) => u.team === "PLAYER")!;
    const targetUnit = units.find((u) => u.team === "ENEMY")!;

    expect(targetUnit.cooldowns).toEqual([0, 0, 0]);
    engine.resolveTurn(casterUnit, { skillIndex: 0, targetId: targetUnit.instanceId });
    expect(targetUnit.cooldowns).toEqual([2, 2, 2]);
  });
});

describe("毒(POISON)", () => {
  const poisonSkill: Skill = {
    id: "test_poison",
    name: "テスト毒",
    description: "テスト用",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "POISON", damageRatePerStack: 0.05, durationTurns: 3, chance: 1 }],
  };

  it("スタックは重複し、最大5スタックまでしか積み上がらない", () => {
    const caster = withSkills(findMonster("wolf", "FIRE")!, [poisonSkill, poisonSkill, poisonSkill]);
    const target = findMonster("golem", "WATER")!;

    const engine = new BattleEngine([caster], [target], { rng: () => 0, maxTurns: 1 });
    const units = engine.getUnits();
    const casterUnit = units.find((u) => u.team === "PLAYER")!;
    const targetUnit = units.find((u) => u.team === "ENEMY")!;

    for (let i = 0; i < 7; i++) {
      engine.resolveTurn(casterUnit, { skillIndex: 0, targetId: targetUnit.instanceId });
    }
    expect(targetUnit.poisonStacks).toBe(5);
  });

  it("自分の手番開始時に、スタック数×damageRatePerStack分のダメージを受ける", () => {
    const caster = withSkills(findMonster("wolf", "FIRE")!, [poisonSkill, poisonSkill, poisonSkill]);
    const target = findMonster("golem", "WATER")!;

    const engine = new BattleEngine([caster], [target], { rng: () => 0, maxTurns: 1 });
    const units = engine.getUnits();
    const casterUnit = units.find((u) => u.team === "PLAYER")!;
    const targetUnit = units.find((u) => u.team === "ENEMY")!;

    engine.resolveTurn(casterUnit, { skillIndex: 0, targetId: targetUnit.instanceId });
    engine.resolveTurn(casterUnit, { skillIndex: 0, targetId: targetUnit.instanceId });
    expect(targetUnit.poisonStacks).toBe(2);

    const hpBefore = targetUnit.currentHp;
    engine.resolveTurn(targetUnit);
    const expectedDamage = Math.round(targetUnit.maxHp * 0.05 * 2);
    expect(targetUnit.currentHp).toBe(hpBefore - expectedDamage);
  });

  it("継続ターンが尽きるとスタックも消滅する", () => {
    const caster = withSkills(findMonster("wolf", "FIRE")!, [poisonSkill, poisonSkill, poisonSkill]);
    const target = findMonster("golem", "WATER")!;

    const engine = new BattleEngine([caster], [target], { rng: () => 0, maxTurns: 1 });
    const units = engine.getUnits();
    const casterUnit = units.find((u) => u.team === "PLAYER")!;
    const targetUnit = units.find((u) => u.team === "ENEMY")!;

    engine.resolveTurn(casterUnit, { skillIndex: 0, targetId: targetUnit.instanceId });
    expect(targetUnit.poisonTurns).toBe(3);

    engine.resolveTurn(targetUnit);
    engine.resolveTurn(targetUnit);
    engine.resolveTurn(targetUnit);
    expect(targetUnit.poisonTurns).toBe(0);
    expect(targetUnit.poisonStacks).toBe(0);
  });

  it("免疫中は毒が付与されない", () => {
    const immunitySkill: Skill = {
      id: "test_poison_immunity",
      name: "テスト免疫",
      description: "テスト用",
      target: "SELF",
      cooldownTurns: 0,
      effects: [{ kind: "IMMUNITY", durationTurns: 2 }],
    };
    const defender = withSkills(findMonster("golem", "WATER")!, [immunitySkill, immunitySkill, immunitySkill]);
    const attacker = withSkills(findMonster("wolf", "FIRE")!, [poisonSkill, poisonSkill, poisonSkill]);

    const engine = new BattleEngine([defender], [attacker], { rng: () => 0, maxTurns: 1 });
    const units = engine.getUnits();
    const defenderUnit = units.find((u) => u.team === "PLAYER")!;
    const attackerUnit = units.find((u) => u.team === "ENEMY")!;

    engine.resolveTurn(defenderUnit, { skillIndex: 0 });
    engine.resolveTurn(attackerUnit, { skillIndex: 0, targetId: defenderUnit.instanceId });
    expect(defenderUnit.poisonStacks).toBe(0);
  });
});

describe("速度デバフ(既存のDEBUFF機構をspdに適用)", () => {
  it("speedデバフをかけると実効速度が下がる", () => {
    const spdDebuffSkill: Skill = {
      id: "test_spd_debuff",
      name: "テスト速度デバフ",
      description: "テスト用",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [{ kind: "DEBUFF", stat: "spd", amount: 0.25, durationTurns: 2 }],
    };
    const caster = withSkills(findMonster("wolf", "FIRE")!, [spdDebuffSkill, spdDebuffSkill, spdDebuffSkill]);
    const target = findMonster("golem", "WATER")!;

    const engine = new BattleEngine([caster], [target], { rng: () => 0, maxTurns: 1 });
    const units = engine.getUnits();
    const casterUnit = units.find((u) => u.team === "PLAYER")!;
    const targetUnit = units.find((u) => u.team === "ENEMY")!;

    const spdBefore = targetUnit.def.stats.spd;
    engine.resolveTurn(casterUnit, { skillIndex: 0, targetId: targetUnit.instanceId });
    expect(targetUnit.effects.some((e) => e.stat === "spd" && e.amount < 0)).toBe(true);
    expect(getEffectiveStat(targetUnit, "spd")).toBe(Math.round(spdBefore * 0.75));
  });
});

describe("暗闇(BLIND)", () => {
  const blindSkill: Skill = {
    id: "test_blind",
    name: "テスト暗闇",
    description: "テスト用",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "BLIND", durationTurns: 2 }],
  };

  const strikeSkill: Skill = {
    id: "test_strike",
    name: "テスト攻撃",
    description: "テスト用",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.0 },
      { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2 },
    ],
  };

  it("暗闇を付与でき、残りターンが手番ごとに減る", () => {
    const caster = withSkills(findMonster("seraph", "LIGHT")!, [blindSkill, blindSkill, blindSkill]);
    const target = withSkills(findMonster("golem", "WATER")!, [strikeSkill, strikeSkill, strikeSkill]);

    const engine = new BattleEngine([caster], [target], { rng: () => 0, maxTurns: 1 });
    const units = engine.getUnits();
    const casterUnit = units.find((u) => u.instanceId === "P1")!;
    const targetUnit = units.find((u) => u.instanceId === "E1")!;

    engine.resolveTurn(casterUnit, { skillIndex: 0, targetId: targetUnit.instanceId });
    expect(targetUnit.blindTurns).toBe(2);

    engine.resolveTurn(targetUnit);
    expect(targetUnit.blindTurns).toBe(1);
  });

  it("暗闇で外すとダメージが大きく減り、追加効果も乗らない", () => {
    const attacker = withSkills(findMonster("wolf", "FIRE")!, [strikeSkill, strikeSkill, strikeSkill]);
    const victim = withStats(findMonster("golem", "WATER")!, { hp: 100000, def: 1 });

    // 暗闇が付いていない側。低い乱数にして、効果抵抗の判定にも勝つようにする
    const hitEngine = new BattleEngine([attacker], [victim], { rng: () => 0.1, maxTurns: 1 });
    const hitUnits = hitEngine.getUnits();
    const hitAttacker = hitUnits.find((u) => u.instanceId === "P1")!;
    const hitVictim = hitUnits.find((u) => u.instanceId === "E1")!;
    const hpBeforeHit = hitVictim.currentHp;
    hitEngine.resolveTurn(hitAttacker, { skillIndex: 0, targetId: hitVictim.instanceId });
    const normalDamage = hpBeforeHit - hitVictim.currentHp;
    expect(hitVictim.effects.some((e) => e.kind === "DEBUFF")).toBe(true);

    // rngが常に0を返すので、暗闇の外れ判定に必ず引っかかる
    const missEngine = new BattleEngine([attacker], [victim], { rng: () => 0, maxTurns: 1 });
    const missUnits = missEngine.getUnits();
    const missAttacker = missUnits.find((u) => u.instanceId === "P1")!;
    const missVictim = missUnits.find((u) => u.instanceId === "E1")!;
    missAttacker.blindTurns = 2;
    const hpBeforeMiss = missVictim.currentHp;
    missEngine.resolveTurn(missAttacker, { skillIndex: 0, targetId: missVictim.instanceId });
    const blindedDamage = hpBeforeMiss - missVictim.currentHp;

    // 外した攻撃はダメージが4分の1程度まで落ちる
    expect(blindedDamage).toBeLessThan(normalDamage * 0.5);
    // 追加効果(防御低下)は一切乗らない
    expect(missVictim.effects.some((e) => e.kind === "DEBUFF")).toBe(false);
  });

  it("状態異常免疫があると暗闇を防げる", () => {
    const caster = withSkills(findMonster("seraph", "LIGHT")!, [blindSkill, blindSkill, blindSkill]);
    const target = withSkills(findMonster("golem", "WATER")!, [strikeSkill, strikeSkill, strikeSkill]);

    const engine = new BattleEngine([caster], [target], { rng: () => 0, maxTurns: 1 });
    const units = engine.getUnits();
    const casterUnit = units.find((u) => u.instanceId === "P1")!;
    const targetUnit = units.find((u) => u.instanceId === "E1")!;

    targetUnit.immuneTurns = 3;
    engine.resolveTurn(casterUnit, { skillIndex: 0, targetId: targetUnit.instanceId });
    expect(targetUnit.blindTurns).toBe(0);
  });
});

describe("行動ゲージの吸収", () => {
  it("対象から減らした分だけ術者のゲージが増える", () => {
    const drainSkill: Skill = {
      id: "test_drain",
      name: "テスト吸収",
      description: "テスト用",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [{ kind: "GAUGE", amount: 0.1, drain: true }],
    };
    const caster = withSkills(findMonster("nemesis", "DARK")!, [drainSkill, drainSkill, drainSkill]);
    const target = findMonster("golem", "WATER")!;

    const engine = new BattleEngine([caster], [target], { rng: () => 0.9, maxTurns: 1 });
    const units = engine.getUnits();
    const casterUnit = units.find((u) => u.instanceId === "P1")!;
    const targetUnit = units.find((u) => u.instanceId === "E1")!;

    targetUnit.gauge = 50;
    // 手番を解決すると術者のゲージは100消費される。消費後に0を下回らないよう満タンにしておく
    casterUnit.gauge = 100;
    engine.resolveTurn(casterUnit, { skillIndex: 0, targetId: targetUnit.instanceId });

    expect(targetUnit.gauge).toBe(40);
    // 対象から減った10が、そのまま術者へ移っている
    expect(casterUnit.gauge).toBe(10);
  });
});
