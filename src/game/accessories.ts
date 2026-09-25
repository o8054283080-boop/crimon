import {
  type Accessory, type AccessoryFamily, type AccessoryMainStat, type AccessoryRarity, type AccessorySpecialId,
  type AccessoryStar,
  ACCESSORY_FAMILIES, ACCESSORY_MAIN_STATS, ACCESSORY_RARITIES, ACCESSORY_SPECIALS, ACCESSORY_STARS,
  accessoryEnhanceCost, accessoryMainValue, accessorySellPrice, canEnhanceAccessory, enhanceAccessory,
  sanitizeAccessory,
} from "../core/accessory.js";
import type { MonsterInstance } from "../core/monsterInstance.js";
import type { PlayerState } from "./playerState.js";

/**
 * アクセサリーの持ち物操作。**着ける・外す・強化・売却・ロック。**
 *
 * 装着は「モンスター側がアクセのIDを1つ持つ」形(装備の枠と同じ向き)。
 * だからモンスターを素材にしたり手放したりすると、アクセは自動的に
 * 誰も着けていない状態で持ち物に残る——**消えない。**
 */

export function accessoriesOf(state: Pick<PlayerState, "accessories">): Accessory[] {
  return Array.isArray(state.accessories) ? state.accessories : [];
}

export function findAccessory(state: Pick<PlayerState, "accessories">, id: string): Accessory | undefined {
  return accessoriesOf(state).find((acc) => acc.id === id);
}

/** そのアクセを着けているモンスター。誰も着けていなければ undefined */
export function accessoryOwner(state: Pick<PlayerState, "monsters">, accessoryId: string): MonsterInstance | undefined {
  return state.monsters.find((m) => m.accessoryId === accessoryId);
}

export function addAccessory(state: PlayerState, accessory: Accessory): void {
  (state.accessories ??= []).push(accessory);
}

export type AccessoryActionResult = { ok: true } | { ok: false; reason: string };

/**
 * 着ける。**別のモンスターが着けていたら、そちらからは外れる**(1個を2体で共有させない)。
 * 付け替え元の枠に何か着いていた場合は、それは外れて持ち物へ戻る。
 */
export function equipAccessory(state: PlayerState, monsterId: string, accessoryId: string): AccessoryActionResult {
  const monster = state.monsters.find((m) => m.id === monsterId);
  if (!monster) return { ok: false, reason: "モンスターが見つかりません" };
  if (!findAccessory(state, accessoryId)) return { ok: false, reason: "アクセサリーが見つかりません" };
  for (const other of state.monsters) {
    if (other !== monster && other.accessoryId === accessoryId) other.accessoryId = null;
  }
  monster.accessoryId = accessoryId;
  return { ok: true };
}

export function unequipAccessory(state: PlayerState, monsterId: string): AccessoryActionResult {
  const monster = state.monsters.find((m) => m.id === monsterId);
  if (!monster) return { ok: false, reason: "モンスターが見つかりません" };
  monster.accessoryId = null;
  return { ok: true };
}

export interface AccessoryEnhanceResult {
  ok: boolean;
  reason?: string;
  cost: number;
  level: number;
}

/** 1段強化する。**ゴールドだけ・必ず成功。** */
export function tryEnhanceAccessory(state: PlayerState, accessoryId: string): AccessoryEnhanceResult {
  const acc = findAccessory(state, accessoryId);
  if (!acc) return { ok: false, reason: "アクセサリーが見つかりません", cost: 0, level: 0 };
  if (!canEnhanceAccessory(acc)) return { ok: false, reason: "これ以上強化できません", cost: 0, level: acc.level };
  const cost = accessoryEnhanceCost(acc);
  if (state.gold < cost) return { ok: false, reason: "ゴールドが足りません", cost, level: acc.level };
  state.gold -= cost;
  enhanceAccessory(acc);
  return { ok: true, cost, level: acc.level };
}

export interface AccessorySellResult {
  ok: boolean;
  reason?: string;
  goldEarned: number;
}

export function sellAccessory(state: PlayerState, accessoryId: string): AccessorySellResult {
  const acc = findAccessory(state, accessoryId);
  if (!acc) return { ok: false, reason: "アクセサリーが見つかりません", goldEarned: 0 };
  if (acc.locked) return { ok: false, reason: "ロック中のアクセサリーは売却できません", goldEarned: 0 };
  if (accessoryOwner(state, accessoryId)) return { ok: false, reason: "装着中のアクセサリーは売却できません(先に外してください)", goldEarned: 0 };
  const goldEarned = accessorySellPrice(acc);
  state.accessories = accessoriesOf(state).filter((a) => a.id !== accessoryId);
  state.gold += goldEarned;
  return { ok: true, goldEarned };
}

export function setAccessoryLocked(state: PlayerState, accessoryId: string, locked: boolean): boolean {
  const acc = findAccessory(state, accessoryId);
  if (!acc) return false;
  if (locked) acc.locked = true;
  else delete acc.locked;
  return true;
}

/* ==========================================================================
 * 並べ替え・絞り込み
 * ========================================================================== */

export type AccessorySortKey = "NEWEST" | "STAR" | "RARITY" | "LEVEL" | "MAIN";

/** 装着しているかの絞り込み。ALLは条件なし */
export type AccessoryWornFilter = "ALL" | "EQUIPPED" | "FREE";
/** ロックしているかの絞り込み。ALLは条件なし */
export type AccessoryLockFilter = "ALL" | "LOCKED" | "UNLOCKED";

/**
 * 絞り込みの条件。**作りは所持装備の絞り込み(`src/web/equipmentFilter.ts`)と同じ。**
 *
 * 空配列は「すべて」。軸どうしは AND、同じ軸の中の複数選択は OR。
 * 「★6 または ★5 の、攻撃系統」という読み方になる。
 *
 * 前は系統・レア・★を1つずつしか選べず、札を3段に常に並べていた。
 * アクセが数十個たまると札の段だけで画面が埋まり、一覧が1枚半しか見えなかった。
 */
export interface AccessoryFilter {
  families: AccessoryFamily[];
  rarities: AccessoryRarity[];
  stars: AccessoryStar[];
  mainStats: AccessoryMainStat[];
  /** 特殊効果。**1個でも持っていれば残す**(装備のサブ効果と同じ読み方) */
  specials: AccessorySpecialId[];
  worn: AccessoryWornFilter;
  lock: AccessoryLockFilter;
}

export const EMPTY_ACCESSORY_FILTER: AccessoryFilter = {
  families: [],
  rarities: [],
  stars: [],
  mainStats: [],
  specials: [],
  worn: "ALL",
  lock: "ALL",
};

/** いま何個の軸で絞っているか。畳んでいる間もバッジで見せる */
export function activeAccessoryFilterCount(filter: AccessoryFilter): number {
  return (filter.families.length > 0 ? 1 : 0)
    + (filter.rarities.length > 0 ? 1 : 0)
    + (filter.stars.length > 0 ? 1 : 0)
    + (filter.mainStats.length > 0 ? 1 : 0)
    + (filter.specials.length > 0 ? 1 : 0)
    + (filter.worn === "ALL" ? 0 : 1)
    + (filter.lock === "ALL" ? 0 : 1);
}

/** 実際に持っている値。**手元に無い値の札は出さない**(押しても0件になるだけ) */
export interface AccessoryFacets {
  families: AccessoryFamily[];
  rarities: AccessoryRarity[];
  stars: AccessoryStar[];
  mainStats: AccessoryMainStat[];
  specials: AccessorySpecialId[];
}

export function availableAccessoryFacets(all: readonly Accessory[]): AccessoryFacets {
  const families = new Set<AccessoryFamily>();
  const rarities = new Set<AccessoryRarity>();
  const stars = new Set<AccessoryStar>();
  const mainStats = new Set<AccessoryMainStat>();
  const specials = new Set<AccessorySpecialId>();
  for (const acc of all) {
    families.add(acc.family);
    rarities.add(acc.rarity);
    stars.add(acc.star);
    mainStats.add(acc.mainStat);
    for (const roll of acc.specials) specials.add(roll.id);
  }
  // 並びは定義順(系統ごとにまとまっている)を保つ
  return {
    families: ACCESSORY_FAMILIES.filter((v) => families.has(v)),
    rarities: ACCESSORY_RARITIES.filter((v) => rarities.has(v)),
    stars: ACCESSORY_STARS.filter((v) => stars.has(v)),
    mainStats: ACCESSORY_MAIN_STATS.filter((v) => mainStats.has(v)),
    specials: (Object.keys(ACCESSORY_SPECIALS) as AccessorySpecialId[]).filter((v) => specials.has(v)),
  };
}

/**
 * 絞り込みを当てる(並べ替えはしない)。`isWorn` は「誰かが着けているか」。
 * 条件は一部だけ渡してもよい(書いていない軸は「すべて」)。
 */
export function filterAccessories(
  all: readonly Accessory[],
  filter: Partial<AccessoryFilter>,
  isWorn: (acc: Accessory) => boolean,
): Accessory[] {
  const f = { ...EMPTY_ACCESSORY_FILTER, ...filter };
  return all.filter((acc) => {
    if (f.families.length > 0 && !f.families.includes(acc.family)) return false;
    if (f.rarities.length > 0 && !f.rarities.includes(acc.rarity)) return false;
    if (f.stars.length > 0 && !f.stars.includes(acc.star)) return false;
    if (f.mainStats.length > 0 && !f.mainStats.includes(acc.mainStat)) return false;
    if (f.specials.length > 0 && !acc.specials.some((roll) => f.specials.includes(roll.id))) return false;
    if (f.worn === "EQUIPPED" && !isWorn(acc)) return false;
    if (f.worn === "FREE" && isWorn(acc)) return false;
    if (f.lock === "LOCKED" && acc.locked !== true) return false;
    if (f.lock === "UNLOCKED" && acc.locked === true) return false;
    return true;
  });
}

/** 誰かが着けているアクセのIDの集合。1件ごとに全モンスターを走査しないよう、先に1回だけ作る */
export function wornAccessoryIds(state: Pick<PlayerState, "monsters">): Set<string> {
  return new Set(state.monsters.map((m) => m.accessoryId).filter((id): id is string => typeof id === "string"));
}

/**
 * まとめて売れるアクセのID。**ロック中と装着中は除く**(`sellAccessory` が断るもの)。
 * 「表示中をすべて選ぶ」は、画面に見えているものからこれを通して選ぶ。
 */
export function sellableAccessoryIds(list: readonly Accessory[], worn: ReadonlySet<string>): string[] {
  return list.filter((acc) => acc.locked !== true && !worn.has(acc.id)).map((acc) => acc.id);
}

export interface AccessoryBulkSellResult {
  ok: boolean;
  reason?: string;
  sold: number;
  goldEarned: number;
}

/**
 * 選んだアクセをまとめて売る。**1個でも売れないものが混ざっていたら、1個も売らない。**
 *
 * 確認ダイアログの後に呼ぶ。確認を出している間に鍵を掛けた・着けた・
 * もう売れていた、があり得るので、ここで持ち物の今の状態を見直す。
 * 一部だけ売ると「確認した金額と違う額が入った」になるので、丸ごと断る。
 */
export function bulkSellAccessories(state: PlayerState, ids: readonly string[]): AccessoryBulkSellResult {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { ok: false, reason: "売却するアクセサリーが選ばれていません", sold: 0, goldEarned: 0 };
  const worn = wornAccessoryIds(state);
  const targets = unique.map((id) => findAccessory(state, id));
  if (targets.some((acc) => acc === undefined)) {
    return { ok: false, reason: "選んだアクセサリーの一部が見つかりません", sold: 0, goldEarned: 0 };
  }
  if (targets.some((acc) => acc!.locked === true)) {
    return { ok: false, reason: "ロック中のアクセサリーが含まれています", sold: 0, goldEarned: 0 };
  }
  if (targets.some((acc) => worn.has(acc!.id))) {
    return { ok: false, reason: "装着中のアクセサリーが含まれています(先に外してください)", sold: 0, goldEarned: 0 };
  }
  let sold = 0;
  let goldEarned = 0;
  for (const acc of targets) {
    const result = sellAccessory(state, acc!.id);
    if (!result.ok) continue;
    sold += 1;
    goldEarned += result.goldEarned;
  }
  return { ok: sold > 0, sold, goldEarned };
}

const RARITY_ORDER: Record<AccessoryRarity, number> = { HERO: 0, LEGEND: 1, EPIC: 2 };

export function sortAndFilterAccessories(
  state: Pick<PlayerState, "accessories" | "monsters">,
  sort: AccessorySortKey,
  filter: Partial<AccessoryFilter> = {},
): Accessory[] {
  const worn = wornAccessoryIds(state);
  const kept = new Set(filterAccessories(accessoriesOf(state), filter, (acc) => worn.has(acc.id)));
  const list = accessoriesOf(state).map((acc, index) => ({ acc, index })).filter(({ acc }) => kept.has(acc));
  const by = (f: (a: Accessory) => number) => (x: { acc: Accessory; index: number }, y: { acc: Accessory; index: number }) =>
    f(y.acc) - f(x.acc) || y.index - x.index;
  switch (sort) {
    case "STAR": list.sort(by((a) => a.star * 100 + RARITY_ORDER[a.rarity] * 10 + a.level / 100)); break;
    case "RARITY": list.sort(by((a) => RARITY_ORDER[a.rarity] * 100 + a.star * 10 + a.level / 100)); break;
    case "LEVEL": list.sort(by((a) => a.level * 100 + a.star)); break;
    case "MAIN": list.sort(by((a) => accessoryMainValue(a))); break;
    default: list.sort((x, y) => y.index - x.index); break;
  }
  return list.map(({ acc }) => acc);
}

/* ==========================================================================
 * 読み込み時の正規化
 * ========================================================================== */

/**
 * 控えのアクセとモンスターの装着を整える。**旧セーブでは何もしない**(配列が無ければ空で作る)。
 *
 *   ・読めないアクセは持ち物から外す(戦闘に渡すと例外の元になる)
 *   ・同じIDが2つあれば後ろを捨てる
 *   ・持ち物に無いアクセIDを指しているモンスターは「着けていない」に戻す
 *   ・同じアクセを2体が着けていたら、先の1体だけに残す
 */
export function normalizeAccessories(state: PlayerState): void {
  const seen = new Set<string>();
  const cleaned: Accessory[] = [];
  for (const raw of Array.isArray(state.accessories) ? state.accessories : []) {
    const acc = sanitizeAccessory(raw);
    if (!acc || acc.id === "acc_unknown" || seen.has(acc.id)) continue;
    seen.add(acc.id);
    cleaned.push(acc);
  }
  state.accessories = cleaned;
  const worn = new Set<string>();
  for (const monster of state.monsters) {
    const id = monster.accessoryId;
    if (id === undefined) continue;
    if (typeof id !== "string" || !seen.has(id) || worn.has(id)) {
      monster.accessoryId = null;
      continue;
    }
    worn.add(id);
  }
}
