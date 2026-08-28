import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { LatentAbilityCandidate } from "../src/core/monsterDevelopment.js";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
import { Skill } from "../src/core/skill.js";
import { findMonster } from "../src/data/monsters.js";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import { awakenLatentAbility, reawakenLatentAbility } from "../src/game/monsterDevelopment.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";
import { setupDungeonBattle } from "../src/game/dungeonRunner.js";

const attack = (hits = 1): Skill => ({ id: "test", name: "test", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1, hits }] });
const latent = (effectType: LatentAbilityCandidate["effectType"], extra: Partial<LatentAbilityCandidate> = {}): LatentAbilityCandidate => ({
  id: `test_${effectType}`, name: effectType, description: "", skillSlot: 0, category: "OFFENSE",
  effectType, value: .2, chance: 1, duration: 1, target: "TARGET", resolution: "ALWAYS", ...extra,
});
function defs(ability?: LatentAbilityCandidate, hits = 1) {
  const base = findMonster("slime", "FIRE")!;
  const enemy = findMonster("golem", "WATER")!;
  const skills = [attack(hits), attack(), attack()] as [Skill, Skill, Skill];
  return {
    player: { ...base, id: "owned", stats: { ...base.stats, spd: 999, criRate: 0, accuracy: 0 }, skills, latentAbility: ability },
    enemy: { ...enemy, stats: { ...enemy.stats, hp: 1_000_000, spd: 1, resistance: 1 } },
  };
}
function use(skillIndex: 0 | 1 | 2, ability?: LatentAbilityCandidate, hits = 1, rng = () => 0.1) {
  const { player, enemy } = defs(ability, hits);
  const engine = new BattleEngine([player], [enemy], { rng });
  const actor = engine.getNextActor()!;
  const before = engine.getUnits()[1].currentHp;
  const record = engine.resolveTurn(actor, { skillIndex, targetId: "E1" });
  return { engine, record, damage: before - engine.getUnits()[1].currentHp };
}

describe("潜在能力のBattleEngine接続", () => {
  it("潜在なしでは発動せず、S1だけで発動する", () => {
    expect(use(0).record.lines.join("\n")).not.toContain("潜在能力");
    expect(use(0, latent("SELF_HEAL", { target: "SELF" })).record.lines.join("\n")).toContain("潜在能力");
    expect(use(1, latent("SELF_HEAL", { target: "SELF" })).record.lines.join("\n")).not.toContain("潜在能力");
    expect(use(2, latent("SELF_HEAL", { target: "SELF" })).record.lines.join("\n")).not.toContain("潜在能力");
  });

  it("多段S1の使用後効果は1回だけ発動する", () => {
    const result = use(0, latent("TURN_METER_DOWN", { value: .1 }), 4);
    expect(result.record.lines.filter((line) => line.includes("潜在能力"))).toHaveLength(1);
  });

  it("追加デバフは正式な命中/抵抗判定を通る", () => {
    const resisted = use(0, latent("ADD_DEBUFF", { status: "SPD_DOWN" }), 1, () => .999);
    expect(resisted.record.lines.join("\n")).toContain("効果を抵抗した");
    expect(resisted.engine.getUnits()[1].effects).toHaveLength(0);
  });

  it("ダメージ、HP/DEF依存の潜在がダメージ式へ反映される", () => {
    const plain = use(0).damage;
    expect(use(0, latent("DAMAGE_UP")).damage).toBeGreaterThan(plain);
    expect(use(0, latent("HP_SCALING", { value: .1 })).damage).toBeGreaterThan(plain);
    expect(use(0, latent("DEF_SCALING", { value: .1 })).damage).toBeGreaterThan(plain);
  });

  it("回復、シールド、ゲージ、我慢、反射を使用後に解決する", () => {
    const heal = use(0, latent("SELF_HEAL", { target: "SELF" }));
    heal.engine.getUnits()[0].currentHp = 1; // 経路の存在はログで確認（発動は既に一度）
    expect(heal.record.lines.join("\n")).toContain("潜在能力");
    expect(use(0, latent("SHIELD", { target: "SELF" })).engine.getUnits()[0].shieldValue).toBeGreaterThan(0);
    expect(use(0, latent("TURN_METER_DOWN")).record.lines.join("\n")).toContain("潜在能力");
    expect(use(0, latent("ADD_BUFF", { target: "SELF", status: "ENDURE", resolution: "CONDITIONAL" })).record.lines.join("\n")).not.toContain("潜在能力");
    const reflect = latent("ADD_BUFF", { target: "SELF", status: "REFLECT", resolution: "CONDITIONAL" });
    const setup = defs(reflect); setup.player.stats.hp = 100; const engine = new BattleEngine([setup.player], [setup.enemy], { rng: () => .1 });
    const actor = engine.getNextActor()!; engine.getUnits()[0].currentHp = 30; engine.resolveTurn(actor, { skillIndex: 0, targetId: "E1" });
    expect(engine.getUnits()[0].statusEffects.some((effect) => effect.type === "REFLECT")).toBe(true);
  });

  it("保存IDの解決、再覚醒後の差替え、ロード、周回用setupを同じ定義へ反映する", () => {
    const instance = createMonsterInstance("slime_FIRE", 3);
    const candidates = LATENT_ABILITY_CANDIDATES[instance.dexId];
    const wallet = { awakeningOrbs: 5, gold: 200_000 };
    expect(awakenLatentAbility(instance, candidates[0].id, candidates, wallet)).toBe(true);
    expect(toBattleDefinition(instance, findMonster("slime", "FIRE")!).latentAbility?.id).toBe(candidates[0].id);
    expect(reawakenLatentAbility(instance, wallet)).toBe(true);
    expect(awakenLatentAbility(instance, candidates[2].id, candidates, wallet)).toBe(true);
    const state = createInitialState(); state.monsters[0] = instance;
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state))).monsters[0];
    expect(loaded.development.latentAbilityId).toBe(candidates[2].id);
    const floor = { enemies: [{ templateId: "slime", element: "WATER" as const, star: 1 as const, level: 1 }], powerScale: 1 };
    expect(setupDungeonBattle([loaded], floor).playerDefs[0].latentAbility?.id).toBe(candidates[2].id);
  });
});

describe("役割変更潜在", () => {
  it("単体S1を主対象維持の全体攻撃へ変え、副対象倍率を下げる", () => {
    const ability = latent("DAMAGE_UP", { value: 0, aoeConversion: { damageMultiplier: .5, nativeEffectTarget: "PRIMARY_ONLY" } });
    const { player, enemy } = defs(ability); const second = { ...enemy, id: "enemy2" };
    const engine = new BattleEngine([player], [enemy, second], { rng: () => .9 });
    const actor = engine.getNextActor()!; const before = engine.getUnits().map((unit) => unit.currentHp);
    engine.resolveTurn(actor, { skillIndex: 0, targetId: "E2" });
    const primaryDamage = before[2] - engine.getUnits()[2].currentHp;
    const secondaryDamage = before[1] - engine.getUnits()[1].currentHp;
    expect(primaryDamage).toBeGreaterThan(secondaryDamage); expect(secondaryDamage).toBeGreaterThan(0);
  });
  it("多段の潜在妨害はスキル使用につき一度だけ解決する", () => {
    const ability = latent("DAMAGE_UP", { value: 0, runtimeEffects: [{ kind: "DEBUFF", status: "POISON", chance: 1, duration: 2, value: .05 }] });
    const setup = defs(ability, 4); setup.enemy.stats.resistance = 0;
    const engine = new BattleEngine([setup.player], [setup.enemy], { rng: () => 0 });
    const record = engine.resolveTurn(engine.getNextActor()!, { skillIndex: 0, targetId: "E1" });
    expect(engine.getUnits()[1].poisonStacks).toBe(1);
    expect(record.lines.filter((line) => line.includes("潜在能力"))).toHaveLength(1);
  });
});
