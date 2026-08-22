/**
 * 所持モンスターの絞り込み。
 *
 * 並べ替えだけでは、手持ちが数十体を超えた時点で目当ての1体に辿り着けない。
 * 「火属性の★6で、まだ装備を着けていない子」を探すのに、
 * 並べ替えを切り替えながら画面を延々とたどることになっていた。
 *
 * ここでは**探し方の軸**を用意する。軸は「編成の時に人が口にする条件」に揃えてある。
 *   属性 / 星 / 役割 / いま編成しているか / 装備を着けているか
 *
 * 表示だけの都合なので `src/web` に置く(保存データには一切入らない)。
 */
import { Element } from "../core/element.js";
import { EQUIP_SLOTS } from "../core/equipment.js";
import { MonsterInstance } from "../core/monsterInstance.js";
import { Star } from "../core/rarity.js";
import { findMonsterById } from "../data/monsters.js";

/** 編成状態の絞り込み。ALLは条件なし */
export type PartyFilter = "ALL" | "IN" | "OUT";

/** 装備状態の絞り込み。ALLは条件なし */
export type GearFilter = "ALL" | "FULL" | "PARTIAL" | "NONE";

export interface MonsterFilter {
  /** 空配列は「すべて」。選んだものの**いずれか**に当てはまるものを残す */
  elements: Element[];
  stars: Star[];
  roles: string[];
  party: PartyFilter;
  gear: GearFilter;
}

export const EMPTY_MONSTER_FILTER: MonsterFilter = {
  elements: [],
  stars: [],
  roles: [],
  party: "ALL",
  gear: "ALL",
};

export const GEAR_FILTER_LABEL: Record<Exclude<GearFilter, "ALL">, string> = {
  FULL: "装備フル",
  PARTIAL: "装備途中",
  NONE: "装備なし",
};

export const PARTY_FILTER_LABEL: Record<Exclude<PartyFilter, "ALL">, string> = {
  IN: "編成中",
  OUT: "未編成",
};

/** 着けている装備の数。カードの表示と絞り込みで同じ数を使う */
export function equippedCount(instance: MonsterInstance): number {
  return EQUIP_SLOTS.filter((slot) => instance.equipment[slot] !== undefined).length;
}

/** 装備スロットの総数。「3/6」の分母 */
export const GEAR_SLOT_TOTAL = EQUIP_SLOTS.length;

function matchesGear(instance: MonsterInstance, gear: GearFilter): boolean {
  if (gear === "ALL") return true;
  const count = equippedCount(instance);
  if (gear === "FULL") return count >= GEAR_SLOT_TOTAL;
  if (gear === "NONE") return count === 0;
  return count > 0 && count < GEAR_SLOT_TOTAL;
}

export interface MonsterFilterContext {
  /** いま編成されているモンスターID(表示中の編成に合わせて渡す) */
  partyIds: readonly string[];
}

/** 条件をひとつでも付けているか。付けている間は解除ボタンを出す */
export function isFilterActive(filter: MonsterFilter): boolean {
  return activeFilterCount(filter) > 0;
}

/** 付けている条件の数。畳んでいる時でも「何個絞っているか」が分かるようにする */
export function activeFilterCount(filter: MonsterFilter): number {
  return (
    filter.elements.length +
    filter.stars.length +
    filter.roles.length +
    (filter.party === "ALL" ? 0 : 1) +
    (filter.gear === "ALL" ? 0 : 1)
  );
}

/** 絞り込んだ新しい配列を返す(元の配列は変えない) */
export function filterMonsters(
  monsters: readonly MonsterInstance[],
  filter: MonsterFilter,
  context: MonsterFilterContext,
): MonsterInstance[] {
  return monsters.filter((instance) => {
    const dex = findMonsterById(instance.dexId);
    if (filter.elements.length > 0 && (!dex || !filter.elements.includes(dex.element))) return false;
    if (filter.stars.length > 0 && !filter.stars.includes(instance.star)) return false;
    if (filter.roles.length > 0 && (!dex || !filter.roles.includes(dex.role))) return false;
    if (filter.party !== "ALL") {
      const inParty = context.partyIds.includes(instance.id);
      if (filter.party === "IN" && !inParty) return false;
      if (filter.party === "OUT" && inParty) return false;
    }
    if (!matchesGear(instance, filter.gear)) return false;
    return true;
  });
}

/**
 * 手持ちに実際にいる属性・星・役割だけを返す。
 *
 * 固定の一覧を並べると、**押しても0体にしかならない札**が並んで、
 * 絞り込み自体が信用されなくなる。持っているものだけを出す。
 */
export function availableFacets(monsters: readonly MonsterInstance[]): {
  elements: Element[];
  stars: Star[];
  roles: string[];
} {
  const elements = new Set<Element>();
  const stars = new Set<Star>();
  const roles = new Set<string>();
  for (const instance of monsters) {
    stars.add(instance.star);
    const dex = findMonsterById(instance.dexId);
    if (!dex) continue;
    elements.add(dex.element);
    roles.add(dex.role);
  }
  return {
    elements: [...elements],
    stars: [...stars].sort((a, b) => b - a),
    roles: [...roles].sort((a, b) => a.localeCompare(b, "ja")),
  };
}

/** 配列の要素を入れたり外したりする(絞り込みの札はどれも押すたびに切り替わる) */
export function toggleInList<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
