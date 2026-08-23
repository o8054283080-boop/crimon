export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  /** クリティカル率 (0-1) */
  criRate: number;
  /** クリティカルダメージ倍率 (1.5 = +50%) */
  criDmg: number;
  /** デバフ抵抗率 (0-1) */
  resistance: number;
  /** デバフ命中率 (0-1) */
  accuracy: number;
}

export function cloneStats(stats: Stats): Stats {
  return { ...stats };
}

/** UI表示用に、クリ率・クリダメ・状態異常付与率・抵抗率を短い日本語テキストの配列に変換する */
export function formatExtraStatLines(stats: Stats): string[] {
  return [
    `クリ率 ${Math.round(stats.criRate * 100)}%`,
    `クリダメ +${Math.round((stats.criDmg - 1) * 100)}%`,
    `状態異常付与率 ${Math.round(stats.accuracy * 100)}%`,
    `状態異常抵抗率 ${Math.round(stats.resistance * 100)}%`,
  ];
}

/** 1項目ぶんの内訳。素の値と、装備で増えた分を分けて持つ */
export interface StatBreakdownEntry {
  key: keyof Stats;
  label: string;
  /** 装備込みの最終値(表示用の文字列) */
  total: string;
  /** 装備を外した素の値(表示用の文字列) */
  base: string;
  /**
   * 装備でどれだけ増えたか(表示用の文字列)。増減が無い項目では null。
   * 表示に出す整数どうしの差で出しているので、**画面上で「素+増加=最終」が必ず成り立つ**
   * (先に実数で引き算してから丸めると、丸め方によって1ずれて見えることがある)
   */
  gain: string | null;
}

export interface StatFormat {
  key: keyof Stats;
  label: string;
  /** 表示する整数値へ変換する(百分率の項目は100倍する) */
  toInt: (stats: Stats) => number;
  /** 数値の後ろに付ける単位。付かない項目は空文字 */
  unit: string;
  /**
   * 素の値を出す時だけ頭に付ける記号。クリダメは1.5倍を「+150%」と見せる決まりがあるため。
   * **上昇分にはこれを付けない**(付けると増減の符号と重なって「++50%」になる)
   */
  prefix?: string;
}

const INT_STAT = (key: keyof Stats, label: string): StatFormat => ({
  key,
  label,
  toInt: (s) => Math.round(s[key]),
  unit: "",
});

const PERCENT_STAT = (key: keyof Stats, label: string): StatFormat => ({
  key,
  label,
  toInt: (s) => Math.round(s[key] * 100),
  unit: "%",
});

/** HP・攻撃・防御・速度。強さを判断する時にまず見る4項目 */
export const PRIMARY_STAT_FORMATS: StatFormat[] = [
  INT_STAT("hp", "HP"),
  INT_STAT("atk", "攻撃力"),
  INT_STAT("def", "防御力"),
  INT_STAT("spd", "速度"),
];

/** クリ率・クリダメ・状態異常の付与率と抵抗率 */
export const EXTRA_STAT_FORMATS: StatFormat[] = [
  PERCENT_STAT("criRate", "クリ率"),
  // クリダメだけは1.5倍を「+50%」と見せる決まりなので、100倍ではなく「(倍率-1)の100倍」
  { key: "criDmg", label: "クリダメ", toInt: (s) => Math.round((s.criDmg - 1) * 100), unit: "%", prefix: "+" },
  PERCENT_STAT("accuracy", "状態異常付与率"),
  PERCENT_STAT("resistance", "状態異常抵抗率"),
];

/**
 * 素のステータスと装備込みのステータスを突き合わせて、項目ごとの内訳を作る。
 *
 * 装備を着けた後の合計値しか出していなかったため、
 * **その数字のうちどれだけが装備のおかげなのかが分からなかった**。
 * 装備を組み替える判断はこの差分を見てするものなので、分けて持たせる。
 */
export function buildStatBreakdown(base: Stats, total: Stats, formats: StatFormat[]): StatBreakdownEntry[] {
  return formats.map((f) => {
    const baseInt = f.toInt(base);
    const totalInt = f.toInt(total);
    const diff = totalInt - baseInt;
    const show = (value: number) => `${f.prefix ?? ""}${value}${f.unit}`;
    return {
      key: f.key,
      label: f.label,
      total: show(totalInt),
      base: show(baseInt),
      gain: diff === 0 ? null : `${diff > 0 ? "+" : "−"}${Math.abs(diff)}${f.unit}`,
    };
  });
}
