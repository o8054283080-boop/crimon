import type { MonsterInstance } from "../core/monsterInstance.js";
import { createMonsterInstance } from "../core/monsterInstance.js";
import type { Star } from "../core/rarity.js";
import type { PlayerState } from "./playerState.js";

export interface MonsterStorageStack {
  dexId: string;
  star: Star;
  count: number;
}

function hasDefaultDevelopment(monster: MonsterInstance): boolean {
  const d = monster.development;
  const t = d?.talents;
  return Boolean(d)
    && d.type === null
    && d.latentAbilityId === null
    && d.latentReselectPending !== true
    && d.abilityPointsConfirmed !== true
    && (d.abilityPoints?.hp ?? 0) === 0
    && (d.abilityPoints?.atk ?? 0) === 0
    && (d.abilityPoints?.def ?? 0) === 0
    && (d.abilityPoints?.spd ?? 0) === 0
    && (!t || (
      (t.unlockedPoints ?? 0) === 0
      && Object.keys(t.basic ?? {}).length === 0
      && Object.keys(t.battle ?? {}).length === 0
      && (t.skill?.[1]?.length ?? 0) === 0
      && (t.skill?.[2]?.length ?? 0) === 0
      && !t.awakening
    ));
}

export function isMonsterStorageEligible(state: PlayerState, monster: MonsterInstance): boolean {
  if (monster.level !== 1 || monster.exp !== 0 || monster.locked) return false;
  if (Object.values(monster.equipment ?? {}).some(Boolean)) return false;
  if (monster.skillLevels.some((level) => level !== 1)) return false;
  if (monster.createdSkill) return false;
  if (!hasDefaultDevelopment(monster)) return false;
  const used = new Set([
    ...state.partyIds,
    ...(state.dungeonPartyIds ?? []),
    ...(state.towerPartyIds ?? []),
    ...(state.arenaDefenseIds ?? []),
    ...(state.arenaOffenseIds ?? []),
    ...(state.backgroundFarmJob?.status === "RUNNING" ? state.backgroundFarmJob.partyIds : []),
    ...(state.trialTowerRun?.members.map((member) => member.instanceId) ?? []),
  ]);
  return !used.has(monster.id);
}

export function storageStacks(state: PlayerState): MonsterStorageStack[] {
  return state.monsterStorage ?? [];
}

export function storageCount(state: PlayerState): number {
  return storageStacks(state).reduce((sum, stack) => sum + stack.count, 0);
}

export function storableOwnedGroups(state: PlayerState): MonsterStorageStack[] {
  const counts = new Map<string, MonsterStorageStack>();
  for (const monster of state.monsters) {
    if (!isMonsterStorageEligible(state, monster)) continue;
    const key = `${monster.dexId}::${monster.star}`;
    const row = counts.get(key);
    if (row) row.count += 1;
    else counts.set(key, { dexId: monster.dexId, star: monster.star, count: 1 });
  }
  return [...counts.values()];
}

function clampCount(requested: number, max: number): number {
  if (!Number.isFinite(requested)) return 0;
  return Math.max(0, Math.min(max, Math.floor(requested)));
}

export function depositMonsters(
  state: PlayerState,
  dexId: string,
  star: Star,
  requested: number,
): number {
  const candidates = state.monsters.filter(
    (monster) => monster.dexId === dexId && monster.star === star && isMonsterStorageEligible(state, monster),
  );
  const count = clampCount(requested, candidates.length);
  if (count === 0) return 0;

  const ids = new Set(candidates.slice(0, count).map((monster) => monster.id));
  state.monsters = state.monsters.filter((monster) => !ids.has(monster.id));
  state.monsterStorage ??= [];
  const existing = state.monsterStorage.find((stack) => stack.dexId === dexId && stack.star === star);
  if (existing) existing.count += count;
  else state.monsterStorage.push({ dexId, star, count });
  return count;
}

export function withdrawMonsters(
  state: PlayerState,
  dexId: string,
  star: Star,
  requested: number,
): number {
  const stack = storageStacks(state).find((row) => row.dexId === dexId && row.star === star);
  if (!stack) return 0;
  const count = clampCount(requested, stack.count);
  if (count === 0) return 0;
  for (let i = 0; i < count; i += 1) state.monsters.push(createMonsterInstance(dexId, star, 1));
  stack.count -= count;
  state.monsterStorage = storageStacks(state).filter((row) => row.count > 0);
  return count;
}

export function exchangeStoredMonstersForPoints(
  state: PlayerState,
  dexId: string,
  star: Star,
  requested: number,
): { sent: number; gained: number; total: number } | null {
  const stack = storageStacks(state).find((row) => row.dexId === dexId && row.star === star);
  if (!stack) return null;
  const sent = clampCount(requested, stack.count);
  if (sent === 0) return null;
  const gained = sent * star;
  stack.count -= sent;
  state.monsterStorage = storageStacks(state).filter((row) => row.count > 0);
  state.monsterPoints = Math.max(0, Math.floor(state.monsterPoints ?? 0)) + gained;
  return { sent, gained, total: state.monsterPoints };
}
