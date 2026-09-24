import { type Accessory, generateAccessory, pickWeighted } from "../core/accessory.js";
import { STAR_MAX_LEVEL, type Star } from "../core/rarity.js";
import { REINCARNATION_PIG_DEX, SKILL_PIG_DEX } from "../data/monsters.js";
import {
  RUIN_FAMILIES, type RuinFloor, type RuinKind, findRuinFloor, ruinFloors,
} from "../data/ruins.js";
import { addAccessory } from "./accessories.js";
import { addMonster, addSummonScrolls, type PlayerState } from "./playerState.js";
import type { StageDrop } from "../data/stages.js";
import type { ClearRewardResult } from "./rewards.js";

/**
 * 力の遺跡・守護の遺跡の進行と報酬。**配るのはここだけ。**
 *
 * 階のデータ(`data/ruins.ts`)は数字を持つだけで、誰が何を受け取るかは知らない。
 */

function clearedList(state: PlayerState, kind: RuinKind): number[] {
  if (kind === "POWER") return state.clearedPowerRuinFloors ?? (state.clearedPowerRuinFloors = []);
  return state.clearedGuardianRuinFloors ?? (state.clearedGuardianRuinFloors = []);
}

/** 1階から順に。前の階をクリアしていれば挑める */
export function isRuinFloorUnlocked(state: PlayerState, kind: RuinKind, floor: number): boolean {
  if (floor <= 1) return true;
  return clearedList(state, kind).includes(floor - 1);
}

export function isRuinFloorCleared(state: PlayerState, kind: RuinKind, floor: number): boolean {
  return clearedList(state, kind).includes(floor);
}

export function deepestUnlockedRuinFloor(state: PlayerState, kind: RuinKind): number {
  let deepest = 1;
  for (const def of ruinFloors(kind)) if (isRuinFloorUnlocked(state, kind, def.floor)) deepest = def.floor;
  return deepest;
}

function rollRange([lo, hi]: readonly [number, number], rng: () => number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * アクセを1つ引く。**レア度と★は別々に引く**(組み合わせの表にはしない)。
 * 系統はその遺跡の2つから半々。
 */
export function rollRuinAccessory(floor: RuinFloor, rng: () => number = Math.random): Accessory {
  const rarity = pickWeighted(floor.rarityWeights, rng);
  const star = pickWeighted(floor.starWeights, rng);
  const [a, b] = RUIN_FAMILIES[floor.kind];
  const family = rng() < 0.5 ? a : b;
  return generateAccessory({ star, rarity, family, rng });
}

export interface RuinDrop {
  accessory: Accessory;
  cores: number;
  shards: number;
  summonScroll: boolean;
  reincarnationPig: StageDrop | null;
  skillPig: StageDrop | null;
}

/**
 * 1勝ぶんのドロップを引く(まだ誰にも配らない)。
 *
 * **どれも独立に引く。**アクセは確定、進化核とカケラも確定。召喚の書・転生ピッグ★3・
 * スキルピッグ★1 はそれぞれ別の抽選で、どれかが出たから他が出ない、ということは無い。
 */
export function rollRuinDrop(floor: RuinFloor, rng: () => number = Math.random): RuinDrop {
  const accessory = rollRuinAccessory(floor, rng);
  const cores = rollRange(floor.cores, rng);
  const shards = rollRange(floor.shards, rng);
  const summonScroll = rng() < floor.bonus.summonScroll;
  const pigRoll = rng();
  const reincarnationPig = pigRoll < floor.bonus.reincarnationPig3
    ? { dexId: REINCARNATION_PIG_DEX[Math.floor(rng() * REINCARNATION_PIG_DEX.length)].id, star: 3 as Star }
    : null;
  const skillRoll = rng();
  const skillPig = skillRoll < floor.bonus.skillPig1
    ? { dexId: SKILL_PIG_DEX[Math.floor(rng() * SKILL_PIG_DEX.length)].id, star: 1 as Star }
    : null;
  return { accessory, cores, shards, summonScroll, reincarnationPig, skillPig };
}

export interface RuinReward extends ClearRewardResult {
  accessoryDrop: Accessory;
  evolutionCores: number;
  ancientShards: number;
  firstClear: boolean;
}

/**
 * 勝った時の報酬を配る。**ゴールド・経験値は配らない**(遺跡はアクセと素材だけの場所)。
 *
 * 周回の集計(`mergeReward`)に流せるよう、`ClearRewardResult` の形で返す。
 */
export function grantRuinReward(state: PlayerState, floor: RuinFloor, rng: () => number = Math.random): RuinReward {
  const cleared = clearedList(state, floor.kind);
  const firstClear = !cleared.includes(floor.floor);
  if (firstClear) cleared.push(floor.floor);

  const drop = rollRuinDrop(floor, rng);
  addAccessory(state, drop.accessory);
  state.evolutionCores = (state.evolutionCores ?? 0) + drop.cores;
  state.ancientShards = (state.ancientShards ?? 0) + drop.shards;
  if (drop.summonScroll) addSummonScrolls(state, 1);
  const pigDrops: StageDrop[] = [];
  for (const pig of [drop.reincarnationPig, drop.skillPig]) {
    if (!pig) continue;
    addMonster(state, pig.dexId, pig.star, STAR_MAX_LEVEL[pig.star]);
  }
  if (drop.reincarnationPig) pigDrops.push(drop.reincarnationPig);

  return {
    goldEarned: 0,
    crystalEarned: 0,
    expTotal: 0,
    fighterExp: 0,
    levelUps: [],
    dropDexId: null,
    dropStar: null,
    equipmentDrop: null,
    pigDrop: drop.reincarnationPig,
    pigDrops,
    skillPigDrop: drop.skillPig,
    summonScrollDropped: drop.summonScroll,
    fighterLevelsGained: 0,
    accessoryDrop: drop.accessory,
    evolutionCores: drop.cores,
    ancientShards: drop.shards,
    firstClear,
  };
}

export { findRuinFloor };
