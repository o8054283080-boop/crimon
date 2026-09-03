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

/** 装備のシリーズ(セット)種類。同じシリーズを規定数まとめて装着するとセット効果が発動する */
/**
 * ステータス1行の表示文字列。
 *
 * **表示用の整形はここに集約すること。** 画面ごとに書くと必ずずれる。
 * 実際に、ショップだけ生の値を出していて「クリ率% +0.106」「速度+ +19」と
 * 表示され、桁が1/100に見える・記号が重なる、という不具合になった。
 */
export function formatStatValue(roll: StatRoll): string {
  const isFlat = roll.type === "ATK_FLAT" || roll.type === "DEF_FLAT" || roll.type === "HP_FLAT" || roll.type === "SPD";
  if (isFlat) return `${STAT_LABEL[roll.type]}${roll.value}`;
  return `${STAT_LABEL[roll.type]}${(roll.value * 100).toFixed(1)}%`;
}

export type SetType =
  | "CRIT" | "POWER" | "GUARD" | "VITALITY" | "ACCURACY_SET" | "RESIST_SET" | "SWIFT"
  | "WARD" | "RAMPAGE" | "IMMUNITY_SET" | "COLLAPSE" | "BLESSING";

export const DEMON_DUNGEON_SET_TYPES: SetType[] = ["CRIT", "POWER", "GUARD", "VITALITY", "ACCURACY_SET", "RESIST_SET", "SWIFT"];
export const BEAST_DUNGEON_SET_TYPES: SetType[] = ["WARD", "RAMPAGE", "IMMUNITY_SET", "COLLAPSE", "BLESSING"];
export const SET_TYPES: SetType[] = [...DEMON_DUNGEON_SET_TYPES, ...BEAST_DUNGEON_SET_TYPES];

export const SET_LABEL: Record<SetType, string> = {
  CRIT: "会心",
  POWER: "筋力",
  GUARD: "守護",
  VITALITY: "体力",
  ACCURACY_SET: "的中",
  RESIST_SET: "抵抗",
  SWIFT: "速攻",
  WARD: "加護",
  RAMPAGE: "暴走",
  IMMUNITY_SET: "免疫",
  COLLAPSE: "崩壊",
  BLESSING: "祝福",
};

/**
 * セット効果1件分の定義。STAT系はステータス計算に、それ以外は戦闘中の特殊効果(CombatModifiers)に反映される。
 * 4個セット条件を満たすと2個セットの効果と重複して両方発動する。
 */
export type SetBonusEffect =
  | { kind: "STAT"; stat: "ATK_PERCENT" | "DEF_PERCENT" | "HP_PERCENT" | "SPD_PERCENT" | "CRIT_RATE" | "CRIT_DMG" | "ACCURACY" | "RESISTANCE"; amount: number }
  | { kind: "DAMAGE_DEALT_MULTIPLIER"; amount: number }
  | { kind: "DAMAGE_TAKEN_MULTIPLIER"; amount: number }
  | { kind: "TURN_HEAL_PERCENT"; amount: number }
  | { kind: "IGNORE_RESISTANCE_PERCENT"; amount: number }
  | { kind: "HEAL_ON_RESIST_PERCENT"; amount: number }
  | { kind: "NONE" };

/** シリーズごとの2個セット/4個セットの効果定義(ユーザー指定の全7シリーズ) */
export const SET_BONUS_CONFIG: Record<SetType, { two: SetBonusEffect; four: SetBonusEffect }> = {
  CRIT: {
    two: { kind: "STAT", stat: "CRIT_RATE", amount: 0.15 },
    four: { kind: "STAT", stat: "CRIT_DMG", amount: 0.3 },
  },
  POWER: {
    two: { kind: "STAT", stat: "ATK_PERCENT", amount: 0.2 },
    four: { kind: "DAMAGE_DEALT_MULTIPLIER", amount: 0.2 },
  },
  GUARD: {
    two: { kind: "STAT", stat: "DEF_PERCENT", amount: 0.2 },
    four: { kind: "DAMAGE_TAKEN_MULTIPLIER", amount: -0.2 },
  },
  VITALITY: {
    two: { kind: "STAT", stat: "HP_PERCENT", amount: 0.2 },
    four: { kind: "TURN_HEAL_PERCENT", amount: 0.05 },
  },
  ACCURACY_SET: {
    two: { kind: "STAT", stat: "ACCURACY", amount: 0.15 },
    four: { kind: "IGNORE_RESISTANCE_PERCENT", amount: 0.25 },
  },
  RESIST_SET: {
    two: { kind: "STAT", stat: "RESISTANCE", amount: 0.25 },
    four: { kind: "HEAL_ON_RESIST_PERCENT", amount: 0.15 },
  },
  SWIFT: {
    two: { kind: "STAT", stat: "SPD_PERCENT", amount: 0.05 },
    four: { kind: "STAT", stat: "SPD_PERCENT", amount: 0.12 },
  },
  WARD: { two: { kind: "NONE" }, four: { kind: "NONE" } },
  RAMPAGE: { two: { kind: "NONE" }, four: { kind: "NONE" } },
  IMMUNITY_SET: { two: { kind: "NONE" }, four: { kind: "NONE" } },
  COLLAPSE: { two: { kind: "NONE" }, four: { kind: "NONE" } },
  BLESSING: { two: { kind: "NONE" }, four: { kind: "NONE" } },
};

/** UI表示用の効果テキスト */
export const SET_BONUS_DESCRIPTION: Record<SetType, { two: string; four: string }> = {
  CRIT: { two: "クリ率+15%", four: "クリダメ+30%" },
  POWER: { two: "攻撃力+20%", four: "与えるダメージ1.2倍" },
  GUARD: { two: "防御力+20%", four: "受けるダメージ0.8倍" },
  VITALITY: { two: "HP+20%", four: "毎ターンHP5%回復" },
  ACCURACY_SET: { two: "状態異常付与率+15%", four: "敵の状態異常抵抗率25%無視" },
  RESIST_SET: { two: "状態異常抵抗率+25%", four: "状態異常を抵抗した時HP15%回復" },
  SWIFT: { two: "速度+5%", four: "速度+12%" },
  WARD: { two: "戦闘開始時、1ターン最大HP8%のシールド（2セットごとに+8%）", four: "シールドが最大HP16%に上昇" },
  RAMPAGE: { two: "4セットで発動", four: "行動終了時15%で追加ターン（回数制限なし）" },
  IMMUNITY_SET: { two: "戦闘開始時、1ターン免疫（2セットごとに+1ターン）", four: "免疫が2ターンに延長" },
  COLLAPSE: { two: "4セットで発動", four: "攻撃時50%で敵の防御を50%無視" },
  BLESSING: { two: "4セットで発動", four: "HP35%以下で一度だけ最大HP35%回復" },
};

/** 2個セットに必要な個数 / 4個セットに必要な個数 */
export const SET_PIECE_COUNTS = { TWO: 2, FOUR: 4 } as const;

export interface Equipment {
  id: string;
  /** 誤売却防止ロック。旧セーブでは未定義を false として扱う。 */
  locked?: boolean;
  slot: EquipSlot;
  star: EquipStar;
  /** 強化レベル。0(無強化)〜15(最大) */
  level: number;
  /** 装備シリーズ。同じシリーズを2個/4個そろえるとセット効果が発動する */
  set: SetType;
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
  /*
   * 速度だけは他と性質が違う。**手番の数に直結する**ので、
   * 同じ「+1」でも攻撃力の+1とは比べものにならない重みがある。
   *
   * 14 だった頃、速度に寄せた★6装備一式で **+190** が乗っていた。
   * モンスターの素の速度は72〜144(中央112)なので、
   * 装備がモンスター自身より大きい、という状態になっていた。
   * そうなると「遅いモンスターに速度装備を積んだ方が、速いモンスターより速い」
   * ことになり、モンスターごとの速さという個性が消える。
   *
   * 半分にして +95 前後に収めてある。装備で速くはなるが、
   * 素の速さを覆すほどではない、という比になる。
   */
  SPD: 7,
  CRIT_RATE: 0.05,
  CRIT_DMG: 0.08,
  ACCURACY: 0.08,
  RESISTANCE: 0.08,
};

/** サブステータスはメインステータスに対してこの比率分だけ弱くなる */
const SUB_STAT_RATIO = 0.2;

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
  /** シリーズ未指定ならランダムに決まる */
  set?: SetType;
  rng?: () => number;
}

/** 装備を1つ生成する(強化レベル0)。スロット・シリーズ未指定ならランダムに決まる */
export function generateEquipment(options: GenerateEquipmentOptions): Equipment {
  const rng = options.rng ?? Math.random;
  const slot = options.slot ?? pick(EQUIP_SLOTS, rng);
  const star = options.star;
  const set = options.set ?? pick(SET_TYPES, rng);

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

  return { id: generateEquipmentId(), slot, star, level: 0, set, mainStat, subStats };
}

export function canEnhanceEquipment(equipment: Equipment): boolean {
  return equipment.level < EQUIP_MAX_LEVEL;
}

/** 装備を1レベル強化するのに必要なゴールド */
export function enhanceEquipmentCost(equipment: Equipment): number {
  return Math.round(30 * (equipment.level + 1) * equipment.star);
}

/**
 * 装備を売却した時にもらえるゴールド。星が高いほど、また強化レベル・サブステータス個数が
 * 多いほど(=それだけ育成に投資されているほど)高くなる。
 */
export function equipmentSellPrice(equipment: Equipment): number {
  const base = 100 * equipment.star * equipment.star;
  const levelBonus = equipment.level * 40 * equipment.star;
  const subStatBonus = equipment.subStats.length * 50;
  return Math.round(base + levelBonus + subStatBonus);
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

/** シリーズごとの装着数を集計する */
export function getEquippedSetCounts(equipmentList: Equipment[]): Partial<Record<SetType, number>> {
  const counts: Partial<Record<SetType, number>> = {};
  for (const eq of equipmentList) {
    counts[eq.set] = (counts[eq.set] ?? 0) + 1;
  }
  return counts;
}

export interface ActiveSetBonus {
  set: SetType;
  count: number;
  twoActive: boolean;
  fourActive: boolean;
}

/** 現在発動中(2個以上そろっている)のセットボーナス一覧。UI表示に使う */
export function getActiveSetBonuses(equipmentList: Equipment[]): ActiveSetBonus[] {
  const counts = getEquippedSetCounts(equipmentList);
  const fourOnly = new Set<SetType>(["RAMPAGE", "COLLAPSE", "BLESSING"]);
  return SET_TYPES.filter((type) => (counts[type] ?? 0) >= (fourOnly.has(type) ? SET_PIECE_COUNTS.FOUR : SET_PIECE_COUNTS.TWO)).map((type) => ({
    set: type,
    count: counts[type] ?? 0,
    twoActive: !fourOnly.has(type) && (counts[type] ?? 0) >= SET_PIECE_COUNTS.TWO,
    fourActive: (counts[type] ?? 0) >= SET_PIECE_COUNTS.FOUR,
  }));
}

interface SetStatBonuses {
  atkPercent: number;
  defPercent: number;
  hpPercent: number;
  spdPercent: number;
  criRate: number;
  criDmg: number;
  accuracy: number;
  resistance: number;
}

const ZERO_SET_STAT_BONUSES: SetStatBonuses = {
  atkPercent: 0,
  defPercent: 0,
  hpPercent: 0,
  spdPercent: 0,
  criRate: 0,
  criDmg: 0,
  accuracy: 0,
  resistance: 0,
};

/** 戦闘専用の特殊効果。基礎ステータス計算には反映されず、戦闘エンジン側で個別に参照する */
export interface CombatModifiers {
  /** 与えるダメージの倍率(1 = 補正なし) */
  damageDealtMultiplier: number;
  /** 受けるダメージの倍率(1 = 補正なし) */
  damageTakenMultiplier: number;
  /** 毎ターン開始時、最大HPに対する割合で回復する量 */
  turnHealPercent: number;
  /** 状態異常付与時、相手の状態異常抵抗率をこの割合分無視する */
  ignoreResistancePercent: number;
  /** 状態異常を抵抗した時、最大HPに対する割合で回復する量 */
  healOnResistPercent: number;
  battleStartShieldPercent?: number;
  battleStartShieldTurns?: number;
  battleStartImmunityTurns?: number;
  extraTurnChance?: number;
  defenseIgnoreChance?: number;
  defenseIgnoreRatio?: number;
  thresholdHealHpRatio?: number;
  thresholdHealPercent?: number;
}

export const DEFAULT_COMBAT_MODIFIERS: CombatModifiers = {
  damageDealtMultiplier: 1,
  damageTakenMultiplier: 1,
  turnHealPercent: 0,
  ignoreResistancePercent: 0,
  healOnResistPercent: 0,
  battleStartShieldPercent: 0,
  battleStartShieldTurns: 0,
  battleStartImmunityTurns: 0,
  extraTurnChance: 0,
  defenseIgnoreChance: 0,
  defenseIgnoreRatio: 0,
  thresholdHealHpRatio: 0,
  thresholdHealPercent: 0,
};

function applyStatEffect(bonus: SetStatBonuses, effect: SetBonusEffect): void {
  if (effect.kind !== "STAT") return;
  switch (effect.stat) {
    case "ATK_PERCENT":
      bonus.atkPercent += effect.amount;
      break;
    case "DEF_PERCENT":
      bonus.defPercent += effect.amount;
      break;
    case "HP_PERCENT":
      bonus.hpPercent += effect.amount;
      break;
    case "SPD_PERCENT":
      bonus.spdPercent += effect.amount;
      break;
    case "CRIT_RATE":
      bonus.criRate += effect.amount;
      break;
    case "CRIT_DMG":
      bonus.criDmg += effect.amount;
      break;
    case "ACCURACY":
      bonus.accuracy += effect.amount;
      break;
    case "RESISTANCE":
      bonus.resistance += effect.amount;
      break;
  }
}

function applyCombatEffect(mods: CombatModifiers, effect: SetBonusEffect): void {
  switch (effect.kind) {
    case "DAMAGE_DEALT_MULTIPLIER":
      mods.damageDealtMultiplier *= 1 + effect.amount;
      break;
    case "DAMAGE_TAKEN_MULTIPLIER":
      mods.damageTakenMultiplier *= 1 + effect.amount;
      break;
    case "TURN_HEAL_PERCENT":
      mods.turnHealPercent += effect.amount;
      break;
    case "IGNORE_RESISTANCE_PERCENT":
      mods.ignoreResistancePercent += effect.amount;
      break;
    case "HEAL_ON_RESIST_PERCENT":
      mods.healOnResistPercent += effect.amount;
      break;
    default:
      break;
  }
}

function computeSetStatBonuses(equipmentList: Equipment[]): SetStatBonuses {
  const counts = getEquippedSetCounts(equipmentList);
  const bonus: SetStatBonuses = { ...ZERO_SET_STAT_BONUSES };
  for (const type of SET_TYPES) {
    const count = counts[type] ?? 0;
    const config = SET_BONUS_CONFIG[type];
    if (count >= SET_PIECE_COUNTS.TWO) applyStatEffect(bonus, config.two);
    if (count >= SET_PIECE_COUNTS.FOUR) applyStatEffect(bonus, config.four);
  }
  return bonus;
}

/** 装備セットの戦闘専用効果(与ダメ/被ダメ倍率・毎ターン回復・抵抗無視・抵抗時回復)を集計する */
export function computeSetCombatModifiers(equipmentList: Equipment[]): CombatModifiers {
  const counts = getEquippedSetCounts(equipmentList);
  const mods: CombatModifiers = { ...DEFAULT_COMBAT_MODIFIERS };
  for (const type of SET_TYPES) {
    const count = counts[type] ?? 0;
    const config = SET_BONUS_CONFIG[type];
    if (count >= SET_PIECE_COUNTS.TWO) applyCombatEffect(mods, config.two);
    if (count >= SET_PIECE_COUNTS.FOUR) applyCombatEffect(mods, config.four);
  }
  const wardSets = Math.floor((counts.WARD ?? 0) / 2);
  if (wardSets > 0) {
    mods.battleStartShieldPercent = wardSets * 0.08;
    mods.battleStartShieldTurns = 1;
  }
  const immunitySets = Math.floor((counts.IMMUNITY_SET ?? 0) / 2);
  if (immunitySets > 0) mods.battleStartImmunityTurns = immunitySets;
  if ((counts.RAMPAGE ?? 0) >= 4) mods.extraTurnChance = 0.15;
  if ((counts.COLLAPSE ?? 0) >= 4) {
    mods.defenseIgnoreChance = 0.5;
    mods.defenseIgnoreRatio = 0.5;
  }
  if ((counts.BLESSING ?? 0) >= 4) {
    mods.thresholdHealHpRatio = 0.35;
    mods.thresholdHealPercent = 0.35;
  }
  return mods;
}

/** 装備込みの実効ステータスを計算する。%系は基礎ステータスに、実数値系は加算で乗る。セットのステータス系効果も反映する */
export function applyEquipmentToStats(base: Stats, equipmentList: Equipment[]): Stats {
  const t = sumEquipmentStats(equipmentList);
  const setBonus = computeSetStatBonuses(equipmentList);
  const atk = base.atk * (1 + (t.ATK_PERCENT ?? 0) + setBonus.atkPercent) + (t.ATK_FLAT ?? 0);
  const def = base.def * (1 + (t.DEF_PERCENT ?? 0) + setBonus.defPercent) + (t.DEF_FLAT ?? 0);
  const hp = base.hp * (1 + (t.HP_PERCENT ?? 0) + setBonus.hpPercent) + (t.HP_FLAT ?? 0);
  const spd = (base.spd + (t.SPD ?? 0)) * (1 + setBonus.spdPercent);
  const criRate = Math.min(1, base.criRate + (t.CRIT_RATE ?? 0) + setBonus.criRate);
  const criDmg = base.criDmg + (t.CRIT_DMG ?? 0) + setBonus.criDmg;
  const accuracy = Math.min(1, base.accuracy + (t.ACCURACY ?? 0) + setBonus.accuracy);
  const resistance = Math.min(1, base.resistance + (t.RESISTANCE ?? 0) + setBonus.resistance);

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
 * 通常冒険(ステージ)向けの装備抽選設定。サブステータスは最大2個までしか付かず、
 * サブ付きの装備が出る確率はかなり低めにしてある。
 */
const NORMAL_STAGE_SUBSTAT_COUNT_WEIGHTS: WeightedOption<number>[] = [
  { value: 0, weight: 60 },
  { value: 1, weight: 30 },
  { value: 2, weight: 10 },
];

/**
 * チャプター(ステージ1〜4)テーマ装備。星は通常1固定だが、starBonusを渡すとその分だけ星を引き上げられる
 * (ボスステージのボーナスドロップ・ハード/ヘル難易度用、6を超える分はクランプされる)。シリーズは指定されたものに固定される。
 * サブステータスの個数分布は通常ステージ装備と同じ(0〜2個、大半は0〜1個)。
 */
export function generateThemedStageEquipment(set: SetType, rng: () => number = Math.random, starBonus = 0): Equipment {
  const subStatCount = weightedPick(NORMAL_STAGE_SUBSTAT_COUNT_WEIGHTS, rng);
  const star = Math.max(1, Math.min(6, 1 + starBonus)) as EquipStar;
  return generateEquipment({ star, set, subStatCount, rng });
}

/**
 * 装備ダンジョン(1〜10階)向けの階層別・星ドロップ率テーブル。
 * 1〜3階は星2〜4、4〜6階は星3〜5、7〜9階は星4〜6、10階は星5〜6が出現し、
 * 階層が上がるほどそのグループ内で最高レアリティの出現率が上がっていく。
 * 各階の重みの合計は100になっているため、weightそのものをドロップ%として扱える。
 *
 * 各グループの最低レアリティを除外した分は、残った星へ従来の比率に沿って再配分している。
 * 7〜10階の星6率だけは従来値(5% / 9% / 15% / 32%)を固定し、除外分を星6へ回さない。
 */
export const DUNGEON_FLOOR_COUNT = 10;

export const DUNGEON_FLOOR_STAR_WEIGHTS: Record<number, WeightedOption<EquipStar>[]> = {
  1: [
    { value: 2, weight: 74 },
    { value: 3, weight: 23 },
    { value: 4, weight: 3 },
  ],
  2: [
    { value: 2, weight: 62 },
    { value: 3, weight: 30 },
    { value: 4, weight: 8 },
  ],
  3: [
    { value: 2, weight: 51 },
    { value: 3, weight: 37 },
    { value: 4, weight: 12 },
  ],
  4: [
    { value: 3, weight: 58 },
    { value: 4, weight: 33 },
    { value: 5, weight: 9 },
  ],
  5: [
    { value: 3, weight: 47 },
    { value: 4, weight: 38 },
    { value: 5, weight: 15 },
  ],
  6: [
    { value: 3, weight: 33 },
    { value: 4, weight: 44 },
    { value: 5, weight: 23 },
  ],
  7: [
    { value: 4, weight: 50 },
    { value: 5, weight: 45 },
    { value: 6, weight: 5 },
  ],
  8: [
    { value: 4, weight: 41 },
    { value: 5, weight: 50 },
    { value: 6, weight: 9 },
  ],
  9: [
    { value: 4, weight: 32 },
    { value: 5, weight: 53 },
    { value: 6, weight: 15 },
  ],
  10: [
    { value: 5, weight: 68 },
    { value: 6, weight: 32 },
  ],
};

/** 星のランクごとのサブステータス個数の出やすさ。星が高いほどサブが多くつきやすい */
const DUNGEON_SUBSTAT_COUNT_WEIGHTS_BY_STAR: Record<EquipStar, WeightedOption<number>[]> = {
  1: [
    { value: 0, weight: 45 },
    { value: 1, weight: 35 },
    { value: 2, weight: 20 },
  ],
  2: [
    { value: 0, weight: 35 },
    { value: 1, weight: 35 },
    { value: 2, weight: 25 },
    { value: 3, weight: 5 },
  ],
  3: [
    { value: 0, weight: 15 },
    { value: 1, weight: 30 },
    { value: 2, weight: 30 },
    { value: 3, weight: 20 },
    { value: 4, weight: 5 },
  ],
  4: [
    { value: 0, weight: 8 },
    { value: 1, weight: 22 },
    { value: 2, weight: 30 },
    { value: 3, weight: 28 },
    { value: 4, weight: 12 },
  ],
  5: [
    { value: 0, weight: 5 },
    { value: 1, weight: 15 },
    { value: 2, weight: 30 },
    { value: 3, weight: 30 },
    { value: 4, weight: 20 },
  ],
  6: [
    { value: 1, weight: 5 },
    { value: 2, weight: 20 },
    { value: 3, weight: 35 },
    { value: 4, weight: 40 },
  ],
};

/** 指定した階層のドロップ率テーブルを取得する(1階=[{star:1,percent:40}, ...]のような表示用) */
export function getDungeonFloorDropRates(floor: number): { star: EquipStar; percent: number }[] {
  const weights = DUNGEON_FLOOR_STAR_WEIGHTS[floor] ?? [];
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  return weights.map((w) => ({ star: w.value, percent: total > 0 ? Math.round((w.weight / total) * 1000) / 10 : 0 }));
}

/** 装備ダンジョンの指定階層で装備を1つ生成する(ドロップは呼び出し側で確定させてから呼ぶ) */
export function generateDungeonEquipment(
  floor: number,
  rng: () => number = Math.random,
  setPool: readonly SetType[] = DEMON_DUNGEON_SET_TYPES,
): Equipment {
  const starWeights = DUNGEON_FLOOR_STAR_WEIGHTS[floor] ?? DUNGEON_FLOOR_STAR_WEIGHTS[1];
  const star = weightedPick(starWeights, rng);
  const subStatCount = weightedPick(DUNGEON_SUBSTAT_COUNT_WEIGHTS_BY_STAR[star], rng);
  return generateEquipment({ star, subStatCount, set: setPool[Math.floor(rng() * setPool.length)], rng });
}
