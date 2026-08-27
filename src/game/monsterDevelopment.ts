import {
  ABILITY_POINT_BUDGET,
  ABILITY_POINT_VALUES,
  AbilityPointAllocation,
  AllocatableStat,
  LatentAbilityCandidate,
  MonsterType,
} from "../core/monsterDevelopment.js";
import { MonsterInstance } from "../core/monsterInstance.js";

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
  if (usedAbilityPoints(next) > ABILITY_POINT_BUDGET) return false;
  instance.development.abilityPoints = next;
  return true;
}

export function reincarnateMonsterType(instance: MonsterInstance, type: MonsterType): void {
  instance.development.type = type;
  instance.level = 1;
  instance.exp = 0;
}

/**
 * dexId別の候補登録口。具体的内容はゲームデザイン確定後に3件ずつ追加する。
 * TODO: 全モンスターのスキル1用候補をデータファイルから登録する。
 */
export const LATENT_ABILITY_CANDIDATES: Readonly<Record<string, readonly LatentAbilityCandidate[]>> = {};

export function selectLatentAbility(
  instance: MonsterInstance,
  candidateId: string,
  candidates: readonly LatentAbilityCandidate[],
): boolean {
  if (candidates.length !== 3 || !candidates.some((candidate) => candidate.id === candidateId)) return false;
  instance.development.latentAbilityId = candidateId;
  return true;
}

export function awakenLatentAbility(
  instance: MonsterInstance,
  candidateId: string,
  candidates: readonly LatentAbilityCandidate[],
  inventory: { awakeningOrbs: number },
): boolean {
  if (instance.development.latentAbilityId !== null || inventory.awakeningOrbs < 1) return false;
  if (!selectLatentAbility(instance, candidateId, candidates)) return false;
  inventory.awakeningOrbs -= 1;
  return true;
}
