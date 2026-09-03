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
  /**
   * 取り巻きの硬さ。**切り分けのために残してある。**
   * 第1回(V1)と第2回(V2)を同じ物差しで並べないと、
   * 勝率が動いた理由が取り巻きなのか咆哮なのか読めない
   */
  addsProfile: "V1" | "V2";
  /** 「不滅の巨獣」の段(V1=1段だけ / V2=3段の置き換え式) */
  tierProfile: "V1" | "V2";
  /** 「始祖の咆哮」を鳴らすか */
  roar: boolean;
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
  addsProfile: "V2",
  tierProfile: "V2",
  roar: true,
};

/**
 * 「不滅の巨獣」の段階(第2回改訂)。
 *
 * **加算ではなく置き換え。**HP30%以下なら「+10 +25 +45」ではなく **+45**。
 * HPが戻れば弱い段へ**下がる**(第1回は一度上がると戻らない実装で、
 * 30%→50%への復帰が全条件で0回だったのはそのせいでもある)。
 *
 * 被ダメージ10%減だけは、70%以下のどの段でも同じ値。
 */
export interface Tower70Tier {
  /** この割合以下で当てはまる */
  hpRatio: number;
  /** 実数で足す速度 */
  spd: number;
  /** HP比例ダメージ部分の上乗せ */
  hpDamageUp: number;
  /** 被ダメージの軽減 */
  damageTakenCut: number;
}

/** **上から順に見て、最初に当てはまった1段だけ**が効く */
export const TOWER70_TIERS: readonly Tower70Tier[] = [
  { hpRatio: 0.3, spd: 45, hpDamageUp: 0.35, damageTakenCut: 0.10 },
  { hpRatio: 0.5, spd: 25, hpDamageUp: 0.20, damageTakenCut: 0.10 },
  { hpRatio: 0.7, spd: 10, hpDamageUp: 0.10, damageTakenCut: 0.10 },
];

/** 第1回の段。新旧を並べるために残してある(30%以下でのみ速度+35) */
export const TOWER70_TIERS_V1: readonly Tower70Tier[] = [
  { hpRatio: 0.3, spd: 35, hpDamageUp: 0.20, damageTakenCut: 0.10 },
  { hpRatio: 0.5, spd: 0, hpDamageUp: 0.20, damageTakenCut: 0.10 },
  { hpRatio: 0.7, spd: 0, hpDamageUp: 0, damageTakenCut: 0.10 },
];

/** そのHP割合で効いている段。どれにも当てはまらなければ null(補正なし) */
export function tower70TierAt(hpRatio: number, profile: "V1" | "V2" = "V2"): Tower70Tier | null {
  const tiers = profile === "V1" ? TOWER70_TIERS_V1 : TOWER70_TIERS;
  return tiers.find((tier) => hpRatio <= tier.hpRatio) ?? null;
}

/** その値の組で使う取り巻きの数値 */
export function tower70AddsOf(numbers: Tower70Numbers) {
  return numbers.addsProfile === "V1" ? TOWER70_ADDS_V1 : TOWER70_ADDS;
}

/**
 * 「始祖の咆哮」。
 *
 * この割合を**初めて下回った時**に、手番もクールタイムも行動ゲージも
 * 消費せず即座に1回だけ飛ぶ。一撃で複数の閾値を飛び越えたら、
 * **飛び越えた数だけ**上から順に発動する(高火力で無視できないように)。
 * 回復して跨ぎ直しても再発動しない。
 */
export const TOWER70_ROAR_THRESHOLDS = [0.75, 0.5, 0.25] as const;

export const TOWER70_ROAR = {
  multiplier: 2.0,
  hpCoefficient: 0.08,
  gaugeDown: 0.5,
  defDown: 0.5,
  defDownTurns: 3,
} as const;

/**
 * 取り巻きの数値(第2回改訂)。
 *
 * 第1回は生命晶 HP85,000 / SPD210 で、**TYPICALでは全体解除を1回も撃てずに
 * 溶けていた**(1戦あたり0回)。CT3の解除もシールドも撃つ前に消えるので、
 * 「どちらを先に倒すか」という階の狙いそのものが成立していなかった。
 * 硬さと速さを上げて、まず仕事をさせる。
 */
export const TOWER70_ADDS = {
  life: { hp: 130_000, atk: 1_900, def: 3_800, spd: 230 },
  pulse: { hp: 140_000, atk: 2_100, def: 4_200, spd: 230 },
} as const;

/** 第1回の値。新旧を並べるために残してある */
export const TOWER70_ADDS_V1 = {
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
];

/** その値の組が基準そのものか */
export function isTower70Base(numbers: Tower70Numbers): boolean {
  return (Object.keys(TOWER70_BASE) as (keyof Tower70Numbers)[]).every((key) => numbers[key] === TOWER70_BASE[key]);
}
