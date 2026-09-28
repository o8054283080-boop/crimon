import { CreatedSkill, MonsterInstance, createdSkillsOf, writeCreatedSkills } from "../core/monsterInstance.js";
import { Skill } from "../core/skill.js";
import { findMonsterById } from "../data/monsters.js";
import { CRIM_MATERIAL_REFUSAL, isCrim } from "./crim.js";

/**
 * クリエイト(スキル合成)。
 *
 * このゲームの名前の由来でもある、**自分のモンスターを作り替える**仕組み。
 * 星6まで育てた別のモンスターを素材にすると、その素材のスキル2または3を、
 * 対象の同じ枠へ移し替えられる。
 *
 * 設計で決めたこと:
 *
 * - **素材は星6でなければならない。** 移し替えは編成の幅を大きく広げるので、
 *   1体を最後まで育てる覚悟と釣り合わせる
 * - **素材は消滅する。** 星6を1体失うから、何を犠牲にするかの選択が生まれる
 * - **移し替えはスキル2・スキル3の枠ごとに1つずつ持てる。** 同じ枠へ合成した時だけ置き換わる。
 *   以前は1体に1つだけで、スキル3を移した後にスキル2を移すとスキル3が元に戻っていた。
 *   依頼主の構想は「両方とも変わる」だったので改めた(2026-09-28)
 * - **枠は動かせない**(スキル2はスキル2へ、スキル3はスキル3へ)。
 *   長いクールタイム前提の必殺技をスキル2の枠へ持ってくると、
 *   バランスが根本から壊れる
 */

/** 移し替えられる枠。0(通常攻撃)は対象外 */
export type CreateSlot = 1 | 2;

export const CREATE_SLOTS: CreateSlot[] = [1, 2];

/** 素材に要求する星。ここを下げると仕組み全体の重みが失われる */
export const CREATE_MATERIAL_STAR = 6;

/**
 * スキルを移し替える費用。
 *
 * **モンスターの★では変えない**(依頼主の指定)。素材は★6と決まっているので、
 * 移し先の★で値段を変えると「安いうちに移しておく」だけの遊びになる。
 * 一律にすれば、いつ移しても同じ重さの決断になる。
 */
export const CREATE_GOLD_COST = 500_000;

export interface CreateCheck {
  ok: boolean;
  reason?: string;
}

/**
 * 合成できるかを判定する。
 *
 * **失敗の理由は必ず言葉で返す。** 押せないボタンだけを出すと、
 * 何を満たせばよいのかが分からない。
 */
export function checkMonsterCreate(
  target: MonsterInstance,
  material: MonsterInstance,
  partyIds: readonly string[],
  dungeonPartyIds: readonly string[] = [],
): CreateCheck {
  if (target.id === material.id) {
    return { ok: false, reason: "同じモンスターは素材にできません" };
  }
  /*
   * **クリムは移し元にできない。**
   *
   * クリエイトは素材を消費する。スキルを1つ譲る代わりに本体が消えるので、
   * ここも消失の経路。クリムを**移し先**にするのは自由で、
   * 他のモンスターからスキルを受け取れる。
   */
  if (isCrim(material)) {
    return { ok: false, reason: CRIM_MATERIAL_REFUSAL };
  }
  if (material.star < CREATE_MATERIAL_STAR) {
    return { ok: false, reason: `素材は星${CREATE_MATERIAL_STAR}まで育てる必要があります` };
  }
  if (partyIds.includes(material.id) || dungeonPartyIds.includes(material.id)) {
    return { ok: false, reason: "編成中のモンスターは素材にできません" };
  }
  const materialDex = findMonsterById(material.dexId);
  if (!materialDex) {
    return { ok: false, reason: "素材のデータが見つかりません" };
  }
  return { ok: true };
}

/**
 * 素材が提供できるスキル(枠と中身)。UIの選択肢に使う。
 *
 * **パッシブは移し元に出さない。** 常時効いている効果や、決まった出来事で
 * 自動発動する効果は、別の種族へ持って行くと前提ごと崩れる
 * (「敵が毒ダメージを受けるたび」を毒を1つも持たない編成へ渡しても
 * 何も起きない枠になるだけ)。
 *
 * 逆向きは許す。**パッシブが入っている枠へ、別の継承できるスキルを移すのは可能。**
 * こちらは枠の中身が置き換わるだけなので、`applyMonsterCreate` は何も禁じない。
 */
export function creatableSkills(material: MonsterInstance): { slot: CreateSlot; skill: Skill }[] {
  const dex = findMonsterById(material.dexId);
  if (!dex) return [];
  return CREATE_SLOTS.map((slot) => ({ slot, skill: dex.skills[slot] })).filter(({ skill }) => !skill.passive);
}

/** いま対象に入っているスキル(移し替え済みなら、その中身) */
export function currentSkillOf(target: MonsterInstance, slot: CreateSlot): Skill | undefined {
  const dex = findMonsterById(target.dexId);
  if (!dex) return undefined;
  const created = createdSkillsOf(target).find((c) => c.slot === slot);
  if (created) {
    // 移し替え済みの枠は、元のスキルではなく移した側を返す
    const source = findMonsterById(created.sourceDexId);
    return source?.skills.find((s) => s.id === created.skillId) ?? dex.skills[slot];
  }
  return dex.skills[slot];
}

export interface CreateResult {
  ok: boolean;
  reason?: string;
  /** 実際に適用された移し替え */
  created?: CreatedSkill;
  /** 置き換わって失われた、**同じ枠の**直前の移し替え(別の枠の移し替えは残る) */
  replaced?: CreatedSkill;
}

/**
 * 合成を実行する。**素材は呼び出し側で手持ちから取り除くこと。**
 * ここでは対象の書き換えだけを行い、所持リストには触らない
 * (取り除きの手順は playerState 側に集約されているため)。
 */
export function applyMonsterCreate(
  target: MonsterInstance,
  material: MonsterInstance,
  slot: CreateSlot,
  partyIds: readonly string[],
  dungeonPartyIds: readonly string[] = [],
  /**
   * 支払い先。**渡さない呼び出しは無料のまま**にしてある——
   * 道具やテストから「費用の話ぬきで移し替えだけ試す」道を残すため。
   * 画面からは必ず渡すこと。
   */
  wallet?: { gold: number },
): CreateResult {
  const check = checkMonsterCreate(target, material, partyIds, dungeonPartyIds);
  if (!check.ok) return { ok: false, reason: check.reason };
  if (wallet && wallet.gold < CREATE_GOLD_COST) {
    return { ok: false, reason: `ゴールドが足りません（${CREATE_GOLD_COST.toLocaleString("ja-JP")}G 必要）` };
  }

  const materialDex = findMonsterById(material.dexId);
  const skill = materialDex?.skills[slot];
  if (!skill) return { ok: false, reason: "素材のスキルが見つかりません" };
  if (skill.passive) return { ok: false, reason: "パッシブスキルは移し替えの元にできません" };

  if (currentSkillOf(target, slot)?.id === skill.id) {
    return { ok: false, reason: "同じスキルなので、移し替える意味がありません" };
  }

  /*
   * **払うのは、断る理由が全部消えてから。**
   * 上の検査より先に引くと、「同じスキルなので意味がありません」で
   * 弾かれた時にもゴールドだけ減る。
   */
  if (wallet) wallet.gold -= CREATE_GOLD_COST;

  // **同じ枠だけを置き換える。**別の枠の移し替えは残す
  const others = createdSkillsOf(target).filter((c) => c.slot !== slot);
  const replaced = createdSkillsOf(target).find((c) => c.slot === slot);
  const created: CreatedSkill = { slot, skillId: skill.id, sourceDexId: material.dexId };
  writeCreatedSkills(target, [...others, created]);
  return { ok: true, created, replaced };
}

/**
 * 移し替えを取り消して、元のスキルへ戻す。
 * `slot` を渡すとその枠だけ、渡さなければ全部。
 */
export function clearMonsterCreate(target: MonsterInstance, slot?: CreateSlot): boolean {
  const all = createdSkillsOf(target);
  const kept = slot === undefined ? [] : all.filter((c) => c.slot !== slot);
  if (kept.length === all.length) return false;
  writeCreatedSkills(target, kept);
  return true;
}

/** 移し替えを持っているか */
export function hasCreatedSkill(target: MonsterInstance): boolean {
  return createdSkillsOf(target).length > 0;
}

/** 表示用。どのモンスターから何を移したかを1行で表す */
export function describeCreatedSkill(created: CreatedSkill): string {
  const source = findMonsterById(created.sourceDexId);
  const skill = source?.skills.find((s) => s.id === created.skillId);
  const slotLabel = created.slot === 1 ? "スキル2" : "スキル3";
  if (!source || !skill) return `${slotLabel}を移し替え済み`;
  return `${slotLabel}: ${skill.name}(${source.name} から)`;
}
