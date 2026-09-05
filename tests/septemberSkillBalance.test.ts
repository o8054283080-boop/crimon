import { describe, expect, it } from "vitest";
import { findMonsterById, findSkillById } from "../src/data/monsters.js";
import { computeLeveledSkill, type Skill } from "../src/core/skill.js";
import { BattleEngine } from "../src/battle/engine.js";
import { getEffectiveStat } from "../src/battle/unit.js";
import { calcDamage } from "../src/battle/damage.js";

const skill = (id: string, level = 5) => computeLeveledSkill(findSkillById(id)!, level);
function battle(s: Skill, passive?: Skill) {
  const base = findMonsterById("slime_FIRE")!;
  return new BattleEngine([{ ...base, skills: [s, s, passive ?? s] }],
    [{ ...base, stats: { ...base.stats, hp: 1000000 } }], { rng: () => 0 });
}
describe("合意したスキル強化", () => {
  it("最大レベルの個別指定と通常成長を区別する", () => {
    expect(skill("wisp_s3_c")).toMatchObject({ target: "SINGLE_ALLY", cooldownTurns: 3, effects: [
      { amount: 1 }, { durationTurns: 3 }] });
    expect(skill("wisp_s3_c", 1)).toMatchObject({ cooldownTurns: 4, effects: [{ amount: 0.8 }, { durationTurns: 2 }] });
    expect(skill("fairy_s1").effects).toMatchObject([{ multiplier: 1 }, { healRate: 0.04 }]);
    expect(skill("mimic_s3_b").cooldownTurns).toBe(3);
    expect(skill("treant_s2_c").effects).toMatchObject([{ multiplier: 1.5, hpCoefficient: 0.06 }, { maxSourceHpRate: 0.3 }]);
    expect(skill("golem_s3_c").effects[2]).toMatchObject({ status: "REFLECT", durationTurns: 3, applyTo: "SELF" });
    expect(skill("golem_s3_c", 4).effects).toHaveLength(2);
  });
  it("終末胞子は生存敵に3回攻撃し、毒も3回付与する", () => {
    const s = skill("mushroon_s3_dark");
    expect(s.effects.map(e => e.kind)).toEqual(["DAMAGE", "POISON", "DAMAGE", "POISON", "DAMAGE", "POISON"]);
    const engine = battle(s);
    const [source, target] = engine.getUnits();
    engine.resolveTurn(source, { skillIndex: 0 });
    expect(target.poisonStacks).toBe(3);
  });
  it("吸血回復は最大HP30%で止まる", () => {
    const s = skill("treant_s2_c");
    const engine = battle(s);
    const [source] = engine.getUnits();
    source.currentHp = Math.floor(source.maxHp * 0.1);
    source.def = { ...source.def, stats: { ...source.def.stats, atk: 1000000 } };
    const before = source.currentHp;
    engine.resolveTurn(source, { skillIndex: 0 });
    expect(source.currentHp - before).toBe(Math.floor(source.maxHp * 0.3));
  });
  it("獲物の匂いは常時能力を上げ、継承攻撃にも速度比例が乗る", () => {
    const engine = battle(skill("slime_s1"), skill("kobold_s3_c"));
    const [source, target] = engine.getUnits();
    expect(getEffectiveStat(source, "atk")).toBeCloseTo(source.def.stats.atk * 1.25, 0);
    expect(getEffectiveStat(source, "spd")).toBe(source.def.stats.spd + 15);
    const effect = { kind: "DAMAGE" as const, multiplier: 1 };
    const before = calcDamage(source, target, effect, () => 0.999).damage;
    source.def = { ...source.def, stats: { ...source.def.stats, spd: source.def.stats.spd + 200 } };
    expect(calcDamage(source, target, effect, () => 0.999).damage).toBeGreaterThan(before);
  });
  it("処刑はHP30%以下でのみ防御を完全無視する", () => {
    const engine = battle(skill("kobold_s3_a"));
    const [source, target] = engine.getUnits();
    const effect = skill("kobold_s3_a").effects[0];
    if (effect.kind !== "DAMAGE") throw new Error("攻撃が必要");
    target.currentHp = target.maxHp * 0.3;
    expect(calcDamage(source, target, effect, () => 0.999).damage).toBe(calcDamage(source, target, { ...effect, ignoreDefense: true }, () => 0.999).damage);
    target.currentHp = target.maxHp * 0.31;
    expect(calcDamage(source, target, effect, () => 0.999).damage).toBeLessThan(calcDamage(source, target, { ...effect, ignoreDefense: true }, () => 0.999).damage);
  });
});
