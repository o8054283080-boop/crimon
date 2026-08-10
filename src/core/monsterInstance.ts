import { Equipment, EquipSlot, applyEquipmentToStats, computeSetCombatModifiers } from "./equipment.js";
import { MonsterDefinition } from "./monster.js";
import { Star, computeEffectiveStats, requiredExpForLevel } from "./rarity.js";
import { MAX_SKILL_LEVEL, computeLeveledSkill } from "./skill.js";

/** プレイヤーが実際に所持しているモンスター1体分のデータ */
export interface MonsterInstance {
  id: string;
  dexId: string; // MonsterDefinition.id (テンプレートID_属性)
  star: Star;
  level: number;
  exp: number;
  /** スロット番号 → 装着中の装備ID */
  equipment: Partial<Record<EquipSlot, string>>;
  /** スキル1〜3それぞれのレベル(1〜5) */
  skillLevels: [number, number, number];
}

let instanceCounter = 0;

function generateInstanceId(): string {
  instanceCounter += 1;
  return `mon_${Date.now().toString(36)}_${instanceCounter}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function createMonsterInstance(dexId: string, star: Star, level = 1): MonsterInstance {
  return { id: generateInstanceId(), dexId, star, level, exp: 0, equipment: {}, skillLevels: [1, 1, 1] };
}

/** 全スキルが最大レベルに達しているか */
export function isSkillMaxLevel(instance: MonsterInstance): boolean {
  return instance.skillLevels.every((lvl) => lvl >= MAX_SKILL_LEVEL);
}

/**
 * スキルレベルをランダムに1つ、まだ最大に達していないものから選んで1レベル上げる。
 * 上げられるスキルがなければ何もせず-1を返す。上げたスキルのindex(0-2)を返す。
 */
export function rollSkillLevelUp(instance: MonsterInstance, rng: () => number = Math.random): number {
  const eligibleIndices = instance.skillLevels
    .map((lvl, i) => (lvl < MAX_SKILL_LEVEL ? i : -1))
    .filter((i) => i >= 0);
  if (eligibleIndices.length === 0) return -1;
  const index = eligibleIndices[Math.floor(rng() * eligibleIndices.length)];
  instance.skillLevels[index] += 1;
  return index;
}

/** 経験値を加算し、可能な限りレベルアップさせる。実際に上がったレベル数を返す */
export function addExp(instance: MonsterInstance, exp: number, maxLevel: number): number {
  if (instance.level >= maxLevel) return 0;
  instance.exp += exp;
  let levelsGained = 0;
  while (instance.level < maxLevel && instance.exp >= requiredExpForLevel(instance.level)) {
    instance.exp -= requiredExpForLevel(instance.level);
    instance.level += 1;
    levelsGained += 1;
  }
  if (instance.level >= maxLevel) {
    instance.level = maxLevel;
    instance.exp = 0;
  }
  return levelsGained;
}

/** そのインスタンスが装着している装備の実体を、渡された装備リストから解決する */
export function resolveEquippedItems(instance: MonsterInstance, allEquipment: Equipment[]): Equipment[] {
  const equippedIds = new Set(Object.values(instance.equipment));
  return allEquipment.filter((eq) => equippedIds.has(eq.id));
}

/** MonsterInstance + 図鑑データ(+装備)から、バトルエンジンに渡せる実効ステータス付きの定義を作る */
export function toBattleDefinition(
  instance: MonsterInstance,
  dex: MonsterDefinition,
  equippedItems: Equipment[] = [],
): MonsterDefinition {
  const growthStats = computeEffectiveStats(dex.stats, instance.star, instance.level);
  const stats = equippedItems.length > 0 ? applyEquipmentToStats(growthStats, equippedItems) : growthStats;
  const combatMods = equippedItems.length > 0 ? computeSetCombatModifiers(equippedItems) : undefined;
  const skills = dex.skills.map((skill, i) => computeLeveledSkill(skill, instance.skillLevels[i])) as [
    MonsterDefinition["skills"][0],
    MonsterDefinition["skills"][1],
    MonsterDefinition["skills"][2],
  ];
  return {
    ...dex,
    id: instance.id,
    name: `${dex.name}★${instance.star} Lv${instance.level}`,
    stats,
    skills,
    combatMods,
  };
}

export function starLabel(star: Star): string {
  return "★".repeat(star);
}
