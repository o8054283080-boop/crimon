import { BattleEngine } from "../battle/engine.js";
import { Equipment } from "../core/equipment.js";
import { MonsterDefinition } from "../core/monster.js";
import { MonsterInstance, resolveEquippedItems, toBattleDefinition } from "../core/monsterInstance.js";
import { computeEffectiveStats } from "../core/rarity.js";
import { Wave, WaveEnemy } from "../data/stages.js";
import { findMonsterById } from "../data/monsters.js";

function resolveDex(dexId: string): MonsterDefinition {
  const dex = findMonsterById(dexId);
  if (!dex) throw new Error(`図鑑に存在しないモンスターです: ${dexId}`);
  return dex;
}

function defFromWaveEnemy(enemy: WaveEnemy, powerScale: number): MonsterDefinition {
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
    id: `${dex.id}_wave`,
    name: `${dex.name}★${enemy.star} Lv${enemy.level}${enemy.isBoss ? " 【BOSS】" : ""}`,
    stats,
  };
}

export function buildEnemyTeam(wave: Wave): MonsterDefinition[] {
  return wave.enemies.map((enemy) => defFromWaveEnemy(enemy, wave.powerScale));
}

export interface WaveBattleSetup {
  playerDefs: MonsterDefinition[];
  enemyDefs: MonsterDefinition[];
  initialPlayerHp: number[] | undefined;
}

/**
 * partyInstances は現在生存しているパーティメンバー(このウェーブに参加する順)。
 * carryHp が渡された場合、そのインスタンスIDに対応する残りHPを引き継いで開始する。
 */
export function setupWaveBattle(
  partyInstances: MonsterInstance[],
  carryHp: Map<string, number> | null,
  wave: Wave,
  allEquipment: Equipment[] = [],
): WaveBattleSetup {
  const playerDefs = partyInstances.map((instance) =>
    toBattleDefinition(instance, resolveDex(instance.dexId), resolveEquippedItems(instance, allEquipment)),
  );
  const enemyDefs = buildEnemyTeam(wave);
  const initialPlayerHp = carryHp
    ? partyInstances.map((instance, i) => carryHp.get(instance.id) ?? playerDefs[i].stats.hp)
    : undefined;

  return { playerDefs, enemyDefs, initialPlayerHp };
}

export interface WaveSurvivors {
  survivorInstances: MonsterInstance[];
  survivorHp: Map<string, number>;
}

/** バトル終了後、パーティ側の生存者と残りHPを取り出す(次ウェーブへの持ち越し用) */
export function extractSurvivors(engine: BattleEngine, partyInstances: MonsterInstance[]): WaveSurvivors {
  const units = engine.getUnits();
  const survivorInstances: MonsterInstance[] = [];
  const survivorHp = new Map<string, number>();

  partyInstances.forEach((instance, i) => {
    const unit = units[i];
    if (unit && unit.alive) {
      survivorInstances.push(instance);
      survivorHp.set(instance.id, unit.currentHp);
    }
  });

  return { survivorInstances, survivorHp };
}
