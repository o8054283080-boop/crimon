import { describe, expect, it } from "vitest";
import { ABILITY_POINT_RESET_COST, MONSTER_TYPE_STAT_MULTIPLIERS, MonsterType, abilityPointBudget } from "../src/core/monsterDevelopment.js";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
import { findMonsterById } from "../src/data/monsters.js";
import { reincarnateMonsterType, resetAbilityPoints, setAbilityPoint, usedAbilityPoints } from "../src/game/monsterDevelopment.js";
import { applyRankUp } from "../src/game/progression.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";

describe("星別能力ポイント", () => {
  it.each([[3, 0], [4, 20], [5, 50], [6, 100]] as const)("★%iは最大%iポイント", (star, maximum) => {
    const monster = createMonsterInstance("slime_FIRE", star);
    expect(abilityPointBudget(star)).toBe(maximum);
    expect(setAbilityPoint(monster, "atk", maximum)).toBe(true);
    expect(setAbilityPoint(monster, "hp", 1)).toBe(maximum === 0 ? false : false);
  });

  it("★4→★5と★5→★6で配分を全リセットする", () => {
    const four = createMonsterInstance("slime_FIRE", 4, 40);
    setAbilityPoint(four, "atk", 20);
    applyRankUp(four, []);
    expect(four.star).toBe(5);
    expect(usedAbilityPoints(four.development.abilityPoints)).toBe(0);
    expect(abilityPointBudget(four.star)).toBe(50);
    setAbilityPoint(four, "hp", 30); setAbilityPoint(four, "def", 20);
    applyRankUp(four, []);
    expect(four.star).toBe(6);
    expect(usedAbilityPoints(four.development.abilityPoints)).toBe(0);
    expect(abilityPointBudget(four.star)).toBe(100);
  });

  it("★6だけが10万Gでリセットでき、残高不足時は変更しない", () => {
    const monster = createMonsterInstance("slime_FIRE", 6);
    setAbilityPoint(monster, "atk", 100);
    const wallet = { gold: 150_000 };
    expect(resetAbilityPoints(monster, wallet)).toBe(true);
    expect(wallet.gold).toBe(50_000);
    expect(usedAbilityPoints(monster.development.abilityPoints)).toBe(0);
    expect(resetAbilityPoints(monster, wallet)).toBe(false);
    expect(wallet.gold).toBe(50_000);
    setAbilityPoint(monster, "atk", 100);
    const poor = { gold: 99_999 };
    expect(resetAbilityPoints(monster, poor)).toBe(false);
    expect(poor.gold).toBe(99_999);
    expect(usedAbilityPoints(monster.development.abilityPoints)).toBe(100);
    expect(ABILITY_POINT_RESET_COST).toBe(100_000);
  });
});

describe("タイプ転生と実戦ステータス", () => {
  const types = Object.keys(MONSTER_TYPE_STAT_MULTIPLIERS) as MonsterType[];
  it("★6転生は15万GでLv・EXPを維持し、能力だけリセットする", () => {
    const monster = createMonsterInstance("slime_FIRE", 6, 60); monster.exp = 99;
    monster.equipment = { 1: "eq-1" };
    monster.skillLevels = [4, 3, 2];
    monster.development.latentAbilityId = "latent-test";
    setAbilityPoint(monster, "hp", 100);
    const wallet = { gold: 150_000 };
    expect(reincarnateMonsterType(monster, "ATTACK", wallet)).toBe(true);
    expect([monster.star, monster.level, monster.exp, monster.development.type, usedAbilityPoints(monster.development.abilityPoints)]).toEqual([6, 60, 99, "ATTACK", 0]);
    expect(wallet.gold).toBe(0);
    expect(monster.equipment).toEqual({ 1: "eq-1" });
    expect(monster.skillLevels).toEqual([4, 3, 2]);
    expect(monster.development.latentAbilityId).toBe("latent-test");
  });
  it("★5以下・149,999G以下は転生できない", () => {
    expect(reincarnateMonsterType(createMonsterInstance("slime_FIRE", 5), "HP", { gold: 150_000 })).toBe(false);
    expect(reincarnateMonsterType(createMonsterInstance("slime_FIRE", 6), "HP", { gold: 149_999 })).toBe(false);
  });
  it.each(types)("%s補正がtoBattleDefinitionへ反映される", (type) => {
    const monster = createMonsterInstance("imp_DARK", 6, 60); const dex = findMonsterById(monster.dexId)!;
    const neutral = toBattleDefinition(monster, dex).stats;
    monster.development.type = type;
    const actual = toBattleDefinition(monster, dex).stats; const mod = MONSTER_TYPE_STAT_MULTIPLIERS[type];
    expect(actual.hp).toBe(Math.round(neutral.hp * mod.hp));
    expect(actual.atk).toBe(Math.round(neutral.atk * mod.atk));
    expect(actual.def).toBe(Math.round(neutral.def * mod.def));
    expect(actual.spd).toBe(Math.round(neutral.spd * mod.spd));
    expect(actual.criRate).toBeCloseTo(Math.min(1, neutral.criRate + mod.criRate));
    expect(actual.criDmg).toBeCloseTo(Math.max(1, neutral.criDmg + mod.criDmg));
    expect(actual.accuracy).toBeCloseTo(Math.min(1, neutral.accuracy + mod.accuracy));
    expect(actual.resistance).toBeCloseTo(Math.max(0, Math.min(1, neutral.resistance + mod.resistance)));
  });
  it("BALANCEは転生済みとして保存され、未転生と戦闘値だけが等しい", () => {
    const monster = createMonsterInstance("slime_FIRE", 6, 60); const dex = findMonsterById(monster.dexId)!;
    const before = toBattleDefinition(monster, dex).stats;
    expect(reincarnateMonsterType(monster, "BALANCE", { gold: 150_000 })).toBe(true);
    expect(monster.development.type).toBe("BALANCE");
    expect(toBattleDefinition(monster, dex).stats).toEqual(before);
  });
  it("全タイプはSPDを低下させず、BALANCEは全補正ゼロ", () => {
    expect(Object.values(MONSTER_TYPE_STAT_MULTIPLIERS).every((modifier) => modifier.spd >= 1)).toBe(true);
    expect(MONSTER_TYPE_STAT_MULTIPLIERS.BALANCE).toEqual({ hp: 1, atk: 1, def: 1, spd: 1, criRate: 0, criDmg: 0, accuracy: 0, resistance: 0 });
  });
  it("特殊能力値を安全範囲へclampする", () => {
    const monster = createMonsterInstance("golem_FIRE", 6, 60); const dex = findMonsterById(monster.dexId)!;
    monster.development.type = "DEFENSE";
    const low = toBattleDefinition(monster, { ...dex, stats: { ...dex.stats, criRate: 0.01, criDmg: 1.02, accuracy: 0, resistance: 0 } }).stats;
    expect(low.criRate).toBe(0); expect(low.criDmg).toBe(1); expect(low.accuracy).toBe(0);
    monster.development.type = "ATTACK";
    const high = toBattleDefinition(monster, { ...dex, stats: { ...dex.stats, criRate: 0.99, accuracy: 1, resistance: 0.01 } }).stats;
    expect(high.criRate).toBe(1); expect(high.accuracy).toBe(1); expect(high.resistance).toBe(0);
  });
  it("type=nullは従来の成長値と一致する", () => {
    const monster = createMonsterInstance("golem_WATER", 6, 60); const dex = findMonsterById(monster.dexId)!;
    expect(monster.development.type).toBeNull();
    expect(toBattleDefinition(monster, dex).stats.criRate).toBe(dex.stats.criRate);
    expect(toBattleDefinition(monster, dex).stats.accuracy).toBe(dex.stats.accuracy);
  });
});

describe("旧セーブmigration", () => {
  it("旧5タイプと新BALANCEを維持する", () => {
    for (const type of ["ATTACK", "HP", "DEFENSE", "SUPPORT", "DISRUPT", "BALANCE"] as const) {
      const state = createInitialState(); state.monsters[0].development.type = type;
      expect(normalizeLoadedState(state).monsters[0].development.type).toBe(type);
    }
  });
  it.each([[4, 21], [5, 51], [6, 101]] as const)("★%iの超過%iポイントは安全に0へ戻す", (star, points) => {
    const state = createInitialState(); state.monsters[0].star = star; state.monsters[0].development.abilityPoints.atk = points;
    expect(usedAbilityPoints(normalizeLoadedState(state).monsters[0].development.abilityPoints)).toBe(0);
  });
  it("★6の上限内配分は維持する", () => {
    const state = createInitialState(); state.monsters[0].star = 6; state.monsters[0].development.abilityPoints.atk = 100;
    expect(normalizeLoadedState(state).monsters[0].development.abilityPoints.atk).toBe(100);
  });
});
