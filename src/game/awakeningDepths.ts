import {
  AWAKENING_DEPTH_FLOORS, AwakeningDepthFloor, findAwakeningDepthFloor, rollAwakeningDepthDrop,
} from "../data/awakeningDepths.js";
import type { PlayerState } from "./playerState.js";

/**
 * 目覚の深域の進行。**素材を配るのはここだけ。**
 *
 * 階のデータ(`data/awakeningDepths.ts`)は数字を持つだけで、
 * 誰が何を受け取るかは知らない。
 */

/** その階に挑めるか。**1階から順に、前の階をクリアしていること** */
export function isAwakeningDepthUnlocked(state: PlayerState, floor: number): boolean {
  if (floor <= 1) return true;
  return (state.clearedAwakeningDepthFloors ?? []).includes(floor - 1);
}

export function isAwakeningDepthCleared(state: PlayerState, floor: number): boolean {
  return (state.clearedAwakeningDepthFloors ?? []).includes(floor);
}

/** いま挑める最も深い階。画面の初期選択に使う */
export function deepestUnlockedFloor(state: PlayerState): number {
  let deepest = 1;
  for (const def of AWAKENING_DEPTH_FLOORS) {
    if (isAwakeningDepthUnlocked(state, def.floor)) deepest = def.floor;
  }
  return deepest;
}

export interface AwakeningDepthReward {
  shards: number;
  crystals: number;
  stones: number;
  /** 初回クリアぶんを含んでいるか。画面で「初回」と出すために返す */
  firstClear: boolean;
}

/**
 * 勝った時の報酬を配る。
 *
 * **初回クリアの上乗せは1度だけ。**印は階ごとに残すので、
 * 同じ階を何度回しても2度目からは周回ぶんだけになる。
 */
export function grantAwakeningDepthReward(
  state: PlayerState, floor: AwakeningDepthFloor, rng: () => number = Math.random,
): AwakeningDepthReward {
  const drop = rollAwakeningDepthDrop(floor, rng);
  const cleared = state.clearedAwakeningDepthFloors ?? (state.clearedAwakeningDepthFloors = []);
  const firstClear = !cleared.includes(floor.floor);
  if (firstClear) cleared.push(floor.floor);

  const reward: AwakeningDepthReward = {
    shards: drop.shards + (firstClear ? floor.firstClear.shards : 0),
    crystals: drop.crystals + (firstClear ? floor.firstClear.crystals : 0),
    stones: drop.stones + (firstClear ? floor.firstClear.stones : 0),
    firstClear,
  };
  state.awakeningShards = (state.awakeningShards ?? 0) + reward.shards;
  state.awakeningCrystals = (state.awakeningCrystals ?? 0) + reward.crystals;
  state.awakeningStones = (state.awakeningStones ?? 0) + reward.stones;
  return reward;
}

/* ==========================================================================
 * 素材の交換
 *
 * **余った下位の素材を、上位へ寄せられるようにする。**
 * 欠片だけが延々と貯まって結晶が足りない、という詰まり方を避けるためのもの。
 * ========================================================================== */

export interface MaterialExchangeDef {
  id: string;
  name: string;
  /** 払うもの */
  from: { kind: "shards" | "crystals"; count: number };
  /** 受け取るもの */
  to: { kind: "crystals" | "stones"; count: number };
  description: string;
}

/**
 * 交換の内容。
 *
 * **レートは意図的に悪い。**深域で直に落ちるぶんと同じ効率にすると、
 * 上の階へ挑む理由が消える。ここは「余りを腐らせない」ための逃げ道で、
 * 集める場所そのものではない。
 */
export const MATERIAL_EXCHANGES: readonly MaterialExchangeDef[] = [
  {
    id: "shards_to_crystals",
    name: "目覚の欠片 → 目覚の結晶",
    from: { kind: "shards", count: 100 },
    to: { kind: "crystals", count: 10 },
    description: "欠片が余った時に。8pt目から要る結晶へ寄せられる",
  },
  {
    id: "crystals_to_stone",
    name: "目覚の結晶 → 目覚の奇石",
    from: { kind: "crystals", count: 50 },
    to: { kind: "stones", count: 1 },
    description: "奇石は深域7階から先でしか落ちない。**スキル覚醒への唯一の別ルート**",
  },
];

export type ExchangeResult = { ok: true } | { ok: false; reason: string };

const MATERIAL_LABEL: Record<"shards" | "crystals" | "stones", string> = {
  shards: "目覚の欠片", crystals: "目覚の結晶", stones: "目覚の奇石",
};

export function materialCount(state: PlayerState, kind: "shards" | "crystals" | "stones"): number {
  if (kind === "shards") return state.awakeningShards ?? 0;
  if (kind === "crystals") return state.awakeningCrystals ?? 0;
  return state.awakeningStones ?? 0;
}

export function addMaterial(state: PlayerState, kind: "shards" | "crystals" | "stones", count: number): void {
  if (kind === "shards") state.awakeningShards = (state.awakeningShards ?? 0) + count;
  else if (kind === "crystals") state.awakeningCrystals = (state.awakeningCrystals ?? 0) + count;
  else state.awakeningStones = (state.awakeningStones ?? 0) + count;
}

/** 交換を1回ぶん行う */
export function exchangeMaterial(state: PlayerState, id: string, times = 1): ExchangeResult {
  const def = MATERIAL_EXCHANGES.find((e) => e.id === id);
  if (!def) return { ok: false, reason: "その交換はありません" };
  if (times < 1) return { ok: false, reason: "交換する数が不正です" };
  const need = def.from.count * times;
  if (materialCount(state, def.from.kind) < need) {
    return { ok: false, reason: `${MATERIAL_LABEL[def.from.kind]}が足りません` };
  }
  addMaterial(state, def.from.kind, -need);
  addMaterial(state, def.to.kind, def.to.count * times);
  return { ok: true };
}

export { AWAKENING_DEPTH_FLOORS, findAwakeningDepthFloor };
export type { AwakeningDepthFloor };
