/**
 * 闇フェニックス S3「輪廻転生」のターン開始時の全体回復に、
 * アクセ(サポート)の「HP50%以下の味方への回復量UP」(low50Heal)が乗る。
 *
 * 以前は通常の HEAL だけが `AccessoryRuntime.healMultiplier` を通り、
 * 輪廻転生は `unit.maxHp * passive.heal` をそのまま回復していた(回復後の onHealed は通っていた)。
 *
 *   回復量 = round(闇フェニックスの最大HP × 輪廻転生の回復率 × アクセ倍率)
 *   アクセ倍率 = 受け手の回復直前HPが50%以下なら 1 + low50Heal、それ以外は 1
 */
import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { BattleUnit } from "../src/battle/unit.js";
import { emptyAccessoryEffects, type Accessory, type AccessoryBattleEffects } from "../src/core/accessory.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { computeLeveledSkill, type Skill } from "../src/core/skill.js";
import { findMonster, findMonsterById } from "../src/data/monsters.js";
import { ARENA_BATTLE_OPTIONS } from "../src/data/pvpArena.js";
import { snapshotUnitToDefinition } from "../src/game/arena/snapshot.js";

const WAIT: Skill = { id: "t_wait", name: "待機", description: "", target: "SELF", cooldownTurns: 0, effects: [] };
const HP = 100_000;

function withAccessory(def: MonsterDefinition, accessory?: Partial<AccessoryBattleEffects>): MonsterDefinition {
  return accessory ? { ...def, accessory: { ...emptyAccessoryEffects(), ...accessory } } : def;
}

/** 輪廻転生 Lv5(自身最大HP10%回復)の闇フェニックス。S1・S2は何もしない技にしておく */
function darkPhoenix(accessory?: Partial<AccessoryBattleEffects>): MonsterDefinition {
  const base = structuredClone(findMonster("phoenix", "DARK")!);
  const rebirth = computeLeveledSkill(base.skills[2], 5);
  return withAccessory({
    ...base,
    stats: { ...base.stats, hp: HP, atk: 100, def: 0, spd: 100, criRate: 0, criDmg: 1.5, accuracy: 1, resistance: 0 },
    skills: [WAIT, WAIT, rebirth],
    combatMods: undefined,
    latentAbility: undefined,
    bossTraits: undefined,
  }, accessory);
}

function dummy(skills: [Skill, Skill, Skill] = [WAIT, WAIT, WAIT], accessory?: Partial<AccessoryBattleEffects>): MonsterDefinition {
  const base = structuredClone(findMonsterById("knight_FIRE")!);
  return withAccessory({
    ...base,
    stats: { ...base.stats, hp: HP, atk: 100, def: 0, spd: 100, criRate: 0, criDmg: 1.5, accuracy: 1, resistance: 0 },
    skills,
    combatMods: undefined,
    latentAbility: undefined,
    bossTraits: undefined,
  }, accessory);
}

/** 味方のHPを割合で置き、闇フェニックスの手番を1回回して、各味方の回復量を返す */
function rebirthHeals(phoenixDef: MonsterDefinition, ratios: number[], allyDefs?: MonsterDefinition[], options = {}) {
  const allies = allyDefs ?? ratios.map(() => dummy());
  const engine = new BattleEngine([phoenixDef, ...allies], [dummy()], { rng: () => 0.5, ...options });
  const units = engine.getUnits();
  const phoenix = units[0];
  const team = units.slice(1, 1 + allies.length);
  team.forEach((u, i) => { u.currentHp = Math.round(u.maxHp * ratios[i]); });
  const before = team.map((u) => u.currentHp);
  phoenix.gauge = 100;
  engine.resolveTurn(phoenix, { skillIndex: 0 });
  return { engine, phoenix, team, heals: team.map((u, i) => u.currentHp - before[i]) };
}

describe("輪廻転生の全体回復とアクセの「HP50%以下の味方への回復量UP」", () => {
  it("回復直前HP49%・50%は +30%、51%は乗らない(境目の50%ちょうども対象)", () => {
    const { phoenix, heals } = rebirthHeals(darkPhoenix({ low50Heal: 0.30 }), [0.49, 0.50, 0.51]);
    const plain = Math.round(phoenix.maxHp * 0.10);
    const boosted = Math.round(phoenix.maxHp * 0.10 * 1.30);
    expect(phoenix.maxHp).toBe(HP);
    expect(plain).toBe(10_000);
    expect(boosted).toBe(13_000);
    expect(heals).toEqual([boosted, boosted, plain]);
  });

  it("味方4体のうち2体だけHP50%以下なら、その2体だけ13,000・残りは10,000(1体ずつ判定)", () => {
    const { heals } = rebirthHeals(darkPhoenix({ low50Heal: 0.30 }), [0.20, 0.80, 0.45, 0.90]);
    expect(heals).toEqual([13_000, 10_000, 13_000, 10_000]);
  });

  it("倍率はアクセが持つ low50Heal の値そのもの(30%に決め打ちしていない)", () => {
    const { heals } = rebirthHeals(darkPhoenix({ low50Heal: 0.22 }), [0.40, 0.60]);
    expect(heals).toEqual([Math.round(HP * 0.10 * 1.22), 10_000]);
  });

  it("アクセを着けていない闇フェニックスは、従来どおり最大HP×10%だけ回復する", () => {
    const { engine, heals } = rebirthHeals(darkPhoenix(), [0.20, 0.50, 0.80]);
    expect((engine as unknown as { acc: unknown }).acc).toBeNull();
    expect(heals).toEqual([10_000, 10_000, 10_000]);
    // 回復量UPを持たないアクセ(回復時ゲージだけ)でも回復量は変わらない
    expect(rebirthHeals(darkPhoenix({ healedGauge: 0.06 }), [0.20, 0.80]).heals).toEqual([10_000, 10_000]);
  });

  it("回復後に乗るアクセ効果は、受け手1体につき1回だけ(二重に発動しない)", () => {
    const accessory = { low50Heal: 0.30, healedGauge: 0.06, healedShield: 0.02, low50HealedShield: 0.12, healedDr: 0.10 };
    const phoenixDef = darkPhoenix(accessory);
    const engine = new BattleEngine([phoenixDef, dummy(), dummy()], [dummy()], { rng: () => 0.5 });
    const [phoenix, low, high] = engine.getUnits();
    const acc = (engine as unknown as { acc: { onHealed: (...args: unknown[]) => void; healedDr: Map<string, number> } }).acc;
    const calls = new Map<string, number>();
    const original = acc.onHealed.bind(acc);
    acc.onHealed = (source: unknown, receiver: unknown, ...rest: unknown[]) => {
      const id = (receiver as BattleUnit).instanceId;
      calls.set(id, (calls.get(id) ?? 0) + 1);
      original(source, receiver, ...rest);
    };
    low.currentHp = Math.round(low.maxHp * 0.40);
    high.currentHp = Math.round(high.maxHp * 0.80);
    low.gauge = 10;
    high.gauge = 20;
    phoenix.gauge = 100;
    engine.resolveTurn(phoenix, { skillIndex: 0 });

    // 回復後の処理は1体1回
    expect(calls.get(low.instanceId)).toBe(1);
    expect(calls.get(high.instanceId)).toBe(1);
    // 回復時ゲージ +6% は1回ぶん(2回なら +12%)
    expect(low.gauge).toBeCloseTo(16, 5);
    expect(high.gauge).toBeCloseTo(26, 5);
    // 回復時シールド: HP50%以下だった方は12%、そうでない方は2%
    expect(low.shieldValue).toBe(Math.round(low.maxHp * 0.12));
    expect(high.shieldValue).toBe(Math.round(high.maxHp * 0.02));
    // 回復時被ダメ軽減は重ねずに1つ
    expect(acc.healedDr.get(low.instanceId)).toBe(0.10);
    expect(acc.healedDr.get(high.instanceId)).toBe(0.10);
    // 回復量UPも1回だけ(1.3倍。1.69倍ではない)
    expect(low.currentHp).toBe(40_000 + 13_000);
    expect(high.currentHp).toBe(80_000 + 10_000);
  });

  it("通常のHEALスキルの挙動は変わらない(HP50%以下は+30%、それより上は乗らない)", () => {
    const heal: Skill = {
      id: "t_heal", name: "治癒", description: "", target: "SINGLE_ALLY", cooldownTurns: 0,
      effects: [{ kind: "HEAL", healRate: 0.10 }],
    };
    const run = (accessory: Partial<AccessoryBattleEffects> | undefined, ratio: number) => {
      const engine = new BattleEngine([dummy([heal, WAIT, WAIT], accessory), dummy()], [dummy()], { rng: () => 0.5 });
      const [healer, ally] = engine.getUnits();
      ally.currentHp = Math.round(ally.maxHp * ratio);
      const before = ally.currentHp;
      healer.gauge = 100;
      engine.resolveTurn(healer, { skillIndex: 0, targetId: ally.instanceId });
      return ally.currentHp - before;
    };
    expect(run(undefined, 0.49)).toBe(10_000);
    expect(run({ low50Heal: 0.30 }, 0.49)).toBe(13_000);
    expect(run({ low50Heal: 0.30 }, 0.50)).toBe(13_000);
    expect(run({ low50Heal: 0.30 }, 0.51)).toBe(10_000);
  });

  it("アリーナ(防衛データから組む定義 + アリーナの戦闘設定)でも同じ回復量になる", () => {
    const accessory: Accessory = {
      id: "acc_test", star: 6, rarity: "EPIC", family: "SUPPORT", level: 15, mainStat: "DEF", mainRoll: 1,
      specials: [{ id: "LOW50_HEAL", value: 0.30, boosts: 0 }],
      weak: "W_SHIELD_UP",
    };
    const instance = createMonsterInstance("phoenix_DARK", 6, 60);
    instance.skillLevels = [5, 5, 5];
    const snapshotDef = snapshotUnitToDefinition({ instance, equipment: [], accessory })!;
    expect(snapshotDef.accessory?.low50Heal).toBeCloseTo(0.30, 10);

    const knight = snapshotUnitToDefinition({ instance: createMonsterInstance("knight_FIRE", 6, 60), equipment: [] })!;
    const { phoenix, team, heals } = rebirthHeals(snapshotDef, [0.40, 0.80], [knight, structuredClone(knight)], ARENA_BATTLE_OPTIONS);
    const rate = (phoenix.def.skills[2].passive!.levels[4] as { heal: number }).heal;
    expect(heals[0]).toBe(Math.min(team[0].maxHp - Math.round(team[0].maxHp * 0.40), Math.round(phoenix.maxHp * rate * 1.30)));
    expect(heals[1]).toBe(Math.min(team[1].maxHp - Math.round(team[1].maxHp * 0.80), Math.round(phoenix.maxHp * rate)));
  });
});

/* ====================================================================== 他の味方回復 */

/**
 * 依頼主の指定「同じように全部のせて」(2026-09-28)。
 * 味方を回復するパッシブ・潜在・波及治療も、通常の HEAL と同じ補正を通す:
 *   回復量 = round(基礎 × 術者の回復量補正 × アクセの「HP50%以下の味方への回復量UP」)
 * 回復後のアクセ効果(onHealed)は受け手1体につき1回。
 */
function passiveHolder(dexId: string, accessory?: Partial<AccessoryBattleEffects>, mods?: MonsterDefinition["combatMods"]): MonsterDefinition {
  const base = structuredClone(findMonsterById(dexId)!);
  return withAccessory({
    ...base,
    stats: { ...base.stats, hp: HP, atk: 100, def: 0, spd: 100, criRate: 0, criDmg: 1.5, accuracy: 1, resistance: 0 },
    skills: [WAIT, WAIT, base.skills[2]],
    combatMods: mods,
    latentAbility: undefined,
    bossTraits: undefined,
  }, accessory);
}

describe("他の味方回復にも、通常の回復と同じ補正が乗る", () => {
  it("輪廻転生: 術者の回復量補正も掛かる(1.2倍 × 1.3倍)", () => {
    const mods = { damageDealtMultiplier: 1, damageTakenMultiplier: 1, turnHealPercent: 0, ignoreResistancePercent: 0, healOnResistPercent: 0, healingMultiplier: 1.2 };
    const def: MonsterDefinition = { ...darkPhoenix({ low50Heal: 0.30 }), combatMods: mods };
    expect(rebirthHeals(def, [0.40, 0.80]).heals).toEqual([Math.round(HP * 0.10 * 1.2 * 1.3), Math.round(HP * 0.10 * 1.2)]);
  });

  it("水の祝福(ウンディーネ): 行動後の全体回復に、HP50%以下の味方だけ回復量UP", () => {
    const run = (accessory?: Partial<AccessoryBattleEffects>) => {
      const engine = new BattleEngine([passiveHolder("undine_WATER", accessory), dummy(), dummy()], [dummy()], { rng: () => 0.5 });
      const [undine, low, high] = engine.getUnits();
      low.currentHp = Math.round(low.maxHp * 0.40);
      high.currentHp = Math.round(high.maxHp * 0.80);
      const before = [low.currentHp, high.currentHp];
      undine.gauge = 100;
      engine.resolveTurn(undine, { skillIndex: 0 });
      return [low.currentHp - before[0], high.currentHp - before[1]];
    };
    expect(run()).toEqual([Math.round(HP * 0.05), Math.round(HP * 0.05)]);
    expect(run({ low50Heal: 0.30 })).toEqual([Math.round(HP * 0.05 * 1.3), Math.round(HP * 0.05)]);
  });

  it("戦乙女の誓い(ヴァルキリア): HPが閾値を切った味方への回復に、回復量UPと回復後の効果が1回乗る", () => {
    const hit: Skill = { id: "t_hit", name: "打撃", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1 }] };
    const run = (accessory?: Partial<AccessoryBattleEffects>) => {
      const engine = new BattleEngine([passiveHolder("valkyria_WATER", accessory), dummy()], [dummy([hit, WAIT, WAIT])], { rng: () => 0.5 });
      const [, victim, enemy] = engine.getUnits();
      victim.currentHp = Math.round(victim.maxHp * 0.3) + 50;
      victim.gauge = 0;
      enemy.gauge = 100;
      engine.resolveTurn(enemy, { skillIndex: 0, targetId: victim.instanceId });
      return victim;
    };
    const plain = run();
    const boosted = run({ low50Heal: 0.30, healedGauge: 0.06 });
    expect(boosted.currentHp - plain.currentHp).toBe(Math.round(HP * 0.25 * 1.3) - Math.round(HP * 0.25));
    expect(plain.gauge).toBe(0);
    expect(boosted.gauge).toBeCloseTo(6, 5);
  });

  it("潜在(味方全体回復・一番HPが低い味方の回復・回復＋解除): 受け手ごとに判定し、onHealed は1体1回", () => {
    const hit: Skill = { id: "t_hit", name: "打撃", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1 }] };
    const latent = {
      id: "t_latent", name: "試験", description: "", skillSlot: 0 as const, category: "SUPPORT" as const,
      effectType: "DAMAGE_UP" as const, value: 0, chance: 1, duration: 0, target: "SELF" as const, resolution: "ALWAYS" as const,
      runtimeEffects: [{ kind: "ALLY_HEAL", value: 0.10 }, { kind: "LOWEST_ALLY_HEAL", value: 0.05 }, { kind: "HEAL_CLEANSE", value: 0.02 }],
    } as unknown as MonsterDefinition["latentAbility"];
    const run = (accessory?: Partial<AccessoryBattleEffects>) => {
      const caster = { ...dummy([hit, WAIT, WAIT], accessory), latentAbility: latent };
      const engine = new BattleEngine([caster, dummy(), dummy()], [dummy()], { rng: () => 0.5 });
      const [me, low, high, enemy] = engine.getUnits();
      low.currentHp = Math.round(low.maxHp * 0.20);
      high.currentHp = Math.round(high.maxHp * 0.80);
      low.gauge = 10;
      const before = [low.currentHp, high.currentHp];
      me.gauge = 100;
      engine.resolveTurn(me, { skillIndex: 0, targetId: enemy.instanceId });
      return { low, high, heals: [low.currentHp - before[0], high.currentHp - before[1]] };
    };
    // 一番HPが低いのは low(20%)。全体10% + 最低5% + 最低2%
    expect(run().heals).toEqual([10_000 + 5_000 + 2_000, 10_000]);
    const boosted = run({ low50Heal: 0.30, healedGauge: 0.06 });
    // 3つの回復とも、回復直前のHPで判定(20%→30%→36.5%でどれも50%以下)
    expect(boosted.heals).toEqual([13_000 + 6_500 + 2_600, 10_000]);
    // 同じスキルの中では onHealed は1回(ゲージ +6 が1回ぶん)
    expect(boosted.low.gauge).toBeCloseTo(16, 5);
  });

  it("潜在(味方サポート型の回復): HP50%以下なら回復量UP", () => {
    const hit: Skill = { id: "t_hit", name: "打撃", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1 }] };
    const latent = {
      id: "t_latent2", name: "試験", description: "", skillSlot: 0 as const, category: "SUPPORT" as const,
      effectType: "ALLY_SUPPORT" as const, value: 0.10, chance: 1, duration: 0, target: "LOWEST_HP_ALLY" as const, resolution: "ALWAYS" as const,
    } as unknown as MonsterDefinition["latentAbility"];
    const run = (accessory?: Partial<AccessoryBattleEffects>) => {
      const engine = new BattleEngine([{ ...dummy([hit, WAIT, WAIT], accessory), latentAbility: latent }, dummy()], [dummy()], { rng: () => 0.5 });
      const [me, low, enemy] = engine.getUnits();
      low.currentHp = Math.round(low.maxHp * 0.30);
      const before = low.currentHp;
      me.gauge = 100;
      engine.resolveTurn(me, { skillIndex: 0, targetId: enemy.instanceId });
      return low.currentHp - before;
    };
    expect(run()).toBe(10_000);
    expect(run({ low50Heal: 0.30 })).toBe(13_000);
  });

  it("波及治療: 波及先ごとに判定する。アクセが無ければ従来どおり round(元の回復量 × 波及率)", () => {
    const heal: Skill = {
      id: "t_heal", name: "治癒", description: "", target: "SINGLE_ALLY", cooldownTurns: 0,
      effects: [{ kind: "HEAL", healRate: 0.10 }], talentMods: { healSplash: 0.5 },
    } as Skill;
    const run = (accessory: Partial<AccessoryBattleEffects> | undefined, ratios: [number, number]) => {
      const engine = new BattleEngine([dummy([heal, WAIT, WAIT], accessory), dummy(), dummy()], [dummy()], { rng: () => 0.5 });
      const [healer, primary, other] = engine.getUnits();
      healer.currentHp = Math.round(healer.maxHp * 0.95);
      primary.currentHp = Math.round(primary.maxHp * ratios[0]);
      other.currentHp = Math.round(other.maxHp * ratios[1]);
      const before = [primary.currentHp, other.currentHp];
      healer.gauge = 100;
      engine.resolveTurn(healer, { skillIndex: 0, targetId: primary.instanceId });
      return [primary.currentHp - before[0], other.currentHp - before[1]];
    };
    expect(run(undefined, [0.80, 0.40])).toEqual([10_000, 5_000]);
    // 波及先がHP50%以下なら、波及にも回復量UP
    expect(run({ low50Heal: 0.30 }, [0.80, 0.40])).toEqual([10_000, 6_500]);
    // 元の受け手がHP50%以下でも、その倍率を波及先へ持ち越さない
    expect(run({ low50Heal: 0.30 }, [0.40, 0.80])).toEqual([13_000, 5_000]);
  });
});
