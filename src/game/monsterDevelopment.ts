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
export const LATENT_AWAKENING_ORB_COST = 1;

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

export type LatentAwakeningResult =
  | { ok: true; kind: "FIRST" | "REAWAKEN" | "LEGACY_RESELECT" }
  | { ok: false; reason: "STALE" | "INVALID_CANDIDATES" | "INVALID_CANDIDATE" | "SAME_ABILITY" | "ORB_SHORTAGE" | "GOLD_SHORTAGE" };

/**
 * 潜在能力の選択・費用・個体更新を同期的な一入口で確定する。
 * expectedCurrentId は候補画面を描画した時点の値で、古いボタンの連打・再送を拒否する。
 * 検証がすべて終わるまで wallet と instance を一切変更しない。
 */
export function confirmLatentAwakening(
  instance: MonsterInstance,
  candidateId: string,
  candidates: readonly LatentAbilityCandidate[],
  wallet: { awakeningOrbs: number; gold: number },
  expectedCurrentId: string | null,
): LatentAwakeningResult {
  if (instance.development.latentAbilityId !== expectedCurrentId) return { ok: false, reason: "STALE" };
  if (candidates.length !== 3 || new Set(candidates.map(({ id }) => id)).size !== 3) return { ok: false, reason: "INVALID_CANDIDATES" };
  if (!candidates.some(({ id }) => id === candidateId)) return { ok: false, reason: "INVALID_CANDIDATE" };
  if (expectedCurrentId === candidateId) return { ok: false, reason: "SAME_ABILITY" };

  const legacyReselect = expectedCurrentId === null && instance.development.latentReselectPending;
  const kind = legacyReselect ? "LEGACY_RESELECT" : expectedCurrentId === null ? "FIRST" : "REAWAKEN";
  const orbCost = kind === "FIRST" ? LATENT_AWAKENING_ORB_COST : kind === "REAWAKEN" ? LATENT_REAWAKENING_ORB_COST : 0;
  const goldCost = kind === "REAWAKEN" ? LATENT_REAWAKENING_GOLD_COST : 0;
  if (wallet.awakeningOrbs < orbCost) return { ok: false, reason: "ORB_SHORTAGE" };
  if (wallet.gold < goldCost) return { ok: false, reason: "GOLD_SHORTAGE" };

  wallet.awakeningOrbs -= orbCost;
  wallet.gold -= goldCost;
  instance.development.latentAbilityId = candidateId;
  instance.development.latentReselectPending = false;
  return { ok: true, kind };
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
