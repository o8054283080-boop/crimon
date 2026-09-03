/**
 * 試練の塔 70階「始祖ベヒモス」の仮仕様。**まだ本編には1行も入っていない。**
 *
 * ここは数値だけを置く場所。スキルは `enemies.ts`、
 * 手番の境目で効く挙動は `probe.ts` にある。
 *
 * ## スイープできるようにしてある理由
 *
 * 「HP230,000が重すぎるのか、7%再生が効きすぎているのか」は、
 * 片方ずつ振らないと切り分けられない。基準値は依頼どおり固定して、
 * そこから1軸ずつ動かした値も測れるようにしてある。
 */

export interface Tower70Numbers {
  /** 始祖ベヒモス */
  bossHp: number;
  bossAtk: number;
  bossDef: number;
  bossSpd: number;
  /** 自ターン終了時に戻す割合(常時) */
  bossRegen: number;
  /** 生命晶が生きている間、上に足す割合 */
  lifeCrystalRegenBonus: number;
  /** 脈動晶が張るシールド(始祖ベヒモスの最大HP比) */
  pulseShieldRate: number;
  /** 脈動晶の固有シールドが飛ぶ間隔(脈動晶の手番の数) */
  pulseShieldEveryTurns: number;
  /** HP30%以下で足す実数の速度 */
  lowHpSpdBonus: number;
}

/**
 * 依頼で確定した基準値。**スイープの中心はここから動かさない。**
 */
export const TOWER70_BASE: Tower70Numbers = {
  bossHp: 230_000,
  bossAtk: 7_800,
  bossDef: 4_000,
  bossSpd: 168,
  bossRegen: 0.03,
  lifeCrystalRegenBonus: 0.04,
  pulseShieldRate: 0.15,
  pulseShieldEveryTurns: 3,
  lowHpSpdBonus: 35,
};

/** 段階の閾値。**排他ではなく重なる**(HP30%以下なら3段とも効く) */
export const TOWER70_TIERS = {
  /** ここ以下で被ダメージを減らす */
  damageTakenBelow: 0.7,
  damageTakenCut: 0.10,
  /** ここ以下でHP比例ダメージを増やす */
  hpDamageBelow: 0.5,
  hpDamageUp: 0.20,
  /** ここ以下で速度を足す */
  spdBelow: 0.3,
} as const;

/** 取り巻きの数値。依頼どおり */
export const TOWER70_ADDS = {
  life: { hp: 85_000, atk: 1_900, def: 3_200, spd: 210 },
  pulse: { hp: 95_000, atk: 2_100, def: 3_600, spd: 210 },
} as const;

/** 敵の並び。識別子は `E1`/`E2`/`E3` に対応する */
export const TOWER70_LABELS = {
  boss: "始祖ベヒモス",
  life: "古代の生命晶",
  pulse: "古代の脈動晶",
} as const;

/** 1軸だけを振った値を作る */
export function tower70With(patch: Partial<Tower70Numbers>): Tower70Numbers {
  return { ...TOWER70_BASE, ...patch };
}

/**
 * 依頼された比較スイープ。**基準値は必ず含める**(振った値だけを見ても、
 * 基準からどれだけ動いたのかが読めない)。
 */
export const TOWER70_SWEEPS: { axis: string; label: string; values: Tower70Numbers[] }[] = [
  { axis: "HP", label: "本体HP", values: [210_000, 230_000, 250_000].map((bossHp) => tower70With({ bossHp })) },
  { axis: "ATK", label: "本体ATK", values: [7_300, 7_800, 8_300].map((bossAtk) => tower70With({ bossAtk })) },
  { axis: "REGEN", label: "生命晶の追加再生", values: [0.03, 0.04, 0.05].map((v) => tower70With({ lifeCrystalRegenBonus: v })) },
  { axis: "SHIELD", label: "脈動晶シールド", values: [0.10, 0.15, 0.20].map((v) => tower70With({ pulseShieldRate: v })) },
  { axis: "SPD", label: "HP30%以下の速度加算", values: [25, 35, 45].map((v) => tower70With({ lowHpSpdBonus: v })) },
];

/** その値の組が基準そのものか */
export function isTower70Base(numbers: Tower70Numbers): boolean {
  return (Object.keys(TOWER70_BASE) as (keyof Tower70Numbers)[]).every((key) => numbers[key] === TOWER70_BASE[key]);
}
