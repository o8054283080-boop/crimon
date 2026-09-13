import { DEF_SW_BASE, balanceFlags } from "../core/balanceFlags.js";

/** 正式な方式Eの係数。検証ツールもこの純粋関数を参照して式の乖離を防ぐ。 */
export const DEFENSE_RATIO = 1.5;
export const FLAT_DEFENSE_RATIO = 0.25;
export const FLAT_DEFENSE_CAP = 0.25;

export interface DefenseBreakdown {
  afterRatio: number;
  flatReduction: number;
  afterDefense: number;
}

/** ATK/HP/DEFの独立項を合成する。途中では丸めない。 */
export function calculateBaseDamage(atk: number, atkMultiplier: number, dependentStat = 0, coefficient = 0): number {
  return Math.max(0, atk) * Math.max(0, atkMultiplier) + Math.max(0, dependentStat) * Math.max(0, coefficient);
}

/**
 * 1対象・1スキル解決全体に対する防御計算。完全防御無視時は両軽減を0にする。
 *
 * 既定は方式E(現行仕様)。`balanceFlags.defenseFormula` が `sw` の時だけ
 * **検証用の式**へ切り替わる。
 *
 * ## 2つの式は性質が違う
 *
 * 方式Eの軽減は**攻める側の攻撃力との比**で決まるので、攻撃を積めば相手の防御を抜ける。
 * 検証式は攻撃力を見ないため、**防御の値だけで軽減率が確定する。**
 * 同じDEF3,600でも、方式Eは攻撃力次第で40%前後、検証式は常に81%軽減になる。
 * 数字の大小ではなく**この性質の違い**が難易度を動かすので、
 * 片方の式に合わせたDEFをもう片方へ持ち込まないこと。
 */
export function applyDefenseE(baseDamage: number, effectiveAtk: number, effectiveDef: number, ignoreDefense = false): DefenseBreakdown {
  const base = Math.max(0, baseDamage);
  if (ignoreDefense) return { afterRatio: base, flatReduction: 0, afterDefense: base };
  const atk = Math.max(0, effectiveAtk);
  const def = Math.max(0, effectiveDef);
  if (balanceFlags.defenseFormula === "sw") {
    // 検証式: 1000 / (1000 + 1.2 * DEF)。固定減算は持たない
    const afterRatio = base * DEF_SW_BASE / (DEF_SW_BASE + balanceFlags.swRatio * def);
    return { afterRatio, flatReduction: 0, afterDefense: Math.max(0, afterRatio) };
  }
  const scaledDef = def * DEFENSE_RATIO;
  const afterRatio = scaledDef + atk > 0 ? base * atk / (scaledDef + atk) : base;
  const flatReduction = Math.min(def * FLAT_DEFENSE_RATIO, afterRatio * FLAT_DEFENSE_CAP);
  return { afterRatio, flatReduction, afterDefense: Math.max(0, afterRatio - flatReduction) };
}

/** 通常防御計算の最終整数化。将来の完全無効(0)はこの関数を呼ばず区別する。 */
export function roundNormalDamage(value: number): number {
  return Math.max(1, Math.round(value));
}
