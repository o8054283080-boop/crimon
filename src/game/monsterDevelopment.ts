import {
  ABILITY_POINT_RESET_COST,
  TYPE_REINCARNATION_GOLD_COST,
  ABILITY_POINT_VALUES,
  AbilityPointAllocation,
  AllocatableStat,
  LatentAbilityCandidate,
  MonsterType,
  abilityPointBudget,
} from "../core/monsterDevelopment.js";
import { MonsterInstance } from "../core/monsterInstance.js";
export { LATENT_ABILITY_CANDIDATES } from "../data/latentAbilities.js";

export const LATENT_REAWAKENING_ORB_COST = 2;
export const LATENT_REAWAKENING_GOLD_COST = 100_000;

export function usedAbilityPoints(allocation: AbilityPointAllocation): number {
  return Object.values(allocation).reduce((sum, value) => sum + value, 0);
}

export function abilityStatBonuses(allocation: AbilityPointAllocation): AbilityPointAllocation {
  return {
    hp: allocation.hp * ABILITY_POINT_VALUES.hp,
    atk: allocation.atk * ABILITY_POINT_VALUES.atk,
    def: allocation.def * ABILITY_POINT_VALUES.def,
    spd: Math.floor(allocation.spd * ABILITY_POINT_VALUES.spd),
  };
}

export function setAbilityPoint(instance: MonsterInstance, stat: AllocatableStat, points: number): boolean {
  if (!Number.isInteger(points) || points < 0) return false;
  const next = { ...instance.development.abilityPoints, [stat]: points };
  if (usedAbilityPoints(next) > abilityPointBudget(instance.star)) return false;
  instance.development.abilityPoints = next;
  return true;
}

export function reincarnateMonsterType(instance: MonsterInstance, type: MonsterType, wallet: { gold: number }): boolean {
  if (instance.star !== 6 || wallet.gold < TYPE_REINCARNATION_GOLD_COST) return false;
  wallet.gold -= TYPE_REINCARNATION_GOLD_COST;
  instance.development.type = type;
  instance.development.abilityPoints = { hp: 0, atk: 0, def: 0, spd: 0 };
  return true;
}

export function resetAbilityPoints(instance: MonsterInstance, wallet: { gold: number }): boolean {
  // 配分済みであることも同じ同期処理内で検証し、連打で空配分へ二重課金しない。
  if (instance.star !== 6 || usedAbilityPoints(instance.development.abilityPoints) === 0 || wallet.gold < ABILITY_POINT_RESET_COST) return false;
  wallet.gold -= ABILITY_POINT_RESET_COST;
  instance.development.abilityPoints = { hp: 0, atk: 0, def: 0, spd: 0 };
  return true;
}

export function selectLatentAbility(
  instance: MonsterInstance,
  candidateId: string,
  candidates: readonly LatentAbilityCandidate[],
): boolean {
  if (candidates.length !== 3 || !candidates.some((candidate) => candidate.id === candidateId)) return false;
  instance.development.latentAbilityId = candidateId;
  instance.development.latentReselectPending = false;
  return true;
}

export function awakenLatentAbility(
  instance: MonsterInstance,
  candidateId: string,
  candidates: readonly LatentAbilityCandidate[],
  inventory: { awakeningOrbs: number },
): boolean {
  if (instance.development.latentAbilityId !== null) return false;
  const reselecting = instance.development.latentReselectPending;
  if (!reselecting && inventory.awakeningOrbs < 1) return false;
  if (!selectLatentAbility(instance, candidateId, candidates)) return false;
  if (!reselecting) inventory.awakeningOrbs -= 1;
  return true;
}

export function canReawakenLatentAbility(
  instance: MonsterInstance,
  wallet: { awakeningOrbs: number; gold: number },
): boolean {
  return instance.development.latentAbilityId !== null
    && !instance.development.latentReselectPending
    && wallet.awakeningOrbs >= LATENT_REAWAKENING_ORB_COST
    && wallet.gold >= LATENT_REAWAKENING_GOLD_COST;
}

/** 再覚醒費用を一度だけ支払い、現在の潜在を外して再選択待ちにする。 */
export function reawakenLatentAbility(
  instance: MonsterInstance,
  wallet: { awakeningOrbs: number; gold: number },
): boolean {
  if (!canReawakenLatentAbility(instance, wallet)) return false;
  wallet.awakeningOrbs -= LATENT_REAWAKENING_ORB_COST;
  wallet.gold -= LATENT_REAWAKENING_GOLD_COST;
  instance.development.latentAbilityId = null;
  instance.development.latentReselectPending = true;
  return true;
}
