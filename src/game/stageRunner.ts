import { scaledEnemyAtk } from "../battle/enemyPower.js";
import { BattleEngine } from "../battle/engine.js";
import { Equipment } from "../core/equipment.js";
import { MonsterDefinition } from "../core/monster.js";
import { MonsterInstance, resolveEquippedItems, toBattleDefinition } from "../core/monsterInstance.js";
import { Star, STAR_MAX_LEVEL, computeEffectiveStats } from "../core/rarity.js";
import { Difficulty, DIFFICULTY_MODIFIERS, Wave, WaveEnemy } from "../data/stages.js";
import { findMonsterById } from "../data/monsters.js";

export function resolveDex(dexId: string): MonsterDefinition {
  const dex = findMonsterById(dexId);
  if (!dex) throw new Error(`図鑑に存在しないモンスターです: ${dexId}`);
  return dex;
}

/** 難易度に応じて敵の星・レベルを底上げする(星は6でクランプ、レベルは新しい星の最大レベルでクランプ) */
function applyDifficultyToEnemy(enemy: WaveEnemy, difficulty: Difficulty): WaveEnemy {
  const mod = DIFFICULTY_MODIFIERS[difficulty];
  if (mod.starBonus === 0 && mod.levelBonus === 0) return enemy;
  const star = Math.min(6, enemy.star + mod.starBonus) as Star;
  const level = Math.min(enemy.level + mod.levelBonus, STAR_MAX_LEVEL[star]);
  return { ...enemy, star, level };
}

function defFromWaveEnemy(
  enemy: WaveEnemy,
  powerScale: number,
  speedScale: number,
  difficulty: Difficulty,
): MonsterDefinition {
  const dex = resolveDex(`${enemy.templateId}_${enemy.element}`);
  const base = computeEffectiveStats(dex.stats, enemy.star, enemy.level);
  const difficultySpeed = DIFFICULTY_MODIFIERS[difficulty].speedScaleMultiplier;
  // ボスのspeedOverrideはNORMAL時の最終実効速度。通常敵だけウェーブの速度カーブを使う。
  const normalSpeed = enemy.speedOverride ?? base.spd * speedScale;
  const stats = {
    ...base,
    hp: Math.round(base.hp * powerScale),
    atk: scaledEnemyAtk(base.atk * powerScale),
    def: Math.round(base.def * powerScale),
    spd: Math.round(normalSpeed * difficultySpeed),
  };

  const counterAfterHits = enemy.bossCounterAfterHits?.[difficulty];
  const bossTraits = counterAfterHits
    ? { ...dex.bossTraits, counterAfterHits, counterMultiplier: dex.bossTraits?.counterMultiplier ?? 1.4 }
    : dex.bossTraits;

  return {
    ...dex,
    id: `${dex.id}_wave`,
    name: `${enemy.displayName ?? dex.name}★${enemy.star} Lv${enemy.level}${enemy.isBoss ? " 【BOSS】" : ""}`,
    stats,
    bossTraits,
  };
}

export function buildEnemyTeam(wave: Wave, difficulty: Difficulty = "NORMAL"): MonsterDefinition[] {
  const mod = DIFFICULTY_MODIFIERS[difficulty];
  const powerScale = wave.powerScale * mod.powerScaleMultiplier;
  return wave.enemies.map((enemy) =>
    defFromWaveEnemy(applyDifficultyToEnemy(enemy, difficulty), powerScale, wave.speedScale, difficulty),
  );
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
  difficulty: Difficulty = "NORMAL",
): WaveBattleSetup {
  const playerDefs = partyInstances.map((instance) =>
    toBattleDefinition(instance, resolveDex(instance.dexId), resolveEquippedItems(instance, allEquipment)),
  );
  const enemyDefs = buildEnemyTeam(wave, difficulty);
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
