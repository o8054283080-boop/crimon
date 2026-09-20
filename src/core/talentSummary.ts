import {
  BASIC_TALENT_BY_LINE,
  BATTLE_TALENT_BY_LINE,
  TIER_NUMERALS,
  type TalentState,
  type TalentTier,
  type TieredTalentDef,
} from "./talents.js";
import { findSkillTalent } from "./talentSkills.js";

/**
 * 才能覚醒で**何を取ったか**を、1行ずつの形にして返す。
 *
 * ## なぜ要るのか
 *
 * 潜在覚醒はモンスターの詳細に「◆ 潜在覚醒」として出るのに、
 * **才能覚醒は何も出ていなかった。**スキルを覚醒させても強化しても、
 * 詳細を見て分かるのはステータスの数字だけで、
 * **何を取ったのかは才能覚醒の画面まで戻らないと分からない**(依頼主の指摘)。
 *
 * 画面を作る側から離して置くのは、**同じ言葉を複数の画面で使う**ため。
 * ここが1つなら、詳細と才能覚醒の画面で呼び名がずれない。
 */
export interface TalentSummaryLine {
  /** どの束のものか。画面ではこの順に並べる */
  group: "基礎" | "戦闘" | "スキル" | "覚醒";
  /** 「攻撃 III」「スキル2」など、左に出す名前 */
  label: string;
  /** 「攻撃力 +12%」など、実際に起きること */
  effect: string;
}

function tieredLine<L extends string>(
  def: TieredTalentDef<L> | undefined,
  tier: TalentTier,
  group: "基礎" | "戦闘",
): TalentSummaryLine | null {
  if (!def || tier <= 0) return null;
  const step = def.steps[tier - 1];
  if (!step) return null;
  return { group, label: `${def.name} ${TIER_NUMERALS[tier - 1]}`, effect: step.effectLabel };
}

/**
 * 取っている才能を並べる。**何も取っていなければ空。**
 *
 * スキル才能は枠ごとにまとめる。1つの枠に3つ取っている時、
 * 「スキル2」が3行並ぶと何の話か分からなくなるため。
 */
export function summarizeTalents(state: TalentState | undefined): TalentSummaryLine[] {
  if (!state) return [];
  const lines: TalentSummaryLine[] = [];

  for (const [line, tier] of Object.entries(state.basic ?? {})) {
    const row = tieredLine(BASIC_TALENT_BY_LINE.get(line as never), tier as TalentTier, "基礎");
    if (row) lines.push(row);
  }
  for (const [line, tier] of Object.entries(state.battle ?? {})) {
    const row = tieredLine(BATTLE_TALENT_BY_LINE.get(line as never), tier as TalentTier, "戦闘");
    if (row) lines.push(row);
  }

  for (const slot of [1, 2] as const) {
    const ids = state.skill?.[slot] ?? [];
    const names = ids.map((id) => findSkillTalent(id)?.name).filter((name): name is string => name !== undefined);
    if (names.length === 0) continue;
    // 添字1がスキル2、2がスキル3(`MonsterInstance.skills` に揃えてある)
    lines.push({ group: "スキル", label: `スキル${slot + 1}`, effect: names.join(" / ") });
  }

  const awakening = state.awakening;
  if (awakening) {
    const def = findSkillTalent(awakening.id);
    lines.push({
      group: "覚醒",
      label: `スキル${awakening.slot + 1}`,
      effect: def ? `${def.name}：${def.effectLabel}` : awakening.id,
    });
  }

  return lines;
}

/** 1つでも取っているか。画面の「未設定」を出し分けるのに使う */
export function hasAnyTalent(state: TalentState | undefined): boolean {
  return summarizeTalents(state).length > 0;
}
