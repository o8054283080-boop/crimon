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

/** 防御計算の方式。`sw` が本番、`legacy` が入れ替える前の方式E */
export type DefenseFormula = "legacy" | "sw";

export interface BalanceFlags {
  defenseFormula: DefenseFormula;
  /**
   * 防御の増減幅を統一する。**検証専用で、本番では使わない。**
   *
   * スキルごとに 0.25〜0.5(低下) / 0.15〜0.8(上昇) とばらついているので、
   * **式の違いだけを見たい時に幅の違いが混ざらないようにする**ための道具。
   * 本番へ持ち込むと、防御上昇80%のスキルが30%になるなど**役割ごと壊れる**ので入れていない。
   */
  unifyDefModifiers: boolean;
  /**
   * 防御計算の係数。`1000 / (1000 + ratio * DEF)`。**本番は1.2。**
   *
   * **サマナーズウォーの式をそのまま持ち込むと強すぎる。**あちらのDEFは
   * 数百〜1000台だが、CRIMONの終盤は3,000〜6,000ある。同じ 1.2 を当てると
   * DEF3,600で81%軽減になり、旧式(攻撃力1万に対し36%軽減)とは別物になる。
   * **だから敵のDEFを対で決め直してある**(塔・各ダンジョンとも実数を下げた)。
   * ここを動かすなら敵側も一緒に測り直すこと。
   */
  swRatio: number;
  /** `unifyDefModifiers` を立てた時の防御**低下**幅。検証専用 */
  defDownRate: number;
  /** 同上、防御**上昇**幅。検証専用 */
  defUpRate: number;
  /**
   * タイプ転生の倍率の上書き。**種類ごとに、書いた項目だけ**差し替える。
   * `{ HP: { hp: 1.10 } }` なら体力タイプのHP倍率だけが変わり、残りは本番のまま。
   */
  typeMultiplierOverride?: Partial<Record<string, Record<string, number>>>;
  /** 能力付与の1ptあたりの値の上書き。書いた能力だけ差し替える */
  abilityPointOverride?: Partial<Record<string, number>>;
  /**
   * 旧方式の属性倍率の上書き。`elementMode` が `legacy` の時だけ効く。
   * (本番は `sw` で、こちらは倍率を使わない)
   */
  elementMultiplierOverride?: { advantage?: number; disadvantage?: number };
  /**
   * 属性相性の効き方。**本番は `sw`。**
   *
   * `legacy` は入れ替える前の倍率方式(有利×1.5 / 不利×0.5)。
   * `sw` はサマナーズウォー方式で、**倍率ではなく確率で効く**。
   *   ・有利   クリ率 +15pt
   *   ・不利   クリ率 −15pt、さらに**50%でかすり**
   *   ・かすり ダメージ −30%、クリティカル不可、**弱体を入れられない**
   *
   * **いちばん重いのは最後の「弱体を入れられない」。**防御低下を持っていても、
   * 苦手属性へ撃ってかすると入らない。火力の話では終わらない。
   *
   * 有利の見返りは 1.50 → 1.10前後まで縮む一方、不利は 0.50 → 0.56前後で
   * ほぼ据え置き。**得だけが小さくなる**ので、有利属性を突く前提で組んだ敵は
   * 相対的に重くなる(`docs/element-sw-plan-a.md`)。
   */
  elementMode?: "legacy" | "sw";
}

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

function readEnv(name: string): string | undefined {
  try {
    // ブラウザにも Deno にも素の `process` は無い。触れる時だけ読む
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    return env?.[name];
  } catch {
    return undefined;
  }
}

export const balanceFlags: BalanceFlags = {
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
export function resetBalanceFlags(): void {
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
export function setBalanceFlags(next: Partial<BalanceFlags>): void {
  Object.assign(balanceFlags, next);
}
