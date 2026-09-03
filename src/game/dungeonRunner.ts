import { scaledEnemyAtk } from "../battle/enemyPower.js";
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
  /**
   * 敵の速度に掛かる倍率。省略時は1(据え置き)。
   * **速度は手番の数に直結する**ので、HPや攻撃力と同じ倍率で伸ばすと
   * 一方的に殴られる展開になる。階層ごとに別のカーブを持たせている。
   */
  speedScale?: number;
}

function defFromDungeonEnemy(enemy: DungeonEnemy, powerScale: number, speedScale: number): MonsterDefinition {
  const dex = resolveDex(`${enemy.templateId}_${enemy.element}`);
  const base = computeEffectiveStats(dex.stats, enemy.star, enemy.level);
  const scaledStats = {
    ...base,
    // hpMultiplier / spdMultiplier は個体単位の補正。powerScale が階層全体に掛かるのに対し、
    // こちらはボス1体だけを分厚くしたり手番を早めたりするために使う
    hp: Math.round(base.hp * powerScale * (enemy.hpMultiplier ?? 1)),
    atk: scaledEnemyAtk(base.atk * powerScale),
    def: Math.round(base.def * powerScale),
    spd: Math.round(base.spd * (enemy.spdMultiplier ?? 1) * speedScale),
  };
  const stats = enemy.fixedStats ? { ...base, ...enemy.fixedStats } : scaledStats;
  return {
    ...dex,
    id: `${dex.id}_dungeon`,
    name: `${dex.name}★${enemy.star} Lv${enemy.level}${enemy.isBoss ? " 【BOSS】" : ""}`,
    stats,
    victoryTarget: enemy.victoryTarget,
    primaryTarget: enemy.primaryTarget,
    initialCooldowns: enemy.initialCooldowns,
  };
}

export function buildDungeonEnemyTeam(floor: DungeonLikeFloor): MonsterDefinition[] {
  return floor.enemies.map((enemy) => defFromDungeonEnemy(enemy, floor.powerScale, floor.speedScale ?? 1));
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
