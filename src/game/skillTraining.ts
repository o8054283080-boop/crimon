import { MonsterInstance, isSkillMaxLevel, rollSkillLevelUp } from "../core/monsterInstance.js";

export interface SkillTrainingCheck {
  ok: boolean;
  reason?: string;
}

/** スキル強化(素材消費)が可能かどうかを検証する。素材はどれも対象と同じモンスター(同じdexId)である必要がある */
export function checkSkillTraining(
  target: MonsterInstance,
  materials: MonsterInstance[],
  partyIds: readonly string[],
): SkillTrainingCheck {
  if (isSkillMaxLevel(target)) {
    return { ok: false, reason: "スキルはすべて最大レベルです" };
  }
  if (materials.length === 0) {
    return { ok: false, reason: "素材を1体以上選択してください" };
  }
  if (materials.some((m) => m.id === target.id)) {
    return { ok: false, reason: "対象自身は素材にできません" };
  }
  if (materials.some((m) => m.dexId !== target.dexId)) {
    return { ok: false, reason: "素材は対象と同じモンスターのみ使用できます" };
  }
  if (materials.some((m) => partyIds.includes(m.id))) {
    return { ok: false, reason: "パーティに編成中のモンスターは素材にできません" };
  }
  return { ok: true };
}

export interface SkillTrainingResult {
  /** 上昇したスキルのindex(0-2)を、上がった順に記録したもの */
  leveledSkillIndices: number[];
}

/**
 * スキル強化を実行する。素材1体につき、まだ最大レベルに達していないスキルの中からランダムに1つ選んでレベルを+1する。
 * 呼び出し前に checkSkillTraining で ok を確認すること。素材モンスターの消費(所持リストからの除去)は呼び出し側の責務。
 */
export function applySkillTraining(
  target: MonsterInstance,
  materialCount: number,
  rng: () => number = Math.random,
): SkillTrainingResult {
  const leveledSkillIndices: number[] = [];
  for (let i = 0; i < materialCount; i += 1) {
    const index = rollSkillLevelUp(target, rng);
    if (index >= 0) leveledSkillIndices.push(index);
  }
  return { leveledSkillIndices };
}
