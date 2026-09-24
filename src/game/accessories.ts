import {
  type Accessory, type AccessoryFamily, type AccessoryRarity, type AccessoryStar,
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

export interface AccessoryFilter {
  family?: AccessoryFamily | null;
  rarity?: AccessoryRarity | null;
  star?: AccessoryStar | null;
  /** 誰も着けていないものだけ */
  unequippedOnly?: boolean;
}

const RARITY_ORDER: Record<AccessoryRarity, number> = { HERO: 0, LEGEND: 1, EPIC: 2 };

export function sortAndFilterAccessories(
  state: Pick<PlayerState, "accessories" | "monsters">,
  sort: AccessorySortKey,
  filter: AccessoryFilter = {},
): Accessory[] {
  const worn = new Set(state.monsters.map((m) => m.accessoryId).filter((id): id is string => typeof id === "string"));
  const list = accessoriesOf(state).map((acc, index) => ({ acc, index })).filter(({ acc }) => {
    if (filter.family && acc.family !== filter.family) return false;
    if (filter.rarity && acc.rarity !== filter.rarity) return false;
    if (filter.star && acc.star !== filter.star) return false;
    if (filter.unequippedOnly && worn.has(acc.id)) return false;
    return true;
  });
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
