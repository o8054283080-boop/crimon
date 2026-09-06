import type { MonsterInstance } from "../core/monsterInstance.js";
import { skillTags } from "../core/skillTags.js";
import type { Skill } from "../core/skill.js";
import {
  BASIC_TALENT_BY_LINE, BATTLE_TALENT_BY_LINE, SKILL_AWAKENING_POINT_COST, SKILL_AWAKENING_STONE_COST,
  TALENT_POINT_CAP, TALENT_RESET_GOLD_COST, TALENT_UNLOCK_STAR,
  createDefaultTalentState, nextTalentUnlockCost, remainingTalentPoints,
  type BasicTalentLine, type BattleTalentLine, type InitialRarity, type TalentState, type TalentTier,
} from "../core/talents.js";
import {
  availableSkillAwakenings, availableSkillTalents, findSkillTalent, isSkillTalentApplicable, skillTalentCost,
} from "../core/talentSkills.js";
import { initialRarityOfDexId } from "../data/initialRarity.js";
import type { PlayerState } from "./playerState.js";

/**
 * 才能覚醒の操作。**素材とゴールドに触るのはここだけ。**
 *
 * `core/talents.ts` は「才能とは何か」を定義するだけで、
 * 持ち物のことは知らない。ここが両者をつなぐ。
 */

export type TalentActionResult =
  | { ok: true }
  | { ok: false; reason: string };

const fail = (reason: string): TalentActionResult => ({ ok: false, reason });

/** その個体の才能覚醒。**無ければその場で作る**(旧セーブの取りこぼし避け) */
export function talentsOf(monster: MonsterInstance): TalentState {
  if (!monster.development.talents) monster.development.talents = createDefaultTalentState();
  return monster.development.talents;
}

/** その個体の初期レアリティ */
export function initialRarityOf(monster: MonsterInstance): InitialRarity {
  return initialRarityOfDexId(monster.dexId);
}

/** その個体の才能pt上限 */
export function talentPointCapOf(monster: MonsterInstance): number {
  return TALENT_POINT_CAP[initialRarityOf(monster)];
}

/** 才能覚醒を開けるか。**★6に届いていること** */
export function isTalentUnlocked(monster: MonsterInstance): boolean {
  return monster.star >= TALENT_UNLOCK_STAR;
}

/** 残りの才能pt */
export function remainingPointsOf(monster: MonsterInstance): number {
  return remainingTalentPoints(talentsOf(monster), skillTalentCost);
}

/* ==========================================================================
 * 素材で才能ptを解放する
 * ========================================================================== */

/** 次の1ptに要る素材。上限まで解放済みなら null */
export function nextUnlockCostOf(monster: MonsterInstance): { shards: number; crystals: number } | null {
  return nextTalentUnlockCost(initialRarityOf(monster), talentsOf(monster).unlockedPoints);
}

/**
 * 素材を払って才能ptを1つ解放する。
 *
 * **★6でなければ解放もできない。**素材そのものは★6前から貯められるので、
 * 「集めておいて、★6にした瞬間に一気に開ける」という遊び方になる。
 */
export function unlockTalentPoint(state: PlayerState, monster: MonsterInstance): TalentActionResult {
  if (!isTalentUnlocked(monster)) return fail("才能覚醒は★6で解放されます");
  const cost = nextUnlockCostOf(monster);
  if (!cost) return fail("これ以上は解放できません");
  if ((state.awakeningShards ?? 0) < cost.shards) return fail("目覚の欠片が足りません");
  if ((state.awakeningCrystals ?? 0) < cost.crystals) return fail("目覚の結晶が足りません");
  state.awakeningShards = (state.awakeningShards ?? 0) - cost.shards;
  state.awakeningCrystals = (state.awakeningCrystals ?? 0) - cost.crystals;
  talentsOf(monster).unlockedPoints += 1;
  return { ok: true };
}

/* ==========================================================================
 * 基礎才能・戦闘才能を取る
 * ========================================================================== */

/** その系統を1段上げる。**IIはIを、IIIはIIを取ってから** */
export function takeBasicTalent(monster: MonsterInstance, line: BasicTalentLine): TalentActionResult {
  const def = BASIC_TALENT_BY_LINE.get(line);
  if (!def) return fail("その才能はありません");
  return takeTiered(monster, def.steps.map((s) => s.cost), talentsOf(monster).basic, line);
}

export function takeBattleTalent(monster: MonsterInstance, line: BattleTalentLine): TalentActionResult {
  const def = BATTLE_TALENT_BY_LINE.get(line);
  if (!def) return fail("その才能はありません");
  return takeTiered(monster, def.steps.map((s) => s.cost), talentsOf(monster).battle, line);
}

function takeTiered(
  monster: MonsterInstance,
  costs: number[],
  bucket: Partial<Record<string, TalentTier>>,
  line: string,
): TalentActionResult {
  if (!isTalentUnlocked(monster)) return fail("才能覚醒は★6で解放されます");
  const current = bucket[line] ?? 0;
  if (current >= 3) return fail("すでに最大まで取得しています");
  const cost = costs[current];
  if (remainingPointsOf(monster) < cost) return fail("才能ptが足りません");
  bucket[line] = (current + 1) as TalentTier;
  return { ok: true };
}

/* ==========================================================================
 * スキル才能
 * ========================================================================== */

/** スキル2(=slot 1) / スキル3(=slot 2) の枠番号 */
export type SkillTalentSlot = 1 | 2;

/**
 * その枠に今入っている技から、付けられる才能を並べる。
 *
 * **戦闘用の定義から札を出す。**継承で入れ替わった技もそのまま反映される
 * (`toBattleDefinition` の結果を渡す約束)。
 */
export function skillTalentCandidates(skill: Skill) {
  return availableSkillTalents(skillTags(skill));
}

export function skillAwakeningCandidates(skill: Skill) {
  return availableSkillAwakenings(skillTags(skill));
}

/** スキル才能を1つ取る */
export function takeSkillTalent(
  monster: MonsterInstance, slot: SkillTalentSlot, id: string, skill: Skill,
): TalentActionResult {
  if (!isTalentUnlocked(monster)) return fail("才能覚醒は★6で解放されます");
  const def = findSkillTalent(id);
  if (!def || def.awakening) return fail("その才能はありません");
  const talents = talentsOf(monster);
  if (talents.skill[slot].includes(id)) return fail("すでに取得しています");
  if (!isSkillTalentApplicable(id, skillTags(skill))) return fail("今のスキルには付けられません");
  if (remainingPointsOf(monster) < def.cost) return fail("才能ptが足りません");
  talents.skill[slot].push(id);
  return { ok: true };
}

/**
 * スキル覚醒を1つ取る。**1体につき1つだけ。**
 *
 * 8ptに加えて目覚の奇石3個を払う。奇石は深域7階から
 * ごく低い確率でしか落ちないので、**どれを選ぶかを本気で悩む**位置にある。
 */
export function takeSkillAwakening(
  state: PlayerState, monster: MonsterInstance, slot: SkillTalentSlot, id: string, skill: Skill,
): TalentActionResult {
  if (!isTalentUnlocked(monster)) return fail("才能覚醒は★6で解放されます");
  const def = findSkillTalent(id);
  if (!def || !def.awakening) return fail("そのスキル覚醒はありません");
  const talents = talentsOf(monster);
  if (talents.awakening) return fail("スキル覚醒は1体につき1つまでです");
  if (!isSkillTalentApplicable(id, skillTags(skill))) return fail("今のスキルには付けられません");
  if (remainingPointsOf(monster) < SKILL_AWAKENING_POINT_COST) return fail("才能ptが足りません");
  if ((state.awakeningStones ?? 0) < SKILL_AWAKENING_STONE_COST) return fail("目覚の奇石が足りません");
  state.awakeningStones = (state.awakeningStones ?? 0) - SKILL_AWAKENING_STONE_COST;
  talents.awakening = { slot, id };
  return { ok: true };
}

/* ==========================================================================
 * 振り直し
 * ========================================================================== */

/**
 * 取得した才能だけを白紙に戻す。**解放済みptは失わない。**
 *
 * 素材で買ったものまで戻すと、振り直しが「やり直し」ではなく
 * 「買い直し」になる。ここで取るのは配り方を変える代金だけ。
 *
 * **スキル覚醒に払った奇石も返さない。**選び直せるようにはするが、
 * 3個そのものは戻らない——奇石は選択の重さそのものなので、
 * 無料で選び直せると「どれでも試せるもの」になってしまう。
 */
export function resetTalents(state: PlayerState, monster: MonsterInstance): TalentActionResult {
  if (!isTalentUnlocked(monster)) return fail("才能覚醒は★6で解放されます");
  const talents = talentsOf(monster);
  const hasAny = Object.keys(talents.basic).length > 0 || Object.keys(talents.battle).length > 0
    || talents.skill[1].length > 0 || talents.skill[2].length > 0 || talents.awakening !== null;
  if (!hasAny) return fail("振り直す才能がありません");
  if (state.gold < TALENT_RESET_GOLD_COST) return fail("ゴールドが足りません");
  state.gold -= TALENT_RESET_GOLD_COST;
  talents.basic = {};
  talents.battle = {};
  talents.skill = { 1: [], 2: [] };
  talents.awakening = null;
  return { ok: true };
}

/* ==========================================================================
 * 継承で技が変わった時の後始末
 * ========================================================================== */

export interface TalentReconcileResult {
  /** 外した才能の名前。画面で知らせるために返す */
  removed: string[];
  /** 戻ったpt */
  refunded: number;
}

/**
 * 今の技に付けられなくなった才能を外し、ptを未使用へ戻す。
 *
 * クリエイト(継承)で枠の中身が入れ替わると、
 * **攻撃技に付けていた「回復強化」がそのまま残る**ことになる。
 * 効果としては何も起きないが、ptだけを取られ続けるのは取り上げと同じ。
 *
 * ptは `unlockedPoints` を減らさないので、外した瞬間に
 * そのまま別の才能へ振り直せる(振り直し代も要らない)。
 */
export function reconcileSkillTalents(
  monster: MonsterInstance, skills: readonly [Skill, Skill, Skill],
): TalentReconcileResult {
  const talents = talentsOf(monster);
  const removed: string[] = [];
  let refunded = 0;
  for (const slot of [1, 2] as const) {
    const tags = skillTags(skills[slot]);
    const kept: string[] = [];
    for (const id of talents.skill[slot]) {
      if (isSkillTalentApplicable(id, tags)) {
        kept.push(id);
        continue;
      }
      removed.push(findSkillTalent(id)?.name ?? id);
      refunded += skillTalentCost(id);
    }
    talents.skill[slot] = kept;
  }
  const awakening = talents.awakening;
  if (awakening && !isSkillTalentApplicable(awakening.id, skillTags(skills[awakening.slot]))) {
    removed.push(findSkillTalent(awakening.id)?.name ?? awakening.id);
    refunded += SKILL_AWAKENING_POINT_COST;
    talents.awakening = null;
  }
  return { removed, refunded };
}
