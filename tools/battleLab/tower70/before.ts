/**
 * 過去の回の実測値。**消さずに残す。**
 *
 * 新旧を並べられないと、勝率が動いた時に「何をしたから動いたのか」が
 * 読めなくなる。ここは測り直しても上書きしないこと——上書きした瞬間、
 * 比較表が「今の値と今の値」を並べるだけの飾りになる。
 *
 * 測定条件は第2回と同じ(装備段階 TYPICAL / 各1000戦 / seed 20260903)。
 */
export interface Tower70BeforeRow {
  party: string;
  focus: string;
  winRate: number;
  /** 引き分け(300手)の割合。**第3回はここが最重要** */
  drawRate?: number;
  avgTurns: number;
  /** 生命晶の全体解除回数(1戦あたり) */
  lifeCleanses: number;
  /** 脈動晶のシールド発動回数(1戦あたり) */
  pulseShields: number;
  /** 本体が自ターン終了時の回復を発動した回数 = 本体の行動回数の目安 */
  bossRegenTicks: number;
  avgHpPercent: number;
}

export const TOWER70_BEFORE: Tower70BeforeRow[] = [
  { party: "TYPICAL", focus: "生命晶→脈動晶→ボス", winRate: 0.986, avgTurns: 54.2, lifeCleanses: 0, pulseShields: 0, bossRegenTicks: 3, avgHpPercent: 0.927 },
  { party: "TYPICAL", focus: "生命晶→ボス", winRate: 0.986, avgTurns: 54.2, lifeCleanses: 0, pulseShields: 0, bossRegenTicks: 3, avgHpPercent: 0.927 },
  { party: "TYPICAL", focus: "脈動晶→ボス", winRate: 0.986, avgTurns: 53.1, lifeCleanses: 0, pulseShields: 0, bossRegenTicks: 3, avgHpPercent: 0.929 },
  { party: "TYPICAL", focus: "ボス集中", winRate: 0.999, avgTurns: 40.7, lifeCleanses: 1, pulseShields: 0, bossRegenTicks: 1, avgHpPercent: 0.985 },
  { party: "TYPICAL", focus: "既存AIまかせ", winRate: 0.986, avgTurns: 54.3, lifeCleanses: 0, pulseShields: 0, bossRegenTicks: 3, avgHpPercent: 0.926 },
  { party: "POISON", focus: "ボス集中", winRate: 0.650, avgTurns: 219.9, lifeCleanses: 2, pulseShields: 4, bossRegenTicks: 4, avgHpPercent: 0.931 },
  { party: "POISON", focus: "生命晶→ボス", winRate: 0.946, avgTurns: 115.0, lifeCleanses: 1, pulseShields: 3, bossRegenTicks: 8, avgHpPercent: 0.852 },
  { party: "POISON", focus: "生命晶→脈動晶→ボス", winRate: 0.946, avgTurns: 115.0, lifeCleanses: 1, pulseShields: 3, bossRegenTicks: 8, avgHpPercent: 0.852 },
  { party: "POISON", focus: "既存AIまかせ", winRate: 0.935, avgTurns: 118.5, lifeCleanses: 1, pulseShields: 3, bossRegenTicks: 8, avgHpPercent: 0.852 },
  { party: "HIGH_RARITY", focus: "生命晶→脈動晶→ボス", winRate: 0.999, avgTurns: 25.3, lifeCleanses: 0, pulseShields: 1, bossRegenTicks: 1, avgHpPercent: 0.936 },
  { party: "HIGH_RARITY", focus: "生命晶→ボス", winRate: 0.999, avgTurns: 25.3, lifeCleanses: 0, pulseShields: 1, bossRegenTicks: 1, avgHpPercent: 0.936 },
  { party: "HIGH_RARITY", focus: "脈動晶→ボス", winRate: 0.983, avgTurns: 28.4, lifeCleanses: 0, pulseShields: 0, bossRegenTicks: 2, avgHpPercent: 0.756 },
  { party: "HIGH_RARITY", focus: "ボス集中", winRate: 1.000, avgTurns: 11.2, lifeCleanses: 1, pulseShields: 0, bossRegenTicks: 0, avgHpPercent: 0.999 },
  { party: "HIGH_RARITY", focus: "既存AIまかせ", winRate: 0.999, avgTurns: 25.5, lifeCleanses: 0, pulseShields: 1, bossRegenTicks: 1, avgHpPercent: 0.936 },
  { party: "SUSTAIN", focus: "生命晶→脈動晶→ボス", winRate: 0.548, avgTurns: 170.2, lifeCleanses: 0, pulseShields: 3, bossRegenTicks: 24, avgHpPercent: 0.895 },
  { party: "SUSTAIN", focus: "生命晶→ボス", winRate: 0.548, avgTurns: 170.2, lifeCleanses: 0, pulseShields: 3, bossRegenTicks: 24, avgHpPercent: 0.895 },
  { party: "SUSTAIN", focus: "脈動晶→ボス", winRate: 0.559, avgTurns: 167.5, lifeCleanses: 1, pulseShields: 3, bossRegenTicks: 23, avgHpPercent: 0.898 },
  { party: "SUSTAIN", focus: "ボス集中", winRate: 0.711, avgTurns: 130.1, lifeCleanses: 1, pulseShields: 3, bossRegenTicks: 17, avgHpPercent: 0.912 },
  { party: "SUSTAIN", focus: "既存AIまかせ", winRate: 0.547, avgTurns: 170.7, lifeCleanses: 1, pulseShields: 3, bossRegenTicks: 24, avgHpPercent: 0.899 },
];

/**
 * 第2回(取り巻き強化・段階の置き換え式・始祖の咆哮)の実測値。
 *
 * 咆哮 ATK2.0倍+最大HP8%、脈動晶は守り役(シールド)。
 * 引き分けが TYPICAL 81〜89% / SUSTAIN 96〜99% まで膨らんだ回。
 */
export const TOWER70_V2: Tower70BeforeRow[] = [
  { party: "TYPICAL", focus: "生命晶→脈動晶→ボス", winRate: 0.020, drawRate: 0.884, avgTurns: 278.4, lifeCleanses: 0, pulseShields: 16, bossRegenTicks: 31, avgHpPercent: 0.621 },
  { party: "TYPICAL", focus: "生命晶→ボス", winRate: 0.020, drawRate: 0.884, avgTurns: 278.4, lifeCleanses: 0, pulseShields: 16, bossRegenTicks: 31, avgHpPercent: 0.621 },
  { party: "TYPICAL", focus: "脈動晶→ボス", winRate: 0.009, drawRate: 0.894, avgTurns: 278.6, lifeCleanses: 1, pulseShields: 10, bossRegenTicks: 31, avgHpPercent: 0.622 },
  { party: "TYPICAL", focus: "ボス集中", winRate: 0.001, drawRate: 0.813, avgTurns: 254.2, lifeCleanses: 3, pulseShields: 18, bossRegenTicks: 18, avgHpPercent: 0.573 },
  { party: "TYPICAL", focus: "既存AIまかせ", winRate: 0.017, drawRate: 0.887, avgTurns: 279.2, lifeCleanses: 1, pulseShields: 15, bossRegenTicks: 32, avgHpPercent: 0.620 },
  { party: "POISON", focus: "ボス集中", winRate: 0.103, drawRate: 0.763, avgTurns: 258.8, lifeCleanses: 2, pulseShields: 13, bossRegenTicks: 17, avgHpPercent: 0.567 },
  { party: "POISON", focus: "生命晶→ボス", winRate: 0.058, drawRate: 0.739, avgTurns: 243.8, lifeCleanses: 1, pulseShields: 16, bossRegenTicks: 32, avgHpPercent: 0.450 },
  { party: "POISON", focus: "生命晶→脈動晶→ボス", winRate: 0.058, drawRate: 0.739, avgTurns: 243.8, lifeCleanses: 1, pulseShields: 16, bossRegenTicks: 32, avgHpPercent: 0.450 },
  { party: "POISON", focus: "既存AIまかせ", winRate: 0.058, drawRate: 0.670, avgTurns: 229.2, lifeCleanses: 1, pulseShields: 12, bossRegenTicks: 30, avgHpPercent: 0.425 },
  { party: "HIGH_RARITY", focus: "生命晶→脈動晶→ボス", winRate: 0.089, drawRate: 0.341, avgTurns: 144.9, lifeCleanses: 0, pulseShields: 13, bossRegenTicks: 11, avgHpPercent: 0.309 },
  { party: "HIGH_RARITY", focus: "生命晶→ボス", winRate: 0.089, drawRate: 0.341, avgTurns: 144.9, lifeCleanses: 0, pulseShields: 13, bossRegenTicks: 11, avgHpPercent: 0.309 },
  { party: "HIGH_RARITY", focus: "脈動晶→ボス", winRate: 0.126, drawRate: 0.154, avgTurns: 102.7, lifeCleanses: 1, pulseShields: 0, bossRegenTicks: 14, avgHpPercent: 0.185 },
  { party: "HIGH_RARITY", focus: "ボス集中", winRate: 0.057, drawRate: 0.145, avgTurns: 61.6, lifeCleanses: 3, pulseShields: 6, bossRegenTicks: 5, avgHpPercent: 0.227 },
  { party: "HIGH_RARITY", focus: "既存AIまかせ", winRate: 0.088, drawRate: 0.340, avgTurns: 144.4, lifeCleanses: 0, pulseShields: 13, bossRegenTicks: 11, avgHpPercent: 0.308 },
  { party: "SUSTAIN", focus: "生命晶→脈動晶→ボス", winRate: 0.000, drawRate: 0.971, avgTurns: 296.8, lifeCleanses: 2, pulseShields: 15, bossRegenTicks: 41, avgHpPercent: 0.807 },
  { party: "SUSTAIN", focus: "生命晶→ボス", winRate: 0.000, drawRate: 0.971, avgTurns: 296.8, lifeCleanses: 2, pulseShields: 15, bossRegenTicks: 41, avgHpPercent: 0.807 },
  { party: "SUSTAIN", focus: "脈動晶→ボス", winRate: 0.000, drawRate: 0.965, avgTurns: 296.2, lifeCleanses: 5, pulseShields: 13, bossRegenTicks: 40, avgHpPercent: 0.805 },
  { party: "SUSTAIN", focus: "ボス集中", winRate: 0.000, drawRate: 0.990, avgTurns: 298.8, lifeCleanses: 6, pulseShields: 20, bossRegenTicks: 36, avgHpPercent: 0.817 },
  { party: "SUSTAIN", focus: "既存AIまかせ", winRate: 0.000, drawRate: 0.962, avgTurns: 296.1, lifeCleanses: 4, pulseShields: 14, bossRegenTicks: 40, avgHpPercent: 0.801 },
];

export function tower70Before(party: string, focus: string): Tower70BeforeRow | undefined {
  return TOWER70_BEFORE.find((row) => row.party === party && row.focus === focus);
}

export function tower70V2(party: string, focus: string): Tower70BeforeRow | undefined {
  return TOWER70_V2.find((row) => row.party === party && row.focus === focus);
}
