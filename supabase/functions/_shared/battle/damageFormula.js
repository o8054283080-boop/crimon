import { DEF_SW_BASE, balanceFlags } from "../core/balanceFlags.js";
/**
 * 入れ替える前の方式Eの係数。**いまは既定では通らない。**
 * `balanceFlags.defenseFormula` を `legacy` にした時だけ使われる比較用。
 */
export const DEFENSE_RATIO = 1.5;
export const FLAT_DEFENSE_RATIO = 0.25;
export const FLAT_DEFENSE_CAP = 0.25;
/** ATK/HP/DEFの独立項を合成する。途中では丸めない。 */
export function calculateBaseDamage(atk, atkMultiplier, dependentStat = 0, coefficient = 0) {
    return Math.max(0, atk) * Math.max(0, atkMultiplier) + Math.max(0, dependentStat) * Math.max(0, coefficient);
}
/**
 * 1対象・1スキル解決全体に対する防御計算。完全防御無視時は両軽減を0にする。
 *
 * 既定は `1000 / (1000 + 1.2 × DEF)`。`balanceFlags.defenseFormula` を
 * `legacy` にした時だけ、入れ替える前の方式Eへ戻る(前後を比べるため)。
 *
 * ## 2つの式は性質が違う
 *
 * 方式Eの軽減は**攻める側の攻撃力との比**で決まるので、攻撃を積めば相手の防御を抜ける。
 * いまの式は攻撃力を見ないため、**防御の値だけで軽減率が確定する。**
 * 同じDEF3,600でも、方式Eは攻撃力次第で40%前後、いまの式は常に81%軽減になる。
 * 数字の大小ではなく**この性質の違い**が難易度を動かす。
 *
 * **だから敵のDEFは式と対で決まっている。**塔も各ダンジョンも、入れ替えに合わせて
 * 実数を下げてある。片方だけ触ると崩れる(`docs/element-sw-plan-a.md`)。
 */
export function applyDefense(baseDamage, effectiveAtk, effectiveDef, ignoreDefense = false) {
    const base = Math.max(0, baseDamage);
    if (ignoreDefense)
        return { afterRatio: base, flatReduction: 0, afterDefense: base };
    if (balanceFlags.defenseFormula === "sw")
        return applyDefenseSw(base, effectiveDef);
    return applyDefenseLegacyE(base, effectiveAtk, effectiveDef);
}
/**
 * **いまの本番の式。** `1000 / (1000 + 1.2 × DEF)`。固定減算は持たない。
 * 攻撃力を受け取らないのは、**見ないから**。
 */
export function applyDefenseSw(baseDamage, effectiveDef) {
    const base = Math.max(0, baseDamage);
    const def = Math.max(0, effectiveDef);
    const afterRatio = base * DEF_SW_BASE / (DEF_SW_BASE + balanceFlags.swRatio * def);
    return { afterRatio, flatReduction: 0, afterDefense: Math.max(0, afterRatio) };
}
/**
 * **入れ替える前の方式E。**軽減が攻撃力との比で決まっていた頃の式。
 * 前後を並べて比べる検証ツールが直接呼ぶので、フラグを通さずに残してある。
 */
export function applyDefenseLegacyE(baseDamage, effectiveAtk, effectiveDef, ignoreDefense = false) {
    const base = Math.max(0, baseDamage);
    if (ignoreDefense)
        return { afterRatio: base, flatReduction: 0, afterDefense: base };
    const atk = Math.max(0, effectiveAtk);
    const def = Math.max(0, effectiveDef);
    const scaledDef = def * DEFENSE_RATIO;
    const afterRatio = scaledDef + atk > 0 ? base * atk / (scaledDef + atk) : base;
    const flatReduction = Math.min(def * FLAT_DEFENSE_RATIO, afterRatio * FLAT_DEFENSE_CAP);
    return { afterRatio, flatReduction, afterDefense: Math.max(0, afterRatio - flatReduction) };
}
/** 通常防御計算の最終整数化。将来の完全無効(0)はこの関数を呼ばず区別する。 */
export function roundNormalDamage(value) {
    return Math.max(1, Math.round(value));
}
