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
/**
 * 潜在覚醒でかかるゴールド。
 *
 * **初回の覚醒はオーブ1個だけで、ゴールドは取らない**(既存の作り)。
 * ここで取るのは「覚醒し直す」代金。クリエイト系の中でいちばん高い。
 */
export const LATENT_REAWAKENING_GOLD_COST = 500_000;

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

/**
 * 配分を確定したか。
 *
 * **控えに印が無い時は「1点でも振ってあれば確定済み」と読む。**
 * 前から遊んでいる人の控えにはこの印が無く、そこを未確定として扱うと、
 * **既に配り終えた全員が無料で振り直せる状態**のまま残ってしまう。
 */
export function abilityPointsConfirmed(instance: MonsterInstance): boolean {
  const dev = instance.development;
  return dev.abilityPointsConfirmed ?? usedAbilityPoints(dev.abilityPoints) > 0;
}

/**
 * 能力ポイントを1つ動かす。**確定後は動かせない。**
 *
 * 以前はここが下げる方向も素通ししていたので、HPを0へ戻して攻撃へ移す、を
 * 無料で何度でもできた。有料のリセットは回り道があるせいで無意味だった。
 */
export function setAbilityPoint(instance: MonsterInstance, stat: AllocatableStat, points: number): boolean {
  if (abilityPointsConfirmed(instance)) return false;
  if (!Number.isInteger(points) || points < 0) return false;
  const next = { ...instance.development.abilityPoints, [stat]: points };
  if (usedAbilityPoints(next) > abilityPointBudget(instance.star)) return false;
  instance.development.abilityPoints = next;
  return true;
}

/**
 * いまの配分で確定する。**ここから先は有料でしか変えられない。**
 *
 * 1点も振っていない状態では確定させない——「何もしていない」を
 * 確定させても、次にできるのは有料リセットだけになる。
 */
export function confirmAbilityPoints(instance: MonsterInstance): boolean {
  if (abilityPointsConfirmed(instance)) return false;
  if (usedAbilityPoints(instance.development.abilityPoints) === 0) return false;
  instance.development.abilityPointsConfirmed = true;
  return true;
}

export function reincarnateMonsterType(instance: MonsterInstance, type: MonsterType, wallet: { gold: number }): boolean {
  if (instance.star !== 6 || wallet.gold < TYPE_REINCARNATION_GOLD_COST) return false;
  wallet.gold -= TYPE_REINCARNATION_GOLD_COST;
  instance.development.type = type;
  instance.development.abilityPoints = { hp: 0, atk: 0, def: 0, spd: 0 };
  // 能力が戻るのだから、確定の印も戻す(でないと配り直せない)
  instance.development.abilityPointsConfirmed = false;
  return true;
}

/**
 * 確定した配分を戻す。**払った後は、また無料で配れる状態に戻る。**
 *
 * 検証と支払いと書き換えを同じ区間で行う。連打しても、
 * 2回目は「配分済みでない」で弾かれるので二重課金にならない。
 */
export function resetAbilityPoints(instance: MonsterInstance, wallet: { gold: number }): boolean {
  if (instance.star !== 6) return false;
  if (usedAbilityPoints(instance.development.abilityPoints) === 0) return false;
  if (wallet.gold < ABILITY_POINT_RESET_COST) return false;
  wallet.gold -= ABILITY_POINT_RESET_COST;
  instance.development.abilityPoints = { hp: 0, atk: 0, def: 0, spd: 0 };
  // **印も外す。** 外さないと、払ったのに配り直せない
  instance.development.abilityPointsConfirmed = false;
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

/** 初回・再覚醒・旧再選択を一つの原子的な入口で確定する。 */
export function confirmLatentAwakening(
  instance: MonsterInstance,
  candidateId: string,
  candidates: readonly LatentAbilityCandidate[],
  wallet: { awakeningOrbs: number; gold: number },
  expectedCurrentId: string | null,
): boolean {
  const current = instance.development.latentAbilityId;
  if (current !== expectedCurrentId || candidates.length !== 3) return false;
  const ids = new Set(candidates.map((candidate) => candidate.id));
  if (ids.size !== 3 || !ids.has(candidateId) || candidateId === current) return false;
  const legacyPaid = current === null && instance.development.latentReselectPending;
  const orbCost = legacyPaid ? 0 : current === null ? 1 : LATENT_REAWAKENING_ORB_COST;
  const goldCost = legacyPaid || current === null ? 0 : LATENT_REAWAKENING_GOLD_COST;
  if (wallet.awakeningOrbs < orbCost || wallet.gold < goldCost) return false;
  // 全検証後にだけ、同じ同期区間で資源とIDを変更する。
  wallet.awakeningOrbs -= orbCost;
  wallet.gold -= goldCost;
  instance.development.latentAbilityId = candidateId;
  instance.development.latentReselectPending = false;
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
