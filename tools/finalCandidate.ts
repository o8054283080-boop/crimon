/**
 * バランス検証で使う**最終候補の定義。ここが唯一の置き場所。**
 *
 * 測定ツールから読むだけの値で、**本番データではない。**
 * `balanceFlags` に載せている間だけ効き、`resetBalanceFlags()` で消える。
 *
 * 定義だけを別ファイルにしてあるのは、測定スクリプト本体から import すると
 * **そのスクリプトのトップレベルが丸ごと走ってしまう**ため
 * (実際に、敵倍率スキャンを動かしたら162個体の監査が先に流れた)。
 */
export const FINAL_CANDIDATE = {
  defenseFormula: "sw" as const,
  swRatio: 1.2,
  unifyDefModifiers: true,
  defDownRate: 0.75,
  defUpRate: 0.30,
  typeMultiplierOverride: {
    // 体力タイプ: HP 1.20→1.10 / DEF 1.00→0.90。他は現行のまま
    HP: { hp: 1.10, def: 0.90 },
    // 防御タイプ: HP 1.00→0.85 / DEF 1.20→1.40。他は現行のまま
    DEFENSE: { hp: 0.85, def: 1.40 },
  },
  abilityPointOverride: { def: 5 },
  /**
   * 属性相性はサマナーズウォー方式。
   * 有利はクリ率+15pt、不利はクリ率-15ptに加えて50%でかすり。
   * **かすりは弱体を入れられない**ので、デバッファーの属性が編成の要件になる。
   */
  elementMode: "sw" as const,
};

/** 旧仕様 = いまの本番。防御式・タイプ・能力付与・防御低下、すべて現行 */
export const LEGACY_SPEC = { defenseFormula: "legacy" as const, unifyDefModifiers: false };
