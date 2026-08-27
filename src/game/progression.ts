import { MonsterInstance, rollSkillLevelUp } from "../core/monsterInstance.js";
import { RANK_UP_SACRIFICE_COUNT, STAR_MAX_LEVEL, Star, canRankUp } from "../core/rarity.js";
import { EXP_PIG, findMonsterById } from "../data/monsters.js";
import { isSameSpecies } from "./monsterPowerUp.js";

export interface RankUpCheck {
  ok: boolean;
  reason?: string;
  requiredCount: number;
}

function isExpPig(instance: MonsterInstance): boolean {
  return findMonsterById(instance.dexId)?.templateId === EXP_PIG.templateId;
}

/** ランクアップ可能かどうかを検証する(対象・素材はどちらもプレイヤーの所持品である前提) */
export function checkRankUp(target: MonsterInstance, sacrifices: MonsterInstance[], partyIds: readonly string[]): RankUpCheck {
  const requiredCount = RANK_UP_SACRIFICE_COUNT[target.star];

  if (!canRankUp(target.star, target.level)) {
    return { ok: false, reason: "対象は最大レベルに達していません", requiredCount };
  }
  if (sacrifices.some((s) => s.id === target.id)) {
    return { ok: false, reason: "対象自身は素材にできません", requiredCount };
  }
  if (sacrifices.length !== requiredCount) {
    return { ok: false, reason: `素材が${requiredCount}体必要です`, requiredCount };
  }
  if (sacrifices.some((s) => s.star !== target.star)) {
    return { ok: false, reason: "素材は対象と同じ星のモンスターのみ使用できます", requiredCount };
  }
  if (sacrifices.some((s) => partyIds.includes(s.id))) {
    return { ok: false, reason: "パーティに編成中のモンスターは素材にできません", requiredCount };
  }
  if (sacrifices.some((s) => isExpPig(s))) {
    return { ok: false, reason: "経験ピッグはランクアップの素材にはできません", requiredCount };
  }
  return { ok: true, requiredCount };
}

export interface RankUpResult {
  /** 上昇したスキルのindex(0-2)を、上がった順に記録したもの */
  leveledSkillIndices: number[];
}

/**
 * ランクアップを実行する。呼び出し前に checkRankUp で ok を確認すること。
 * 素材のうち対象と同じ種族(属性・色違いでも可)のものは1体につき、まだ最大レベルに達していない
 * スキルの中からランダムに1つ選んでレベルを+1する(モンスター強化と同じ仕組み)。
 */
export function applyRankUp(target: MonsterInstance, sacrifices: MonsterInstance[], rng: () => number = Math.random): RankUpResult {
  target.star = (target.star + 1) as Star;
  target.level = 1;
  target.exp = 0;
  // 新しい育成段階では、その段階の上限をゼロから配分し直す。
  target.development.abilityPoints = { hp: 0, atk: 0, def: 0, spd: 0 };

  const leveledSkillIndices: number[] = [];
  for (const sacrifice of sacrifices) {
    if (!isSameSpecies(target, sacrifice)) continue;
    const index = rollSkillLevelUp(target, rng);
    if (index >= 0) leveledSkillIndices.push(index);
  }

  return { leveledSkillIndices };
}

export function maxLevelOf(instance: MonsterInstance): number {
  return STAR_MAX_LEVEL[instance.star];
}
