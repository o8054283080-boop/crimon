import { describe, expect, it } from "vitest";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { MONSTER_SORT_KEYS, monsterPower, sortMonsters } from "../src/game/monsterSort.js";
import { findMonsterById } from "../src/data/monsters.js";

function make(dexId: string, star: 1 | 2 | 3 | 4 | 5 | 6, level: number) {
  return createMonsterInstance(dexId, star, level);
}

const NO_PARTY = { partyIds: [] as string[] };

describe("モンスターの並べ替え", () => {
  it("星順は星の高いものが先に来る", () => {
    const list = [make("slime_FIRE", 1, 1), make("wolf_WATER", 5, 1), make("golem_GRASS", 3, 1)];
    const sorted = sortMonsters(list, "star", NO_PARTY);
    expect(sorted.map((m) => m.star)).toEqual([5, 3, 1]);
  });

  it("レベル順はレベルの高いものが先に来る", () => {
    const list = [make("slime_FIRE", 3, 10), make("wolf_WATER", 3, 30), make("golem_GRASS", 3, 20)];
    const sorted = sortMonsters(list, "level", NO_PARTY);
    expect(sorted.map((m) => m.level)).toEqual([30, 20, 10]);
  });

  it("総合力順は、同じ星でもステータスの高い種族が先に来る", () => {
    // トレント(HP1950)はフェアリー(HP950)よりはっきり総合力が高い
    const treant = make("treant_GRASS", 3, 20);
    const fairy = make("fairy_GRASS", 3, 20);
    expect(monsterPower(treant)).toBeGreaterThan(monsterPower(fairy));
    const sorted = sortMonsters([fairy, treant], "power", NO_PARTY);
    expect(sorted[0].dexId).toBe("treant_GRASS");
  });

  it("おすすめ順は編成中のモンスターを先頭へ寄せる", () => {
    const inParty = make("slime_FIRE", 1, 1);
    const strong = make("dragon_FIRE", 6, 60);
    const sorted = sortMonsters([strong, inParty], "recommended", { partyIds: [inParty.id] });
    expect(sorted[0].id).toBe(inParty.id);
  });

  it("属性順は同じ属性がまとまる", () => {
    const list = [make("slime_FIRE", 1, 1), make("wolf_WATER", 1, 1), make("golem_FIRE", 1, 1)];
    const sorted = sortMonsters(list, "element", NO_PARTY);
    const elements = sorted.map((m) => findMonsterById(m.dexId)!.element);
    // 同じ属性が隣り合っていること(間に別属性が挟まらない)
    expect(elements[0]).toBe(elements[1]);
  });

  it("種族順は同じ種族がまとまる", () => {
    const list = [make("slime_FIRE", 1, 1), make("wolf_WATER", 1, 1), make("slime_WATER", 1, 1)];
    const sorted = sortMonsters(list, "template", NO_PARTY);
    const templates = sorted.map((m) => findMonsterById(m.dexId)!.templateId);
    expect(templates[0]).toBe(templates[1]);
  });

  it("新しい順は手に入れた順の逆になる(強さで崩さない)", () => {
    const first = make("slime_FIRE", 1, 1);
    const second = make("dragon_FIRE", 6, 60);
    const third = make("wolf_WATER", 2, 5);
    const sorted = sortMonsters([first, second, third], "newest", NO_PARTY);
    expect(sorted.map((m) => m.id)).toEqual([third.id, second.id, first.id]);
  });

  it("どの軸でも元の配列を変えず、体数も変わらない", () => {
    const list = [make("slime_FIRE", 1, 1), make("wolf_WATER", 5, 30), make("golem_GRASS", 3, 12)];
    const snapshot = list.map((m) => m.id);
    for (const key of MONSTER_SORT_KEYS) {
      const sorted = sortMonsters(list, key, NO_PARTY);
      expect(sorted).toHaveLength(list.length);
      expect(new Set(sorted.map((m) => m.id))).toEqual(new Set(snapshot));
      expect(list.map((m) => m.id)).toEqual(snapshot);
    }
  });

  it("同じ内容で並べ替えれば毎回同じ並びになる(開くたびに順番が動かない)", () => {
    const list = [make("slime_FIRE", 3, 10), make("wolf_WATER", 3, 10), make("golem_GRASS", 3, 10)];
    for (const key of MONSTER_SORT_KEYS) {
      const a = sortMonsters(list, key, NO_PARTY).map((m) => m.id);
      const b = sortMonsters(list, key, NO_PARTY).map((m) => m.id);
      expect(a).toEqual(b);
    }
  });
});
