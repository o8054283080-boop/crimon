import { Equipment, EquipSlot, SET_TYPES, canEnhanceEquipment, enhanceEquipment, enhanceEquipmentCost } from "../core/equipment.js";
import { MonsterInstance, createMonsterInstance } from "../core/monsterInstance.js";
import { Star } from "../core/rarity.js";

export interface PlayerState {
  crystal: number;
  gold: number;
  monsters: MonsterInstance[];
  partyIds: string[];
  clearedStageIds: string[];
  equipment: Equipment[];
  /** 装備ダンジョン専用のパーティ編成(通常ステージのpartyIdsとは別枠、最大5体) */
  dungeonPartyIds: string[];
  /** 召喚の書の所持数。1個消費すると石を使わずに1回分の召喚ができる */
  summonScrolls: number;
}

const STORAGE_KEY = "crimon_save_v1";

/** 装備ダンジョン専用パーティの最大人数(通常ステージの4体より1体多い) */
export const MAX_DUNGEON_PARTY_SIZE = 5;

const STARTER_MONSTERS: { templateId: string; element: string }[] = [
  { templateId: "slime", element: "FIRE" },
  { templateId: "wolf", element: "WATER" },
  { templateId: "golem", element: "ELECTRIC" },
  { templateId: "fairy", element: "GRASS" },
];

export function createInitialState(): PlayerState {
  const monsters = STARTER_MONSTERS.map((s) => createMonsterInstance(`${s.templateId}_${s.element}`, 1, 1));
  return {
    crystal: 300,
    gold: 500,
    monsters,
    partyIds: monsters.map((m) => m.id),
    clearedStageIds: [],
    equipment: [],
    dungeonPartyIds: [],
    summonScrolls: 0,
  };
}

/** 装備IDから決定的にシリーズを割り当てる(旧セーブデータ補完用。読み込むたびに同じ結果になる) */
function deterministicSetFromId(id: string): Equipment["set"] {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % SET_TYPES.length;
  return SET_TYPES[index];
}

/** 旧バージョンのセーブデータ(装備システム・強化レベル・セット・ダンジョン専用パーティ・召喚の書導入前)を読み込んでも壊れないよう不足フィールドを補う */
function normalizeState(state: PlayerState): PlayerState {
  if (!state.equipment) state.equipment = [];
  for (const equipment of state.equipment) {
    if (typeof equipment.level !== "number") equipment.level = 0;
    if (!equipment.set) equipment.set = deterministicSetFromId(equipment.id);
  }
  for (const monster of state.monsters) {
    if (!monster.equipment) monster.equipment = {};
  }
  if (!state.dungeonPartyIds) state.dungeonPartyIds = [];
  if (typeof state.summonScrolls !== "number") state.summonScrolls = 0;
  return state;
}

export function loadPlayerState(): PlayerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as PlayerState;
    if (!parsed.monsters || parsed.monsters.length === 0) return createInitialState();
    return normalizeState(parsed);
  } catch {
    return createInitialState();
  }
}

export function savePlayerState(state: PlayerState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function addMonster(state: PlayerState, dexId: string, star: Star, level = 1): MonsterInstance {
  const instance = createMonsterInstance(dexId, star, level);
  state.monsters.push(instance);
  return instance;
}

export function removeMonsters(state: PlayerState, instanceIds: readonly string[]): void {
  const idSet = new Set(instanceIds);
  state.monsters = state.monsters.filter((m) => !idSet.has(m.id));
  state.partyIds = state.partyIds.filter((id) => !idSet.has(id));
  state.dungeonPartyIds = state.dungeonPartyIds.filter((id) => !idSet.has(id));
}

export function getParty(state: PlayerState): MonsterInstance[] {
  return state.partyIds
    .map((id) => state.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
}

export function getDungeonParty(state: PlayerState): MonsterInstance[] {
  return state.dungeonPartyIds
    .map((id) => state.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
}

/** 装備ダンジョン専用パーティにモンスターを追加/除外する(最大5体まで) */
export function toggleDungeonPartyMember(state: PlayerState, instanceId: string): void {
  const idx = state.dungeonPartyIds.indexOf(instanceId);
  if (idx >= 0) {
    state.dungeonPartyIds.splice(idx, 1);
    return;
  }
  if (state.dungeonPartyIds.length >= MAX_DUNGEON_PARTY_SIZE) return;
  state.dungeonPartyIds.push(instanceId);
}

export function isStageCleared(state: PlayerState, stageId: string): boolean {
  return state.clearedStageIds.includes(stageId);
}

export function markStageCleared(state: PlayerState, stageId: string): void {
  if (!state.clearedStageIds.includes(stageId)) {
    state.clearedStageIds.push(stageId);
  }
}

export function addEquipment(state: PlayerState, equipment: Equipment): void {
  state.equipment.push(equipment);
}

/** 装備がどこかのモンスターに装着中かどうか */
export function isEquipmentEquipped(state: PlayerState, equipmentId: string): boolean {
  return state.monsters.some((m) => Object.values(m.equipment).includes(equipmentId));
}

export function findEquippedOwner(state: PlayerState, equipmentId: string): MonsterInstance | undefined {
  return state.monsters.find((m) => Object.values(m.equipment).includes(equipmentId));
}

/** 装備をモンスターのスロットに装着する。スロット不一致・所持外は失敗しfalseを返す */
export function equipToMonster(state: PlayerState, monsterId: string, equipmentId: string): boolean {
  const monster = state.monsters.find((m) => m.id === monsterId);
  const equipment = state.equipment.find((e) => e.id === equipmentId);
  if (!monster || !equipment) return false;

  // 他のモンスターに装着中なら先に外す
  for (const other of state.monsters) {
    if (other.id === monster.id) continue;
    const slot = (Object.entries(other.equipment) as [string, string][]).find(([, id]) => id === equipmentId)?.[0];
    if (slot) delete other.equipment[Number(slot) as EquipSlot];
  }

  monster.equipment[equipment.slot] = equipment.id;
  return true;
}

export function unequipFromMonster(state: PlayerState, monsterId: string, slot: EquipSlot): void {
  const monster = state.monsters.find((m) => m.id === monsterId);
  if (!monster) return;
  delete monster.equipment[slot];
}

export function getEquipmentById(state: PlayerState, equipmentId: string): Equipment | undefined {
  return state.equipment.find((e) => e.id === equipmentId);
}

export interface EnhanceResult {
  ok: boolean;
  reason?: string;
}

/** 所持ゴールドを消費して装備を1レベル強化する */
export function tryEnhanceEquipment(state: PlayerState, equipmentId: string, rng?: () => number): EnhanceResult {
  const equipment = state.equipment.find((e) => e.id === equipmentId);
  if (!equipment) return { ok: false, reason: "装備が見つかりません" };
  if (!canEnhanceEquipment(equipment)) return { ok: false, reason: "最大強化レベルに達しています" };

  const cost = enhanceEquipmentCost(equipment);
  if (state.gold < cost) return { ok: false, reason: "ゴールドが足りません" };

  state.gold -= cost;
  enhanceEquipment(equipment, rng);
  return { ok: true };
}

export function addSummonScrolls(state: PlayerState, count = 1): void {
  state.summonScrolls += count;
}

/** 召喚の書を1個消費できるなら消費してtrueを返す(石を使わずに1回分の召喚権を得る) */
export function tryUseSummonScroll(state: PlayerState): boolean {
  if (state.summonScrolls <= 0) return false;
  state.summonScrolls -= 1;
  return true;
}
