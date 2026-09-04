import { Equipment, EquipSlot, SET_TYPES, canEnhanceEquipment, enhanceEquipment, enhanceEquipmentCost, equipmentSellPrice } from "../core/equipment.js";
import { MAX_FIGHTER_LEVEL, INITIAL_MAX_STAMINA, maxStaminaForFighterLevel, requiredExpForFighterLevel } from "../core/fighterLevel.js";
import { MonsterInstance, createMonsterInstance } from "../core/monsterInstance.js";
import { abilityPointBudget, createDefaultMonsterDevelopment } from "../core/monsterDevelopment.js";
import { Star } from "../core/rarity.js";
import type { ArenaDefenseSnapshot, ArenaMatchRecord } from "./arena/types.js";
import { GOLD_DUNGEON_DAILY_LIMIT } from "../data/goldDungeon.js";
import { LEGACY_LEVEL_DUNGEON_TIERS, LEVEL_DUNGEON_DAILY_LIMIT } from "../data/levelDungeon.js";
import { ARENA_START_POINTS, ARENA_TICKET_MAX } from "../data/pvpArena.js";
import { ARENA_NOT_CLAIMED } from "../data/arena/season.js";

/** アリーナの記録として残す件数。増やし続けると控えが太る */
export const ARENA_HISTORY_MAX = 30;

/**
 * この端末の識別子を作る。
 *
 * **形はUUIDに揃える。** サーバ側の `user_id` は uuid 型なので、
 * `local_1` のような文字列を送ると PostgREST がキャストで落として
 * 400を返す——実プレイヤーが1人も並ばず、順位も常に「未掲載」になる。
 * 認証が入ったらそのユーザIDへ差し替える。
 */
export function newArenaLocalId(): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${["8", "9", "a", "b"][Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

/** アリーナショップの購入回数1件ぶん */
export interface ArenaShopPurchaseRecord {
  itemId: string;
  /** "WEEKLY" / "MONTHLY" / "SEASON" */
  period: string;
  /** その周期の通し番号。番号が変われば数え直す(= 上限がリセットされる) */
  periodKey: number;
  count: number;
}
import {
  ShopEntry,
  SHOP_INITIAL_SLOTS,
  SHOP_MAX_SLOTS,
  buildShopLineup,
  nextSlotUnlockCost,
  rotationKeyAt,
} from "./shop.js";
import { Difficulty } from "../data/stages.js";
import { BackgroundFarmJob } from "./backgroundAutoFarm.js";
import { FALLBACK_REFERENCE_SECONDS, ManualClearTimes } from "./manualClearTimes.js";
import type { EquipmentDungeonKind } from "../data/equipmentDungeon.js";

export interface PlayerState {
  backgroundFarmJob: BackgroundFarmJob | null;
  recentManualClearTimes: ManualClearTimes;
  tutorialMissions: { claimedIds: string[]; partyChanged: boolean; createOpened: boolean };
  crystal: number;
  gold: number;
  monsters: MonsterInstance[];
  partyIds: string[];
  clearedStageIds: string[];
  clearedDungeonFloors: number[];
  clearedBeastDungeonFloors?: number[];
  clearedLevelDungeonTiers: string[];
  clearedGoldDungeonFloors: number[];
  equipment: Equipment[];
  dungeonPartyIds: string[];
  summonScrolls: number;
  fourStarSummonScrolls: number;
  lightDarkFourStarSummonScrolls: number;
  fiveStarSummonScrolls: number;
  awakeningOrbs: number;
  claimedAwakeningOrbRewardIds: string[];
  fighterLevel: number;
  fighterExp: number;
  stamina: number;
  maxStamina: number;
  lastStaminaUpdateAt: number;
  fighterName: string;
  lastLoginBonusAt: number | null;
  loginBonusClaimCount: number;
  goldDungeonChallengesToday: number;
  lastGoldDungeonResetAt: number | null;
  levelDungeonChallengesToday: number;
  lastLevelDungeonResetAt: number | null;
  shopSlotsUnlocked: number;
  shopRotationKey: number;
  shopPurchasedSlots: number[];
  claimedCompensationIds: string[];
  tutorialSummonDone?: boolean;
  equipmentSpeedRebalanced?: boolean;
  arenaDefenseIds: string[];
  arenaOffenseIds: string[];
  arenaPoints: number;
  arenaTickets: number;
  lastArenaTicketUpdateAt: number;
  arenaOpponentSeed: number;
  arenaRerollsSinceBattle: number;
  crystalShopPurchases: { itemId: string; period: string; periodKey: number; count: number }[];
  crystalShopMaxWeekKey?: number;
  crystalShopMaxMonthKey?: number;
  arenaPeriodKey: number;
  arenaSeasonBattles: number;
  arenaSeasonWins: number;
  arenaSeasonBestPoints: number;
  arenaCoins: number;
  arenaDefenseSnapshot: ArenaDefenseSnapshot | null;
  arenaMatchHistory: ArenaMatchRecord[];
  arenaRecentOpponentIds: string[];
  arenaWeeklyClaimedWeek: number;
  arenaSeasonClaimedNumber: number;
  arenaSeasonNumber: number;
  arenaShopPurchases: ArenaShopPurchaseRecord[];
  arenaShopFulfilledPurchaseIds: string[];
  arenaCosmetics: string[];
  arenaLocalId: string;
  arenaLastDefenseCheckAt: number;
  arenaDefenseLossToday: number;
  arenaDefenseLossDate: string;
  arenaDefenseCoinsToday: number;
  arenaDefenseCoinDate: string;
  towerPartyIds: string[];
  trialTowerBestFloor: number;
  trialTowerClaimedFloors: number[];
  trialTowerSeason: string;
  trialTowerMonthlyOrbClaimedFloors: number[];
  trialTowerRun: TowerRunSave | null;
}

export interface TowerRunSave {
  floor: number;
  members: { instanceId: string; hp: number; cooldowns: [number, number, number] }[];
}

const STORAGE_KEY = "crimon_save_v1";
export const MAX_TOWER_PARTY_SIZE = 5;
export const MAX_DUNGEON_PARTY_SIZE = 5;
const STARTER_MONSTERS: { templateId: string; element: string }[] = [
  { templateId: "slime", element: "FIRE" },
  { templateId: "wolf", element: "WATER" },
  { templateId: "golem", element: "ELECTRIC" },
  { templateId: "fairy", element: "GRASS" },
];
export const DEFAULT_FIGHTER_NAME = "ファイター";
export const FIGHTER_NAME_MAX_LENGTH = 12;

export function towerSeasonKeyAt(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function ensureTowerMonthlyState(state: PlayerState, now: Date = new Date()): boolean {
  const season = towerSeasonKeyAt(now);
  if (typeof state.trialTowerSeason !== "string") {
    state.trialTowerSeason = season;
    state.trialTowerMonthlyOrbClaimedFloors = [15, 30].filter((floor) => state.trialTowerBestFloor >= floor);
    return false;
  }
  if (!Array.isArray(state.trialTowerMonthlyOrbClaimedFloors)) state.trialTowerMonthlyOrbClaimedFloors = [];
  if (state.trialTowerSeason === season) return false;
  state.trialTowerSeason = season;
  state.trialTowerBestFloor = 0;
  state.trialTowerClaimedFloors = [];
  state.trialTowerMonthlyOrbClaimedFloors = [];
  state.trialTowerRun = null;
  return true;
}

export function createInitialState(): PlayerState {
  const monsters = STARTER_MONSTERS.map((s) => createMonsterInstance(`${s.templateId}_${s.element}`, 1, 1));
  return {
    backgroundFarmJob: null,
    recentManualClearTimes: {},
    tutorialMissions: { claimedIds: [], partyChanged: false, createOpened: false },
    crystal: 300,
    gold: 500,
    monsters,
    partyIds: monsters.map((m) => m.id),
    clearedStageIds: [],
    clearedDungeonFloors: [],
    clearedBeastDungeonFloors: [],
    clearedLevelDungeonTiers: [],
    clearedGoldDungeonFloors: [],
    equipment: [],
    dungeonPartyIds: [],
    summonScrolls: 0,
    fourStarSummonScrolls: 0,
    lightDarkFourStarSummonScrolls: 0,
    fiveStarSummonScrolls: 0,
    awakeningOrbs: 0,
    claimedAwakeningOrbRewardIds: [],
    fighterLevel: 1,
    fighterExp: 0,
    stamina: INITIAL_MAX_STAMINA,
    maxStamina: INITIAL_MAX_STAMINA,
    lastStaminaUpdateAt: Date.now(),
    fighterName: DEFAULT_FIGHTER_NAME,
    lastLoginBonusAt: null,
    loginBonusClaimCount: 0,
    goldDungeonChallengesToday: 0,
    lastGoldDungeonResetAt: null,
    levelDungeonChallengesToday: 0,
    lastLevelDungeonResetAt: null,
    shopSlotsUnlocked: SHOP_INITIAL_SLOTS,
    shopRotationKey: -1,
    shopPurchasedSlots: [],
    claimedCompensationIds: [],
    tutorialSummonDone: false,
    equipmentSpeedRebalanced: true,
    arenaDefenseIds: [],
    arenaOffenseIds: [],
    arenaPoints: ARENA_START_POINTS,
    arenaTickets: ARENA_TICKET_MAX,
    lastArenaTicketUpdateAt: Date.now(),
    arenaOpponentSeed: 1,
    arenaRerollsSinceBattle: 0,
    crystalShopPurchases: [],
    arenaPeriodKey: -1,
    arenaSeasonBattles: 0,
    arenaSeasonWins: 0,
    arenaSeasonBestPoints: ARENA_START_POINTS,
    arenaCoins: 0,
    arenaDefenseSnapshot: null,
    arenaMatchHistory: [],
    arenaRecentOpponentIds: [],
    arenaWeeklyClaimedWeek: ARENA_NOT_CLAIMED,
    arenaSeasonClaimedNumber: ARENA_NOT_CLAIMED,
    arenaSeasonNumber: 0,
    arenaShopPurchases: [],
    arenaShopFulfilledPurchaseIds: [],
    arenaCosmetics: [],
    arenaLocalId: newArenaLocalId(),
    arenaLastDefenseCheckAt: 0,
    arenaDefenseLossToday: 0,
    arenaDefenseLossDate: "",
    arenaDefenseCoinsToday: 0,
    arenaDefenseCoinDate: "",
    towerPartyIds: [],
    trialTowerBestFloor: 0,
    trialTowerClaimedFloors: [],
    trialTowerSeason: towerSeasonKeyAt(),
    trialTowerMonthlyOrbClaimedFloors: [],
    trialTowerRun: null,
  };
}

export function setFighterName(state: PlayerState, name: string): void {
  const trimmed = name.trim().slice(0, FIGHTER_NAME_MAX_LENGTH);
  if (trimmed.length === 0) return;
  state.fighterName = trimmed;
}

function deterministicSetFromId(id: string): Equipment["set"] {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return SET_TYPES[Math.abs(hash) % SET_TYPES.length];
}

function normalizeState(state: PlayerState, now: Date = new Date()): PlayerState {
  if (!state.backgroundFarmJob) state.backgroundFarmJob = null;
  if (!state.recentManualClearTimes || typeof state.recentManualClearTimes !== "object") state.recentManualClearTimes = {};
  if (state.backgroundFarmJob && !(state.backgroundFarmJob.referenceRunSeconds > 0)) {
    state.backgroundFarmJob.referenceRunSeconds = FALLBACK_REFERENCE_SECONDS[state.backgroundFarmJob.kind];
    state.backgroundFarmJob.referenceFromManual = false;
  }
  if (state.backgroundFarmJob?.status === "SETTLING") state.backgroundFarmJob.status = "RUNNING";
  if (!state.tutorialMissions || !Array.isArray(state.tutorialMissions.claimedIds)) state.tutorialMissions = { claimedIds: [], partyChanged: false, createOpened: false };
  const canonicalPrefix = "tutorial-step-";
  const legacyClaimCount = state.tutorialMissions.claimedIds.filter((id) => !id.startsWith(canonicalPrefix)).length;
  for (let step = 1; step <= Math.min(10, legacyClaimCount); step += 1) {
    const canonicalId = `${canonicalPrefix}${step}`;
    if (!state.tutorialMissions.claimedIds.includes(canonicalId)) state.tutorialMissions.claimedIds.push(canonicalId);
  }
  state.tutorialMissions.partyChanged = state.tutorialMissions.partyChanged === true;
  state.tutorialMissions.createOpened = state.tutorialMissions.createOpened === true;
  if (!state.equipment) state.equipment = [];
  for (const equipment of state.equipment) {
    if (typeof equipment.level !== "number") equipment.level = 0;
    if (!equipment.set) equipment.set = deterministicSetFromId(equipment.id);
    equipment.locked = equipment.locked === true;
  }
  if (state.backgroundFarmJob?.result && !Array.isArray(state.backgroundFarmJob.result.earnedEquipmentIds)) state.backgroundFarmJob.result.earnedEquipmentIds = [];
  for (const monster of state.monsters) {
    monster.locked = monster.locked === true;
    if (!monster.equipment) monster.equipment = {};
    if (!monster.skillLevels) monster.skillLevels = [1, 1, 1];
    if (!monster.development) monster.development = createDefaultMonsterDevelopment();
    else {
      const defaults = createDefaultMonsterDevelopment();
      const allocation = monster.development.abilityPoints ?? defaults.abilityPoints;
      const mergedAllocation = { ...defaults.abilityPoints, ...allocation };
      const valid = Object.values(mergedAllocation).every((value) => Number.isInteger(value) && value >= 0)
        && Object.values(mergedAllocation).reduce((sum, value) => sum + value, 0) <= abilityPointBudget(monster.star);
      monster.development.abilityPoints = valid ? mergedAllocation : defaults.abilityPoints;
      if (typeof monster.development.latentAbilityId !== "string") monster.development.latentAbilityId = null;
      monster.development.latentReselectPending = monster.development.latentReselectPending === true;
      if (monster.development.latentAbilityId !== null) monster.development.latentReselectPending = false;
      if (!(monster.development.type === null || ["ATTACK", "HP", "DEFENSE", "SUPPORT", "DISRUPT", "BALANCE"].includes(monster.development.type))) monster.development.type = null;
      if (typeof monster.development.abilityPointsConfirmed !== "boolean") {
        const used = Object.values(monster.development.abilityPoints).reduce((sum, value) => sum + value, 0);
        monster.development.abilityPointsConfirmed = used > 0;
      }
    }
  }
  if (!state.dungeonPartyIds) state.dungeonPartyIds = [];
  if (!state.clearedDungeonFloors) state.clearedDungeonFloors = [];
  if (!state.clearedBeastDungeonFloors) state.clearedBeastDungeonFloors = [];
  if (!state.clearedLevelDungeonTiers) state.clearedLevelDungeonTiers = [];
  if (!state.clearedGoldDungeonFloors) state.clearedGoldDungeonFloors = [];
  if (typeof state.summonScrolls !== "number") state.summonScrolls = 0;
  if (typeof state.fourStarSummonScrolls !== "number") state.fourStarSummonScrolls = 0;
  if (typeof state.lightDarkFourStarSummonScrolls !== "number") state.lightDarkFourStarSummonScrolls = 0;
  if (typeof state.fiveStarSummonScrolls !== "number") state.fiveStarSummonScrolls = 0;
  if (typeof state.awakeningOrbs !== "number") state.awakeningOrbs = 0;
  if (!Array.isArray(state.claimedAwakeningOrbRewardIds)) {
    state.claimedAwakeningOrbRewardIds = [];
    const retroactiveIds: string[] = [];
    if (state.tutorialMissions.claimedIds.includes("tutorial-step-26")) retroactiveIds.push("tutorial-step-26");
    if (state.tutorialMissions.claimedIds.includes("tutorial-step-30")) retroactiveIds.push("tutorial-step-30");
    if (state.clearedDungeonFloors.some((floor) => floor >= 10)) retroactiveIds.push("equipment-dungeon-floor-10");
    if (state.trialTowerBestFloor >= 15) retroactiveIds.push("trial-tower-floor-15");
    if (state.trialTowerBestFloor >= 30) retroactiveIds.push("trial-tower-floor-30");
    state.awakeningOrbs += retroactiveIds.length;
    state.claimedAwakeningOrbRewardIds.push(...retroactiveIds);
  }
  if (typeof state.fighterLevel !== "number" || !Number.isFinite(state.fighterLevel)) state.fighterLevel = 1;
  state.fighterLevel = Math.max(1, Math.min(MAX_FIGHTER_LEVEL, Math.floor(state.fighterLevel)));
  if (typeof state.fighterExp !== "number" || !Number.isFinite(state.fighterExp) || state.fighterExp < 0) state.fighterExp = 0;
  if (state.fighterLevel >= MAX_FIGHTER_LEVEL) state.fighterExp = 0;
  state.maxStamina = maxStaminaForFighterLevel(state.fighterLevel);
  if (typeof state.stamina !== "number" || !Number.isFinite(state.stamina)) state.stamina = state.maxStamina;
  state.stamina = Math.max(0, state.stamina);
  if (typeof state.lastStaminaUpdateAt !== "number") state.lastStaminaUpdateAt = Date.now();
  if (typeof state.fighterName !== "string" || state.fighterName.length === 0) state.fighterName = DEFAULT_FIGHTER_NAME;
  if (typeof state.lastLoginBonusAt !== "number") state.lastLoginBonusAt = null;
  if (typeof state.loginBonusClaimCount !== "number") state.loginBonusClaimCount = 0;
  if (typeof state.goldDungeonChallengesToday !== "number") state.goldDungeonChallengesToday = 0;
  if (typeof state.lastGoldDungeonResetAt !== "number") state.lastGoldDungeonResetAt = null;
  if (typeof state.levelDungeonChallengesToday !== "number") state.levelDungeonChallengesToday = 0;
  if (typeof state.lastLevelDungeonResetAt !== "number") state.lastLevelDungeonResetAt = null;
  state.clearedLevelDungeonTiers = state.clearedLevelDungeonTiers.map((tier) => LEGACY_LEVEL_DUNGEON_TIERS[tier] ?? tier);
  if (typeof state.shopSlotsUnlocked !== "number") state.shopSlotsUnlocked = SHOP_INITIAL_SLOTS;
  state.shopSlotsUnlocked = Math.max(SHOP_INITIAL_SLOTS, Math.min(SHOP_MAX_SLOTS, state.shopSlotsUnlocked));
  if (typeof state.shopRotationKey !== "number") state.shopRotationKey = -1;
  if (!Array.isArray(state.shopPurchasedSlots)) state.shopPurchasedSlots = [];
  if (!Array.isArray(state.claimedCompensationIds)) state.claimedCompensationIds = [];
  if (typeof state.tutorialSummonDone !== "boolean") state.tutorialSummonDone = false;
  if (!state.equipmentSpeedRebalanced) {
    for (const equipment of state.equipment) {
      if (equipment.mainStat.type === "SPD") equipment.mainStat.value = Math.max(1, Math.round(equipment.mainStat.value / 2));
      for (const sub of equipment.subStats) if (sub.type === "SPD") sub.value = Math.max(1, Math.round(sub.value / 2));
    }
    state.equipmentSpeedRebalanced = true;
  }
  if (!Array.isArray(state.arenaDefenseIds)) state.arenaDefenseIds = [];
  if (!Array.isArray(state.arenaOffenseIds)) state.arenaOffenseIds = [];
  if (typeof state.arenaPoints !== "number") state.arenaPoints = ARENA_START_POINTS;
  if (typeof state.arenaTickets !== "number") state.arenaTickets = ARENA_TICKET_MAX;
  if (typeof state.lastArenaTicketUpdateAt !== "number") state.lastArenaTicketUpdateAt = Date.now();
  if (typeof state.arenaOpponentSeed !== "number" || state.arenaOpponentSeed <= 0) state.arenaOpponentSeed = 1;
  if (typeof state.arenaRerollsSinceBattle !== "number" || state.arenaRerollsSinceBattle < 0) state.arenaRerollsSinceBattle = 0;
  if (!Array.isArray(state.crystalShopPurchases)) state.crystalShopPurchases = [];
  state.crystalShopPurchases = state.crystalShopPurchases.filter((entry) => entry && typeof entry.itemId === "string" && typeof entry.periodKey === "number" && Number.isFinite(entry.periodKey) && typeof entry.count === "number" && entry.count > 0);
  if (typeof state.crystalShopMaxWeekKey !== "number" || !Number.isFinite(state.crystalShopMaxWeekKey)) state.crystalShopMaxWeekKey = undefined;
  if (typeof state.crystalShopMaxMonthKey !== "number" || !Number.isFinite(state.crystalShopMaxMonthKey)) state.crystalShopMaxMonthKey = undefined;
  if (typeof state.arenaPeriodKey !== "number") state.arenaPeriodKey = -1;
  if (typeof state.arenaSeasonBattles !== "number") state.arenaSeasonBattles = 0;
  if (typeof state.arenaSeasonWins !== "number") state.arenaSeasonWins = 0;
  if (typeof state.arenaSeasonBestPoints !== "number") state.arenaSeasonBestPoints = state.arenaPoints;
  if (typeof state.arenaCoins !== "number" || !Number.isFinite(state.arenaCoins) || state.arenaCoins < 0) state.arenaCoins = 0;
  if (!state.arenaDefenseSnapshot || !Array.isArray(state.arenaDefenseSnapshot.units)) state.arenaDefenseSnapshot = null;
  if (!Array.isArray(state.arenaMatchHistory)) state.arenaMatchHistory = [];
  if (state.arenaMatchHistory.length > ARENA_HISTORY_MAX) state.arenaMatchHistory.length = ARENA_HISTORY_MAX;
  if (!Array.isArray(state.arenaRecentOpponentIds)) state.arenaRecentOpponentIds = [];
  if (typeof state.arenaWeeklyClaimedWeek !== "number") state.arenaWeeklyClaimedWeek = ARENA_NOT_CLAIMED;
  if (typeof state.arenaSeasonClaimedNumber !== "number") state.arenaSeasonClaimedNumber = ARENA_NOT_CLAIMED;
  if (typeof state.arenaSeasonNumber !== "number") state.arenaSeasonNumber = 0;
  if (!Array.isArray(state.arenaShopPurchases)) state.arenaShopPurchases = [];
  if (!Array.isArray(state.arenaShopFulfilledPurchaseIds)) state.arenaShopFulfilledPurchaseIds = [];
  state.arenaShopFulfilledPurchaseIds = state.arenaShopFulfilledPurchaseIds.filter((id): id is string => typeof id === "string" && id.length > 0).slice(-500);
  if (!Array.isArray(state.arenaCosmetics)) state.arenaCosmetics = [];
  if (typeof state.arenaLocalId !== "string" || state.arenaLocalId.length < 8) state.arenaLocalId = newArenaLocalId();
  if (typeof state.arenaLastDefenseCheckAt !== "number") state.arenaLastDefenseCheckAt = 0;
  if (typeof state.arenaDefenseLossToday !== "number") state.arenaDefenseLossToday = 0;
  if (typeof state.arenaDefenseLossDate !== "string") state.arenaDefenseLossDate = "";
  if (typeof state.arenaDefenseCoinsToday !== "number") state.arenaDefenseCoinsToday = 0;
  if (typeof state.arenaDefenseCoinDate !== "string") state.arenaDefenseCoinDate = "";
  if (!Array.isArray(state.towerPartyIds)) state.towerPartyIds = [];
  if (typeof state.trialTowerBestFloor !== "number") state.trialTowerBestFloor = 0;
  if (!Array.isArray(state.trialTowerClaimedFloors)) state.trialTowerClaimedFloors = [];
  if (!state.trialTowerRun || !Array.isArray(state.trialTowerRun.members)) state.trialTowerRun = null;
  ensureTowerMonthlyState(state, now);
  const owned = new Set(state.monsters.map((m) => m.id));
  state.arenaDefenseIds = state.arenaDefenseIds.filter((id) => owned.has(id));
  state.arenaOffenseIds = state.arenaOffenseIds.filter((id) => owned.has(id));
  state.towerPartyIds = state.towerPartyIds.filter((id) => owned.has(id));
  if (state.trialTowerRun && state.trialTowerRun.members.some((m) => !owned.has(m.instanceId))) state.trialTowerRun = null;
  return state;
}

export function setMonsterLocked(state: PlayerState, monsterId: string, locked: boolean): boolean {
  const monster = state.monsters.find((entry) => entry.id === monsterId);
  if (!monster) return false;
  monster.locked = locked;
  return true;
}

export function normalizeLoadedState(state: PlayerState, now: Date = new Date()): PlayerState { return normalizeState(state, now); }
export function loadPlayerState(): PlayerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as PlayerState;
    if (!parsed.monsters || parsed.monsters.length === 0) return createInitialState();
    return normalizeState(parsed);
  } catch { return createInitialState(); }
}
export function savePlayerState(state: PlayerState): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
export function addMonster(state: PlayerState, dexId: string, star: Star, level = 1): MonsterInstance { const instance = createMonsterInstance(dexId, star, level); state.monsters.push(instance); return instance; }
export function removeMonsters(state: PlayerState, instanceIds: readonly string[]): void { const locked = new Set(state.backgroundFarmJob?.status === "RUNNING" ? state.backgroundFarmJob.partyIds : []); const idSet = new Set(instanceIds.filter((id) => !locked.has(id))); state.monsters = state.monsters.filter((m) => !idSet.has(m.id)); state.partyIds = state.partyIds.filter((id) => !idSet.has(id)); state.dungeonPartyIds = state.dungeonPartyIds.filter((id) => !idSet.has(id)); }
export function getParty(state: PlayerState): MonsterInstance[] { return state.partyIds.map((id) => state.monsters.find((m) => m.id === id)).filter((m): m is MonsterInstance => m !== undefined); }
export function getDungeonParty(state: PlayerState): MonsterInstance[] { return state.dungeonPartyIds.map((id) => state.monsters.find((m) => m.id === id)).filter((m): m is MonsterInstance => m !== undefined); }
export function toggleDungeonPartyMember(state: PlayerState, instanceId: string): void { const idx = state.dungeonPartyIds.indexOf(instanceId); if (idx >= 0) { state.dungeonPartyIds.splice(idx, 1); return; } if (state.dungeonPartyIds.length >= MAX_DUNGEON_PARTY_SIZE) return; state.dungeonPartyIds.push(instanceId); }
export function toggleTowerPartyMember(state: PlayerState, instanceId: string): void { const idx = state.towerPartyIds.indexOf(instanceId); if (idx >= 0) { state.towerPartyIds.splice(idx, 1); return; } if (state.towerPartyIds.length >= MAX_TOWER_PARTY_SIZE) return; state.towerPartyIds.push(instanceId); }
function stageClearKey(stageId: string, difficulty: Difficulty): string { return difficulty === "NORMAL" ? stageId : `${stageId}::${difficulty}`; }
export function isStageCleared(state: PlayerState, stageId: string, difficulty: Difficulty = "NORMAL"): boolean { return state.clearedStageIds.includes(stageClearKey(stageId, difficulty)); }
export function markStageCleared(state: PlayerState, stageId: string, difficulty: Difficulty = "NORMAL"): void { const key = stageClearKey(stageId, difficulty); if (!state.clearedStageIds.includes(key)) state.clearedStageIds.push(key); }
export function isDungeonFloorCleared(state: PlayerState, floor: number, kind: EquipmentDungeonKind = "DEMON"): boolean { return (kind === "BEAST" ? (state.clearedBeastDungeonFloors ?? []) : state.clearedDungeonFloors).includes(floor); }
export function markDungeonFloorCleared(state: PlayerState, floor: number, kind: EquipmentDungeonKind = "DEMON"): void { const cleared = kind === "BEAST" ? (state.clearedBeastDungeonFloors ??= []) : state.clearedDungeonFloors; if (!cleared.includes(floor)) cleared.push(floor); }
export function isLevelDungeonTierCleared(state: PlayerState, tier: string): boolean { return state.clearedLevelDungeonTiers.includes(tier); }
export function markLevelDungeonTierCleared(state: PlayerState, tier: string): void { if (!state.clearedLevelDungeonTiers.includes(tier)) state.clearedLevelDungeonTiers.push(tier); }
export const FIRST_CLEAR_CRYSTAL_REWARD = 200;
export const REPEAT_CLEAR_CRYSTAL_CHANCE = 0.03;
export const REPEAT_CLEAR_CRYSTAL_REWARD = 50;
export function addEquipment(state: PlayerState, equipment: Equipment): void { state.equipment.push(equipment); }
export function isEquipmentEquipped(state: PlayerState, equipmentId: string): boolean { return state.monsters.some((m) => Object.values(m.equipment).includes(equipmentId)); }
export function findEquippedOwner(state: PlayerState, equipmentId: string): MonsterInstance | undefined { return state.monsters.find((m) => Object.values(m.equipment).includes(equipmentId)); }
export function equipToMonster(state: PlayerState, monsterId: string, equipmentId: string): boolean { const monster = state.monsters.find((m) => m.id === monsterId); const equipment = state.equipment.find((e) => e.id === equipmentId); if (!monster || !equipment) return false; for (const other of state.monsters) { if (other.id === monster.id) continue; const slot = (Object.entries(other.equipment) as [string, string][]).find(([, id]) => id === equipmentId)?.[0]; if (slot) delete other.equipment[Number(slot) as EquipSlot]; } monster.equipment[equipment.slot] = equipment.id; return true; }
export function unequipFromMonster(state: PlayerState, monsterId: string, slot: EquipSlot): void { const monster = state.monsters.find((m) => m.id === monsterId); if (!monster) return; delete monster.equipment[slot]; }
export function getEquipmentById(state: PlayerState, equipmentId: string): Equipment | undefined { return state.equipment.find((e) => e.id === equipmentId); }
export interface EnhanceResult { ok: boolean; reason?: string; }
export function tryEnhanceEquipment(state: PlayerState, equipmentId: string, rng?: () => number): EnhanceResult { const equipment = state.equipment.find((e) => e.id === equipmentId); if (!equipment) return { ok: false, reason: "装備が見つかりません" }; if (!canEnhanceEquipment(equipment)) return { ok: false, reason: "最大強化レベルに達しています" }; const cost = enhanceEquipmentCost(equipment); if (state.gold < cost) return { ok: false, reason: "ゴールドが足りません" }; state.gold -= cost; enhanceEquipment(equipment, rng); return { ok: true }; }
export const STAMINA_REGEN_INTERVAL_MINUTES = 3;
export function applyPassiveStaminaRegen(state: PlayerState, now: number = Date.now()): void { if (state.stamina >= state.maxStamina) { state.lastStaminaUpdateAt = now; return; } const intervalMs = STAMINA_REGEN_INTERVAL_MINUTES * 60_000; const elapsedTicks = Math.floor((now - state.lastStaminaUpdateAt) / intervalMs); if (elapsedTicks <= 0) return; const gained = Math.min(elapsedTicks, state.maxStamina - state.stamina); state.stamina += gained; state.lastStaminaUpdateAt += elapsedTicks * intervalMs; }
export interface StaminaSpendResult { ok: boolean; reason?: string; }
export function trySpendStamina(state: PlayerState, cost: number): StaminaSpendResult { applyPassiveStaminaRegen(state); if (state.stamina < cost) return { ok: false, reason: "スタミナが足りません" }; state.stamina -= cost; return { ok: true }; }
export const STAMINA_REFILL_PARTIAL_COST = 50;
export const STAMINA_REFILL_PARTIAL_AMOUNT = 100;
export const STAMINA_REFILL_FULL_COST = 200;
export interface StaminaRefillResult { ok: boolean; reason?: string; }
export function tryRefillStaminaPartial(state: PlayerState): StaminaRefillResult { applyPassiveStaminaRegen(state); if (state.crystal < STAMINA_REFILL_PARTIAL_COST) return { ok: false, reason: "ダイヤが足りません" }; state.crystal -= STAMINA_REFILL_PARTIAL_COST; state.stamina += STAMINA_REFILL_PARTIAL_AMOUNT; return { ok: true }; }
export function tryRefillStaminaFull(state: PlayerState): StaminaRefillResult { applyPassiveStaminaRegen(state); if (state.stamina >= state.maxStamina) return { ok: false, reason: "スタミナは既に満タンです" }; if (state.crystal < STAMINA_REFILL_FULL_COST) return { ok: false, reason: "ダイヤが足りません" }; state.crystal -= STAMINA_REFILL_FULL_COST; state.stamina = state.maxStamina; return { ok: true }; }
export interface FighterExpResult { levelsGained: number; }
export const FIGHTER_LEVEL_UP_CRYSTAL_REWARD = 300;
export function addFighterExp(state: PlayerState, exp: number): FighterExpResult {
  if (state.fighterLevel >= MAX_FIGHTER_LEVEL || exp <= 0) return { levelsGained: 0 };
  const staminaBefore = state.stamina;
  state.fighterExp += exp;
  let levelsGained = 0;
  while (state.fighterLevel < MAX_FIGHTER_LEVEL && state.fighterExp >= requiredExpForFighterLevel(state.fighterLevel)) {
    state.fighterExp -= requiredExpForFighterLevel(state.fighterLevel);
    state.fighterLevel += 1;
    state.maxStamina = maxStaminaForFighterLevel(state.fighterLevel);
    state.stamina = state.maxStamina;
    levelsGained += 1;
  }
  if (state.fighterLevel >= MAX_FIGHTER_LEVEL) { state.fighterLevel = MAX_FIGHTER_LEVEL; state.fighterExp = 0; }
  if (levelsGained > 0) {
    state.stamina = Math.max(state.stamina, staminaBefore);
    state.crystal += FIGHTER_LEVEL_UP_CRYSTAL_REWARD * levelsGained;
  }
  return { levelsGained };
}
export const LOGIN_BONUS_DAILY_CRYSTAL = 200;
export const LOGIN_BONUS_FIRST_TIME_CRYSTAL = 3000;
export const LOGIN_BONUS_MILESTONE_CRYSTAL = 1000;
export const LOGIN_BONUS_MILESTONE_INTERVAL_DAYS = 10;
export interface LoginBonusResult { claimed: boolean; dailyCrystal: number; milestoneCrystal: number; firstTimeCrystal: number; claimCount: number; }
export function claimDailyLoginBonus(state: PlayerState, now: number = Date.now()): LoginBonusResult { const alreadyClaimedToday = state.lastLoginBonusAt !== null && new Date(state.lastLoginBonusAt).toDateString() === new Date(now).toDateString(); if (alreadyClaimedToday) return { claimed: false, dailyCrystal: 0, milestoneCrystal: 0, firstTimeCrystal: 0, claimCount: state.loginBonusClaimCount }; state.lastLoginBonusAt = now; state.loginBonusClaimCount += 1; const milestoneCrystal = state.loginBonusClaimCount % LOGIN_BONUS_MILESTONE_INTERVAL_DAYS === 0 ? LOGIN_BONUS_MILESTONE_CRYSTAL : 0; const firstTimeCrystal = state.loginBonusClaimCount === 1 ? LOGIN_BONUS_FIRST_TIME_CRYSTAL : 0; state.crystal += LOGIN_BONUS_DAILY_CRYSTAL + milestoneCrystal + firstTimeCrystal; return { claimed: true, dailyCrystal: LOGIN_BONUS_DAILY_CRYSTAL, milestoneCrystal, firstTimeCrystal, claimCount: state.loginBonusClaimCount }; }
export function addSummonScrolls(state: PlayerState, count = 1): void { state.summonScrolls += count; }
export function tryUseSummonScroll(state: PlayerState): boolean { return trySpendSummonScrolls(state, 1); }
export function trySpendSummonScrolls(state: PlayerState, count: number): boolean { if (count <= 0 || state.summonScrolls < count) return false; state.summonScrolls -= count; return true; }
function resetGoldDungeonChallengesIfNewDay(state: PlayerState, now: number): void { const isNewDay = state.lastGoldDungeonResetAt === null || new Date(state.lastGoldDungeonResetAt).toDateString() !== new Date(now).toDateString(); if (isNewDay) { state.goldDungeonChallengesToday = 0; state.lastGoldDungeonResetAt = now; } }
export function goldDungeonChallengesRemaining(state: PlayerState, now: number = Date.now()): number { resetGoldDungeonChallengesIfNewDay(state, now); return Math.max(0, GOLD_DUNGEON_DAILY_LIMIT - state.goldDungeonChallengesToday); }
export interface GoldDungeonChallengeResult { ok: boolean; reason?: string; }
export function trySpendGoldDungeonChallenge(state: PlayerState, now: number = Date.now()): GoldDungeonChallengeResult { resetGoldDungeonChallengesIfNewDay(state, now); if (state.goldDungeonChallengesToday >= GOLD_DUNGEON_DAILY_LIMIT) return { ok: false, reason: "本日のゴールドダンジョン挑戦回数の上限に達しています" }; state.goldDungeonChallengesToday += 1; return { ok: true }; }
function resetLevelDungeonChallengesIfNewDay(state: PlayerState, now: number): void { const isNewDay = state.lastLevelDungeonResetAt === null || new Date(state.lastLevelDungeonResetAt).toDateString() !== new Date(now).toDateString(); if (isNewDay) { state.levelDungeonChallengesToday = 0; state.lastLevelDungeonResetAt = now; } }
export function levelDungeonChallengesRemaining(state: PlayerState, now: number = Date.now()): number { resetLevelDungeonChallengesIfNewDay(state, now); return Math.max(0, LEVEL_DUNGEON_DAILY_LIMIT - state.levelDungeonChallengesToday); }
export function trySpendLevelDungeonChallenge(state: PlayerState, now: number = Date.now()): GoldDungeonChallengeResult { resetLevelDungeonChallengesIfNewDay(state, now); if (state.levelDungeonChallengesToday >= LEVEL_DUNGEON_DAILY_LIMIT) return { ok: false, reason: "本日のレベル上げダンジョン挑戦回数の上限に達しています" }; state.levelDungeonChallengesToday += 1; return { ok: true }; }
export interface SellEquipmentResult { ok: boolean; reason?: string; goldEarned: number; }
export function setEquipmentLocked(state: PlayerState, equipmentId: string, locked: boolean): boolean { const equipment = state.equipment.find((e) => e.id === equipmentId); if (!equipment) return false; equipment.locked = locked; return true; }
export function sellEquipment(state: PlayerState, equipmentId: string): SellEquipmentResult { const equipment = state.equipment.find((e) => e.id === equipmentId); if (!equipment) return { ok: false, reason: "装備が見つかりません", goldEarned: 0 }; if (equipment.locked) return { ok: false, reason: "ロック中の装備は売却できません", goldEarned: 0 }; if (isEquipmentEquipped(state, equipmentId)) return { ok: false, reason: "装着中の装備は売却できません(先に外してください)", goldEarned: 0 }; const goldEarned = equipmentSellPrice(equipment); state.equipment = state.equipment.filter((e) => e.id !== equipmentId); state.gold += goldEarned; return { ok: true, goldEarned }; }
export interface ShopView { entries: ShopEntry[]; slots: number; purchasedSlots: number[]; nextRotationAt: number; nextSlotCost: number | null; }
export function getShop(state: PlayerState, now = Date.now()): ShopView { const key = rotationKeyAt(now); if (state.shopRotationKey !== key) { state.shopRotationKey = key; state.shopPurchasedSlots = []; } const lineup = buildShopLineup(now, state.fighterLevel, state.shopSlotsUnlocked); return { entries: lineup.entries, slots: state.shopSlotsUnlocked, purchasedSlots: [...state.shopPurchasedSlots], nextRotationAt: lineup.nextRotationAt, nextSlotCost: nextSlotUnlockCost(state.shopSlotsUnlocked) }; }
export interface ShopPurchaseResult { ok: boolean; reason?: string; label?: string; }
export function buyShopEntry(state: PlayerState, slotIndex: number, now = Date.now()): ShopPurchaseResult { const shop = getShop(state, now); const entry = shop.entries[slotIndex]; if (!entry) return { ok: false, reason: "その枠は開いていません" }; if (state.shopPurchasedSlots.includes(slotIndex)) return { ok: false, reason: "すでに購入済みです" }; if (state.gold < entry.price) return { ok: false, reason: "ゴールドが足りません" }; state.gold -= entry.price; state.shopPurchasedSlots.push(slotIndex); switch (entry.kind) { case "EQUIPMENT": addEquipment(state, entry.equipment); return { ok: true, label: `星${entry.equipment.star}の装備を購入しました` }; case "MONSTER": addMonster(state, entry.dexId, entry.star); return { ok: true, label: `星${entry.star}のモンスターを購入しました` }; case "SCROLL": addSummonScrolls(state, entry.count); return { ok: true, label: `召喚の書を${entry.count}個購入しました` }; } }
export function unlockShopSlot(state: PlayerState): { ok: boolean; reason?: string } { const cost = nextSlotUnlockCost(state.shopSlotsUnlocked); if (cost === null) return { ok: false, reason: "これ以上は開放できません" }; if (state.crystal < cost) return { ok: false, reason: "ダイヤが足りません" }; state.crystal -= cost; state.shopSlotsUnlocked += 1; return { ok: true }; }
