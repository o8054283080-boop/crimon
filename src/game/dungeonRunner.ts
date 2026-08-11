import { Equipment } from "../core/equipment.js";
import { MonsterDefinition } from "../core/monster.js";
import { MonsterInstance, resolveEquippedItems, toBattleDefinition } from "../core/monsterInstance.js";
import { computeEffectiveStats } from "../core/rarity.js";
import { DungeonEnemy } from "../data/equipmentDungeon.js";
import { resolveDex } from "./stageRunner.js";

/** 装備ダンジョン・レベル上げダンジョンなど、敵編成+難易度倍率だけを持つ「階層」共通の形 */
export interface DungeonLikeFloor {
  enemies: DungeonEnemy[];
  /** 敵の実効ステータスに掛かる倍率 */
  powerScale: number;
}

function defFromDungeonEnemy(enemy: DungeonEnemy, powerScale: number): MonsterDefinition {
  const dex = resolveDex(`${enemy.templateId}_${enemy.element}`);
  const base = computeEffectiveStats(dex.stats, enemy.star, enemy.level);
  const stats = {
    ...base,
    hp: Math.round(base.hp * powerScale),
    atk: Math.round(base.atk * powerScale),
    def: Math.round(base.def * powerScale),
  };
  return {
    ...dex,
    id: `${dex.id}_dungeon`,
    name: `${dex.name}★${enemy.star} Lv${enemy.level}${enemy.isBoss ? " 【BOSS】" : ""}`,
    stats,
  };
}

export function buildDungeonEnemyTeam(floor: DungeonLikeFloor): MonsterDefinition[] {
  return floor.enemies.map((enemy) => defFromDungeonEnemy(enemy, floor.powerScale));
}

export interface DungeonBattleSetup {
  playerDefs: MonsterDefinition[];
  enemyDefs: MonsterDefinition[];
}

/** 装備ダンジョン・レベル上げダンジョン共通: 持ち越しHPなし・単発バトルで、常に全回復状態から挑戦する */
export function setupDungeonBattle(
  partyInstances: MonsterInstance[],
  floor: DungeonLikeFloor,
  allEquipment: Equipment[] = [],
): DungeonBattleSetup {
  const playerDefs = partyInstances.map((instance) =>
    toBattleDefinition(instance, resolveDex(instance.dexId), resolveEquippedItems(instance, allEquipment)),
  );
  const enemyDefs = buildDungeonEnemyTeam(floor);
  return { playerDefs, enemyDefs };
}
