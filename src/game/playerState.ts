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
  /** クリア済みのレベル上げダンジョン難易度(初回クリア判定・ダイヤ報酬用) */
  clearedLevelDungeonTiers: string[];
  equipment: Equipment[];
  /** 装備ダンジョン専用のパーティ編成(通常ステージのpartyIdsとは別枠、最大5体) */
  dungeonPartyIds: string[];
  /** 召喚の書の所持数。1個消費すると石を使わずに1回分の召喚ができる */
  summonScrolls: number;
  /** プレイヤー(ファイター)自身のレベル。上限50 */
  fighterLevel: number;
  /** 次のファイターレベルまでの累積経験値 */
  fighterExp: number;
  /** 現在のスタミナ */
  stamina: number;
  /** スタミナ上限(ファイターレベルに応じて増える) */
  maxStamina: number;
  /** スタミナの自然回復計算の基準時刻(ミリ秒epoch) */
  lastStaminaUpdateAt: number;
  /** プレイヤーが自由に設定できるファイター名 */
  fighterName: string;
  /** 直近でログインボーナスを受け取った時刻(ミリ秒epoch)。同じ日にはもう受け取れない */
  lastLoginBonusAt: number | null;
  /** ログインボーナスを受け取った日数の累計(10日ごとの追加ボーナス判定に使う) */
  loginBonusClaimCount: number;
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

/** ファイター名の初期値・最大文字数 */
export const DEFAULT_FIGHTER_NAME = "ファイター";
export const FIGHTER_NAME_MAX_LENGTH = 12;

export function createInitialState(): PlayerState {
  const monsters = STARTER_MONSTERS.map((s) => createMonsterInstance(`${s.templateId}_${s.element}`, 1, 1));
  return {
    crystal: 300,
    gold: 500,
    monsters,
    partyIds: monsters.map((m) => m.id),
    clearedStageIds: [],
    clearedDungeonFloors: [],
    clearedLevelDungeonTiers: [],
    equipment: [],
    dungeonPartyIds: [],
    summonScrolls: 0,
    fighterLevel: 1,
    fighterExp: 0,
    stamina: INITIAL_MAX_STAMINA,
    maxStamina: INITIAL_MAX_STAMINA,
    lastStaminaUpdateAt: Date.now(),
    fighterName: DEFAULT_FIGHTER_NAME,
    lastLoginBonusAt: null,
    loginBonusClaimCount: 0,
  };
}

/** ファイター名を変更する。空文字や規定文字数超過は無視して元の値を保つ */
export function setFighterName(state: PlayerState, name: string): void {
  const trimmed = name.trim().slice(0, FIGHTER_NAME_MAX_LENGTH);
  if (trimmed.length === 0) return;
  state.fighterName = trimmed;
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
  if (!state.clearedLevelDungeonTiers) state.clearedLevelDungeonTiers = [];
  if (typeof state.summonScrolls !== "number") state.summonScrolls = 0;
  if (typeof state.fighterLevel !== "number") state.fighterLevel = 1;
  if (typeof state.fighterExp !== "number") state.fighterExp = 0;
  if (typeof state.maxStamina !== "number") state.maxStamina = maxStaminaForFighterLevel(state.fighterLevel);
  if (typeof state.stamina !== "number") state.stamina = state.maxStamina;
  if (typeof state.lastStaminaUpdateAt !== "number") state.lastStaminaUpdateAt = Date.now();
  if (typeof state.fighterName !== "string" || state.fighterName.length === 0) state.fighterName = DEFAULT_FIGHTER_NAME;
  if (typeof state.lastLoginBonusAt !== "number") state.lastLoginBonusAt = null;
  if (typeof state.loginBonusClaimCount !== "number") state.loginBonusClaimCount = 0;
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

export function isLevelDungeonTierCleared(state: PlayerState, tier: string): boolean {
  return state.clearedLevelDungeonTiers.includes(tier);
}

export function markLevelDungeonTierCleared(state: PlayerState, tier: string): void {
  if (!state.clearedLevelDungeonTiers.includes(tier)) {
    state.clearedLevelDungeonTiers.push(tier);
  }
}

/** 初回クリアなら200ダイヤ確定。2回目以降は低確率(3%)で50ダイヤがもらえる */
export const FIRST_CLEAR_CRYSTAL_REWARD = 200;
export const REPEAT_CLEAR_CRYSTAL_CHANCE = 0.03;
export const REPEAT_CLEAR_CRYSTAL_REWARD = 50;

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
export const STAMINA_REGEN_INTERVAL_MINUTES = 3;

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

/** ダイヤ50でスタミナ100回復(上限を超える分は切り捨て) */
export const STAMINA_REFILL_PARTIAL_COST = 50;
export const STAMINA_REFILL_PARTIAL_AMOUNT = 100;
/** ダイヤ200でスタミナ全回復 */
export const STAMINA_REFILL_FULL_COST = 200;

export interface StaminaRefillResult {
  ok: boolean;
  reason?: string;
}

/** ダイヤを消費してスタミナを100回復する。呼ぶ前に自然回復を反映する */
export function tryRefillStaminaPartial(state: PlayerState): StaminaRefillResult {
  applyPassiveStaminaRegen(state);
  if (state.stamina >= state.maxStamina) return { ok: false, reason: "スタミナは既に満タンです" };
  if (state.crystal < STAMINA_REFILL_PARTIAL_COST) return { ok: false, reason: "ダイヤが足りません" };
  state.crystal -= STAMINA_REFILL_PARTIAL_COST;
  state.stamina = Math.min(state.maxStamina, state.stamina + STAMINA_REFILL_PARTIAL_AMOUNT);
  return { ok: true };
}

/** ダイヤを消費してスタミナを全回復する。呼ぶ前に自然回復を反映する */
export function tryRefillStaminaFull(state: PlayerState): StaminaRefillResult {
  applyPassiveStaminaRegen(state);
  if (state.stamina >= state.maxStamina) return { ok: false, reason: "スタミナは既に満タンです" };
  if (state.crystal < STAMINA_REFILL_FULL_COST) return { ok: false, reason: "ダイヤが足りません" };
  state.crystal -= STAMINA_REFILL_FULL_COST;
  state.stamina = state.maxStamina;
  return { ok: true };
}

export interface FighterExpResult {
  levelsGained: number;
}

/** ファイターレベルが1上がるごとにもらえるダイヤ */
export const FIGHTER_LEVEL_UP_CRYSTAL_REWARD = 300;

/**
 * ファイター経験値を加算し、可能な限りレベルアップさせる。
 * レベルアップのたびにスタミナ上限が上がり、スタミナは全回復し、ダイヤも獲得する。
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
  if (levelsGained > 0) state.crystal += FIGHTER_LEVEL_UP_CRYSTAL_REWARD * levelsGained;
  return { levelsGained };
}

/** 毎日のログインボーナス(ダイヤ200)。10日分(累計)受け取るごとに追加でダイヤ1000がもらえる */
export const LOGIN_BONUS_DAILY_CRYSTAL = 200;
export const LOGIN_BONUS_MILESTONE_CRYSTAL = 1000;
export const LOGIN_BONUS_MILESTONE_INTERVAL_DAYS = 10;

export interface LoginBonusResult {
  claimed: boolean;
  dailyCrystal: number;
  milestoneCrystal: number;
  claimCount: number;
}

/**
 * まだその日のログインボーナスを受け取っていなければ付与する(カレンダー日の変わり目で判定)。
 * 受け取った累計日数が10の倍数に達するたびに追加でダイヤ1000が付与される。
 */
export function claimDailyLoginBonus(state: PlayerState, now: number = Date.now()): LoginBonusResult {
  const alreadyClaimedToday = state.lastLoginBonusAt !== null && new Date(state.lastLoginBonusAt).toDateString() === new Date(now).toDateString();
  if (alreadyClaimedToday) {
    return { claimed: false, dailyCrystal: 0, milestoneCrystal: 0, claimCount: state.loginBonusClaimCount };
  }

  state.lastLoginBonusAt = now;
  state.loginBonusClaimCount += 1;
  const milestoneCrystal = state.loginBonusClaimCount % LOGIN_BONUS_MILESTONE_INTERVAL_DAYS === 0 ? LOGIN_BONUS_MILESTONE_CRYSTAL : 0;
  state.crystal += LOGIN_BONUS_DAILY_CRYSTAL + milestoneCrystal;

  return { claimed: true, dailyCrystal: LOGIN_BONUS_DAILY_CRYSTAL, milestoneCrystal, claimCount: state.loginBonusClaimCount };
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
