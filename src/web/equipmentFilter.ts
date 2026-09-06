/**
 * 所持装備の絞り込み。
 *
 * 並べ替えだけでは、装備が数百個たまった時点で目当ての1個に辿り着けない。
 * 「速攻シリーズで、まだ誰も着けていないレジェンド以上」を探すのに、
 * 並べ替えを切り替えながら画面を延々とたどることになっていた
 * (所持モンスター側で同じ問題を先に解いてある——`monsterFilter.ts`)。
 *
 * ここでは**探し方の軸**を用意する。軸は「装備を選ぶ時に人が口にする条件」に揃えた。
 *   レア度 / 星 / シリーズ / メイン効果 / 装着しているか・ロックしているか
 *
 * 枠(スロット)は既に専用の帯があるのでここには入れない。
 *
 * 表示だけの都合なので `src/web` に置く(保存データには一切入らない)。
 */
import { EquipStar, Equipment, SetType, StatType } from "../core/equipment.js";
import { EquipmentRarity, getEquipmentRarity } from "../core/equipmentRarity.js";

/** 装着状態の絞り込み。ALLは条件なし */
export type EquipUseFilter = "ALL" | "EQUIPPED" | "FREE" | "LOCKED";

export interface EquipmentFilter {
  /** 空配列は「すべて」。選んだものの**いずれか**に当てはまるものを残す */
  rarities: EquipmentRarity[];
  stars: EquipStar[];
  sets: SetType[];
  mainStats: StatType[];
  use: EquipUseFilter;
}

export const EMPTY_EQUIPMENT_FILTER: EquipmentFilter = {
  rarities: [],
  stars: [],
  sets: [],
  mainStats: [],
  use: "ALL",
};

export const EQUIP_USE_FILTER_LABEL: Record<Exclude<EquipUseFilter, "ALL">, string> = {
  EQUIPPED: "装着中",
  FREE: "未装着",
  LOCKED: "ロック中",
};

/** 配列の中身を1つ出し入れする。札を押すたびに呼ぶ */
export function toggleEquipmentFilterValue<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** いま何個の軸で絞っているか。畳んでいる間もバッジで見せる */
export function activeEquipmentFilterCount(filter: EquipmentFilter): number {
  return (
    (filter.rarities.length > 0 ? 1 : 0)
    + (filter.stars.length > 0 ? 1 : 0)
    + (filter.sets.length > 0 ? 1 : 0)
    + (filter.mainStats.length > 0 ? 1 : 0)
    + (filter.use === "ALL" ? 0 : 1)
  );
}

/**
 * 実際に持っている値だけを札にする。
 *
 * シリーズは12種、メイン効果は11種あるので、全部を常に並べると
 * **絞り込みを開いた時点で装備が1個も見えない。**
 * 手元に無いシリーズの札を出しても押す意味が無いので、持っているものだけ出す。
 */
export interface EquipmentFacets {
  rarities: EquipmentRarity[];
  stars: EquipStar[];
  sets: SetType[];
  mainStats: StatType[];
}

/** 並びは呼び出し側で決めた順序を保つため、定義順の配列を渡してもらう */
export function availableEquipmentFacets(
  all: readonly Equipment[],
  order: { rarities: readonly EquipmentRarity[]; stars: readonly EquipStar[]; sets: readonly SetType[]; mainStats: readonly StatType[] },
): EquipmentFacets {
  const rarities = new Set<EquipmentRarity>();
  const stars = new Set<EquipStar>();
  const sets = new Set<SetType>();
  const mainStats = new Set<StatType>();
  for (const item of all) {
    rarities.add(getEquipmentRarity(item));
    stars.add(item.star);
    sets.add(item.set);
    mainStats.add(item.mainStat.type);
  }
  return {
    rarities: order.rarities.filter((value) => rarities.has(value)),
    stars: order.stars.filter((value) => stars.has(value)),
    sets: order.sets.filter((value) => sets.has(value)),
    mainStats: order.mainStats.filter((value) => mainStats.has(value)),
  };
}

/**
 * 絞り込みを当てる。
 *
 * 軸どうしは AND(全部に当てはまるものが残る)、
 * 同じ軸の中の複数選択は OR(どれか1つに当てはまればよい)。
 * 「★6 または ★5 の、速攻シリーズ」という読み方になる。
 */
export function filterEquipment(
  all: readonly Equipment[],
  filter: EquipmentFilter,
  isEquipped: (equipment: Equipment) => boolean,
): Equipment[] {
  return all.filter((item) => {
    if (filter.rarities.length > 0 && !filter.rarities.includes(getEquipmentRarity(item))) return false;
    if (filter.stars.length > 0 && !filter.stars.includes(item.star)) return false;
    if (filter.sets.length > 0 && !filter.sets.includes(item.set)) return false;
    if (filter.mainStats.length > 0 && !filter.mainStats.includes(item.mainStat.type)) return false;
    if (filter.use === "EQUIPPED" && !isEquipped(item)) return false;
    if (filter.use === "FREE" && isEquipped(item)) return false;
    if (filter.use === "LOCKED" && item.locked !== true) return false;
    return true;
  });
}
