import { MonsterInstance, addExp } from "../core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../core/rarity.js";
import { Equipment } from "../core/equipment.js";
import { DungeonFloor, rollDungeonEquipment, rollDungeonReincarnationPig, rollDungeonSummonScroll } from "../data/equipmentDungeon.js";
import { GoldDungeonFloor } from "../data/goldDungeon.js";
import { LevelDungeonDef } from "../data/levelDungeon.js";
import { EXP_PIG_DEX, findMonsterById } from "../data/monsters.js";
import { Difficulty, Stage, StageDrop, rollStageDrop, rollStageEquipment, rollStageReincarnationPig, rollStageSummonScroll } from "../data/stages.js";
import {
  FIRST_CLEAR_CRYSTAL_REWARD,
  REPEAT_CLEAR_CRYSTAL_CHANCE,
  REPEAT_CLEAR_CRYSTAL_REWARD,
  PlayerState,
  addEquipment,
  addFighterExp,
  addMonster,
  addSummonScrolls,
  isDungeonFloorCleared,
  isLevelDungeonTierCleared,
  isStageCleared,
  markDungeonFloorCleared,
  markLevelDungeonTierCleared,
  markStageCleared,
} from "./playerState.js";

/** 初回クリアはダイヤ200確定。2回目以降は3%の確率でダイヤ50がもらえる */
function rollClearCrystal(isFirstClear: boolean, rng: () => number): number {
  if (isFirstClear) return FIRST_CLEAR_CRYSTAL_REWARD;
  return rng() < REPEAT_CLEAR_CRYSTAL_CHANCE ? REPEAT_CLEAR_CRYSTAL_REWARD : 0;
}

export interface LevelUpInfo {
  instanceId: string;
  name: string;
  levels: number;
}

export interface ClearRewardResult {
  /** ステージクリアボーナス/装備ダンジョンクリア報酬のゴールド(ウェーブ毎のゴールドは含まない) */
  goldEarned: number;
  crystalEarned: number;
  expTotal: number;
  levelUps: LevelUpInfo[];
  dropDexId: string | null;
  dropStar: number | null;
  equipmentDrop: Equipment | null;
  pigDrop: StageDrop | null;
  summonScrollDropped: boolean;
  fighterLevelsGained: number;
}

function applyExpAndLevelUps(partyInstances: MonsterInstance[], expTotal: number): LevelUpInfo[] {
  const levelUps: LevelUpInfo[] = [];
  for (const instance of partyInstances) {
    const gained = addExp(instance, expTotal, STAR_MAX_LEVEL[instance.star]);
    if (gained > 0) {
      const dex = findMonsterById(instance.dexId);
      levelUps.push({ instanceId: instance.id, name: dex ? dex.name : instance.dexId, levels: gained });
    }
  }
  return levelUps;
}

/**
 * ステージクリア(全ウェーブ)時の報酬をまとめて付与する。
 * ダイヤは初回クリアなら200確定、既にクリア済みのステージなら3%の確率で50。
 */
export function applyStageClearRewards(
  state: PlayerState,
  stage: Stage,
  wavesCleared: number,
  partyInstances: MonsterInstance[],
  difficulty: Difficulty = "NORMAL",
  rng: () => number = Math.random,
): ClearRewardResult {
  const isFirstClear = !isStageCleared(state, stage.id, difficulty);
  markStageCleared(state, stage.id, difficulty);

  const expTotal = wavesCleared * stage.rewards.waveExp;
  const levelUps = applyExpAndLevelUps(partyInstances, expTotal);

  const goldEarned = stage.rewards.clearGold;
  const crystalEarned = rollClearCrystal(isFirstClear, rng);

  const drop = rollStageDrop(stage);
  if (drop) addMonster(state, drop.dexId, drop.star);
  const equipmentDrop = rollStageEquipment(stage, Math.random, difficulty);
  if (equipmentDrop) addEquipment(state, equipmentDrop);
  const pigDrop = rollStageReincarnationPig();
  if (pigDrop) addMonster(state, pigDrop.dexId, pigDrop.star, STAR_MAX_LEVEL[pigDrop.star]);
  const summonScrollDropped = rollStageSummonScroll();
  if (summonScrollDropped) addSummonScrolls(state, 1);
  const fighterLevelsGained = addFighterExp(state, expTotal).levelsGained;

  state.gold += goldEarned;
  state.crystal += crystalEarned;

  return {
    goldEarned,
    crystalEarned,
    expTotal,
    levelUps,
    dropDexId: drop ? drop.dexId : null,
    dropStar: drop ? drop.star : null,
    equipmentDrop,
    pigDrop,
    summonScrollDropped,
    fighterLevelsGained,
  };
}

/**
 * 装備ダンジョンクリア時の報酬をまとめて付与する。
 * ダイヤは初回クリアなら200確定、既にクリア済みの階層なら3%の確率で50。
 */
export function applyDungeonClearRewards(
  state: PlayerState,
  floor: DungeonFloor,
  partyInstances: MonsterInstance[],
  rng: () => number = Math.random,
): ClearRewardResult {
  const isFirstClear = !isDungeonFloorCleared(state, floor.floor);
  markDungeonFloorCleared(state, floor.floor);

  const expTotal = floor.floor * 20;
  const levelUps = applyExpAndLevelUps(partyInstances, expTotal);

  const goldEarned = floor.goldReward;
  const crystalEarned = rollClearCrystal(isFirstClear, rng);

  const equipmentDrop = rollDungeonEquipment(floor);
  addEquipment(state, equipmentDrop);
  const summonScrollDropped = rollDungeonSummonScroll();
  if (summonScrollDropped) addSummonScrolls(state, 1);
  let pigDrop: StageDrop | null = null;
  const pig = rollDungeonReincarnationPig(floor);
  if (pig) {
    pigDrop = { dexId: pig.dexId, star: pig.star };
    addMonster(state, pig.dexId, pig.star, STAR_MAX_LEVEL[pig.star]);
  }
  const fighterLevelsGained = addFighterExp(state, expTotal).levelsGained;

  state.gold += goldEarned;
  state.crystal += crystalEarned;

  return {
    goldEarned,
    crystalEarned,
    expTotal,
    levelUps,
    dropDexId: null,
    dropStar: null,
    equipmentDrop,
    pigDrop,
    summonScrollDropped,
    fighterLevelsGained,
  };
}

/**
 * レベル上げダンジョンクリア時の報酬をまとめて付与する。装備ダンジョンと異なり装備ドロップはなく、
 * 代わりに経験値そのものが大きく、経験ピッグ(経験値フィード専用モンスター)を確定で入手できる。
 * ダイヤは初回クリアなら200確定、既にクリア済みの難易度なら3%の確率で50。
 */
export function applyLevelDungeonClearRewards(
  state: PlayerState,
  def: LevelDungeonDef,
  partyInstances: MonsterInstance[],
  rng: () => number = Math.random,
): ClearRewardResult {
  const isFirstClear = !isLevelDungeonTierCleared(state, def.tier);
  markLevelDungeonTierCleared(state, def.tier);

  const expTotal = def.expReward;
  const levelUps = applyExpAndLevelUps(partyInstances, expTotal);

  const goldEarned = def.goldReward;
  const crystalEarned = rollClearCrystal(isFirstClear, rng);

  const pigVariant = EXP_PIG_DEX[Math.floor(rng() * EXP_PIG_DEX.length)];
  const pigDrop: StageDrop = { dexId: pigVariant.id, star: def.pigStar };
  addMonster(state, pigDrop.dexId, pigDrop.star, STAR_MAX_LEVEL[pigDrop.star]);

  const fighterLevelsGained = addFighterExp(state, expTotal).levelsGained;

  state.gold += goldEarned;
  state.crystal += crystalEarned;

  return {
    goldEarned,
    crystalEarned,
    expTotal,
    levelUps,
    dropDexId: null,
    dropStar: null,
    equipmentDrop: null,
    pigDrop,
    summonScrollDropped: false,
    fighterLevelsGained,
  };
}

/**
 * ゴールドダンジョンクリア時の報酬をまとめて付与する。
 * 1日の挑戦回数制限がある代わりに、他コンテンツと違い装備ドロップやダイヤ報酬はなく、
 * その分ゴールド報酬そのものが大幅に大きい。
 */
export function applyGoldDungeonClearRewards(
  state: PlayerState,
  floor: GoldDungeonFloor,
  partyInstances: MonsterInstance[],
): ClearRewardResult {
  const expTotal = floor.floor * 20;
  const levelUps = applyExpAndLevelUps(partyInstances, expTotal);

  const goldEarned = floor.goldReward;
  const fighterLevelsGained = addFighterExp(state, expTotal).levelsGained;

  state.gold += goldEarned;

  return {
    goldEarned,
    crystalEarned: 0,
    expTotal,
    levelUps,
    dropDexId: null,
    dropStar: null,
    equipmentDrop: null,
    pigDrop: null,
    summonScrollDropped: false,
    fighterLevelsGained,
  };
}
