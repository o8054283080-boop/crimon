import { beforeEach, describe, expect, it } from "vitest";
import { STAR_MAX_LEVEL } from "../src/core/rarity.js";
import { findMonsterById, EXP_PIG } from "../src/data/monsters.js";
import { claimCompensations, COMPENSATIONS } from "../src/game/compensation.js";
import {
  EXP_BALANCE_APOLOGY,
  EXP_BALANCE_APOLOGY_ID,
  EXP_BALANCE_PIG_GRANT_ID,
  grantExpBalancePigs,
  registerExpBalanceApology,
} from "../src/game/expBalanceCompensation.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";

function onlyExpBalanceApology() {
  const state = createInitialState();
  state.claimedCompensationIds = COMPENSATIONS
    .filter((compensation) => compensation.id !== EXP_BALANCE_APOLOGY_ID)
    .map((compensation) => compensation.id);
  return state;
}

describe("経験値バランス調整のお詫び", () => {
  beforeEach(() => registerExpBalanceApology());

  it("お詫びを既存の配布一覧へ重複なく登録する", () => {
    registerExpBalanceApology();
    registerExpBalanceApology();
    expect(COMPENSATIONS.filter((compensation) => compensation.id === EXP_BALANCE_APOLOGY_ID)).toHaveLength(1);
    expect(EXP_BALANCE_APOLOGY.kind).toBe("APOLOGY");
  });

  it("ダイヤ1500個と召喚の書20枚を1回だけ受け取る", () => {
    const state = onlyExpBalanceApology();
    const beforeCrystal = state.crystal;
    const beforeScrolls = state.summonScrolls;

    const claims = claimCompensations(state, new Date("2026-09-10T12:00:00+09:00"));
    expect(claims.map(({ compensation }) => compensation.id)).toEqual([EXP_BALANCE_APOLOGY_ID]);
    expect(state.crystal).toBe(beforeCrystal + 1_500);
    expect(state.summonScrolls).toBe(beforeScrolls + 20);

    const reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)));
    expect(claimCompensations(reloaded, new Date("2026-09-11T12:00:00+09:00"))).toHaveLength(0);
    expect(reloaded.crystal).toBe(state.crystal);
    expect(reloaded.summonScrolls).toBe(state.summonScrolls);
  });

  it("★6 Lv60経験ピッグを6属性それぞれ2体ずつ、合計12体配る", () => {
    const state = createInitialState();
    const beforeIds = new Set(state.monsters.map((monster) => monster.id));

    expect(grantExpBalancePigs(state)).toBe(12);

    const granted = state.monsters.filter((monster) => !beforeIds.has(monster.id));
    expect(granted).toHaveLength(12);
    expect(granted.every((monster) => monster.star === 6)).toBe(true);
    expect(granted.every((monster) => monster.level === STAR_MAX_LEVEL[6])).toBe(true);
    expect(granted.every((monster) => findMonsterById(monster.dexId)?.templateId === EXP_PIG.templateId)).toBe(true);

    const counts = new Map<string, number>();
    for (const monster of granted) {
      const element = findMonsterById(monster.dexId)?.element;
      expect(element).toBeDefined();
      counts.set(element!, (counts.get(element!) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      FIRE: 2,
      WATER: 2,
      ELECTRIC: 2,
      GRASS: 2,
      LIGHT: 2,
      DARK: 2,
    });
    expect(state.claimedCompensationIds).toContain(EXP_BALANCE_PIG_GRANT_ID);
  });

  it("経験ピッグは再起動後も二重配布しない", () => {
    const state = createInitialState();
    expect(grantExpBalancePigs(state)).toBe(12);
    const after = state.monsters.length;

    const reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)));
    expect(grantExpBalancePigs(reloaded)).toBe(0);
    expect(reloaded.monsters).toHaveLength(after);
  });
});
