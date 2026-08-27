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
  it("★6転生はタイプ変更、Lv1、EXP0、能力0になる", () => {
    const monster = createMonsterInstance("slime_FIRE", 6, 60); monster.exp = 99;
    setAbilityPoint(monster, "hp", 100);
    expect(reincarnateMonsterType(monster, "ATTACK")).toBe(true);
    expect([monster.star, monster.level, monster.exp, monster.development.type, usedAbilityPoints(monster.development.abilityPoints)]).toEqual([6, 1, 0, "ATTACK", 0]);
  });
  it("★5以下は転生できない", () => expect(reincarnateMonsterType(createMonsterInstance("slime_FIRE", 5), "HP")).toBe(false));
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
    expect(actual.accuracy).toBeCloseTo(Math.min(1, neutral.accuracy + mod.accuracy));
  });
  it("type=nullは従来の成長値と一致する", () => {
    const monster = createMonsterInstance("golem_WATER", 6, 60); const dex = findMonsterById(monster.dexId)!;
    expect(monster.development.type).toBeNull();
    expect(toBattleDefinition(monster, dex).stats.criRate).toBe(dex.stats.criRate);
    expect(toBattleDefinition(monster, dex).stats.accuracy).toBe(dex.stats.accuracy);
  });
});

describe("旧セーブmigration", () => {
  it.each([[4, 21], [5, 51], [6, 101]] as const)("★%iの超過%iポイントは安全に0へ戻す", (star, points) => {
    const state = createInitialState(); state.monsters[0].star = star; state.monsters[0].development.abilityPoints.atk = points;
    expect(usedAbilityPoints(normalizeLoadedState(state).monsters[0].development.abilityPoints)).toBe(0);
  });
  it("★6の上限内配分は維持する", () => {
    const state = createInitialState(); state.monsters[0].star = 6; state.monsters[0].development.abilityPoints.atk = 100;
    expect(normalizeLoadedState(state).monsters[0].development.abilityPoints.atk).toBe(100);
  });
});
