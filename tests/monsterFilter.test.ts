import { describe, expect, it } from "vitest";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { findMonsterById } from "../src/data/monsters.js";
import {
  EMPTY_MONSTER_FILTER,
  MonsterFilter,
  activeFilterCount,
  availableFacets,
  equippedCount,
  filterMonsters,
  isFilterActive,
  toggleInList,
} from "../src/web/monsterFilter.js";

function make(dexId: string, star: 1 | 2 | 3 | 4 | 5 | 6, level = 1) {
  return createMonsterInstance(dexId, star, level);
}

const NO_PARTY = { partyIds: [] as string[] };

function withFilter(patch: Partial<MonsterFilter>): MonsterFilter {
  return { ...EMPTY_MONSTER_FILTER, ...patch };
}

describe("所持モンスターの絞り込み", () => {
  it("条件を付けていなければ全部残る", () => {
    const list = [make("slime_FIRE", 1), make("wolf_WATER", 5)];
    expect(filterMonsters(list, EMPTY_MONSTER_FILTER, NO_PARTY)).toHaveLength(2);
    expect(isFilterActive(EMPTY_MONSTER_FILTER)).toBe(false);
  });

  it("属性で絞ると、選んだ属性のものだけが残る", () => {
    const list = [make("slime_FIRE", 1), make("wolf_WATER", 1), make("golem_GRASS", 1)];
    const result = filterMonsters(list, withFilter({ elements: ["FIRE", "GRASS"] }), NO_PARTY);
    expect(result.map((m) => findMonsterById(m.dexId)?.element).sort()).toEqual(["FIRE", "GRASS"]);
  });

  it("星で絞ると、選んだ星のものだけが残る", () => {
    const list = [make("slime_FIRE", 1), make("slime_FIRE", 5), make("slime_FIRE", 6)];
    const result = filterMonsters(list, withFilter({ stars: [5, 6] }), NO_PARTY);
    expect(result.map((m) => m.star).sort()).toEqual([5, 6]);
  });

  it("役割で絞ると、その役割のものだけが残る", () => {
    const list = [make("slime_FIRE", 1), make("golem_GRASS", 1)];
    const role = findMonsterById("golem_GRASS")!.role;
    const result = filterMonsters(list, withFilter({ roles: [role] }), NO_PARTY);
    expect(result).toHaveLength(1);
    expect(findMonsterById(result[0].dexId)?.role).toBe(role);
  });

  it("編成中/未編成で分けられる", () => {
    const inParty = make("slime_FIRE", 1);
    const outParty = make("wolf_WATER", 1);
    const context = { partyIds: [inParty.id] };
    expect(filterMonsters([inParty, outParty], withFilter({ party: "IN" }), context)).toEqual([inParty]);
    expect(filterMonsters([inParty, outParty], withFilter({ party: "OUT" }), context)).toEqual([outParty]);
  });

  it("装備の付き具合で分けられる", () => {
    const bare = make("slime_FIRE", 1);
    const partial = make("wolf_WATER", 1);
    partial.equipment = { 1: "eq1", 2: "eq2" };
    const full = make("golem_GRASS", 1);
    full.equipment = { 1: "a", 2: "b", 3: "c", 4: "d", 5: "e", 6: "f" };
    const list = [bare, partial, full];

    expect(equippedCount(partial)).toBe(2);
    expect(filterMonsters(list, withFilter({ gear: "NONE" }), NO_PARTY)).toEqual([bare]);
    expect(filterMonsters(list, withFilter({ gear: "PARTIAL" }), NO_PARTY)).toEqual([partial]);
    expect(filterMonsters(list, withFilter({ gear: "FULL" }), NO_PARTY)).toEqual([full]);
  });

  it("複数の軸は同時に効く(かつ条件)", () => {
    const hit = make("slime_FIRE", 6);
    const list = [hit, make("slime_FIRE", 3), make("wolf_WATER", 6)];
    const result = filterMonsters(list, withFilter({ elements: ["FIRE"], stars: [6] }), NO_PARTY);
    expect(result).toEqual([hit]);
  });

  it("付けている条件の数を数えられる", () => {
    expect(activeFilterCount(EMPTY_MONSTER_FILTER)).toBe(0);
    expect(activeFilterCount(withFilter({ elements: ["FIRE", "WATER"], party: "IN" }))).toBe(3);
  });

  it("札の候補は、実際に持っているものだけを出す", () => {
    const facets = availableFacets([make("slime_FIRE", 3), make("slime_FIRE", 6)]);
    expect(facets.elements).toEqual(["FIRE"]);
    // 星は高い順に並べて、強い個体から探せるようにする
    expect(facets.stars).toEqual([6, 3]);
    expect(facets.roles).toHaveLength(1);
  });

  it("札は押すたびに入り切りが変わる", () => {
    expect(toggleInList(["FIRE"], "WATER")).toEqual(["FIRE", "WATER"]);
    expect(toggleInList(["FIRE", "WATER"], "FIRE")).toEqual(["WATER"]);
  });
});
