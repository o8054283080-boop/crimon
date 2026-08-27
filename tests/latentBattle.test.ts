import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
import { LatentAbilityEffectType } from "../src/core/monsterDevelopment.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX, findMonster } from "../src/data/monsters.js";
import { LATENT_ABILITY_BY_ID, LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";

function awakened(template: string, element: "FIRE" | "GRASS" | "WATER", candidate: number) {
  const dex = findMonster(template, element)!;
  const instance = createMonsterInstance(dex.id, 6, 40);
  instance.development.latentAbilityId = LATENT_ABILITY_CANDIDATES[dex.id][candidate].id;
  return toBattleDefinition(instance, dex);
}

describe("潜在覚醒の本番戦闘接続", () => {
  it("72体216候補が索引化され、全effectType/status/target/resolutionを処理可能と検査する", () => {
    expect(ALL_DISPLAYABLE_MONSTERS_DEX).toHaveLength(72);
    expect(LATENT_ABILITY_BY_ID.size).toBe(216);
    const supported: LatentAbilityEffectType[] = ["DAMAGE_UP", "CRIT_TRIGGER", "HP_SCALING", "DEF_SCALING", "DEBUFF_CHANCE_UP",
      "ADD_DEBUFF", "TURN_METER_DOWN", "SELF_HEAL", "ADD_BUFF", "ALLY_SUPPORT", "SHIELD", "SPECIAL_TRIGGER"];
    const statuses = new Set(["SPD_DOWN", "ATK_DOWN", "HEAL_BLOCK", "BLIND", "TAUNT", "BUFF_BLOCK", "SKILL_LOCK",
      "CRIT_RATE_UP", "CRIT_RATE_DOWN", "ENDURE", "REFLECT", "SHIELD", undefined]);
    statuses.add("DEF_DOWN");
    for (const candidate of LATENT_ABILITY_BY_ID.values()) {
      expect(supported).toContain(candidate.effectType);
      expect(statuses.has(candidate.status)).toBe(true);
      expect(["SELF", "TARGET", "LOWEST_HP_ALLY", "ALL_ALLIES"]).toContain(candidate.target);
      expect(["ALWAYS", "SEPARATE", "ADD_TO_EXISTING", "ON_CRIT", "CONDITIONAL"]).toContain(candidate.resolution);
    }
  });

  it("DAMAGE_UPはS1だけを指定倍率にし、S2には波及しない", () => {
    const latent = awakened("slime", "FIRE", 0);
    const base = { ...latent, latentAbility: undefined };
    const enemy = { ...findMonster("slime", "GRASS")!, stats: { ...findMonster("slime", "GRASS")!.stats, hp: 1_000_000, criRate: 0 } };
    const hit = (def: typeof latent, skillIndex: 0 | 1) => {
      const e = new BattleEngine([def], [enemy], { rng: () => .99 }); const [a, t] = e.getUnits();
      const before = t.currentHp; e.resolveTurn(a, { skillIndex, targetId: t.instanceId }); return before - t.currentHp;
    };
    expect(hit(latent, 0) / hit(base, 0)).toBeCloseTo(1.15, 1);
    expect(hit(latent, 1)).toBe(hit(base, 1));
  });

  it("HP/DEF係数は装備後の最終最大HP/DEFを使う", () => {
    const rawEnemy = findMonster("slime", "WATER")!; const enemy = { ...rawEnemy, stats: { ...rawEnemy.stats, hp: 1_000_000 } };
    const damage = (def: ReturnType<typeof awakened>) => { const e = new BattleEngine([def], [enemy], { rng: () => .99 }); const [a, t] = e.getUnits(); const hp = t.currentHp; e.resolveTurn(a, { skillIndex: 0, targetId: t.instanceId }); return hp - t.currentHp; };
    const treant = awakened("treant", "FIRE", 0); const highHp = { ...treant, stats: { ...treant.stats, hp: treant.stats.hp * 2 } };
    const golem = awakened("golem", "FIRE", 0); const highDef = { ...golem, stats: { ...golem.stats, def: golem.stats.def * 2 } };
    expect(damage(highHp)).toBeGreaterThan(damage(treant));
    expect(damage(highDef)).toBeGreaterThan(damage(golem));
  });

  it("追加デバフのchance境界と命中/抵抗を通す", () => {
    const attacker = awakened("imp", "FIRE", 1);
    const enemy = { ...findMonster("slime", "GRASS")!, stats: { ...findMonster("slime", "GRASS")!.stats, resistance: 0 } };
    const run = (roll: number) => { const e = new BattleEngine([attacker], [enemy], { rng: () => roll }); const [a, t] = e.getUnits(); e.resolveTurn(a, { skillIndex: 0, targetId: t.instanceId }); return t.statusEffects.some((s) => s.type === "SKILL_LOCK"); };
    expect(run(.199)).toBe(true); expect(run(.2)).toBe(false);
  });

  it("シールド・最低HP味方回復は受け手の最大HP基準", () => {
    const slime = awakened("slime", "FIRE", 2); const ally = awakened("golem", "WATER", 0); const enemy = findMonster("slime", "GRASS")!;
    const e = new BattleEngine([slime, ally], [enemy], { rng: () => .99 }); const [a, low, target] = e.getUnits(); low.currentHp = 1;
    e.resolveTurn(a, { skillIndex: 0, targetId: target.instanceId }); expect(low.shieldValue).toBe(Math.round(low.maxHp * .08));
    const fairy = awakened("fairy", "FIRE", 2); const h = new BattleEngine([fairy, ally], [enemy], { rng: () => .99 }); const [f, hurt, foe] = h.getUnits(); hurt.currentHp = 1;
    h.resolveTurn(f, { skillIndex: 0, targetId: foe.instanceId }); expect(hurt.currentHp).toBe(1 + Math.round(hurt.maxHp * .06));
  });
});
