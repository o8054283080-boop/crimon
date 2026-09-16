/**
 * **バランスの切り替え。既定が本番仕様で、旧仕様へ戻して比べるための道具。**
 *
 * 元は「防御計算を変えたら難易度がどう動くか」を、本番データを書き換えずに測るために置いた。
 * 測り終わって新仕様を本番へ入れた今も残してあるのは、**前後を並べて比べる道が要る**から。
 * 本番データを書き換えて測ると戻し忘れる事故が起きる(しかも型もテストも通るので気づけない)。
 * だからデータではなく計算の側に分岐を置き、**既定を本番仕様に固定する。**
 *
 * 切り替えは環境変数だけで、画面からは触れない。
 * ブラウザには `process` が無いので、読み取りは必ず try で囲う。
 *
 *   CRIMON_DEF_FORMULA=legacy   防御計算を旧式(方式E)へ戻す (既定: sw = 本番)
 *   CRIMON_ELEMENT=legacy       属性相性を旧方式(有利×1.5 / 不利×0.5)へ戻す (既定: sw = 本番)
 *   CRIMON_UNIFY_DEF=1          防御の増減幅を一律に揃える (**検証専用。本番では使わない**)
 */
/** `unifyDefModifiers` を立てた時の既定の幅。検証専用 */
export const UNIFIED_DEF_DOWN = 0.5;
export const UNIFIED_DEF_UP = 0.3;
/**
 * サマナーズウォー方式の属性相性の定数。
 * 有利/不利でクリ率を15pt動かし、不利側は50%で「かすり」になる。
 * かすりはダメージ3割減で、クリティカルも弱体付与もできない。
 */
export const SW_CRIT_SHIFT = 0.15;
export const SW_GLANCING_CHANCE = 0.5;
export const SW_GLANCING_MULTIPLIER = 0.7;
/** 防御計算の係数。`1000 / (1000 + DEF_SW_RATIO * DEF)` */
export const DEF_SW_BASE = 1000;
export const DEF_SW_RATIO = 1.2;
function readEnv(name) {
    try {
        // ブラウザにも Deno にも素の `process` は無い。触れる時だけ読む
        const env = globalThis.process?.env;
        return env?.[name];
    }
    catch {
        return undefined;
    }
}
export const balanceFlags = {
    defenseFormula: readEnv("CRIMON_DEF_FORMULA") === "legacy" ? "legacy" : "sw",
    unifyDefModifiers: readEnv("CRIMON_UNIFY_DEF") === "1",
    swRatio: Number(readEnv("CRIMON_DEF_SW_RATIO") ?? DEF_SW_RATIO) || DEF_SW_RATIO,
    defDownRate: Number(readEnv("CRIMON_DEF_DOWN") ?? UNIFIED_DEF_DOWN) || UNIFIED_DEF_DOWN,
    defUpRate: Number(readEnv("CRIMON_DEF_UP") ?? UNIFIED_DEF_UP) || UNIFIED_DEF_UP,
    elementMode: readEnv("CRIMON_ELEMENT") === "legacy" ? "legacy" : "sw",
};
/**
 * 検証を終えたら必ず呼ぶ。**上書きを消し忘れると、後の測定が全部ずれる。**
 * 戻す先は**本番仕様**であって、入れ替える前の旧仕様ではない。
 * `setBalanceFlags` は Object.assign なので、undefined を渡しても消えない
 * (キーが残る)。消すのはこちらの仕事。
 */
export function resetBalanceFlags() {
    balanceFlags.defenseFormula = "sw";
    balanceFlags.elementMode = "sw";
    balanceFlags.unifyDefModifiers = false;
    balanceFlags.swRatio = DEF_SW_RATIO;
    balanceFlags.defDownRate = UNIFIED_DEF_DOWN;
    balanceFlags.defUpRate = UNIFIED_DEF_UP;
    delete balanceFlags.typeMultiplierOverride;
    delete balanceFlags.abilityPointOverride;
    delete balanceFlags.elementMultiplierOverride;
}
/** 測定ツールから明示的に切り替える。**本番の経路からは呼ばない。** */
export function setBalanceFlags(next) {
    Object.assign(balanceFlags, next);
}
