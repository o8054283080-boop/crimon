import { Equipment, EquipSlot } from "../core/equipment.js";
import { MonsterInstance, createMonsterInstance } from "../core/monsterInstance.js";
import { Star } from "../core/rarity.js";

export interface PlayerState {
  crystal: number;
  gold: number;
  monsters: MonsterInstance[];
  partyIds: string[];
  clearedStageIds: string[];
  equipment: Equipment[];
}

const STORAGE_KEY = "crimon_save_v1";

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
  };
}

/** 旧バージョンのセーブデータ(装備システム導入前)を読み込んでも壊れないよう不足フィールドを補う */
function normalizeState(state: PlayerState): PlayerState {
  if (!state.equipment) state.equipment = [];
  for (const monster of state.monsters) {
    if (!monster.equipment) monster.equipment = {};
  }
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
}

export function getParty(state: PlayerState): MonsterInstance[] {
  return state.partyIds
    .map((id) => state.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
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
