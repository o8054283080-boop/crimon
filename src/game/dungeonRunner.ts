import { Equipment } from "../core/equipment.js";
import { MonsterDefinition } from "../core/monster.js";
import { MonsterInstance, resolveEquippedItems, toBattleDefinition } from "../core/monsterInstance.js";
import { computeEffectiveStats } from "../core/rarity.js";
import { DungeonFloor } from "../data/equipmentDungeon.js";
import { resolveDex } from "./stageRunner.js";

function defFromDungeonEnemy(enemy: DungeonFloor["enemies"][number], powerScale: number): MonsterDefinition {
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
    name: `${dex.name}★${enemy.star} Lv${enemy.level}`,
    stats,
  };
}

export function buildDungeonEnemyTeam(floor: DungeonFloor): MonsterDefinition[] {
  return floor.enemies.map((enemy) => defFromDungeonEnemy(enemy, floor.powerScale));
}

export interface DungeonBattleSetup {
  playerDefs: MonsterDefinition[];
  enemyDefs: MonsterDefinition[];
}

/** 装備ダンジョンは持ち越しHPなし・単発バトルで、常に全回復状態から挑戦する */
export function setupDungeonBattle(
  partyInstances: MonsterInstance[],
  floor: DungeonFloor,
  allEquipment: Equipment[] = [],
): DungeonBattleSetup {
  const playerDefs = partyInstances.map((instance) =>
    toBattleDefinition(instance, resolveDex(instance.dexId), resolveEquippedItems(instance, allEquipment)),
  );
  const enemyDefs = buildDungeonEnemyTeam(floor);
  return { playerDefs, enemyDefs };
}
