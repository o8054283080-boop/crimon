import { MonsterInstance } from "../core/monsterInstance.js";
import { RANK_UP_SACRIFICE_COUNT, STAR_MAX_LEVEL, Star, canRankUp } from "../core/rarity.js";

export interface RankUpCheck {
  ok: boolean;
  reason?: string;
  requiredCount: number;
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
  return { ok: true, requiredCount };
}

/** ランクアップを実行する。呼び出し前に checkRankUp で ok を確認すること */
export function applyRankUp(target: MonsterInstance): void {
  target.star = (target.star + 1) as Star;
  target.level = 1;
  target.exp = 0;
}

export function maxLevelOf(instance: MonsterInstance): number {
  return STAR_MAX_LEVEL[instance.star];
}
