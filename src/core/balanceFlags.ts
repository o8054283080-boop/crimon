/**
 * **バランス検証のための切り替え。既定は必ず現行仕様。**
 *
 * 「防御計算を変えたら各コンテンツの難易度がどう動くか」を測るために置いた。
 * 本番データを書き換えて測ると、測り終わったあと元に戻し忘れる事故が起きる
 * (しかも型もテストも通ってしまうので気づけない)。だから**データではなく
 * 計算の側に分岐を置き、既定を現行仕様に固定する。**
 *
 * 切り替えは環境変数だけで、画面からは触れない。
 * ブラウザには `process` が無いので、読み取りは必ず try で囲う。
 *
 *   CRIMON_DEF_FORMULA=sw   防御計算を検証式へ (既定: legacy = 現行の方式E)
 *   CRIMON_UNIFY_DEF=1      防御低下を一律50%・防御上昇を一律30%へ
 */

/** 防御計算の方式。`legacy` が本番、`sw` が検証中の新式 */
export type DefenseFormula = "legacy" | "sw";

export interface BalanceFlags {
  defenseFormula: DefenseFormula;
  /**
   * 防御の増減幅を統一する。
   * 現行はスキルごとに 0.25〜0.5(低下) / 0.15〜0.8(上昇) とばらついているので、
   * **式の違いだけを見たい時に幅の違いが混ざらないようにする。**
   */
  unifyDefModifiers: boolean;
  /**
   * 検証式の係数。`1000 / (1000 + ratio * DEF)`。
   *
   * **サマナーズウォーの式をそのまま持ち込むと強すぎる。**あちらのDEFは
   * 数百〜1000台だが、CRIMONの終盤は3,000〜6,000ある。同じ 1.2 を当てると
   * DEF3,600で81%軽減になり、旧式(攻撃力1万に対し36%軽減)とは別物になる。
   * ここを振って、どの係数なら現行の手数に近いかを測るために可変にしてある。
   */
  swRatio: number;
  /**
   * 統一した時の防御**低下**幅。既定0.5。
   * 検証で75%を試すために可変にしてある。
   */
  defDownRate: number;
  /** 統一した時の防御**上昇**幅。既定0.3 */
  defUpRate: number;
  /**
   * タイプ転生の倍率の上書き。**種類ごとに、書いた項目だけ**差し替える。
   * `{ HP: { hp: 1.10 } }` なら体力タイプのHP倍率だけが変わり、残りは本番のまま。
   */
  typeMultiplierOverride?: Partial<Record<string, Record<string, number>>>;
  /** 能力付与の1ptあたりの値の上書き。書いた能力だけ差し替える */
  abilityPointOverride?: Partial<Record<string, number>>;
  /**
   * 属性相性の倍率の上書き。
   *
   * 現行は 有利×1.5 / 不利×0.5。サマナーズウォーは不利側が
   * 「かすり」で約0.7倍なので、**不利のペナルティが現行のほうが重い。**
   * ここを緩めると、不利属性で挑んだ時の火力が上がる一方、
   * **敵が不利属性で殴ってくる時のダメージも上がる**(両陣営に効く)。
   */
  elementMultiplierOverride?: { advantage?: number; disadvantage?: number };
}

/** 統一した時の既定の幅。低下は50%、上昇は30% */
export const UNIFIED_DEF_DOWN = 0.5;
export const UNIFIED_DEF_UP = 0.3;

/** 検証式の係数。`1000 / (1000 + DEF_SW_RATIO * DEF)` */
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
  defenseFormula: readEnv("CRIMON_DEF_FORMULA") === "sw" ? "sw" : "legacy",
  unifyDefModifiers: readEnv("CRIMON_UNIFY_DEF") === "1",
  swRatio: Number(readEnv("CRIMON_DEF_SW_RATIO") ?? DEF_SW_RATIO) || DEF_SW_RATIO,
  defDownRate: Number(readEnv("CRIMON_DEF_DOWN") ?? UNIFIED_DEF_DOWN) || UNIFIED_DEF_DOWN,
  defUpRate: Number(readEnv("CRIMON_DEF_UP") ?? UNIFIED_DEF_UP) || UNIFIED_DEF_UP,
};

/**
 * 検証を終えたら必ず呼ぶ。**上書きを消し忘れると、後の測定が全部ずれる。**
 * `setBalanceFlags` は Object.assign なので、undefined を渡しても消えない
 * (キーが残る)。消すのはこちらの仕事。
 */
export function resetBalanceFlags(): void {
  balanceFlags.defenseFormula = "legacy";
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
