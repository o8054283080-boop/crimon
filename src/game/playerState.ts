import { MonsterInstance, createMonsterInstance } from "../core/monsterInstance.js";
import { Star } from "../core/rarity.js";

export interface PlayerState {
  crystal: number;
  gold: number;
  monsters: MonsterInstance[];
  partyIds: string[];
  clearedStageIds: string[];
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
  };
}

export function loadPlayerState(): PlayerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as PlayerState;
    if (!parsed.monsters || parsed.monsters.length === 0) return createInitialState();
    return parsed;
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
