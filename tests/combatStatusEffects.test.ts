import { describe, expect, it } from "vitest";
import { chooseSkill, chooseTargets } from "../src/battle/ai.js";
import { BattleEngine } from "../src/battle/engine.js";
import { getFinalCritRate } from "../src/battle/damage.js";
import { applyDamage, applyStatus, createBattleUnit, hasStatus } from "../src/battle/unit.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { Skill } from "../src/core/skill.js";

const skill = (target: Skill["target"] = "SINGLE_ENEMY"): Skill => ({
  id: target, name: target, description: "fixture", target, cooldownTurns: 0, effects: [],
});
const definition = (id: string, hp = 1000, criRate = 0): MonsterDefinition => ({
  id, templateId: id, name: id, element: "FIRE", color: "#fff", role: "fixture", emoji: "x",
  stats: { hp, atk: 100, def: 100, spd: 100, criRate, criDmg: 1.5, resistance: 0, accuracy: 0 },
  skills: [skill(), skill(), skill("ALL_ENEMIES")],
});

describe("新しい戦闘状態効果", () => {
  it.each([
    [0.8, ["CRIT_RATE_DOWN"], 0.5], [0.2, ["CRIT_RATE_DOWN"], 0],
    [0.2, ["CRIT_RATE_UP"], 0.7], [0.7, ["CRIT_RATE_UP"], 1],
    [0.5, ["CRIT_RATE_UP", "CRIT_RATE_DOWN"], 0.7],
  ] as const)("被クリ率補正をpercentage pointsでclampする", (rate, statuses, expected) => {
    const attacker = createBattleUnit(definition("a", 1000, rate), "PLAYER", "A");
    const target = createBattleUnit(definition("b"), "ENEMY", "B");
    statuses.forEach((status) => applyStatus(target, status, 2));
    expect(getFinalCritRate(attacker, target)).toBeCloseTo(expected);
  });

  it("我慢を消費せず、解除後は死亡する", () => {
    const unit = createBattleUnit(definition("a", 100), "PLAYER", "A");
    applyStatus(unit, "ENDURE", 2);
    expect(applyDamage(unit, 200)).toMatchObject({ hpDamage: 99, endured: true });
    expect(applyDamage(unit, 100)).toMatchObject({ hpDamage: 0, endured: true });
    expect(hasStatus(unit, "ENDURE")).toBe(true);
    unit.statusEffects = [];
    expect(applyDamage(unit, 100)).toMatchObject({ died: true });
  });

  it("我慢を復活より優先し、復活は25%で一度だけ消費する", () => {
    const unit = createBattleUnit(definition("a", 20000), "PLAYER", "A");
    applyStatus(unit, "REVIVE", 3); applyStatus(unit, "ENDURE", 3);
    applyDamage(unit, 30000);
    expect(unit.currentHp).toBe(1); expect(hasStatus(unit, "REVIVE")).toBe(true);
    unit.statusEffects = unit.statusEffects.filter((e) => e.type !== "ENDURE");
    expect(applyDamage(unit, 100)).toMatchObject({ revived: true });
    expect(unit.currentHp).toBe(5000); expect(hasStatus(unit, "REVIVE")).toBe(false);
    expect(applyDamage(unit, 6000)).toMatchObject({ died: true });
  });

  it("無敵は0ダメージ経路を通りシールドも致死効果も消費しない", () => {
    const unit = createBattleUnit(definition("a", 100), "PLAYER", "A");
    unit.shieldValue = 50; applyStatus(unit, "INVINCIBLE", 2); applyStatus(unit, "REVIVE", 2);
    expect(applyDamage(unit, 999)).toMatchObject({ hpDamage: 0, shieldAbsorbed: 0, invincible: true });
    expect(unit.shieldValue).toBe(50); expect(hasStatus(unit, "REVIVE")).toBe(true);
  });

  it("強化不可は既存BUFFを残し、新規・再付与を拒否する", () => {
    const unit = createBattleUnit(definition("a"), "PLAYER", "A");
    applyStatus(unit, "INVINCIBLE", 2); applyStatus(unit, "BUFF_BLOCK", 2);
    expect(applyStatus(unit, "REVIVE", 2)).toBe(false);
    expect(applyStatus(unit, "INVINCIBLE", 5)).toBe(false);
    expect(hasStatus(unit, "INVINCIBLE")).toBe(true);
  });

  it("挑発は単体敵だけを付与元へ向け、死亡時に除去し、上書きできる", () => {
    const actor = createBattleUnit(definition("actor"), "PLAYER", "P");
    const a = createBattleUnit(definition("a"), "ENEMY", "A");
    const d = createBattleUnit(definition("d"), "ENEMY", "D");
    applyStatus(actor, "TAUNT", 2, "A");
    expect(chooseTargets(actor, skill(), [actor, a, d])).toEqual([a]);
    expect(chooseTargets(actor, skill("ALL_ENEMIES"), [actor, a, d])).toEqual([a, d]);
    a.alive = false;
    expect(chooseTargets(actor, skill(), [actor, a, d])).toEqual([d]);
    expect(hasStatus(actor, "TAUNT")).toBe(false);
    applyStatus(actor, "TAUNT", 2, "D");
    expect(actor.statusEffects.find((e) => e.type === "TAUNT")?.sourceId).toBe("D");
  });

  it("スキル使用不可のAIはCTを変えずスキル1だけ選ぶ", () => {
    const unit = createBattleUnit(definition("a"), "ENEMY", "A");
    unit.cooldowns = [0, 0, 0]; applyStatus(unit, "SKILL_LOCK", 2);
    expect(chooseSkill(unit).index).toBe(0); expect(unit.cooldowns).toEqual([0, 0, 0]);
    unit.statusEffects = [];
    expect(chooseSkill(unit).index).toBe(2);
  });

  it("本番スキル解決で多段復活後の残Hit、反射、反射ループ防止を統合する", () => {
    const multi: Skill = { id: "multi", name: "多段", description: "fixture", target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 20, hits: 3, ignoreDefense: true }] };
    const attackerDef = { ...definition("attacker", 5000), skills: [multi, multi, multi] as [Skill, Skill, Skill] };
    const defenderDef = { ...definition("defender", 1000), skills: [multi, multi, multi] as [Skill, Skill, Skill] };
    const engine = new BattleEngine([attackerDef], [defenderDef], { rng: () => 0.99 });
    const [attacker, defender] = engine.getUnits();
    applyStatus(defender, "REVIVE", 5); applyStatus(defender, "REFLECT", 5); applyStatus(attacker, "REFLECT", 5);
    const record = engine.resolveTurn(attacker, { skillIndex: 0, targetId: defender.instanceId });
    expect(record.lines.some((line) => line.includes("復活した"))).toBe(true);
    expect(record.lines.filter((line) => line.includes("の反射！"))).toHaveLength(2);
    expect(defender.alive).toBe(false); // 復活後も次Hitが継続した
    expect(attacker.currentHp).toBeLessThan(attacker.maxHp);
  });
});
