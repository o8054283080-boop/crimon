import { Stats } from "./stats.js";

export type EquipSlot = 1 | 2 | 3 | 4 | 5 | 6;
export const EQUIP_SLOTS: EquipSlot[] = [1, 2, 3, 4, 5, 6];

export type EquipStar = 1 | 2 | 3 | 4 | 5 | 6;
export const EQUIP_STARS: EquipStar[] = [1, 2, 3, 4, 5, 6];

export type StatType =
  | "ATK_FLAT"
  | "ATK_PERCENT"
  | "DEF_FLAT"
  | "DEF_PERCENT"
  | "HP_FLAT"
  | "HP_PERCENT"
  | "SPD"
  | "CRIT_RATE"
  | "CRIT_DMG"
  | "ACCURACY"
  | "RESISTANCE";

export const STAT_TYPES: StatType[] = [
  "ATK_FLAT",
  "ATK_PERCENT",
  "DEF_FLAT",
  "DEF_PERCENT",
  "HP_FLAT",
  "HP_PERCENT",
  "SPD",
  "CRIT_RATE",
  "CRIT_DMG",
  "ACCURACY",
  "RESISTANCE",
];

/** 実数値(整数)で表現されるステータス。それ以外は割合(0.09 = +9%)で表現される */
const FLAT_STAT_TYPES: ReadonlySet<StatType> = new Set(["ATK_FLAT", "DEF_FLAT", "HP_FLAT", "SPD"]);

export const STAT_LABEL: Record<StatType, string> = {
  ATK_FLAT: "攻撃力+",
  ATK_PERCENT: "攻撃力%",
  DEF_FLAT: "防御力+",
  DEF_PERCENT: "防御力%",
  HP_FLAT: "HP+",
  HP_PERCENT: "HP%",
  SPD: "速度+",
  CRIT_RATE: "クリ率%",
  CRIT_DMG: "クリダメ%",
  ACCURACY: "効果命中%",
  RESISTANCE: "効果抵抗%",
};

/** スロットごとに選ばれ得るメインステータスの候補。スロット1/3/5は固定、2/4/6は複数候補から抽選 */
export const SLOT_MAIN_STAT_OPTIONS: Record<EquipSlot, StatType[]> = {
  1: ["ATK_FLAT"],
  2: ["SPD", "ATK_PERCENT", "DEF_PERCENT", "HP_PERCENT"],
  3: ["DEF_FLAT"],
  4: ["HP_PERCENT", "ATK_PERCENT", "DEF_PERCENT", "CRIT_RATE", "CRIT_DMG"],
  5: ["HP_FLAT"],
  6: ["ATK_PERCENT", "DEF_PERCENT", "HP_PERCENT", "ACCURACY", "RESISTANCE"],
};

export const SLOT_LABEL: Record<EquipSlot, string> = {
  1: "スロット1",
  2: "スロット2",
  3: "スロット3",
  4: "スロット4",
  5: "スロット5",
  6: "スロット6",
};

export interface StatRoll {
  type: StatType;
  value: number;
}

export interface Equipment {
  id: string;
  slot: EquipSlot;
  star: EquipStar;
  /** 強化レベル。0(無強化)〜15(最大) */
  level: number;
  mainStat: StatRoll;
  subStats: StatRoll[];
}

let equipmentCounter = 0;

function generateEquipmentId(): string {
  equipmentCounter += 1;
  return `equip_${Date.now().toString(36)}_${equipmentCounter}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * 星ごとのメインステータス初期値(強化レベル0時点)の倍率。
 * 星1〜4は一定間隔(+0.5)で上がるが、星5・6は初期値そのものを大きく引き上げる。
 */
const STAR_INITIAL_MULTIPLIER: Record<EquipStar, number> = {
  1: 1.0,
  2: 1.5,
  3: 2.0,
  4: 2.5,
  5: 4.0,
  6: 6.0,
};

/**
 * 星ごとの、強化レベルが1上がるごとにメインステータスへ加算される量の割合(STAT_BASE_VALUEに対する比率)。
 * 星5・6は星1〜4より明確に高い上昇率にしてある。
 */
const STAR_LEVEL_GROWTH_RATE: Record<EquipStar, number> = {
  1: 0.06,
  2: 0.08,
  3: 0.1,
  4: 0.12,
  5: 0.22,
  6: 0.3,
};

/**
 * 星1・強化レベル0における基準値。上記の倍率・上昇率はこの値に対して掛かる。
 * 実数値系(ATK+/DEF+/HP+/SPD+)は整数に丸められる(最低1)ため、
 * レベル成長が丸めで潰れて差が出なくなることのないよう、ある程度大きめの値にしてある。
 */
const STAT_BASE_VALUE: Record<StatType, number> = {
  ATK_FLAT: 20,
  DEF_FLAT: 18,
  HP_FLAT: 220,
  ATK_PERCENT: 0.09,
  DEF_PERCENT: 0.09,
  HP_PERCENT: 0.09,
  SPD: 14,
  CRIT_RATE: 0.05,
  CRIT_DMG: 0.08,
  ACCURACY: 0.08,
  RESISTANCE: 0.08,
};

/** サブステータスはメインステータスに対してこの比率分だけ弱くなる */
const SUB_STAT_RATIO = 0.4;

/** 装備の最大強化レベル */
export const EQUIP_MAX_LEVEL = 15;
/** サブステータスの最大個数 */
export const MAX_SUB_STATS = 4;
/** この強化レベルに到達するたびサブステータスが強化される(3レベルごと) */
export const SUBSTAT_POWERUP_LEVELS = [3, 6, 9, 12, 15];
/** 最大強化レベル(15)到達時、メインステータスの上昇量に掛かる追加倍率。1〜14レベルの通常上昇より大きくなる */
const LEVEL_MAX_BONUS_MULTIPLIER = 2.5;

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function roundStatValue(type: StatType, raw: number): number {
  if (FLAT_STAT_TYPES.has(type)) {
    return Math.max(1, Math.round(raw));
  }
  return Math.round(raw * 1000) / 1000;
}

function rollStatValue(type: StatType, star: EquipStar, ratio: number, rng: () => number): number {
  const base = STAT_BASE_VALUE[type] * STAR_INITIAL_MULTIPLIER[star] * ratio;
  const variance = 0.85 + rng() * 0.3; // 0.85〜1.15倍のばらつき
  return roundStatValue(type, base * variance);
}

/** 強化レベルが1上がったときにメインステータスへ加算される量(15レベル到達時のみ大きく増える) */
function mainStatLevelIncrement(type: StatType, star: EquipStar, reachedLevel: number): number {
  const base = STAT_BASE_VALUE[type] * STAR_LEVEL_GROWTH_RATE[star];
  const bonus = reachedLevel === EQUIP_MAX_LEVEL ? LEVEL_MAX_BONUS_MULTIPLIER : 1;
  return roundStatValue(type, base * bonus);
}

export interface GenerateEquipmentOptions {
  slot?: EquipSlot;
  star: EquipStar;
  /** サブステータスの個数(0-4)。呼び出し側で確率制御する */
  subStatCount: number;
  rng?: () => number;
}

/** 装備を1つ生成する(強化レベル0)。スロット未指定ならランダムに決まる */
export function generateEquipment(options: GenerateEquipmentOptions): Equipment {
  const rng = options.rng ?? Math.random;
  const slot = options.slot ?? pick(EQUIP_SLOTS, rng);
  const star = options.star;

  const mainType = pick(SLOT_MAIN_STAT_OPTIONS[slot], rng);
  const mainStat: StatRoll = { type: mainType, value: rollStatValue(mainType, star, 1, rng) };

  const subCandidates = STAT_TYPES.filter((t) => t !== mainType);
  const subCount = Math.max(0, Math.min(MAX_SUB_STATS, options.subStatCount));
  const subStats: StatRoll[] = [];
  const pool = [...subCandidates];
  for (let i = 0; i < subCount && pool.length > 0; i += 1) {
    const idx = Math.floor(rng() * pool.length);
    const [type] = pool.splice(idx, 1);
    subStats.push({ type, value: rollStatValue(type, star, SUB_STAT_RATIO, rng) });
  }

  return { id: generateEquipmentId(), slot, star, level: 0, mainStat, subStats };
}

export function canEnhanceEquipment(equipment: Equipment): boolean {
  return equipment.level < EQUIP_MAX_LEVEL;
}

/** 装備を1レベル強化するのに必要なゴールド */
export function enhanceEquipmentCost(equipment: Equipment): number {
  return Math.round(30 * (equipment.level + 1) * equipment.star);
}

/**
 * 装備を1レベル強化する(呼び出し前に canEnhanceEquipment で確認すること)。
 * メインステータスは毎レベル上昇し、15レベル到達時は1〜14レベルより大きく上昇する。
 * 3・6・9・12・15レベル到達時は、サブステータスが4個未満ならランダムで1個追加され、
 * 既に4個ある場合は既存のサブステータスのうち1つがランダムに強化される。
 */
export function enhanceEquipment(equipment: Equipment, rng: () => number = Math.random): boolean {
  if (!canEnhanceEquipment(equipment)) return false;
  equipment.level += 1;

  const mainType = equipment.mainStat.type;
  const increment = mainStatLevelIncrement(mainType, equipment.star, equipment.level);
  equipment.mainStat.value = roundStatValue(mainType, equipment.mainStat.value + increment);

  if (SUBSTAT_POWERUP_LEVELS.includes(equipment.level)) {
    if (equipment.subStats.length < MAX_SUB_STATS) {
      const usedTypes = new Set([mainType, ...equipment.subStats.map((s) => s.type)]);
      const pool = STAT_TYPES.filter((t) => !usedTypes.has(t));
      if (pool.length > 0) {
        const newType = pick(pool, rng);
        equipment.subStats.push({ type: newType, value: rollStatValue(newType, equipment.star, SUB_STAT_RATIO, rng) });
      }
    } else {
      const target = equipment.subStats[Math.floor(rng() * equipment.subStats.length)];
      const boost = rollStatValue(target.type, equipment.star, SUB_STAT_RATIO, rng);
      target.value = roundStatValue(target.type, target.value + boost);
    }
  }

  return true;
}

/** 装備リストの全ステータス加算値をタイプ別に集計する */
export function sumEquipmentStats(equipmentList: Equipment[]): Partial<Record<StatType, number>> {
  const totals: Partial<Record<StatType, number>> = {};
  for (const eq of equipmentList) {
    for (const roll of [eq.mainStat, ...eq.subStats]) {
      totals[roll.type] = (totals[roll.type] ?? 0) + roll.value;
    }
  }
  return totals;
}

/** 装備込みの実効ステータスを計算する。%系は基礎ステータスに、実数値系は加算で乗る */
export function applyEquipmentToStats(base: Stats, equipmentList: Equipment[]): Stats {
  const t = sumEquipmentStats(equipmentList);
  const atk = base.atk * (1 + (t.ATK_PERCENT ?? 0)) + (t.ATK_FLAT ?? 0);
  const def = base.def * (1 + (t.DEF_PERCENT ?? 0)) + (t.DEF_FLAT ?? 0);
  const hp = base.hp * (1 + (t.HP_PERCENT ?? 0)) + (t.HP_FLAT ?? 0);
  const spd = base.spd + (t.SPD ?? 0);
  const criRate = Math.min(1, base.criRate + (t.CRIT_RATE ?? 0));
  const criDmg = base.criDmg + (t.CRIT_DMG ?? 0);
  const accuracy = Math.min(1, base.accuracy + (t.ACCURACY ?? 0));
  const resistance = Math.min(1, base.resistance + (t.RESISTANCE ?? 0));

  return {
    hp: Math.round(hp),
    atk: Math.round(atk),
    def: Math.round(def),
    spd: Math.round(spd),
    criRate,
    criDmg,
    accuracy,
    resistance,
  };
}

interface WeightedOption<T> {
  value: T;
  weight: number;
}

function weightedPick<T>(options: WeightedOption<T>[], rng: () => number): T {
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = rng() * total;
  for (const option of options) {
    if (roll < option.weight) return option.value;
    roll -= option.weight;
  }
  return options[options.length - 1].value;
}

/**
 * 通常冒険(ステージ)向けの装備抽選設定。
 * 星は1〜3まで、サブステータスも最大2個までしか付かず、
 * 星3やサブ付きの装備が出る確率はかなり低めにしてある。
 * ダンジョン等の高難度コンテンツでは、より高い星やサブ4個までを許可する別設定を今後追加する想定。
 */
const NORMAL_STAGE_STAR_WEIGHTS: WeightedOption<EquipStar>[] = [
  { value: 1, weight: 70 },
  { value: 2, weight: 25 },
  { value: 3, weight: 5 },
];

const NORMAL_STAGE_SUBSTAT_COUNT_WEIGHTS: WeightedOption<number>[] = [
  { value: 0, weight: 60 },
  { value: 1, weight: 30 },
  { value: 2, weight: 10 },
];

export function generateNormalStageEquipment(rng: () => number = Math.random): Equipment {
  const star = weightedPick(NORMAL_STAGE_STAR_WEIGHTS, rng);
  const subStatCount = weightedPick(NORMAL_STAGE_SUBSTAT_COUNT_WEIGHTS, rng);
  return generateEquipment({ star, subStatCount, rng });
}
