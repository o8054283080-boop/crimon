import type { BossInterrupt, MonsterDefinition } from "../core/monster.js";

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

/**
 * HARDの80・90階のボスにだけ持たせる割り込み技(2026-09-27、依頼主の案)。
 *
 * 70階の「始祖の咆哮」が気絶でもゲージ操作でも止まらない壁になっていた一方、
 * 80・90階はほとんど負けない通過点だった(依頼主の5体で40回登って 70階33 / 80階1 / 90階7 / 100階54)。
 * **咆哮の写しにはしない。**階ごとにそのボスのテーマへ沿わせ、別の役が活きる形にする。
 * 回数は依頼主の指定で少なめ(1戦に1〜2回)。100階は既にいちばんの壁なので付けない。
 *
 * - 80階 古代聖竜(免疫と強化解除の階): HP50%を切った時に1回、全体攻撃と**味方の強化の全消去**。
 *   張り直せる支援役・強化に頼らない耐久役が活きる
 * - 90階 古代ネメシス(お供を倒すと狂化する階): **お供が倒れた時**に2回まで全体攻撃。
 *   「いつ倒すか」——回復やシールドを整えてから落とす判断が要る
 */
export const TRIAL_TOWER_HARD_BOSS_INTERRUPTS: Readonly<Record<number, BossInterrupt>> = {
  80: { name: "聖光の裁き", hpThresholds: [0.5], multiplier: 3, stripBuffs: true },
  90: { name: "報復の冥炎", onAllyDeath: 2, multiplier: 3 },
};

/**
 * HARDの70〜100階のボスは、倍率ではなく**実数で決める**(2026-09-27、依頼主の指定)。
 *
 * 倍率だと階ごとの素の値の癖がそのまま出て、80階のボスが防御950・HP24万の
 * 「一番軽いボス」になっていた(依頼主の5体で40回登って、80階の負けは1〜2回)。
 * ボスの強さを4階で揃えて書けるよう、HP・攻撃・防御・速度をここへ直に置く。
 * 会心・的中・抵抗・スキル・ギミックは元のまま。
 */
export const TRIAL_TOWER_HARD_BOSS_STATS: Readonly<Record<number, { hp: number; atk: number; def: number; spd: number }>> = {
  70: { hp: 250_000, atk: 60_000, def: 3_500, spd: 200 },
  80: { hp: 350_000, atk: 65_000, def: 4_000, spd: 225 },
  90: { hp: 500_000, atk: 70_000, def: 3_800, spd: 250 },
  100: { hp: 700_000, atk: 80_000, def: 5_500, spd: 280 },
};

/**
 * 同じ階のお供のHPは、**平均がボスのHPのこの割合**になるよう揃える(依頼主「HP半分くらい」)。
 * お供どうしの差(硬い晶・脆い獣)は残す。攻撃・防御・速度は倍率のまま。
 * 100階の分身は戦闘中に「ボスの今のHPの25%(最低は倍率×7.5万)」で生まれるので、ここでは触らない。
 */
export const TRIAL_TOWER_HARD_MINION_HP_OF_BOSS = 0.5;

/**
 * HARD 80階「古代聖竜」の免疫の固め方(2026-09-27、依頼主の案)。
 *
 * 80階は依頼主の5体だと敵が1戦で9回ほどしか動けず(味方は59回)、硬くしても負けなかった。
 * 聖竜の免疫(戦闘開始時・HP70%・40%)を張る時、**先に攻撃UP・防御UPを張ってから免疫**にする。
 * 解除は付いた順に外れるので、1個ずつ剥がす相手なら免疫に届くまで3回かかる。
 * 免疫が付いている間は80階の敵全員の速度が30%上がる(剥がせば戻る)。
 */
export const TRIAL_TOWER_HARD_80_IMMUNITY_GUARD = { buffs: ["atk", "def"] as const, spdWhileImmune: 0.3 };

/** 戦闘用に完成したNORMAL敵定義の複製だけを倍率化する。ボス階の主(`isBoss`)にはHARDのボス特性も付ける。 */
export function scaleTrialTowerHardEnemies(enemies: MonsterDefinition[], floor: number): MonsterDefinition[] {
  const scaled = scaleByMultipliers(enemies, floor);
  const bossStats = TRIAL_TOWER_HARD_BOSS_STATS[floor];
  if (!bossStats) return scaled;
  const minions = floor === 100 ? [] : scaled.filter((enemy) => !enemy.isBoss);
  const minionMean = minions.reduce((sum, enemy) => sum + enemy.stats.hp, 0) / Math.max(1, minions.length);
  const minionFactor = minions.length > 0 ? (bossStats.hp * TRIAL_TOWER_HARD_MINION_HP_OF_BOSS) / minionMean : 1;
  return scaled.map((enemy) => {
    if (enemy.isBoss) return { ...enemy, stats: { ...enemy.stats, ...bossStats } };
    if (!minions.includes(enemy)) return enemy;
    return { ...enemy, stats: { ...enemy.stats, hp: Math.max(1, Math.round(enemy.stats.hp * minionFactor)) } };
  });
}

function scaleByMultipliers(enemies: MonsterDefinition[], floor: number): MonsterDefinition[] {
  const scale = trialTowerHardMultipliers(floor);
  return enemies.map((enemy) => ({
    ...enemy,
    ...(enemy.isBoss ? {
      bossTraits: {
        ...enemy.bossTraits,
        ...TRIAL_TOWER_HARD_BOSS_TRAITS,
        stunHaste: { ...TRIAL_TOWER_HARD_BOSS_TRAITS.stunHaste },
        ...(TRIAL_TOWER_HARD_BOSS_INTERRUPTS[floor] ? { interrupt: TRIAL_TOWER_HARD_BOSS_INTERRUPTS[floor] } : {}),
        ...(floor === 80 ? { immunityGuard: TRIAL_TOWER_HARD_80_IMMUNITY_GUARD } : {}),
      },
    } : {}),
    stats: {
      ...enemy.stats,
      hp: Math.max(1, Math.round(enemy.stats.hp * scale.hp)),
      def: Math.max(1, Math.round(enemy.stats.def * scale.def)),
      atk: Math.max(1, Math.round(enemy.stats.atk * scale.atk)),
      spd: Math.max(1, Math.round(enemy.stats.spd * scale.spd)),
    },
  }));
}
