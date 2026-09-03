import { MonsterInstance, addExp } from "../core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../core/rarity.js";
import { Equipment } from "../core/equipment.js";
import { DungeonFloor, rollDungeonEquipment, rollDungeonReincarnationPig, rollDungeonSummonScroll } from "../data/equipmentDungeon.js";
import { GoldDungeonFloor } from "../data/goldDungeon.js";
import { LevelDungeonDef } from "../data/levelDungeon.js";
import { EXP_PIG_DEX, findMonsterById } from "../data/monsters.js";
import {
  DIFFICULTY_MODIFIERS,
  Difficulty,
  Stage,
  StageDrop,
  rollStageDrop,
  rollStageEquipment,
  rollStageReincarnationPigs,
  rollStageSummonScroll,
  stageClearExp,
  stageClearGold,
} from "../data/stages.js";
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

export interface PartyLevelInfo {
  instanceId: string;
  name: string;
  level: number;
  maxLevel: number;
}

export interface ExpAwardInfo {
  instanceId: string;
  name: string;
  total: number;
  maxMemberBonus: number;
}

/**
 * EXP受取メンバーだけを配列要素として持つ従来契約は維持する。
 * partyLevels はリザルト表示専用の非列挙メタデータで、配列比較やEXP集計には混ざらない。
 */
export type ExpAwardList = ExpAwardInfo[] & { partyLevels?: PartyLevelInfo[] };

export interface ClearRewardResult {
  /** ステージクリアボーナス/装備ダンジョンクリア報酬のゴールド(ウェーブ毎のゴールドは含まない) */
  goldEarned: number;
  crystalEarned: number;
  expTotal: number;
  /** ファイターレベルへ入ったEXP。expTotalはモンスター用のため同額とは限らない */
  fighterExp: number;
  levelUps: LevelUpInfo[];
  expAwards?: ExpAwardList;
  dropDexId: string | null;
  dropStar: number | null;
  equipmentDrop: Equipment | null;
  pigDrop: StageDrop | null;
  /** 星2通常抽選とボス階の星3抽選。既存のpigDropは先頭1件を指し、旧呼び出し側との互換を保つ。 */
  pigDrops?: StageDrop[];
  summonScrollDropped: boolean;
  fighterLevelsGained: number;
}

/** 通常ステージはモンスターEXPの25%。難易度倍率を含む値から算出する。 */
export function stageFighterExp(monsterExp: number): number {
  return Math.max(1, Math.round(monsterExp * 0.25));
}

/** 装備10階で750。モンスター育成用の floor * 500 とは分離する。 */
export function equipmentDungeonFighterExp(floor: number): number {
  return Math.max(1, Math.round(floor * 75));
}

/** 育成ダンジョンはモンスター育成が主目的。上階でもファイター最高効率にしない。 */
export function levelDungeonFighterExp(tier: LevelDungeonDef["tier"]): number {
  const floor = Number(tier.slice(1));
  return 100 + Math.max(1, Math.min(5, floor)) * 60;
}

export function goldDungeonFighterExp(floor: number): number {
  return Math.max(1, floor * 20);
}

function attachPartyLevels(expAwards: ExpAwardList, partyInstances: readonly MonsterInstance[]): void {
  const partyLevels = partyInstances.map((instance) => {
    const dex = findMonsterById(instance.dexId);
    return {
      instanceId: instance.id,
      name: dex ? dex.name : instance.dexId,
      level: instance.level,
      maxLevel: STAR_MAX_LEVEL[instance.star],
    };
  });
  Object.defineProperty(expAwards, "partyLevels", {
    value: partyLevels,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

export function applyExpAndLevelUps(partyInstances: MonsterInstance[], expTotal: number): { levelUps: LevelUpInfo[]; expAwards: ExpAwardList } {
  const levelUps: LevelUpInfo[] = [];
  const expAwards: ExpAwardList = [];
  const trainees = partyInstances.filter((instance) => instance.level < STAR_MAX_LEVEL[instance.star]);
  if (trainees.length > 0) {
    const maxCount = partyInstances.length - trainees.length;
    const pooledBonus = expTotal * maxCount;
    const bonusEach = Math.floor(pooledBonus / trainees.length);
    let bonusRemainder = pooledBonus % trainees.length;
    for (const instance of trainees) {
      const bonus = bonusEach + (bonusRemainder-- > 0 ? 1 : 0);
      const awarded = expTotal + bonus;
      const gained = addExp(instance, awarded, STAR_MAX_LEVEL[instance.star]);
      const dex = findMonsterById(instance.dexId);
      expAwards.push({ instanceId: instance.id, name: dex ? dex.name : instance.dexId, total: awarded, maxMemberBonus: bonus });
      if (gained > 0) {
        levelUps.push({ instanceId: instance.id, name: dex ? dex.name : instance.dexId, levels: gained });
      }
    }
  }
  // addExp反映後のレベルを、EXP配列の意味を変えずにリザルトへ渡す。
  attachPartyLevels(expAwards, partyInstances);
  return { levelUps, expAwards };
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

  const expTotal = wavesCleared === stage.waves.length
    ? stageClearExp(stage, difficulty)
    : Math.round(wavesCleared * stage.rewards.waveExp * DIFFICULTY_MODIFIERS[difficulty].expMultiplier);
  const { levelUps, expAwards } = applyExpAndLevelUps(partyInstances, expTotal);

  const goldEarned = stageClearGold(stage, difficulty);
  const crystalEarned = rollClearCrystal(isFirstClear, rng);

  const drop = rollStageDrop(stage, rng);
  if (drop) addMonster(state, drop.dexId, drop.star);
  const equipmentDrop = rollStageEquipment(stage, rng, difficulty);
  if (equipmentDrop) addEquipment(state, equipmentDrop);
  const pigDrops = rollStageReincarnationPigs(stage, difficulty, rng);
  for (const pig of pigDrops) addMonster(state, pig.dexId, pig.star, STAR_MAX_LEVEL[pig.star]);
  const pigDrop = pigDrops[0] ?? null;
  const summonScrollDropped = rollStageSummonScroll(rng);
  if (summonScrollDropped) addSummonScrolls(state, 1);
  const fighterExp = stageFighterExp(expTotal);
  const fighterLevelsGained = addFighterExp(state, fighterExp).levelsGained;

  state.gold += goldEarned;
  state.crystal += crystalEarned;

  return {
    goldEarned,
    crystalEarned,
    expTotal,
    fighterExp,
    levelUps,
    expAwards,
    dropDexId: drop ? drop.dexId : null,
    dropStar: drop ? drop.star : null,
    equipmentDrop,
    pigDrop,
    pigDrops,
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
  const isFirstClear = !isDungeonFloorCleared(state, floor.floor, floor.kind);
  markDungeonFloorCleared(state, floor.floor, floor.kind);
  const orbRewardId = "equipment-dungeon-floor-10";
  if (floor.kind === "DEMON" && isFirstClear && floor.floor === 10 && !state.claimedAwakeningOrbRewardIds.includes(orbRewardId)) {
    state.awakeningOrbs += 1;
    state.claimedAwakeningOrbRewardIds.push(orbRewardId);
  }

  const expTotal = floor.floor * 500;
  const { levelUps, expAwards } = applyExpAndLevelUps(partyInstances, expTotal);

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
  const fighterExp = equipmentDungeonFighterExp(floor.floor);
  const fighterLevelsGained = addFighterExp(state, fighterExp).levelsGained;

  state.gold += goldEarned;
  state.crystal += crystalEarned;

  return {
    goldEarned,
    crystalEarned,
    expTotal,
    fighterExp,
    levelUps,
    expAwards,
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
  const { levelUps, expAwards } = applyExpAndLevelUps(partyInstances, expTotal);

  const goldEarned = def.goldReward;
  const crystalEarned = rollClearCrystal(isFirstClear, rng);

  const pigVariant = EXP_PIG_DEX[Math.floor(rng() * EXP_PIG_DEX.length)];
  const pigDrop: StageDrop = { dexId: pigVariant.id, star: def.pigStar };
  addMonster(state, pigDrop.dexId, pigDrop.star, STAR_MAX_LEVEL[pigDrop.star]);

  const fighterExp = levelDungeonFighterExp(def.tier);
  const fighterLevelsGained = addFighterExp(state, fighterExp).levelsGained;

  state.gold += goldEarned;
  state.crystal += crystalEarned;

  return {
    goldEarned,
    crystalEarned,
    expTotal,
    fighterExp,
    levelUps,
    expAwards,
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
  const { levelUps, expAwards } = applyExpAndLevelUps(partyInstances, expTotal);

  const goldEarned = floor.goldReward;
  const fighterExp = goldDungeonFighterExp(floor.floor);
  const fighterLevelsGained = addFighterExp(state, fighterExp).levelsGained;

  state.gold += goldEarned;

  return {
    goldEarned,
    crystalEarned: 0,
    expTotal,
    fighterExp,
    levelUps,
    expAwards,
    dropDexId: null,
    dropStar: null,
    equipmentDrop: null,
    pigDrop: null,
    summonScrollDropped: false,
    fighterLevelsGained,
  };
}
