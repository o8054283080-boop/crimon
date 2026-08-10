import { MonsterDefinition } from "./monster.js";
import { Star, computeEffectiveStats, requiredExpForLevel } from "./rarity.js";

/** プレイヤーが実際に所持しているモンスター1体分のデータ */
export interface MonsterInstance {
  id: string;
  dexId: string; // MonsterDefinition.id (テンプレートID_属性)
  star: Star;
  level: number;
  exp: number;
}

let instanceCounter = 0;

function generateInstanceId(): string {
  instanceCounter += 1;
  return `mon_${Date.now().toString(36)}_${instanceCounter}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function createMonsterInstance(dexId: string, star: Star, level = 1): MonsterInstance {
  return { id: generateInstanceId(), dexId, star, level, exp: 0 };
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

/** MonsterInstance + 図鑑データから、バトルエンジンに渡せる実効ステータス付きの定義を作る */
export function toBattleDefinition(instance: MonsterInstance, dex: MonsterDefinition): MonsterDefinition {
  const stats = computeEffectiveStats(dex.stats, instance.star, instance.level);
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
