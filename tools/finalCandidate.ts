/**
 * バランス検証で使う仕様の定義。**ここが唯一の置き場所。**
 *
 * 測定ツールから読むだけの値で、`balanceFlags` に載せている間だけ効く。
 *
 * 定義だけを別ファイルにしてあるのは、測定スクリプト本体から import すると
 * **そのスクリプトのトップレベルが丸ごと走ってしまう**ため
 * (実際に、敵倍率スキャンを動かしたら162個体の監査が先に流れた)。
 *
 * ## いまの本番と、この定義の関係
 *
 * 防御式・属性・タイプ倍率・能力付与は**すでに本番へ入った**ので、
 * `FINAL_CANDIDATE` を載せなくても `resetBalanceFlags()` の状態が本番仕様になる。
 * 残してあるのは、**取り込み前の測定を同じ条件で再現できるようにする**ため。
 * `unifyDefModifiers` だけは検証専用で、**本番には入れていない**
 * (入れると防御上昇80%のスキルが30%になるなど、役割ごと壊れる)。
 */
export const FINAL_CANDIDATE = {
  defenseFormula: "sw" as const,
  swRatio: 1.2,
  /** **検証専用。本番には入っていない。**式だけを比べたい時に幅を揃えるための道具 */
  unifyDefModifiers: true,
  defDownRate: 0.75,
  defUpRate: 0.30,
  typeMultiplierOverride: {
    // 体力タイプ: HP 1.20→1.10 / DEF 1.00→0.90。**本番へ取り込み済み**
    HP: { hp: 1.10, def: 0.90 },
    // 防御タイプ: HP 1.00→0.85 / DEF 1.20→1.40。**本番へ取り込み済み**
    DEFENSE: { hp: 0.85, def: 1.40 },
  },
  /** **本番へ取り込み済み**(ABILITY_POINT_VALUES.def = 5) */
  abilityPointOverride: { def: 5 },
  /**
   * 属性相性はサマナーズウォー方式。**本番へ取り込み済み。**
   * 有利はクリ率+15pt、不利はクリ率-15ptに加えて50%でかすり。
   * **かすりは弱体を入れられない**ので、デバッファーの属性が編成の要件になる。
   */
  elementMode: "sw" as const,
};

/**
 * 入れ替える**前**の仕様。前後を並べて比べる時に載せる。
 * タイプ倍率と能力付与は本番データそのものを書き換えたので、ここでは戻せない
 * (式と属性だけが `balanceFlags` で戻せる)。
 */
export const LEGACY_SPEC = {
  defenseFormula: "legacy" as const,
  elementMode: "legacy" as const,
  unifyDefModifiers: false,
};
