import { Equipment, EquipSlot, applyEquipmentToStats } from "./equipment.js";
import { MonsterDefinition } from "./monster.js";
import { Star, computeEffectiveStats, requiredExpForLevel } from "./rarity.js";

/** プレイヤーが実際に所持しているモンスター1体分のデータ */
export interface MonsterInstance {
  id: string;
  dexId: string; // MonsterDefinition.id (テンプレートID_属性)
  star: Star;
  level: number;
  exp: number;
  /** スロット番号 → 装着中の装備ID */
  equipment: Partial<Record<EquipSlot, string>>;
}

let instanceCounter = 0;

function generateInstanceId(): string {
  instanceCounter += 1;
  return `mon_${Date.now().toString(36)}_${instanceCounter}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function createMonsterInstance(dexId: string, star: Star, level = 1): MonsterInstance {
  return { id: generateInstanceId(), dexId, star, level, exp: 0, equipment: {} };
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
  return {
    ...dex,
    id: instance.id,
    name: `${dex.name}★${instance.star} Lv${instance.level}`,
    stats,
  };
}

export function starLabel(star: Star): string {
  return "★".repeat(star);
}
