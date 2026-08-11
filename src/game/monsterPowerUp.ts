import { MonsterInstance, addExp, rollSkillLevelUp } from "../core/monsterInstance.js";
import { Star, STAR_MAX_LEVEL } from "../core/rarity.js";
import { findMonsterById } from "../data/monsters.js";

export interface MonsterPowerUpCheck {
  ok: boolean;
  reason?: string;
}

/** モンスター強化(素材消費)が可能かどうかを検証する。素材はどのモンスターでもよい(経験値に変換される) */
export function checkMonsterPowerUp(
  target: MonsterInstance,
  materials: MonsterInstance[],
  partyIds: readonly string[],
): MonsterPowerUpCheck {
  if (materials.length === 0) {
    return { ok: false, reason: "素材を1体以上選択してください" };
  }
  if (materials.some((m) => m.id === target.id)) {
    return { ok: false, reason: "対象自身は素材にできません" };
  }
  if (materials.some((m) => partyIds.includes(m.id))) {
    return { ok: false, reason: "パーティに編成中のモンスターは素材にできません" };
  }
  if (target.level >= STAR_MAX_LEVEL[target.star]) {
    return { ok: false, reason: "対象は現在の星の最大レベルに達しています(素材を無駄にしないよう、ランクアップしてください)" };
  }
  return { ok: true };
}

/** 星ごとの、素材1体あたりの基礎経験値。星・レベルが高い素材ほど経験値としての価値が高い */
const FEED_EXP_BASE_PER_STAR: Record<Star, number> = { 1: 50, 2: 90, 3: 160, 4: 280, 5: 480, 6: 800 };

/** 素材モンスター1体を強化に使った時に得られる経験値 */
export function feedExpValue(material: MonsterInstance): number {
  return Math.round(FEED_EXP_BASE_PER_STAR[material.star] * (1 + (material.level - 1) * 0.1));
}

/** 素材が対象と同じ種族(テンプレートID)かどうか。属性(色)が違っていても種族が同じならtrue */
export function isSameSpecies(target: MonsterInstance, material: MonsterInstance): boolean {
  const targetDex = findMonsterById(target.dexId);
  const materialDex = findMonsterById(material.dexId);
  if (!targetDex || !materialDex) return false;
  return targetDex.templateId === materialDex.templateId;
}

export interface MonsterPowerUpResult {
  expGained: number;
  levelsGained: number;
  /** 上昇したスキルのindex(0-2)を、上がった順に記録したもの */
  leveledSkillIndices: number[];
}

/**
 * モンスター強化を実行する。素材はすべて経験値に変換され、対象のレベルが上がる。
 * さらに、対象と同じ種族(属性・色違いでも可)の素材は1体につき、まだ最大レベルに達していない
 * スキルの中からランダムに1つ選んでレベルを+1する。
 * 呼び出し前に checkMonsterPowerUp で ok を確認すること。素材モンスターの消費(所持リストからの除去)は呼び出し側の責務。
 */
export function applyMonsterPowerUp(
  target: MonsterInstance,
  materials: MonsterInstance[],
  rng: () => number = Math.random,
): MonsterPowerUpResult {
  const expGained = materials.reduce((sum, m) => sum + feedExpValue(m), 0);
  const levelsGained = addExp(target, expGained, STAR_MAX_LEVEL[target.star]);

  const leveledSkillIndices: number[] = [];
  for (const material of materials) {
    if (!isSameSpecies(target, material)) continue;
    const index = rollSkillLevelUp(target, rng);
    if (index >= 0) leveledSkillIndices.push(index);
  }

  return { expGained, levelsGained, leveledSkillIndices };
}
