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
