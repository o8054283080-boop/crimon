import type { MonsterDefinition } from "../core/monster.js";

/** NORMAL完成ステータスへ追加で掛けるHARD専用倍率。 */
export interface TrialTowerHardMultipliers {
  hp: number;
  def: number;
  atk: number;
  spd: number;
}

const M = (hp: number, def: number, atk: number, spd: number): TrialTowerHardMultipliers => ({ hp, def, atk, spd });

/**
 * Battle LabのH7通常階＋H8ボス階を本番用データとして固定したもの。
 * 元の敵定義・階固有補正を作り終えた後へ掛け、NORMAL側の調整を上書きしない。
 */
export function trialTowerHardMultipliers(floor: number): TrialTowerHardMultipliers {
  if (floor <= 9) return M(30, 1, 80, 2.20);
  if (floor === 10) return M(12, 1, 30, 1.55);
  if (floor <= 19) return M(15, 1, 40, 1.55);
  if (floor === 20) return M(8, 1, 20, 1.30);
  if (floor <= 29) return M(8, 1, 15, 1.20);
  if (floor === 30) return M(4, 1, 8, 1.10);
  if (floor <= 39) return M(4, 1, 8, 1.08);

  const fixed: Record<number, TrialTowerHardMultipliers> = {
    40: M(3, 1, 8.5, 1.08),
    41: M(3, 1, 14, 1.18), 42: M(3, 1, 14, 1.18),
    43: M(3, 1, 24, 1.35), 44: M(3, 1, 12, 1.15),
    45: M(3, 1, 15, 1.20), 46: M(1.5, 1, 22, 1.32),
    47: M(3, 1, 10, 1.12), 48: M(1.75, 1, 20, 1.28),
    49: M(3, 1, 9.2, 1.10), 50: M(0.7, 1, 9, 1.16),
    51: M(3, 1.25, 24, 1.57), 52: M(3, 1, 24, 1.50),
    53: M(3, 1, 24, 1.47), 54: M(3, 1.75, 24, 1.60),
    55: M(3, 1, 24, 1.50), 56: M(3, 1, 16, 1.30),
    57: M(3, 1, 18, 1.38), 58: M(3, 1.20, 18, 1.44),
    59: M(3, 1, 15.5, 1.28), 60: M(1.5, 1, 8, 1.15),
    61: M(2.5, 1, 20, 1.45), 62: M(2.5, 1, 20, 1.45),
    63: M(2.5, 1, 16, 1.35), 64: M(2.5, 1, 16, 1.35),
    65: M(2.5, 1, 19, 1.42), 66: M(2.5, 1, 12.5, 1.23),
    67: M(2.5, 1, 15, 1.30), 68: M(1.5, 1, 20, 1.35),
    69: M(2.5, 1, 10, 1.16), 70: M(0.8, 1, 4.5, 1.20),
    71: M(3.5, 1, 30, 1.15), 72: M(3.5, 1, 30, 1.08),
    73: M(3.5, 1, 30, 1.09), 74: M(3.5, 1, 30, 1.08),
    75: M(3.5, 1, 12, 1.05), 76: M(3, 1, 11, 1.05),
    77: M(2.25, 1, 18, 1.20), 78: M(2.5, 1, 11, 1.08),
    79: M(2.7, 1, 13, 1.08), 80: M(1.2, 1, 7, 1.22),
    81: M(3.2, 1, 18, 1.10), 82: M(3.2, 1, 18, 1.10),
    83: M(3.2, 1, 18, 1.10), 84: M(3.2, 1, 18, 1.12),
    85: M(2.8, 1, 12, 1.03), 86: M(2.8, 1, 13, 1.06),
    87: M(2.8, 1, 13, 1.08), 88: M(2.5, 1, 16, 1.15),
    89: M(1.8, 1, 10, 1.14), 90: M(0.85, 1, 3, 1.20),
    91: M(3, 1, 16, 1.20), 92: M(3, 1, 16, 1.20),
    93: M(3, 1, 16, 1.20), 94: M(3, 1, 16, 1.20),
    95: M(2.7, 1, 12, 1.20), 96: M(2.7, 1, 12, 1.20),
    97: M(2.7, 1, 12, 1.20), 98: M(2, 1, 8, 1.20),
    99: M(2, 1, 8, 1.20), 100: M(1.6, 1.15, 1.5, 1.22),
  };
  const at = Math.max(40, Math.min(100, Math.round(floor)));
  const value = fixed[at];
  if (!value) throw new Error(`試練の塔HARD ${floor}階の倍率がありません`);
  return isUpperNormalFloor(at) ? { ...value, hp: value.hp * TRIAL_TOWER_HARD_UPPER_HP_BOOST } : value;
}

/**
 * 51〜99階の**通常階**だけ、敵のHPを上の表からさらに1.2倍にする(2026-09-27)。
 *
 * 上位の5体(依頼主の実際の育成)が1回の登頂で4〜5回しか負けず、楽に100階へ届いていた。
 * 依頼主の目標は「1回の登頂で10回くらい負ける」。ボス特性(下)と合わせて
 * `tools/towerHardClimb.ts` で 8.7回 / 10.2回(種を変えて2通り)。
 * 1.3倍で12〜13回、1.5倍で15回。表の値を1つずつ書き換えず掛け算で持つのは、
 * **元の表がPR #431 の検証と対になっている**ので、どこから動かしたかを残すため。
 */
export const TRIAL_TOWER_HARD_UPPER_HP_BOOST = 1.2;
const isUpperNormalFloor = (floor: number): boolean => floor >= 51 && floor <= 99 && floor % 10 !== 0;

/**
 * HARDの**ボス階の主**にだけ付ける特性。
 *
 * 気絶とゲージ操作で主に一度も手番を渡さない戦い方が、HARDの山場を平らにしていた。
 * 効き目は消さずに**半分**にし、気絶させた後に速くなる。止めたらその後をどう受けるかを問う。
 * **取り巻きと通常階には付けない。**全ての敵へ付けると、ゲージ操作という戦い方そのものが潰れる
 * (実測: 上位の5体が1回の登頂で61回負け、20回とも100階に届かなかった)。
 */
export const TRIAL_TOWER_HARD_BOSS_TRAITS = {
  stunHaste: { spd: 0.5, turns: 3 },
  gaugeResist: 0.5,
} as const;

/** 戦闘用に完成したNORMAL敵定義の複製だけを倍率化する。ボス階の主(`isBoss`)にはHARDのボス特性も付ける。 */
export function scaleTrialTowerHardEnemies(enemies: MonsterDefinition[], floor: number): MonsterDefinition[] {
  const scale = trialTowerHardMultipliers(floor);
  return enemies.map((enemy) => ({
    ...enemy,
    ...(enemy.isBoss ? { bossTraits: { ...enemy.bossTraits, ...TRIAL_TOWER_HARD_BOSS_TRAITS, stunHaste: { ...TRIAL_TOWER_HARD_BOSS_TRAITS.stunHaste } } } : {}),
    stats: {
      ...enemy.stats,
      hp: Math.max(1, Math.round(enemy.stats.hp * scale.hp)),
      def: Math.max(1, Math.round(enemy.stats.def * scale.def)),
      atk: Math.max(1, Math.round(enemy.stats.atk * scale.atk)),
      spd: Math.max(1, Math.round(enemy.stats.spd * scale.spd)),
    },
  }));
}
