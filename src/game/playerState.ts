import { Equipment, EquipSlot, SET_TYPES, canEnhanceEquipment, enhanceEquipment, enhanceEquipmentCost } from "../core/equipment.js";
import { MAX_FIGHTER_LEVEL, INITIAL_MAX_STAMINA, maxStaminaForFighterLevel, requiredExpForFighterLevel } from "../core/fighterLevel.js";
import { MonsterInstance, createMonsterInstance } from "../core/monsterInstance.js";
import { Star } from "../core/rarity.js";
import { Difficulty } from "../data/stages.js";

export interface PlayerState {
  crystal: number;
  gold: number;
  monsters: MonsterInstance[];
  partyIds: string[];
  clearedStageIds: string[];
  /** クリア済みの装備ダンジョン階層(初回クリア判定・ダイヤ報酬用) */
  clearedDungeonFloors: number[];
  equipment: Equipment[];
  /** 装備ダンジョン専用のパーティ編成(通常ステージのpartyIdsとは別枠、最大5体) */
  dungeonPartyIds: string[];
  /** 召喚の書の所持数。1個消費すると石を使わずに1回分の召喚ができる */
  summonScrolls: number;
  /** プレイヤー(ファイター)自身のレベル。上限30 */
  fighterLevel: number;
  /** 次のファイターレベルまでの累積経験値 */
  fighterExp: number;
  /** 現在のスタミナ */
  stamina: number;
  /** スタミナ上限(ファイターレベルに応じて増える) */
  maxStamina: number;
  /** スタミナの自然回復計算の基準時刻(ミリ秒epoch) */
  lastStaminaUpdateAt: number;
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
    clearedDungeonFloors: [],
    equipment: [],
    dungeonPartyIds: [],
    summonScrolls: 0,
    fighterLevel: 1,
    fighterExp: 0,
    stamina: INITIAL_MAX_STAMINA,
    maxStamina: INITIAL_MAX_STAMINA,
    lastStaminaUpdateAt: Date.now(),
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
    if (!monster.skillLevels) monster.skillLevels = [1, 1, 1];
  }
  if (!state.dungeonPartyIds) state.dungeonPartyIds = [];
  if (!state.clearedDungeonFloors) state.clearedDungeonFloors = [];
  if (typeof state.summonScrolls !== "number") state.summonScrolls = 0;
  if (typeof state.fighterLevel !== "number") state.fighterLevel = 1;
  if (typeof state.fighterExp !== "number") state.fighterExp = 0;
  if (typeof state.maxStamina !== "number") state.maxStamina = maxStaminaForFighterLevel(state.fighterLevel);
  if (typeof state.stamina !== "number") state.stamina = state.maxStamina;
  if (typeof state.lastStaminaUpdateAt !== "number") state.lastStaminaUpdateAt = Date.now();
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

/**
 * クリア済み判定用のキーを作る。ノーマルは既存セーブとの後方互換のため素のstageIdのまま扱い、
 * ハード/ヘルだけ難易度サフィックスを付けて別枠のクリア扱いにする。
 */
function stageClearKey(stageId: string, difficulty: Difficulty): string {
  return difficulty === "NORMAL" ? stageId : `${stageId}::${difficulty}`;
}

export function isStageCleared(state: PlayerState, stageId: string, difficulty: Difficulty = "NORMAL"): boolean {
  return state.clearedStageIds.includes(stageClearKey(stageId, difficulty));
}

export function markStageCleared(state: PlayerState, stageId: string, difficulty: Difficulty = "NORMAL"): void {
  const key = stageClearKey(stageId, difficulty);
  if (!state.clearedStageIds.includes(key)) {
    state.clearedStageIds.push(key);
  }
}

export function isDungeonFloorCleared(state: PlayerState, floor: number): boolean {
  return state.clearedDungeonFloors.includes(floor);
}

export function markDungeonFloorCleared(state: PlayerState, floor: number): void {
  if (!state.clearedDungeonFloors.includes(floor)) {
    state.clearedDungeonFloors.push(floor);
  }
}

/** 初回クリアかどうかでダイヤ報酬額を決める(初回200、以降は消費スタミナと同量) */
export const FIRST_CLEAR_CRYSTAL_REWARD = 200;

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

/** スタミナが1回復するまでの実時間(分)。時間経過で自然回復する */
export const STAMINA_REGEN_INTERVAL_MINUTES = 5;

/**
 * 最後に計算した時刻からの経過時間に応じてスタミナを自然回復させる。
 * 消費したぶんの時間だけ基準時刻を進める(端数の経過時間は次回に持ち越す)。
 */
export function applyPassiveStaminaRegen(state: PlayerState, now: number = Date.now()): void {
  if (state.stamina >= state.maxStamina) {
    state.lastStaminaUpdateAt = now;
    return;
  }
  const intervalMs = STAMINA_REGEN_INTERVAL_MINUTES * 60_000;
  const elapsedTicks = Math.floor((now - state.lastStaminaUpdateAt) / intervalMs);
  if (elapsedTicks <= 0) return;

  const gained = Math.min(elapsedTicks, state.maxStamina - state.stamina);
  state.stamina += gained;
  state.lastStaminaUpdateAt += elapsedTicks * intervalMs;
}

export interface StaminaSpendResult {
  ok: boolean;
  reason?: string;
}

/** スタミナが足りていれば消費する(挑戦開始時に呼ぶ)。呼ぶ前に自然回復を反映する */
export function trySpendStamina(state: PlayerState, cost: number): StaminaSpendResult {
  applyPassiveStaminaRegen(state);
  if (state.stamina < cost) return { ok: false, reason: "スタミナが足りません" };
  state.stamina -= cost;
  return { ok: true };
}

export interface FighterExpResult {
  levelsGained: number;
}

/**
 * ファイター経験値を加算し、可能な限りレベルアップさせる。
 * レベルアップのたびにスタミナ上限が上がり、スタミナは全回復する。
 */
export function addFighterExp(state: PlayerState, exp: number): FighterExpResult {
  if (state.fighterLevel >= MAX_FIGHTER_LEVEL || exp <= 0) return { levelsGained: 0 };

  state.fighterExp += exp;
  let levelsGained = 0;
  while (state.fighterLevel < MAX_FIGHTER_LEVEL && state.fighterExp >= requiredExpForFighterLevel(state.fighterLevel)) {
    state.fighterExp -= requiredExpForFighterLevel(state.fighterLevel);
    state.fighterLevel += 1;
    state.maxStamina = maxStaminaForFighterLevel(state.fighterLevel);
    state.stamina = state.maxStamina;
    levelsGained += 1;
  }
  if (state.fighterLevel >= MAX_FIGHTER_LEVEL) {
    state.fighterLevel = MAX_FIGHTER_LEVEL;
    state.fighterExp = 0;
  }
  return { levelsGained };
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
