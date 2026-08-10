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
  mainStat: StatRoll;
  subStats: StatRoll[];
}

let equipmentCounter = 0;

function generateEquipmentId(): string {
  equipmentCounter += 1;
  return `equip_${Date.now().toString(36)}_${equipmentCounter}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const STAR_GROWTH: Record<EquipStar, number> = { 1: 1, 2: 1.5, 3: 2.2, 4: 3.1, 5: 4.2, 6: 5.5 };

/** 星1における基準値。星が上がるほど STAR_GROWTH 倍される */
const STAT_BASE_VALUE: Record<StatType, number> = {
  ATK_FLAT: 8,
  DEF_FLAT: 7,
  HP_FLAT: 90,
  ATK_PERCENT: 0.09,
  DEF_PERCENT: 0.09,
  HP_PERCENT: 0.09,
  SPD: 5,
  CRIT_RATE: 0.05,
  CRIT_DMG: 0.08,
  ACCURACY: 0.08,
  RESISTANCE: 0.08,
};

/** サブステータスはメインステータスに対してこの比率分だけ弱くなる */
const SUB_STAT_RATIO = 0.4;

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function rollStatValue(type: StatType, star: EquipStar, ratio: number, rng: () => number): number {
  const base = STAT_BASE_VALUE[type] * STAR_GROWTH[star] * ratio;
  const variance = 0.85 + rng() * 0.3; // 0.85〜1.15倍のばらつき
  const raw = base * variance;
  if (FLAT_STAT_TYPES.has(type)) {
    return Math.max(1, Math.round(raw));
  }
  return Math.round(raw * 1000) / 1000;
}

export interface GenerateEquipmentOptions {
  slot?: EquipSlot;
  star: EquipStar;
  /** サブステータスの個数(0-4)。呼び出し側で確率制御する */
  subStatCount: number;
  rng?: () => number;
}

/** 装備を1つ生成する。スロット未指定ならランダムに決まる */
export function generateEquipment(options: GenerateEquipmentOptions): Equipment {
  const rng = options.rng ?? Math.random;
  const slot = options.slot ?? pick(EQUIP_SLOTS, rng);
  const star = options.star;

  const mainType = pick(SLOT_MAIN_STAT_OPTIONS[slot], rng);
  const mainStat: StatRoll = { type: mainType, value: rollStatValue(mainType, star, 1, rng) };

  const subCandidates = STAT_TYPES.filter((t) => t !== mainType);
  const subCount = Math.max(0, Math.min(4, options.subStatCount));
  const subStats: StatRoll[] = [];
  const pool = [...subCandidates];
  for (let i = 0; i < subCount && pool.length > 0; i += 1) {
    const idx = Math.floor(rng() * pool.length);
    const [type] = pool.splice(idx, 1);
    subStats.push({ type, value: rollStatValue(type, star, SUB_STAT_RATIO, rng) });
  }

  return { id: generateEquipmentId(), slot, star, mainStat, subStats };
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
