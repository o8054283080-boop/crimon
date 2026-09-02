import { Element } from "../core/element.js";
import { MonsterDefinition } from "../core/monster.js";

/**
 * 図鑑の絞り込み。
 *
 * 156体を並べ替えるだけでは、まだ「炎の耐久型」を探すのに炎の26体を
 * 目で追うことになる。並べ替えは順番を変えるだけで、**見る量は減らない。**
 *
 * 所持モンスターの絞り込み(`monsterFilter.ts`)とは軸が別物。
 * 図鑑は個体ではなく種の一覧なので、レベルも装備も編成状態も持たない。
 */

/** どこで手に入るか。図鑑でいちばん知りたい区別 */
export type DexSource = "NORMAL" | "GACHA" | "MATERIAL";

export const DEX_SOURCE_LABEL: Record<DexSource, string> = {
  NORMAL: "通常",
  GACHA: "召喚限定",
  MATERIAL: "素材",
};

export const DEX_SOURCES: DexSource[] = ["NORMAL", "GACHA", "MATERIAL"];

export interface DexFilter {
  elements: Element[];
  roles: string[];
  sources: DexSource[];
}

export const EMPTY_DEX_FILTER: DexFilter = { elements: [], roles: [], sources: [] };

export function dexFilterCount(filter: DexFilter): number {
  return filter.elements.length + filter.roles.length + filter.sources.length;
}

export function toggleDexValue<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/**
 * その1体がどこで手に入るか。
 *
 * 判定に使う集合は**呼ぶ側から渡す**。データ側の定数を直に読むと、
 * この関数だけを単体で確かめられなくなる。
 */
export interface DexSourceSets {
  /** 召喚でしか出ないテンプレートID */
  gachaOnly: ReadonlySet<string>;
  /** 素材専用のテンプレートID */
  material: ReadonlySet<string>;
}

export function dexSourceOf(dex: MonsterDefinition, sets: DexSourceSets): DexSource {
  if (sets.material.has(dex.templateId)) return "MATERIAL";
  if (sets.gachaOnly.has(dex.templateId)) return "GACHA";
  return "NORMAL";
}

/**
 * 絞り込む。
 *
 * **同じ群れの中は「どれか」、群れをまたぐと「すべて」。**
 * 火と水を選べば火か水、そこに「ヒーラー」を足せば
 * 「(火か水)かつヒーラー」。何も選んでいない群れは条件にしない。
 */
export function filterDexEntries(
  entries: readonly MonsterDefinition[],
  filter: DexFilter,
  sets: DexSourceSets,
): MonsterDefinition[] {
  return entries.filter((dex) => {
    if (filter.elements.length > 0 && !filter.elements.includes(dex.element)) return false;
    if (filter.roles.length > 0 && !filter.roles.includes(dex.role)) return false;
    if (filter.sources.length > 0 && !filter.sources.includes(dexSourceOf(dex, sets))) return false;
    return true;
  });
}

/** 一覧に実際に居る値だけを札にする。居ない条件の札を出すと、押しても0体になる */
export function dexFacets(entries: readonly MonsterDefinition[], sets: DexSourceSets): {
  elements: Element[];
  roles: string[];
  sources: DexSource[];
} {
  const elements: Element[] = [];
  const roles: string[] = [];
  const sources: DexSource[] = [];
  for (const dex of entries) {
    if (!elements.includes(dex.element)) elements.push(dex.element);
    if (!roles.includes(dex.role)) roles.push(dex.role);
    const source = dexSourceOf(dex, sets);
    if (!sources.includes(source)) sources.push(source);
  }
  // 並びは定義順に揃える。出てきた順だと、絞り込むたび札の位置が動く
  return {
    elements,
    roles: roles.sort((a, b) => a.localeCompare(b, "ja")),
    sources: DEX_SOURCES.filter((source) => sources.includes(source)),
  };
}
