/**
 * プレイヤー(ファイター)自身のレベルとスタミナ。モンスターの星・レベルとは別軸の進行要素。
 * ステージ/装備ダンジョンに挑戦するとスタミナを消費し、クリアで得られる経験値でファイターレベルが上がる。
 * ファイターレベルが上がるとスタミナが全回復し、スタミナ上限も上がる。
 */

/** ファイターレベルの上限 */
export const MAX_FIGHTER_LEVEL = 100;

/** 初期スタミナ上限(ファイターレベル1のとき) */
export const INITIAL_MAX_STAMINA = 150;

/** 通常ステージ挑戦1回あたりのスタミナ消費量 */
export const STAGE_STAMINA_COST = 5;
/** 装備ダンジョン挑戦1回あたりのスタミナ消費量 */
export const DUNGEON_STAMINA_COST = 10;
/** レベル上げダンジョン挑戦1回あたりのスタミナ消費量 */
export const LEVEL_DUNGEON_STAMINA_COST = 20;
/** ゴールドダンジョン挑戦1回あたりのスタミナ消費量 */
export const GOLD_DUNGEON_STAMINA_COST = 15;

/** そのファイターレベルにおけるスタミナ上限 */
export function maxStaminaForFighterLevel(level: number): number {
  const clamped = Math.max(1, Math.min(level, MAX_FIGHTER_LEVEL));
  const through20 = Math.min(clamped - 1, 19) * 5;
  const through50 = Math.max(0, Math.min(clamped - 20, 30)) * 3;
  const through100 = Math.max(0, clamped - 50) * 2;
  return INITIAL_MAX_STAMINA + through20 + through50 + through100;
}

/**
 * そのレベルから次へ上がるための経験値。
 * 帯ごとの先頭値を直前帯の末尾から引き継ぐため、境界でも必ず単調増加する。
 * 係数は序盤の手触りを残しつつ、Lv50以降を月単位の育成にするため帯ごとに独立している。
 */
export function requiredExpForFighterLevel(level: number): number {
  const safeLevel = Math.max(1, Math.min(Math.floor(Number.isFinite(level) ? level : 1), MAX_FIGHTER_LEVEL - 1));
  if (safeLevel <= 10) return Math.round(100 + 35 * safeLevel ** 1.5);
  if (safeLevel <= 30) {
    const offset = safeLevel - 10;
    return Math.round(requiredExpForFighterLevel(10) + 220 * offset + 20 * offset ** 2);
  }
  if (safeLevel <= 50) {
    const offset = safeLevel - 30;
    return requiredExpForFighterLevel(30) + 1_800 * offset + 90 * offset ** 2;
  }
  if (safeLevel <= 75) {
    const offset = safeLevel - 50;
    return requiredExpForFighterLevel(50) + 6_000 * offset + 200 * offset ** 2;
  }
  const offset = safeLevel - 75;
  return requiredExpForFighterLevel(75) + 18_000 * offset + 600 * offset ** 2;
}
