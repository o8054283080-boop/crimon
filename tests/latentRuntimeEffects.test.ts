import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { LatentAbilityCandidate, LatentRuntimeEffect } from "../src/core/monsterDevelopment.js";
import { Skill } from "../src/core/skill.js";
import { findMonster } from "../src/data/monsters.js";

const attack = (hits = 1, target: Skill["target"] = "SINGLE_ENEMY", effects: Skill["effects"] = [{ kind: "DAMAGE", multiplier: 1, hits }]): Skill =>
  ({ id: "runtime_test", name: "runtime test", description: "", target, cooldownTurns: 0, effects });
const latent = (runtimeEffects: readonly LatentRuntimeEffect[] = [], extra: Partial<LatentAbilityCandidate> = {}): LatentAbilityCandidate => ({
  id: "runtime", name: "runtime", description: "", skillSlot: 0, category: "SPECIAL", effectType: "RUNTIME",
  value: 0, chance: 1, duration: 1, target: "TARGET", resolution: "ALWAYS", runtimeEffects, ...extra,
});

function setup(ability: LatentAbilityCandidate, skill = attack(), enemies = 1) {
  const base = findMonster("slime", "FIRE")!;
  const foe = findMonster("golem", "WATER")!;
  const source = { ...base, id: "source", stats: { ...base.stats, spd: 999, criRate: 0, accuracy: 1 }, skills: [skill, attack(), attack()] as [Skill, Skill, Skill], latentAbility: ability };
  const enemy = { ...foe, stats: { ...foe.stats, hp: 1_000_000, spd: 1, resistance: 0 } };
  const engine = new BattleEngine([source], Array.from({ length: enemies }, (_, i) => ({ ...enemy, id: `enemy-${i}` })), { rng: () => 0 });
  const actor = engine.getNextActor()!;
  return { engine, actor, use: () => engine.resolveTurn(actor, { skillIndex: 0, targetId: "E1" }) };
}

describe("宣言的な潜在BattleEngineランタイム", () => {
  it("単体攻撃を補正付きで全体化し、元から全体の技には二重補正しない", () => {
    const aoe = latent([], { aoeConversion: { damageMultiplier: .75 } });
    const converted = setup(aoe, attack(), 3); converted.use();
    expect(converted.engine.getUnits().slice(1).every((u) => u.currentHp < u.maxHp)).toBe(true);
    const single = setup(latent(), attack()); single.use();
    expect(single.engine.getUnits()[1].maxHp - converted.engine.getUnits()[1].currentHp).toBeLessThan(single.engine.getUnits()[1].maxHp - single.engine.getUnits()[1].currentHp);
    const native = setup(aoe, attack(1, "ALL_ENEMIES"), 2); native.use();
    const nativePlain = setup(latent(), attack(1, "ALL_ENEMIES"), 2); nativePlain.use();
    expect(native.engine.getUnits()[1].currentHp).toBe(nativePlain.engine.getUnits()[1].currentHp);
  });

  it("全体化時に既存追加効果を主対象限定または副対象chance補正できる", () => {
    const skill = attack(1, "SINGLE_ENEMY", [{ kind: "DAMAGE", multiplier: .1 }, { kind: "STUN", durationTurns: 1, chance: 1 }]);
    const primary = setup(latent([], { aoeConversion: { damageMultiplier: 1, nativeEffectTarget: "PRIMARY_ONLY" } }), skill, 3); primary.use();
    expect(primary.engine.getUnits().slice(1).map((u) => u.stunTurns)).toEqual([1, 0, 0]);
    const reduced = setup(latent([], { aoeConversion: { damageMultiplier: 1, secondaryEffectChanceMultiplier: 0 } }), skill, 2); reduced.use();
    expect(reduced.engine.getUnits().slice(1).map((u) => u.stunTurns)).toEqual([1, 0]);
  });

  it.each([
    ["GAUGE", { kind: "GAUGE_DOWN", amount: .15, chance: 1 }],
    ["STUN", { kind: "DEBUFF", status: "STUN", chance: 1, duration: 1 }],
    ["HEAL_BLOCK", { kind: "DEBUFF", status: "HEAL_BLOCK", chance: 1, duration: 2 }],
    ["POISON", { kind: "DEBUFF", status: "POISON", chance: 1, duration: 2 }],
    ["SPD DOWN", { kind: "DEBUFF", status: "SPD_DOWN", chance: 1, duration: 2 }],
  ] as const)("多段攻撃でも潜在%sはスキル使用につき1回", (_label, effect) => {
    const test = setup(latent([effect]), attack(4));
    const record = test.use();
    expect(record.lines.filter((line) => line.includes("潜在能力"))).toHaveLength(1);
    const enemy = test.engine.getUnits()[1];
    if (effect.kind === "GAUGE_DOWN") expect(enemy.gauge).toBe(0);
    if (effect.kind === "DEBUFF" && effect.status === "POISON") expect(enemy.poisonStacks).toBe(1);
  });

  it("多段STRIPも1回だけ判定し、IMMUNITYを剥がした後の妨害が通常経路で入る", () => {
    const test = setup(latent([{ kind: "STRIP", chance: 1, count: 1 }, { kind: "DEBUFF", status: "STUN", chance: 1, duration: 1 }]), attack(4));
    test.engine.getUnits()[1].immuneTurns = 3;
    const record = test.use();
    expect(test.engine.getUnits()[1].immuneTurns).toBe(0);
    expect(test.engine.getUnits()[1].stunTurns).toBe(1);
    expect(record.lines.filter((line) => line.includes("潜在能力"))).toHaveLength(2);
  });

  it("BUFF_BLOCK、味方ゲージ、デバフ延長、デバフ数damage、防御20%無視を統合する", () => {
    const block = setup(latent([{ kind: "DEBUFF", status: "BUFF_BLOCK", chance: 1, duration: 2 }])); block.use();
    expect(block.engine.getUnits()[1].statusEffects.some((e) => e.type === "BUFF_BLOCK")).toBe(true);
    const gauge = setup(latent([{ kind: "GAUGE_UP", amount: .2, target: "ALL_ALLIES" }])); gauge.use(); expect(gauge.engine.getUnits()[0].gauge).toBeGreaterThan(-100);
    const extend = setup(latent([{ kind: "EXTEND_DEBUFF", chance: 1, turns: 1, count: 1 }])); extend.engine.getUnits()[1].effects.push({ stat: "spd", amount: -.3, remainingTurns: 2, kind: "DEBUFF" }); extend.use(); expect(extend.engine.getUnits()[1].effects[0].remainingTurns).toBe(3);
    const plain = setup(latent()); plain.engine.getUnits()[1].effects.push({ stat: "spd", amount: -.3, remainingTurns: 2, kind: "DEBUFF" }); plain.use();
    const bonus = setup(latent([], { debuffDamageBonus: { perDebuff: .2, max: .25 } })); bonus.engine.getUnits()[1].effects.push({ stat: "spd", amount: -.3, remainingTurns: 2, kind: "DEBUFF" }); bonus.use();
    expect(bonus.engine.getUnits()[1].currentHp).toBeLessThan(plain.engine.getUnits()[1].currentHp);
    const pierce = setup(latent([], { ignoreDefenseRatio: .2 })); pierce.use();
    const noPierce = setup(latent()); noPierce.use(); expect(pierce.engine.getUnits()[1].currentHp).toBeLessThan(noPierce.engine.getUnits()[1].currentHp);
  });

  it("回復後の解除・ゲージ・shield・regenと耐久補正を既存unitへ適用する", () => {
    const healSkill = attack(1, "SELF", [{ kind: "HEAL", healRate: .1 }]);
    const effects: LatentRuntimeEffect[] = [
      { kind: "CLEANSE", count: 1, target: "SELF", afterHeal: true }, { kind: "GAUGE_UP", amount: .1, target: "SELF" },
      { kind: "SHIELD", rate: .1, duration: 2, target: "SELF", afterHeal: true }, { kind: "REGEN", rate: .03, duration: 2, target: "SELF", afterHeal: true },
    ];
    const test = setup(latent(effects, { hpMultiplier: 1.2, defMultiplier: 1.2, damageTakenMultiplier: .8 }), healSkill);
    const source = test.engine.getUnits()[0]; source.effects.push({ stat: "spd", amount: -.3, remainingTurns: 2, kind: "DEBUFF" }); test.use();
    expect(source.effects.some((e) => e.kind === "DEBUFF")).toBe(false); expect(source.shieldValue).toBeGreaterThan(0); expect(source.regenTurns).toBe(2);
    expect(source.maxHp).toBe(Math.round(findMonster("slime", "FIRE")!.stats.hp * 1.2));
  });
});
