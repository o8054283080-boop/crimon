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
