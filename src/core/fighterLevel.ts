/**
 * プレイヤー(ファイター)自身のレベルとスタミナ。モンスターの星・レベルとは別軸の進行要素。
 * ステージ/装備ダンジョンに挑戦するとスタミナを消費し、クリアで得られる経験値でファイターレベルが上がる。
 * ファイターレベルが上がるとスタミナが全回復し、スタミナ上限も上がる。
 */

/** ファイターレベルの上限 */
export const MAX_FIGHTER_LEVEL = 30;

/** 初期スタミナ上限(ファイターレベル1のとき) */
export const INITIAL_MAX_STAMINA = 150;
/** ファイターレベルが1上がるごとにスタミナ上限が増える量 */
export const STAMINA_PER_LEVEL = 10;

/** 通常ステージ挑戦1回あたりのスタミナ消費量 */
export const STAGE_STAMINA_COST = 5;
/** 装備ダンジョン挑戦1回あたりのスタミナ消費量 */
export const DUNGEON_STAMINA_COST = 10;

/** そのファイターレベルにおけるスタミナ上限 */
export function maxStaminaForFighterLevel(level: number): number {
  const clamped = Math.max(1, Math.min(level, MAX_FIGHTER_LEVEL));
  return INITIAL_MAX_STAMINA + (clamped - 1) * STAMINA_PER_LEVEL;
}

/** そのファイターレベルから次のレベルに上がるために必要な累積経験値 */
export function requiredExpForFighterLevel(level: number): number {
  return Math.round(60 * level ** 1.5);
}
