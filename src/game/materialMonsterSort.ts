import { MonsterInstance } from "../core/monsterInstance.js";
import { EXP_PIG, REINCARNATION_PIG, findMonsterById } from "../data/monsters.js";

export type MaterialMonsterSort = "DEFAULT" | "EXP_PIG_FIRST" | "REINCARNATION_PIG_FIRST";

function priorityTemplateId(sort: Exclude<MaterialMonsterSort, "DEFAULT">): string {
  return sort === "EXP_PIG_FIRST" ? EXP_PIG.templateId : REINCARNATION_PIG.templateId;
}

/**
 * 素材候補の元の並びを壊さず、用途に合う専用ピッグだけを先頭へまとめる。
 * 表示名ではなく図鑑データの templateId を使うため、名前変更や翻訳の影響を受けない。
 */
export function sortMaterialMonsters(
  candidates: readonly MonsterInstance[],
  sort: MaterialMonsterSort,
): MonsterInstance[] {
  if (sort === "DEFAULT") return [...candidates];

  const templateId = priorityTemplateId(sort);
  const prioritized: MonsterInstance[] = [];
  const others: MonsterInstance[] = [];

  for (const candidate of candidates) {
    const candidateTemplateId = findMonsterById(candidate.dexId)?.templateId;
    (candidateTemplateId === templateId ? prioritized : others).push(candidate);
  }

  return [...prioritized, ...others];
}
