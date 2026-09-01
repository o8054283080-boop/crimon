import { createMonsterInstance, MonsterInstance } from "../core/monsterInstance.js";
import { STAR_MAX_LEVEL, Star } from "../core/rarity.js";
import { EXP_PIG, REINCARNATION_PIG, SKILL_PIG, findMonsterById } from "../data/monsters.js";
import { PlayerState, savePlayerState } from "./playerState.js";

export type MissionPeriod = "DAILY" | "WEEKLY" | "MONTHLY";
export type MissionCounterKey =
  | "loginDays"
  | "summons"
  | "levelsGained"
  | "rankUps"
  | "star6Raised"
  | "arenaBattles"
  | "equipmentEnhancements"
  | "shopPurchases"
  | "staminaSpent";

export interface MissionCounters extends Record<MissionCounterKey, number> {}

export interface MissionReward {
  gold?: number;
  crystal?: number;
  summonScrolls?: number;
  fourStarSummonScrolls?: number;
  lightDarkFourStarSummonScrolls?: number;
  fiveStarSummonScrolls?: number;
  awakeningOrbs?: number;
  reincarnationPig3?: number;
  reincarnationPig4?: number;
}

export interface PeriodMissionDefinition {
  id: string;
  title: string;
  condition: string;
  counter: MissionCounterKey;
  target: number;
  reward: MissionReward;
}

interface MissionPeriodState {
  key: string;
  baseline: MissionCounters;
  claimedIds: string[];
  clearClaimed: boolean;
}

interface MissionObservedState {
  monsters: Record<string, { star: Star; level: number }>;
  equipmentLevels: Record<string, number>;
  arenaSeasonBattles: number;
  stamina: number;
  shopRotationKey: number;
  shopPurchasedSlots: number[];
  lastLoginKey: string | null;
}

interface CumulativeClaimState {
  lastClaimedTarget: number;
}

export interface MissionState {
  version: 1;
  counters: MissionCounters;
  daily: MissionPeriodState;
  weekly: MissionPeriodState;
  monthly: MissionPeriodState;
  cumulative: Record<string, CumulativeClaimState>;
  observed: MissionObservedState;
}

type MissionPlayerState = PlayerState & { missionState?: MissionState };

export interface PeriodMissionView extends PeriodMissionDefinition {
  current: number;
  complete: boolean;
  claimed: boolean;
}

export interface PeriodMissionGroupView {
  period: MissionPeriod;
  missions: PeriodMissionView[];
  completedCount: number;
  requiredCount: number;
  clearReward: MissionReward;
  clearClaimed: boolean;
  canClaimClear: boolean;
}

interface FixedRewardStep {
  target: number;
  reward: MissionReward;
}

interface CumulativeDefinition {
  key: string;
  title: string;
  counter: MissionCounterKey;
  fixed: readonly FixedRewardStep[];
  nextAfterFixed: (lastTarget: number) => number;
  rewardAfterFixed: (target: number) => MissionReward;
}

export interface CumulativeMissionView {
  key: string;
  title: string;
  current: number;
  target: number;
  reward: MissionReward;
  complete: boolean;
}

const PERIOD_REQUIREMENTS: Record<MissionPeriod, number> = {
  DAILY: 4,
  WEEKLY: 6,
  MONTHLY: 7,
};

const PERIOD_CLEAR_REWARDS: Record<MissionPeriod, MissionReward> = {
  DAILY: { summonScrolls: 3, crystal: 50, gold: 100_000, reincarnationPig3: 1 },
  WEEKLY: { summonScrolls: 10, fourStarSummonScrolls: 1, crystal: 300, gold: 500_000, reincarnationPig4: 1, awakeningOrbs: 1 },
  MONTHLY: {
    summonScrolls: 20,
    fourStarSummonScrolls: 2,
    lightDarkFourStarSummonScrolls: 1,
    crystal: 1_000,
    gold: 2_000_000,
    reincarnationPig4: 2,
    awakeningOrbs: 1,
  },
};

export const DAILY_MISSIONS: readonly PeriodMissionDefinition[] = [
  { id: "daily-login", title: "今日もクリモン", condition: "ログインする", counter: "loginDays", target: 1, reward: { crystal: 20 } },
  { id: "daily-levels", title: "少しずつ育成", condition: "モンスターのレベルを合計5上げる", counter: "levelsGained", target: 5, reward: { gold: 50_000 } },
  { id: "daily-shop", title: "ショップをのぞこう", condition: "ショップで1回買い物する", counter: "shopPurchases", target: 1, reward: { summonScrolls: 1 } },
  { id: "daily-stamina", title: "今日の冒険", condition: "スタミナを50消費する", counter: "staminaSpent", target: 50, reward: { summonScrolls: 1 } },
  { id: "daily-arena", title: "闘技場に挑戦", condition: "アリーナを3回プレイする", counter: "arenaBattles", target: 3, reward: { gold: 50_000 } },
  { id: "daily-equipment", title: "装備を整える", condition: "装備を3回強化する", counter: "equipmentEnhancements", target: 3, reward: { crystal: 20 } },
];

export const WEEKLY_MISSIONS: readonly PeriodMissionDefinition[] = [
  { id: "weekly-login", title: "今週も冒険", condition: "5日ログインする", counter: "loginDays", target: 5, reward: { summonScrolls: 5 } },
  { id: "weekly-levels", title: "育成週間", condition: "モンスターのレベルを合計100上げる", counter: "levelsGained", target: 100, reward: { gold: 300_000 } },
  { id: "weekly-stamina", title: "スタミナ消費", condition: "スタミナを500消費する", counter: "staminaSpent", target: 500, reward: { summonScrolls: 5 } },
  { id: "weekly-arena", title: "闘技場週間", condition: "アリーナを20回プレイする", counter: "arenaBattles", target: 20, reward: { summonScrolls: 5 } },
  { id: "weekly-equipment", title: "装備強化週間", condition: "装備を20回強化する", counter: "equipmentEnhancements", target: 20, reward: { crystal: 100 } },
  { id: "weekly-shop", title: "お買い物週間", condition: "ショップで10回買い物する", counter: "shopPurchases", target: 10, reward: { gold: 300_000 } },
  { id: "weekly-rank", title: "ランクアップ週間", condition: "ランクアップを3回行う", counter: "rankUps", target: 3, reward: { reincarnationPig3: 2 } },
  { id: "weekly-summon", title: "新しい仲間", condition: "20回召喚する", counter: "summons", target: 20, reward: { crystal: 150 } },
  { id: "weekly-star6", title: "★6への一歩", condition: "★6モンスターを1体育成する", counter: "star6Raised", target: 1, reward: { reincarnationPig4: 1 } },
];

export const MONTHLY_MISSIONS: readonly PeriodMissionDefinition[] = [
  { id: "monthly-login20", title: "月の冒険者", condition: "20日ログインする", counter: "loginDays", target: 20, reward: { summonScrolls: 10 } },
  { id: "monthly-login25", title: "皆勤目前", condition: "25日ログインする", counter: "loginDays", target: 25, reward: { fourStarSummonScrolls: 1 } },
  { id: "monthly-levels", title: "大育成月間", condition: "モンスターのレベルを合計500上げる", counter: "levelsGained", target: 500, reward: { reincarnationPig3: 3 } },
  { id: "monthly-stamina", title: "大冒険月間", condition: "スタミナを3,000消費する", counter: "staminaSpent", target: 3_000, reward: { summonScrolls: 10 } },
  { id: "monthly-arena", title: "闘技場月間", condition: "アリーナを100回プレイする", counter: "arenaBattles", target: 100, reward: { summonScrolls: 10 } },
  { id: "monthly-equipment", title: "装備職人", condition: "装備を100回強化する", counter: "equipmentEnhancements", target: 100, reward: { gold: 1_000_000 } },
  { id: "monthly-shop", title: "常連ファイター", condition: "ショップで30回買い物する", counter: "shopPurchases", target: 30, reward: { crystal: 300 } },
  { id: "monthly-rank", title: "ランクアップ月間", condition: "ランクアップを10回行う", counter: "rankUps", target: 10, reward: { reincarnationPig4: 2 } },
  { id: "monthly-summon", title: "召喚月間", condition: "100回召喚する", counter: "summons", target: 100, reward: { crystal: 500 } },
  { id: "monthly-star6", title: "★6育成月間", condition: "★6モンスターを2体育成する", counter: "star6Raised", target: 2, reward: { reincarnationPig4: 2 } },
];

const PERIOD_DEFINITIONS: Record<MissionPeriod, readonly PeriodMissionDefinition[]> = {
  DAILY: DAILY_MISSIONS,
  WEEKLY: WEEKLY_MISSIONS,
  MONTHLY: MONTHLY_MISSIONS,
};

const ZERO_COUNTERS = (): MissionCounters => ({
  loginDays: 0,
  summons: 0,
  levelsGained: 0,
  rankUps: 0,
  star6Raised: 0,
  arenaBattles: 0,
  equipmentEnhancements: 0,
  shopPurchases: 0,
  staminaSpent: 0,
});

function cloneCounters(counters: MissionCounters): MissionCounters {
  return { ...counters };
}

function jstDateParts(now: Date): { year: number; month: number; day: number; weekday: number } {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

export function dailyMissionKeyAt(now: Date = new Date()): string {
  const { year, month, day } = jstDateParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function monthlyMissionKeyAt(now: Date = new Date()): string {
  const { year, month } = jstDateParts(now);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function weeklyMissionKeyAt(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const offsetFromMonday = (shifted.getUTCDay() + 6) % 7;
  shifted.setUTCDate(shifted.getUTCDate() - offsetFromMonday);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function periodKey(period: MissionPeriod, now: Date): string {
  if (period === "DAILY") return dailyMissionKeyAt(now);
  if (period === "WEEKLY") return weeklyMissionKeyAt(now);
  return monthlyMissionKeyAt(now);
}

function snapshotMonsters(monsters: readonly MonsterInstance[]): MissionObservedState["monsters"] {
  return Object.fromEntries(monsters.map((monster) => [monster.id, { star: monster.star, level: monster.level }]));
}

function snapshotEquipment(player: PlayerState): Record<string, number> {
  return Object.fromEntries(player.equipment.map((equipment) => [equipment.id, equipment.level]));
}

function currentShopSlots(player: PlayerState): number[] {
  return Array.isArray(player.shopPurchasedSlots) ? [...player.shopPurchasedSlots] : [];
}

function createPeriodState(key: string, baseline: MissionCounters): MissionPeriodState {
  return { key, baseline: cloneCounters(baseline), claimedIds: [], clearClaimed: false };
}

function createMissionState(player: PlayerState, now: Date): MissionState {
  const counters = ZERO_COUNTERS();
  return {
    version: 1,
    counters,
    daily: createPeriodState(dailyMissionKeyAt(now), counters),
    weekly: createPeriodState(weeklyMissionKeyAt(now), counters),
    monthly: createPeriodState(monthlyMissionKeyAt(now), counters),
    cumulative: {},
    observed: {
      monsters: snapshotMonsters(player.monsters),
      equipmentLevels: snapshotEquipment(player),
      arenaSeasonBattles: Math.max(0, player.arenaSeasonBattles ?? 0),
      stamina: Math.max(0, player.stamina ?? 0),
      shopRotationKey: player.shopRotationKey ?? -1,
      shopPurchasedSlots: currentShopSlots(player),
      lastLoginKey: null,
    },
  };
}

function finiteNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function missionStateFor(player: PlayerState, now: Date = new Date()): MissionState {
  const holder = player as MissionPlayerState;
  if (!holder.missionState || holder.missionState.version !== 1) holder.missionState = createMissionState(player, now);
  const state = holder.missionState;

  const defaults = ZERO_COUNTERS();
  for (const key of Object.keys(defaults) as MissionCounterKey[]) state.counters[key] = finiteNonNegative(state.counters?.[key]);
  if (!state.cumulative || typeof state.cumulative !== "object") state.cumulative = {};
  if (!state.observed || typeof state.observed !== "object") state.observed = createMissionState(player, now).observed;
  if (!state.observed.monsters || typeof state.observed.monsters !== "object") state.observed.monsters = snapshotMonsters(player.monsters);
  if (!state.observed.equipmentLevels || typeof state.observed.equipmentLevels !== "object") state.observed.equipmentLevels = snapshotEquipment(player);
  if (!Array.isArray(state.observed.shopPurchasedSlots)) state.observed.shopPurchasedSlots = currentShopSlots(player);
  if (typeof state.observed.shopRotationKey !== "number") state.observed.shopRotationKey = player.shopRotationKey ?? -1;
  if (typeof state.observed.arenaSeasonBattles !== "number") state.observed.arenaSeasonBattles = player.arenaSeasonBattles ?? 0;
  if (typeof state.observed.stamina !== "number") state.observed.stamina = player.stamina ?? 0;
  if (typeof state.observed.lastLoginKey !== "string") state.observed.lastLoginKey = null;

  const periodDefaults: [MissionPeriodState | undefined, MissionPeriod, (value: MissionPeriodState) => void][] = [
    [state.daily, "DAILY", (value) => { state.daily = value; }],
    [state.weekly, "WEEKLY", (value) => { state.weekly = value; }],
    [state.monthly, "MONTHLY", (value) => { state.monthly = value; }],
  ];
  for (const [current, period, set] of periodDefaults) {
    if (!current || typeof current.key !== "string" || !current.baseline) {
      set(createPeriodState(periodKey(period, now), state.counters));
      continue;
    }
    if (!Array.isArray(current.claimedIds)) current.claimedIds = [];
    current.clearClaimed = current.clearClaimed === true;
    for (const key of Object.keys(defaults) as MissionCounterKey[]) current.baseline[key] = finiteNonNegative(current.baseline[key]);
  }
  return state;
}

function resetExpiredPeriods(state: MissionState, now: Date): boolean {
  let changed = false;
  const reset = (period: MissionPeriod, current: MissionPeriodState): MissionPeriodState => {
    const key = periodKey(period, now);
    if (current.key === key) return current;
    changed = true;
    return createPeriodState(key, state.counters);
  };
  state.daily = reset("DAILY", state.daily);
  state.weekly = reset("WEEKLY", state.weekly);
  state.monthly = reset("MONTHLY", state.monthly);
  return changed;
}

function templateIdOf(instance: MonsterInstance): string | undefined {
  return findMonsterById(instance.dexId)?.templateId;
}

function isMissionExcludedSummon(instance: MonsterInstance): boolean {
  const templateId = templateIdOf(instance);
  return templateId === REINCARNATION_PIG.templateId || templateId === EXP_PIG.templateId || templateId === SKILL_PIG.templateId;
}

function observeProgress(player: PlayerState, state: MissionState, now: Date): boolean {
  let changed = false;
  const loginKey = dailyMissionKeyAt(now);
  if (state.observed.lastLoginKey !== loginKey) {
    state.observed.lastLoginKey = loginKey;
    state.counters.loginDays += 1;
    changed = true;
  }

  const previousMonsters = state.observed.monsters;
  const nextMonsters = snapshotMonsters(player.monsters);
  for (const monster of player.monsters) {
    const previous = previousMonsters[monster.id];
    if (!previous) {
      if (monster.star >= 3 && !isMissionExcludedSummon(monster)) {
        state.counters.summons += 1;
        changed = true;
      }
      continue;
    }
    if (monster.star > previous.star) {
      const starDelta = monster.star - previous.star;
      state.counters.rankUps += starDelta;
      if (previous.star < 6 && monster.star >= 6) state.counters.star6Raised += 1;
      if (monster.level > 1) state.counters.levelsGained += monster.level - 1;
      changed = true;
    } else if (monster.star === previous.star && monster.level > previous.level) {
      state.counters.levelsGained += monster.level - previous.level;
      changed = true;
    }
  }
  state.observed.monsters = nextMonsters;

  const previousEquipment = state.observed.equipmentLevels;
  const nextEquipment = snapshotEquipment(player);
  for (const equipment of player.equipment) {
    const previousLevel = previousEquipment[equipment.id];
    if (typeof previousLevel === "number" && equipment.level > previousLevel) {
      state.counters.equipmentEnhancements += equipment.level - previousLevel;
      changed = true;
    }
  }
  state.observed.equipmentLevels = nextEquipment;

  const arenaNow = Math.max(0, player.arenaSeasonBattles ?? 0);
  if (arenaNow > state.observed.arenaSeasonBattles) {
    state.counters.arenaBattles += arenaNow - state.observed.arenaSeasonBattles;
    changed = true;
  }
  state.observed.arenaSeasonBattles = arenaNow;

  const staminaNow = Math.max(0, player.stamina ?? 0);
  if (staminaNow < state.observed.stamina) {
    state.counters.staminaSpent += state.observed.stamina - staminaNow;
    changed = true;
  }
  state.observed.stamina = staminaNow;

  const rotationNow = player.shopRotationKey ?? -1;
  const slotsNow = currentShopSlots(player);
  if (rotationNow !== state.observed.shopRotationKey) {
    if (slotsNow.length > 0) {
      state.counters.shopPurchases += slotsNow.length;
      changed = true;
    }
  } else {
    const before = new Set(state.observed.shopPurchasedSlots);
    const added = slotsNow.filter((slot) => !before.has(slot)).length;
    if (added > 0) {
      state.counters.shopPurchases += added;
      changed = true;
    }
  }
  state.observed.shopRotationKey = rotationNow;
  state.observed.shopPurchasedSlots = slotsNow;
  return changed;
}

function persist(player: PlayerState): void {
  if (typeof localStorage === "undefined") return;
  savePlayerState(player);
}

export function syncMissions(player: PlayerState, now: Date = new Date()): MissionState {
  const state = missionStateFor(player, now);
  let changed = resetExpiredPeriods(state, now);
  if (observeProgress(player, state, now)) changed = true;
  if (changed) persist(player);
  return state;
}

function stateForPeriod(state: MissionState, period: MissionPeriod): MissionPeriodState {
  if (period === "DAILY") return state.daily;
  if (period === "WEEKLY") return state.weekly;
  return state.monthly;
}

export function getPeriodMissionView(player: PlayerState, period: MissionPeriod, now: Date = new Date()): PeriodMissionGroupView {
  const state = syncMissions(player, now);
  const periodState = stateForPeriod(state, period);
  const missions = PERIOD_DEFINITIONS[period].map((mission) => {
    const current = Math.max(0, state.counters[mission.counter] - periodState.baseline[mission.counter]);
    return {
      ...mission,
      current: Math.min(mission.target, current),
      complete: current >= mission.target,
      claimed: periodState.claimedIds.includes(mission.id),
    };
  });
  const completedCount = missions.filter((mission) => mission.complete).length;
  const requiredCount = PERIOD_REQUIREMENTS[period];
  return {
    period,
    missions,
    completedCount,
    requiredCount,
    clearReward: PERIOD_CLEAR_REWARDS[period],
    clearClaimed: periodState.clearClaimed,
    canClaimClear: completedCount >= requiredCount && !periodState.clearClaimed,
  };
}

function grantPig(player: PlayerState, star: 3 | 4, count: number): void {
  const maxLevel = STAR_MAX_LEVEL[star];
  for (let index = 0; index < count; index += 1) {
    player.monsters.push(createMonsterInstance(`${REINCARNATION_PIG.templateId}_FIRE`, star, maxLevel));
  }
}

export function grantMissionReward(player: PlayerState, reward: MissionReward): void {
  player.gold += reward.gold ?? 0;
  player.crystal += reward.crystal ?? 0;
  player.summonScrolls += reward.summonScrolls ?? 0;
  player.fourStarSummonScrolls += reward.fourStarSummonScrolls ?? 0;
  player.lightDarkFourStarSummonScrolls += reward.lightDarkFourStarSummonScrolls ?? 0;
  player.fiveStarSummonScrolls += reward.fiveStarSummonScrolls ?? 0;
  player.awakeningOrbs += reward.awakeningOrbs ?? 0;
  grantPig(player, 3, reward.reincarnationPig3 ?? 0);
  grantPig(player, 4, reward.reincarnationPig4 ?? 0);
}

export function claimPeriodMission(player: PlayerState, period: MissionPeriod, id: string, now: Date = new Date()): MissionReward | null {
  const view = getPeriodMissionView(player, period, now);
  const mission = view.missions.find((entry) => entry.id === id);
  if (!mission || !mission.complete || mission.claimed) return null;
  const state = missionStateFor(player, now);
  const periodState = stateForPeriod(state, period);
  periodState.claimedIds.push(id);
  grantMissionReward(player, mission.reward);
  persist(player);
  return mission.reward;
}

export function claimPeriodClear(player: PlayerState, period: MissionPeriod, now: Date = new Date()): MissionReward | null {
  const view = getPeriodMissionView(player, period, now);
  if (!view.canClaimClear) return null;
  const state = missionStateFor(player, now);
  stateForPeriod(state, period).clearClaimed = true;
  grantMissionReward(player, view.clearReward);
  persist(player);
  return view.clearReward;
}

const CUMULATIVE_DEFINITIONS: readonly CumulativeDefinition[] = [
  {
    key: "summons",
    title: "召喚回数",
    counter: "summons",
    fixed: [
      { target: 10, reward: { summonScrolls: 3 } },
      { target: 30, reward: { crystal: 100 } },
      { target: 50, reward: { summonScrolls: 5 } },
      { target: 100, reward: { fourStarSummonScrolls: 1 } },
      { target: 200, reward: { summonScrolls: 10 } },
      { target: 300, reward: { crystal: 500 } },
      { target: 500, reward: { fourStarSummonScrolls: 2 } },
    ],
    nextAfterFixed: (last) => last + 100,
    rewardAfterFixed: (target) => target % 1_000 === 0
      ? { summonScrolls: 20, crystal: 300, lightDarkFourStarSummonScrolls: 1 }
      : target % 500 === 0
        ? { summonScrolls: 10, crystal: 200, fourStarSummonScrolls: 1 }
        : { summonScrolls: 10, crystal: 100 },
  },
  {
    key: "levels",
    title: "レベルアップ数",
    counter: "levelsGained",
    fixed: [
      { target: 50, reward: { gold: 100_000 } },
      { target: 100, reward: { summonScrolls: 3 } },
      { target: 300, reward: { reincarnationPig3: 2 } },
      { target: 500, reward: { crystal: 200 } },
    ],
    nextAfterFixed: (last) => last + 500,
    rewardAfterFixed: (target) => target % 2_000 === 0
      ? { reincarnationPig3: 2, gold: 300_000, reincarnationPig4: 1, summonScrolls: 5 }
      : { reincarnationPig3: 2, gold: 300_000 },
  },
  {
    key: "rankups",
    title: "ランクアップ回数",
    counter: "rankUps",
    fixed: [
      { target: 5, reward: { gold: 100_000 } },
      { target: 10, reward: { summonScrolls: 3 } },
      { target: 25, reward: { reincarnationPig4: 1 } },
    ],
    nextAfterFixed: (last) => last + 25,
    rewardAfterFixed: (target) => target % 100 === 0
      ? { reincarnationPig4: 1, summonScrolls: 3, crystal: 300 }
      : { reincarnationPig4: 1, summonScrolls: 3 },
  },
  {
    key: "star6",
    title: "★6育成数",
    counter: "star6Raised",
    fixed: [
      { target: 1, reward: { crystal: 200 } },
      { target: 3, reward: { summonScrolls: 5 } },
      { target: 5, reward: { awakeningOrbs: 1 } },
      { target: 10, reward: { fourStarSummonScrolls: 1 } },
      { target: 15, reward: { awakeningOrbs: 1 } },
      { target: 25, reward: { lightDarkFourStarSummonScrolls: 1 } },
    ],
    nextAfterFixed: (last) => last + 10,
    rewardAfterFixed: () => ({ reincarnationPig4: 2, summonScrolls: 5 }),
  },
  {
    key: "star6-milestone",
    title: "★6育成・大台",
    counter: "star6Raised",
    fixed: [],
    nextAfterFixed: (last) => last <= 0 ? 50 : last + 50,
    rewardAfterFixed: () => ({ fourStarSummonScrolls: 1, crystal: 500, awakeningOrbs: 1 }),
  },
  {
    key: "arena",
    title: "アリーナ挑戦回数",
    counter: "arenaBattles",
    fixed: [
      { target: 10, reward: { crystal: 100 } },
      { target: 50, reward: { summonScrolls: 5 } },
      { target: 100, reward: { gold: 300_000 } },
      { target: 150, reward: { crystal: 300, summonScrolls: 3 } },
    ],
    nextAfterFixed: (last) => last + 150,
    rewardAfterFixed: (target) => target % 750 === 0
      ? { crystal: 300, summonScrolls: 3, fourStarSummonScrolls: 1 }
      : { crystal: 300, summonScrolls: 3 },
  },
  {
    key: "equipment",
    title: "装備強化回数",
    counter: "equipmentEnhancements",
    fixed: [
      { target: 10, reward: { gold: 100_000 } },
      { target: 50, reward: { summonScrolls: 3 } },
      { target: 100, reward: { gold: 300_000 } },
      { target: 200, reward: { gold: 500_000, crystal: 200 } },
    ],
    nextAfterFixed: (last) => last + 200,
    rewardAfterFixed: (target) => target % 1_000 === 0
      ? { gold: 500_000, crystal: 200, summonScrolls: 10 }
      : { gold: 500_000, crystal: 200 },
  },
  {
    key: "shop",
    title: "ショップ購入回数",
    counter: "shopPurchases",
    fixed: [
      { target: 10, reward: { summonScrolls: 3 } },
      { target: 30, reward: { gold: 100_000 } },
      { target: 50, reward: { crystal: 200 } },
      { target: 100, reward: { summonScrolls: 10 } },
    ],
    nextAfterFixed: (last) => last + 50,
    rewardAfterFixed: () => ({ reincarnationPig3: 1, crystal: 100 }),
  },
  {
    key: "login",
    title: "ログイン日数",
    counter: "loginDays",
    fixed: [
      { target: 3, reward: { crystal: 100 } },
      { target: 7, reward: { summonScrolls: 5 } },
      { target: 14, reward: { gold: 200_000 } },
      { target: 30, reward: { summonScrolls: 10 } },
      { target: 60, reward: { crystal: 500 } },
      { target: 100, reward: { fourStarSummonScrolls: 1 } },
      { target: 180, reward: { summonScrolls: 30 } },
      { target: 365, reward: { lightDarkFourStarSummonScrolls: 1 } },
    ],
    nextAfterFixed: (last) => last + 30,
    rewardAfterFixed: () => ({ summonScrolls: 5, crystal: 100 }),
  },
];

function nextCumulativeStep(definition: CumulativeDefinition, lastClaimedTarget: number): FixedRewardStep {
  const fixed = definition.fixed.find((step) => step.target > lastClaimedTarget);
  if (fixed) return fixed;
  const target = definition.nextAfterFixed(lastClaimedTarget);
  return { target, reward: definition.rewardAfterFixed(target) };
}

export function getCumulativeMissionViews(player: PlayerState, now: Date = new Date()): CumulativeMissionView[] {
  const state = syncMissions(player, now);
  return CUMULATIVE_DEFINITIONS.map((definition) => {
    const last = state.cumulative[definition.key]?.lastClaimedTarget ?? 0;
    const next = nextCumulativeStep(definition, last);
    const current = state.counters[definition.counter];
    return { key: definition.key, title: definition.title, current, target: next.target, reward: next.reward, complete: current >= next.target };
  });
}

export function claimCumulativeMission(player: PlayerState, key: string, now: Date = new Date()): MissionReward | null {
  const state = syncMissions(player, now);
  const definition = CUMULATIVE_DEFINITIONS.find((entry) => entry.key === key);
  if (!definition) return null;
  const claim = state.cumulative[key] ?? { lastClaimedTarget: 0 };
  const step = nextCumulativeStep(definition, claim.lastClaimedTarget);
  if (state.counters[definition.counter] < step.target) return null;
  claim.lastClaimedTarget = step.target;
  state.cumulative[key] = claim;
  grantMissionReward(player, step.reward);
  persist(player);
  return step.reward;
}

function addReward(total: MissionReward, reward: MissionReward): void {
  const keys = Object.keys(reward) as (keyof MissionReward)[];
  for (const key of keys) total[key] = (total[key] ?? 0) + (reward[key] ?? 0);
}

export function claimAllAvailableMissionRewards(player: PlayerState, now: Date = new Date()): MissionReward {
  const total: MissionReward = {};
  for (const period of ["DAILY", "WEEKLY", "MONTHLY"] as const) {
    const view = getPeriodMissionView(player, period, now);
    for (const mission of view.missions) {
      if (!mission.complete || mission.claimed) continue;
      const reward = claimPeriodMission(player, period, mission.id, now);
      if (reward) addReward(total, reward);
    }
    const clear = claimPeriodClear(player, period, now);
    if (clear) addReward(total, clear);
  }
  for (const definition of CUMULATIVE_DEFINITIONS) {
    for (let safety = 0; safety < 10_000; safety += 1) {
      const reward = claimCumulativeMission(player, definition.key, now);
      if (!reward) break;
      addReward(total, reward);
    }
  }
  persist(player);
  return total;
}

export function missionRewardText(reward: MissionReward): string {
  const parts: string[] = [];
  if (reward.gold) parts.push(`${reward.gold.toLocaleString("ja-JP")}G`);
  if (reward.crystal) parts.push(`ダイヤ×${reward.crystal.toLocaleString("ja-JP")}`);
  if (reward.summonScrolls) parts.push(`召喚の書×${reward.summonScrolls}`);
  if (reward.fourStarSummonScrolls) parts.push(`★4以上召喚書×${reward.fourStarSummonScrolls}`);
  if (reward.lightDarkFourStarSummonScrolls) parts.push(`★4以上光闇召喚書×${reward.lightDarkFourStarSummonScrolls}`);
  if (reward.fiveStarSummonScrolls) parts.push(`★5召喚書×${reward.fiveStarSummonScrolls}`);
  if (reward.awakeningOrbs) parts.push(`覚醒オーブ×${reward.awakeningOrbs}`);
  if (reward.reincarnationPig3) parts.push(`★3 MAX転生ピッグ×${reward.reincarnationPig3}`);
  if (reward.reincarnationPig4) parts.push(`★4 MAX転生ピッグ×${reward.reincarnationPig4}`);
  return parts.join(" / ") || "報酬なし";
}

let registeredPlayer: PlayerState | null = null;
let observerHandle: number | null = null;

export function registerMissionPlayer(player: PlayerState): void {
  registeredPlayer = player;
  syncMissions(player);
}

export function getRegisteredMissionPlayer(): PlayerState | null {
  return registeredPlayer;
}

export function startMissionObserver(): void {
  if (typeof window === "undefined" || observerHandle !== null) return;
  observerHandle = window.setInterval(() => {
    if (registeredPlayer) syncMissions(registeredPlayer);
  }, 250);
}
