import * as core from "./playerStateCore.js";
import type { FighterExpResult, PlayerState, StaminaRefillResult } from "./playerStateCore.js";

/**
 * PlayerState の公開窓口。
 *
 * 既存実装は `playerStateCore.ts` にそのまま置き、ここでは「上限を超えた
 * ボーナススタミナを消さない」という現在のスタミナ方針だけを上書きする。
 * 自然回復は core 側のままなので、上限以上では増えない。
 */
export * from "./playerStateCore.js";

const STORAGE_KEY = "crimon_save_v1";

/**
 * 配布・ミッション・回復で得た上限超過スタミナは、セーブ読込でも保持する。
 * 壊れた負数・NaN は従来どおり安全な値へ丸める。
 */
export function normalizeLoadedState(state: PlayerState, now: Date = new Date()): PlayerState {
  const savedStamina = typeof state.stamina === "number" && Number.isFinite(state.stamina)
    ? Math.max(0, state.stamina)
    : null;
  const normalized = core.normalizeLoadedState(state, now);
  if (savedStamina !== null) normalized.stamina = savedStamina;
  return normalized;
}

/** ローカルセーブも同じ上限超過ルールで読み込む。 */
export function loadPlayerState(): PlayerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return core.createInitialState();
    const parsed = JSON.parse(raw) as PlayerState;
    if (!parsed.monsters || parsed.monsters.length === 0) return core.createInitialState();
    return normalizeLoadedState(parsed);
  } catch {
    return core.createInitialState();
  }
}

/**
 * ダイヤ50の「+100」は固定量をそのまま足す。
 * 例: 120/150 → 220/150。すでに上限超過中でも購入できる。
 */
export function tryRefillStaminaPartial(state: PlayerState): StaminaRefillResult {
  core.applyPassiveStaminaRegen(state);
  if (state.crystal < core.STAMINA_REFILL_PARTIAL_COST) return { ok: false, reason: "ダイヤが足りません" };
  state.crystal -= core.STAMINA_REFILL_PARTIAL_COST;
  state.stamina += core.STAMINA_REFILL_PARTIAL_AMOUNT;
  return { ok: true };
}

/**
 * レベルアップの全回復で、すでに持っていた超過スタミナを削らない。
 * 通常時は従来どおり新しい上限まで全回復する。
 */
export function addFighterExp(state: PlayerState, exp: number): FighterExpResult {
  const staminaBefore = state.stamina;
  const result = core.addFighterExp(state, exp);
  if (state.stamina < staminaBefore) state.stamina = staminaBefore;
  return result;
}
