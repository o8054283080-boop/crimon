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

/** 1対象・1スキル解決全体に対する方式E。完全防御無視時は両軽減を0にする。 */
export function applyDefenseE(baseDamage: number, effectiveAtk: number, effectiveDef: number, ignoreDefense = false): DefenseBreakdown {
  const base = Math.max(0, baseDamage);
  if (ignoreDefense) return { afterRatio: base, flatReduction: 0, afterDefense: base };
  const atk = Math.max(0, effectiveAtk);
  const def = Math.max(0, effectiveDef);
  const scaledDef = def * DEFENSE_RATIO;
  const afterRatio = scaledDef + atk > 0 ? base * atk / (scaledDef + atk) : base;
  const flatReduction = Math.min(def * FLAT_DEFENSE_RATIO, afterRatio * FLAT_DEFENSE_CAP);
  return { afterRatio, flatReduction, afterDefense: Math.max(0, afterRatio - flatReduction) };
}

/** 通常防御計算の最終整数化。将来の完全無効(0)はこの関数を呼ばず区別する。 */
export function roundNormalDamage(value: number): number {
  return Math.max(1, Math.round(value));
}
