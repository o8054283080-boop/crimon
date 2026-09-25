/**
 * アクセサリー。**6枠の装備とは別の、1体に1つだけ着けられる独立枠。**
 *
 * ## 何が入っているか
 *
 *   ★(4/5/6)・レア度(ヒーロー/レジェンド/エピック)・系統(攻撃/耐久/サポート/妨害)
 *   メイン(HP/攻撃/防御の実数)・特殊効果(レア度で1〜3個)・弱効果(必ず1個)・強化Lv(1〜15)
 *
 * ## 数値は「引いた時に確定して控えに焼く」
 *
 * 特殊効果の値は引いた瞬間に決まり、アクセそのものに保存される
 * (装備のサブOPと同じ)。メインの実数と弱効果の強さだけは Lv から毎回計算する——
 * どちらも「強化で伸びる」もので、Lv だけを持てば値が一意に決まるから。
 * メインの個体差(×0.8〜1.2)は `mainRoll` に焼いておく。
 *
 * ## このファイルは戦闘サーバへも持っていく
 *
 * アリーナの精算(`supabase/functions/arena-settle`)は同じ戦闘を回し直すので、
 * アクセの効き方はクライアントとサーバで1バイトも違ってはいけない。
 * **`game/` を取り込まないこと**(`build:edge` が DOM 抜きで組み立てるため)。
 *
 * ## 壊れたアクセは「着けていない」として扱う
 *
 * 旧セーブ・古い防衛データ・売却済みのID・手で書き換えた値——
 * どれが来ても `sanitizeAccessory` が null を返すだけで、**例外は投げない。**
 * アクセ1個が読めないせいで編成や対戦が丸ごと止まるのが、いちばん困る。
 */
import type { Element } from "./element.js";
import { ELEMENTS, ELEMENT_JA } from "./element.js";

/* ==========================================================================
 * 型
 * ========================================================================== */

export type AccessoryStar = 4 | 5 | 6;
export type AccessoryRarity = "HERO" | "LEGEND" | "EPIC";
export type AccessoryFamily = "ATTACK" | "DURABILITY" | "SUPPORT" | "DISRUPT";
export type AccessoryMainStat = "HP" | "ATK" | "DEF";

export const ACCESSORY_STARS: readonly AccessoryStar[] = [4, 5, 6];
export const ACCESSORY_RARITIES: readonly AccessoryRarity[] = ["HERO", "LEGEND", "EPIC"];
export const ACCESSORY_FAMILIES: readonly AccessoryFamily[] = ["ATTACK", "DURABILITY", "SUPPORT", "DISRUPT"];
export const ACCESSORY_MAIN_STATS: readonly AccessoryMainStat[] = ["HP", "ATK", "DEF"];

export const ACCESSORY_RARITY_JA: Record<AccessoryRarity, string> = { HERO: "ヒーロー", LEGEND: "レジェンド", EPIC: "エピック" };
export const ACCESSORY_FAMILY_JA: Record<AccessoryFamily, string> = {
  ATTACK: "攻撃", DURABILITY: "耐久", SUPPORT: "サポート", DISRUPT: "妨害",
};
export const ACCESSORY_MAIN_JA: Record<AccessoryMainStat, string> = { HP: "HP", ATK: "攻撃力", DEF: "防御力" };

/** レア度ごとの特殊効果の数。弱効果はどのレア度も1個 */
export const SPECIAL_COUNT: Record<AccessoryRarity, number> = { HERO: 1, LEGEND: 2, EPIC: 3 };

export const ACCESSORY_MIN_LEVEL = 1;
export const ACCESSORY_MAX_LEVEL = 15;

/** 特殊効果1つ。`value` は割合(0.085 = 8.5%)。倍率型(×1.12)は 0.12 で持つ */
export interface AccessorySpecialRoll {
  id: AccessorySpecialId;
  value: number;
}

export interface Accessory {
  id: string;
  star: AccessoryStar;
  rarity: AccessoryRarity;
  family: AccessoryFamily;
  level: number;
  mainStat: AccessoryMainStat;
  /** メインの個体差。0.8〜1.2 の一様。★6 Lv15 の中央値にこれを掛けた値がメインになる */
  mainRoll: number;
  specials: AccessorySpecialRoll[];
  weak: AccessoryWeakId;
  locked?: boolean;
}

/* ==========================================================================
 * メイン
 * ========================================================================== */

/** ★6 Lv15 の中央値。**依頼主の指定値。動かさないこと** */
export const ACCESSORY_MAIN_MEDIAN_6_15: Record<AccessoryMainStat, number> = { HP: 5_000, ATK: 2_000, DEF: 750 };
export const ACCESSORY_MAIN_ROLL_MIN = 0.8;
export const ACCESSORY_MAIN_ROLL_MAX = 1.2;

/**
 * ★ごとのメインの大きさ(★6 = 1)。
 *
 * 装備のメインは★が1つ下がるとおよそ2〜3割落ちる。アクセもそれに揃えて、
 * ★5 は★6の約7割、★4 は約5割にしてある。★4 の Lv15 が★6 の Lv5 前後に並ぶ。
 */
export const ACCESSORY_STAR_MAIN_FACTOR: Record<AccessoryStar, number> = { 4: 0.5, 5: 0.7, 6: 1 };

/**
 * Lv ごとの伸び。Lv1 で最終値の3割、Lv15 で10割。途中は均等。
 *
 * 装備と同じく「強化してはじめて本来の数字になる」形。Lv1 のまま着けても
 * 何もしないよりは強いが、育てる意味がはっきり残るようにする。
 */
export function accessoryLevelFactor(level: number): number {
  const lv = clampLevel(level);
  return 0.3 + 0.7 * ((lv - 1) / (ACCESSORY_MAX_LEVEL - 1));
}

export function accessoryMainValue(acc: Pick<Accessory, "star" | "level" | "mainStat" | "mainRoll">): number {
  const median = ACCESSORY_MAIN_MEDIAN_6_15[acc.mainStat];
  const roll = Math.max(ACCESSORY_MAIN_ROLL_MIN, Math.min(ACCESSORY_MAIN_ROLL_MAX, acc.mainRoll));
  return Math.round(median * ACCESSORY_STAR_MAIN_FACTOR[acc.star] * roll * accessoryLevelFactor(acc.level));
}

/* ==========================================================================
 * 特殊効果の表
 * ========================================================================== */

type Range = readonly [number, number];
type Ranges = Readonly<Record<AccessoryRarity, Range>>;
const r = (hero: Range, legend: Range, epic: Range): Ranges => ({ HERO: hero, LEGEND: legend, EPIC: epic });
const fixed = (hero: number, legend: number, epic: number): Ranges => r([hero, hero], [legend, legend], [epic, epic]);

/** 画面での数字の出し方 */
export type SpecialUnit = "PERCENT" | "POINT" | "TIMES";

interface SpecialDef {
  family: AccessoryFamily;
  /** 抽選で同じ「種類」とみなす束。属性特効6つは1つの種類として引く */
  kind: string;
  ranges: Ranges;
  unit: SpecialUnit;
  /** 画面の書き方。`{v}` に値が入る */
  format: string;
}

const ELEMENT_SPECIALS = {
  ELEM_FIRE: "FIRE", ELEM_WATER: "WATER", ELEM_ELECTRIC: "ELECTRIC",
  ELEM_GRASS: "GRASS", ELEM_LIGHT: "LIGHT", ELEM_DARK: "DARK",
} as const satisfies Record<string, Element>;
export type ElementSpecialId = keyof typeof ELEMENT_SPECIALS;

const ELEM_RANGES = r([0.04, 0.06], [0.06, 0.08], [0.08, 0.11]);
const elementSpecial = (element: Element): SpecialDef => ({
  family: "ATTACK", kind: "ELEM", ranges: ELEM_RANGES, unit: "PERCENT",
  format: `${ELEMENT_JA[element]}属性の敵への与ダメージ +{v}`,
});

export const ACCESSORY_SPECIALS = {
  /* ------------------------------------------------ 攻撃(与ダメUPは加算) */
  ELEM_FIRE: elementSpecial("FIRE"),
  ELEM_WATER: elementSpecial("WATER"),
  ELEM_ELECTRIC: elementSpecial("ELECTRIC"),
  ELEM_GRASS: elementSpecial("GRASS"),
  ELEM_LIGHT: elementSpecial("LIGHT"),
  ELEM_DARK: elementSpecial("DARK"),
  S1_DMG: { family: "ATTACK", kind: "S1_DMG", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]), unit: "PERCENT", format: "S1ダメージ +{v}" },
  S2_DMG: { family: "ATTACK", kind: "S2_DMG", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]), unit: "PERCENT", format: "S2ダメージ +{v}" },
  S3_DMG: { family: "ATTACK", kind: "S3_DMG", ranges: r([0.05, 0.07], [0.07, 0.09], [0.09, 0.12]), unit: "PERCENT", format: "S3ダメージ +{v}" },
  SELF_HP70: { family: "ATTACK", kind: "SELF_HP70", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]), unit: "PERCENT", format: "自分のHP70%以上で与ダメージ +{v}" },
  SELF_HP50: { family: "ATTACK", kind: "SELF_HP50", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]), unit: "PERCENT", format: "自分のHP50%以上で与ダメージ +{v}" },
  SELF_HP30: { family: "ATTACK", kind: "SELF_HP30", ranges: r([0.07, 0.10], [0.10, 0.13], [0.13, 0.17]), unit: "PERCENT", format: "自分のHP30%以下で与ダメージ +{v}" },
  ENEMY_HP30: { family: "ATTACK", kind: "ENEMY_HP30", ranges: r([0.06, 0.08], [0.08, 0.11], [0.11, 0.14]), unit: "PERCENT", format: "HP30%以下の敵への与ダメージ +{v}" },
  ENEMY_HP20: { family: "ATTACK", kind: "ENEMY_HP20", ranges: r([0.08, 0.10], [0.10, 0.13], [0.13, 0.17]), unit: "PERCENT", format: "HP20%以下の敵への与ダメージ +{v}" },
  DEBUFF1: { family: "ATTACK", kind: "DEBUFF1", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]), unit: "PERCENT", format: "弱体1個以上の敵への与ダメージ +{v}" },
  DEBUFF3: { family: "ATTACK", kind: "DEBUFF3", ranges: r([0.07, 0.09], [0.09, 0.12], [0.12, 0.15]), unit: "PERCENT", format: "弱体3個以上の敵への与ダメージ +{v}" },
  MULTI2: { family: "ATTACK", kind: "MULTI2", ranges: r([0.04, 0.06], [0.06, 0.09], [0.09, 0.12]), unit: "PERCENT", format: "2ヒット目以降のダメージ +{v}" },
  MULTI3: { family: "ATTACK", kind: "MULTI3", ranges: r([0.06, 0.08], [0.08, 0.11], [0.11, 0.15]), unit: "PERCENT", format: "3ヒット目以降のダメージ +{v}" },
  FIRST: { family: "ATTACK", kind: "FIRST", ranges: r([0.05, 0.07], [0.07, 0.09], [0.09, 0.12]), unit: "PERCENT", format: "戦闘で最初の攻撃のダメージ +{v}" },
  KILL_GAUGE: { family: "ATTACK", kind: "KILL_GAUGE", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]), unit: "PERCENT", format: "敵を倒した時 自分の行動ゲージ +{v}" },

  /* ------------------------------------------------ 耐久(被ダメ軽減は乗算) */
  DMG_TAKEN: { family: "DURABILITY", kind: "DMG_TAKEN", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]), unit: "PERCENT", format: "受けるダメージ -{v}" },
  CRIT_TAKEN: { family: "DURABILITY", kind: "CRIT_TAKEN", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]), unit: "PERCENT", format: "受けるクリティカルダメージ -{v}" },
  MAX_HP: { family: "DURABILITY", kind: "MAX_HP", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]), unit: "PERCENT", format: "最大HP +{v}" },
  DEF_UP: { family: "DURABILITY", kind: "DEF_UP", ranges: r([0.03, 0.04], [0.04, 0.06], [0.06, 0.08]), unit: "PERCENT", format: "防御力 +{v}" },
  LOW50: { family: "DURABILITY", kind: "LOW50", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.11]), unit: "PERCENT", format: "HP50%以下の時 受けるダメージ -{v}" },
  LOW30: { family: "DURABILITY", kind: "LOW30", ranges: r([0.06, 0.08], [0.08, 0.11], [0.11, 0.14]), unit: "PERCENT", format: "HP30%以下の時 受けるダメージ -{v}" },
  START_SHIELD: { family: "DURABILITY", kind: "START_SHIELD", ranges: r([0.03, 0.04], [0.04, 0.05], [0.05, 0.07]), unit: "PERCENT", format: "戦闘開始時 最大HPの{v}のシールド" },
  SHIELD50: { family: "DURABILITY", kind: "SHIELD50", ranges: r([0.04, 0.05], [0.05, 0.07], [0.07, 0.09]), unit: "PERCENT", format: "初めてHP50%以下になった時 最大HPの{v}のシールド(1回)" },
  TURN_HEAL: { family: "DURABILITY", kind: "TURN_HEAL", ranges: r([0.005, 0.01], [0.01, 0.015], [0.015, 0.02]), unit: "PERCENT", format: "ターン開始時 最大HPの{v}回復" },
  HIT_HEAL: { family: "DURABILITY", kind: "HIT_HEAL", ranges: fixed(0.01, 0.015, 0.02), unit: "PERCENT", format: "攻撃を受けた時 15%で最大HPの{v}回復" },
  S1_TAKEN: { family: "DURABILITY", kind: "S1_TAKEN", ranges: r([0.03, 0.04], [0.04, 0.06], [0.06, 0.08]), unit: "PERCENT", format: "敵のS1から受けるダメージ -{v}" },
  S2_TAKEN: { family: "DURABILITY", kind: "S2_TAKEN", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]), unit: "PERCENT", format: "敵のS2から受けるダメージ -{v}" },
  S3_TAKEN: { family: "DURABILITY", kind: "S3_TAKEN", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]), unit: "PERCENT", format: "敵のS3から受けるダメージ -{v}" },
  HP70_TAKEN: { family: "DURABILITY", kind: "HP70_TAKEN", ranges: r([0.02, 0.03], [0.03, 0.05], [0.05, 0.07]), unit: "PERCENT", format: "HP70%以上の時 受けるダメージ -{v}" },
  DEBUFFED_TAKEN: { family: "DURABILITY", kind: "DEBUFFED_TAKEN", ranges: r([0.03, 0.04], [0.04, 0.06], [0.06, 0.08]), unit: "PERCENT", format: "弱体を受けている時 受けるダメージ -{v}" },
  SINGLE_TAKEN: { family: "DURABILITY", kind: "SINGLE_TAKEN", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]), unit: "PERCENT", format: "単体攻撃から受けるダメージ -{v}" },
  AOE_TAKEN: { family: "DURABILITY", kind: "AOE_TAKEN", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]), unit: "PERCENT", format: "全体攻撃から受けるダメージ -{v}" },

  /* ------------------------------------------------ サポート(1スキル×1対象×1条件で1回) */
  HEAL_UP: { family: "SUPPORT", kind: "HEAL_UP", ranges: r([0.10, 0.14], [0.14, 0.20], [0.20, 0.25]), unit: "PERCENT", format: "回復量 +{v}" },
  SHIELD_UP: { family: "SUPPORT", kind: "SHIELD_UP", ranges: r([0.10, 0.15], [0.15, 0.22], [0.30, 0.35]), unit: "PERCENT", format: "シールド量 +{v}" },
  LOW50_HEAL: { family: "SUPPORT", kind: "LOW50_HEAL", ranges: r([0.16, 0.22], [0.22, 0.30], [0.30, 0.40]), unit: "PERCENT", format: "HP50%以下の味方への回復量 +{v}" },
  HEALED_DR: { family: "SUPPORT", kind: "HEALED_DR", ranges: r([0.06, 0.08], [0.08, 0.11], [0.12, 0.15]), unit: "PERCENT", format: "回復した味方の被ダメージ -{v}（1ターン）" },
  HEALED_SHIELD: { family: "SUPPORT", kind: "HEALED_SHIELD", ranges: fixed(0.04, 0.06, 0.08), unit: "PERCENT", format: "回復した味方に 最大HPの{v}のシールド" },
  LOW50_HEALED_SHIELD: { family: "SUPPORT", kind: "LOW50_HEALED_SHIELD", ranges: r([0.06, 0.06], [0.08, 0.08], [0.10, 0.12]), unit: "PERCENT", format: "HP50%以下の味方を回復した時 最大HPの{v}のシールド" },
  HEALED_GAUGE: { family: "SUPPORT", kind: "HEALED_GAUGE", ranges: fixed(0.03, 0.045, 0.06), unit: "PERCENT", format: "回復した味方の行動ゲージ +{v}" },
  BUFF_SHIELD: { family: "SUPPORT", kind: "BUFF_SHIELD", ranges: fixed(0.03, 0.05, 0.07), unit: "PERCENT", format: "強化を付与した味方に 最大HPの{v}のシールド" },
  BUFF_GAUGE: { family: "SUPPORT", kind: "BUFF_GAUGE", ranges: fixed(0.03, 0.045, 0.06), unit: "PERCENT", format: "強化を付与した味方の行動ゲージ +{v}" },

  /* ------------------------------------------------ 妨害 */
  DEBUFF_RATE: { family: "DISRUPT", kind: "DEBUFF_RATE", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]), unit: "POINT", format: "弱体効果の発動率 +{v}" },
  S1_RATE: { family: "DISRUPT", kind: "S1_RATE", ranges: fixed(0.02, 0.03, 0.04), unit: "POINT", format: "S1の弱体効果の発動率 +{v}" },
  S2_RATE: { family: "DISRUPT", kind: "S2_RATE", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]), unit: "POINT", format: "S2の弱体効果の発動率 +{v}" },
  S3_RATE: { family: "DISRUPT", kind: "S3_RATE", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]), unit: "POINT", format: "S3の弱体効果の発動率 +{v}" },
  GAUGE_DOWN_UP: { family: "DISRUPT", kind: "GAUGE_DOWN_UP", ranges: r([0.05, 0.07], [0.07, 0.09], [0.09, 0.12]), unit: "TIMES", format: "行動ゲージ減少量 {v}" },
  DEBUFFED_GAUGE_DOWN: { family: "DISRUPT", kind: "DEBUFFED_GAUGE_DOWN", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]), unit: "TIMES", format: "弱体中の敵への行動ゲージ減少量 {v}" },
  DEBUFF_SELF_GAUGE: { family: "DISRUPT", kind: "DEBUFF_SELF_GAUGE", ranges: fixed(0.02, 0.03, 0.04), unit: "PERCENT", format: "弱体付与に成功した時 自分の行動ゲージ +{v}" },
  STRIP_SELF_GAUGE: { family: "DISRUPT", kind: "STRIP_SELF_GAUGE", ranges: r([0.03, 0.03], [0.04, 0.05], [0.05, 0.06]), unit: "PERCENT", format: "強化解除に成功した時 自分の行動ゲージ +{v}" },
  STRIP_TARGET_GAUGE: { family: "DISRUPT", kind: "STRIP_TARGET_GAUGE", ranges: fixed(0.02, 0.03, 0.04), unit: "PERCENT", format: "強化解除に成功した敵の行動ゲージ -{v}" },
  STUNNED_DMG: { family: "DISRUPT", kind: "STUNNED_DMG", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]), unit: "PERCENT", format: "行動不能の敵への与ダメージ +{v}" },
} as const satisfies Record<string, SpecialDef>;

export type AccessorySpecialId = keyof typeof ACCESSORY_SPECIALS;

export function specialDef(id: AccessorySpecialId): SpecialDef {
  return ACCESSORY_SPECIALS[id];
}

export function specialRange(id: AccessorySpecialId, rarity: AccessoryRarity): Range {
  return ACCESSORY_SPECIALS[id].ranges[rarity];
}

export function isAccessorySpecialId(value: unknown): value is AccessorySpecialId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACCESSORY_SPECIALS, value);
}

export function elementOfSpecial(id: AccessorySpecialId): Element | null {
  return (ELEMENT_SPECIALS as Record<string, Element>)[id] ?? null;
}

/* ==========================================================================
 * 弱効果
 *
 * 1つのアクセに必ず1つ。特殊効果より明確に弱い値で、**Lv5・10・15 で少しずつ伸びる。**
 *
 *   範囲で指定された弱効果(吸収1〜2%・追撃10〜15%)… Lv1で下端、Lv15で上端
 *   1つの値で指定された弱効果 … Lv1でその値、Lv5・10・15で1割ずつ上乗せ(Lv15で1.3倍)
 *
 * 検証で使った値(追撃10〜15%でATK×0.15・吸収1.5%・止め刺し+3%・初撃+2%・
 * 連撃+2%・撃破+4%)は、この表の Lv1〜Lv15 の間に収まっている。
 * ========================================================================== */

interface WeakDef {
  family: AccessoryFamily;
  /** Lv1〜4 / Lv5〜9 / Lv10〜14 / Lv15 の値 */
  steps: readonly [number, number, number, number];
  unit: SpecialUnit;
  format: string;
}

const grow = (base: number): WeakDef["steps"] => [base, base * 1.1, base * 1.2, base * 1.3];
const span = (lo: number, hi: number): WeakDef["steps"] => [lo, lo + (hi - lo) / 3, lo + (hi - lo) * 2 / 3, hi];

export const ACCESSORY_WEAKS = {
  /* 攻撃 */
  W_FOLLOWUP: { family: "ATTACK", steps: span(0.10, 0.15), unit: "PERCENT", format: "攻撃後 {v}で攻撃力の15%の追撃" },
  W_LIFESTEAL: { family: "ATTACK", steps: span(0.01, 0.02), unit: "PERCENT", format: "与えたダメージの{v}を吸収" },
  W_FINISH: { family: "ATTACK", steps: grow(0.03), unit: "PERCENT", format: "HP20%以下の敵への与ダメージ +{v}" },
  W_CRIT_GAUGE: { family: "ATTACK", steps: grow(0.03), unit: "PERCENT", format: "クリティカル時 5%で自分の行動ゲージ +{v}" },
  W_KILL_GAUGE: { family: "ATTACK", steps: grow(0.04), unit: "PERCENT", format: "敵を倒した時 自分の行動ゲージ +{v}" },
  W_FIRST: { family: "ATTACK", steps: grow(0.02), unit: "PERCENT", format: "戦闘で最初の攻撃のダメージ +{v}" },
  W_MULTI2: { family: "ATTACK", steps: grow(0.02), unit: "PERCENT", format: "2ヒット目以降のダメージ +{v}" },
  /* 耐久 */
  W_MAX_HP: { family: "DURABILITY", steps: grow(0.01), unit: "PERCENT", format: "最大HP +{v}" },
  W_DEF: { family: "DURABILITY", steps: grow(0.01), unit: "PERCENT", format: "防御力 +{v}" },
  W_DMG_TAKEN: { family: "DURABILITY", steps: grow(0.01), unit: "PERCENT", format: "受けるダメージ -{v}" },
  W_CRIT_TAKEN: { family: "DURABILITY", steps: grow(0.02), unit: "PERCENT", format: "受けるクリティカルダメージ -{v}" },
  W_LOW30: { family: "DURABILITY", steps: grow(0.02), unit: "PERCENT", format: "HP30%以下の時 受けるダメージ -{v}" },
  W_TURN_HEAL: { family: "DURABILITY", steps: grow(0.005), unit: "PERCENT", format: "ターン開始時 最大HPの{v}回復" },
  W_START_SHIELD: { family: "DURABILITY", steps: grow(0.015), unit: "PERCENT", format: "戦闘開始時 最大HPの{v}のシールド" },
  W_HIT_HEAL: { family: "DURABILITY", steps: grow(0.01), unit: "PERCENT", format: "攻撃を受けた時 10%で最大HPの{v}回復" },
  /* サポート */
  W_HEAL_UP: { family: "SUPPORT", steps: grow(0.02), unit: "PERCENT", format: "回復量 +{v}" },
  W_SHIELD_UP: { family: "SUPPORT", steps: grow(0.05), unit: "PERCENT", format: "シールド量 +{v}" },
  W_HEALED_SHIELD: { family: "SUPPORT", steps: grow(0.01), unit: "PERCENT", format: "回復した味方に 最大HPの{v}のシールド" },
  W_HEALED_GAUGE: { family: "SUPPORT", steps: grow(0.01), unit: "PERCENT", format: "回復した味方の行動ゲージ +{v}" },
  W_BUFF_SHIELD: { family: "SUPPORT", steps: grow(0.01), unit: "PERCENT", format: "強化を付与した味方に 最大HPの{v}のシールド" },
  /* 妨害 */
  W_DEBUFF_RATE: { family: "DISRUPT", steps: grow(0.01), unit: "POINT", format: "弱体効果の発動率 +{v}" },
  W_S1_RATE: { family: "DISRUPT", steps: grow(0.01), unit: "POINT", format: "S1の弱体効果の発動率 +{v}" },
  W_S2_RATE: { family: "DISRUPT", steps: grow(0.01), unit: "POINT", format: "S2の弱体効果の発動率 +{v}" },
  W_S3_RATE: { family: "DISRUPT", steps: grow(0.01), unit: "POINT", format: "S3の弱体効果の発動率 +{v}" },
  W_GAUGE_DOWN: { family: "DISRUPT", steps: grow(0.02), unit: "TIMES", format: "行動ゲージ減少量 {v}" },
  W_DEBUFF_GAUGE: { family: "DISRUPT", steps: grow(0.01), unit: "PERCENT", format: "弱体付与に成功した時 自分の行動ゲージ +{v}" },
  W_STRIP_GAUGE: { family: "DISRUPT", steps: grow(0.02), unit: "PERCENT", format: "強化解除に成功した時 自分の行動ゲージ +{v}" },
  W_STUNNED_DMG: { family: "DISRUPT", steps: grow(0.02), unit: "PERCENT", format: "行動不能の敵への与ダメージ +{v}" },
} as const satisfies Record<string, WeakDef>;

export type AccessoryWeakId = keyof typeof ACCESSORY_WEAKS;

export function isAccessoryWeakId(value: unknown): value is AccessoryWeakId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACCESSORY_WEAKS, value);
}

/** 弱効果が伸びる段。Lv5・10・15 */
export const WEAK_EFFECT_LEVELS: readonly number[] = [5, 10, 15];

export function weakStepIndex(level: number): 0 | 1 | 2 | 3 {
  const lv = clampLevel(level);
  if (lv >= 15) return 3;
  if (lv >= 10) return 2;
  if (lv >= 5) return 1;
  return 0;
}

/** 弱効果の現在値。表示と戦闘の両方がここを見る */
export function weakValue(id: AccessoryWeakId, level: number): number {
  return roundFraction(ACCESSORY_WEAKS[id].steps[weakStepIndex(level)]);
}

/* ==========================================================================
 * 生成
 * ========================================================================== */

let accessorySerial = 0;

export function newAccessoryId(rng: () => number = Math.random): string {
  accessorySerial = (accessorySerial + 1) % 1_000_000;
  return `acc_${Date.now().toString(36)}_${accessorySerial.toString(36)}_${Math.floor(rng() * 1e9).toString(36)}`;
}

/** 表示で数字がぶれないよう、割合は 0.1% 刻みに丸めて焼く */
function roundFraction(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

export function rollSpecialValue(id: AccessorySpecialId, rarity: AccessoryRarity, rng: () => number): number {
  const [lo, hi] = specialRange(id, rarity);
  if (lo === hi) return roundFraction(lo);
  return roundFraction(lo + (hi - lo) * rng());
}

/** その系統の特殊効果を種類ごとに束ねたもの(属性特効6つは1つの種類) */
function specialKinds(family: AccessoryFamily): Map<string, AccessorySpecialId[]> {
  const kinds = new Map<string, AccessorySpecialId[]>();
  for (const [id, def] of Object.entries(ACCESSORY_SPECIALS) as [AccessorySpecialId, SpecialDef][]) {
    if (def.family !== family) continue;
    const list = kinds.get(def.kind) ?? [];
    list.push(id);
    kinds.set(def.kind, list);
  }
  return kinds;
}

/**
 * 特殊効果を引く。**同じ効果は1つのアクセに2つ入らない。**
 *
 * 抽選はまず「種類」を等確率で選び、属性特効ならそこから属性を選ぶ。
 * 属性特効6つを別々の候補として並べると、攻撃系の3割が属性特効になってしまう。
 * 同じ「属性特効」でも別の属性なら別の効果なので、2つ目も入りうる。
 */
export function rollSpecials(family: AccessoryFamily, rarity: AccessoryRarity, rng: () => number): AccessorySpecialRoll[] {
  const kinds = specialKinds(family);
  const taken = new Set<AccessorySpecialId>();
  const out: AccessorySpecialRoll[] = [];
  for (let i = 0; i < SPECIAL_COUNT[rarity]; i += 1) {
    const open = [...kinds.entries()]
      .map(([kind, ids]) => [kind, ids.filter((id) => !taken.has(id))] as const)
      .filter(([, ids]) => ids.length > 0);
    if (open.length === 0) break;
    const [, ids] = pick(open, rng);
    const id = pick(ids, rng);
    taken.add(id);
    out.push({ id, value: rollSpecialValue(id, rarity, rng) });
  }
  return out;
}

export function weaksOfFamily(family: AccessoryFamily): AccessoryWeakId[] {
  return (Object.entries(ACCESSORY_WEAKS) as [AccessoryWeakId, WeakDef][])
    .filter(([, def]) => def.family === family)
    .map(([id]) => id);
}

export function specialsOfFamily(family: AccessoryFamily): AccessorySpecialId[] {
  return (Object.entries(ACCESSORY_SPECIALS) as [AccessorySpecialId, SpecialDef][])
    .filter(([, def]) => def.family === family)
    .map(([id]) => id);
}

export interface GenerateAccessoryOptions {
  star: AccessoryStar;
  rarity: AccessoryRarity;
  family: AccessoryFamily;
  rng?: () => number;
  /** 未指定ならHP/攻撃/防御から等確率 */
  mainStat?: AccessoryMainStat;
}

export function generateAccessory(options: GenerateAccessoryOptions): Accessory {
  const rng = options.rng ?? Math.random;
  const mainStat = options.mainStat ?? pick(ACCESSORY_MAIN_STATS, rng);
  const mainRoll = Math.round((ACCESSORY_MAIN_ROLL_MIN + (ACCESSORY_MAIN_ROLL_MAX - ACCESSORY_MAIN_ROLL_MIN) * rng()) * 1000) / 1000;
  const specials = rollSpecials(options.family, options.rarity, rng);
  const weak = pick(weaksOfFamily(options.family), rng);
  return {
    id: newAccessoryId(rng),
    star: options.star,
    rarity: options.rarity,
    family: options.family,
    level: ACCESSORY_MIN_LEVEL,
    mainStat,
    mainRoll,
    specials,
    weak,
  };
}

/** 重み付きの表から1つ選ぶ。重みは合計しなくてよい */
export function pickWeighted<T extends string | number>(table: readonly (readonly [T, number])[], rng: () => number): T {
  const total = table.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  let roll = rng() * total;
  for (const [value, weight] of table) {
    if (weight <= 0) continue;
    if (roll < weight) return value;
    roll -= weight;
  }
  return table.filter(([, w]) => w > 0).at(-1)![0];
}

/* ==========================================================================
 * 強化・売却
 *
 * **ゴールドだけで、必ず成功する。**装備の強化(`enhanceEquipment`)とは
 * 別の関数にしてある——装備側の抽選や副OPの伸び方を一切通らない。
 * ========================================================================== */

/**
 * Lv(n) → Lv(n+1) の費用。添字は「上がった後のLv」。
 * 装備の同じ★の +2〜+15 と同じ額にそろえてある(装備を1本育てるのと同じ重さ)。
 */
export const ACCESSORY_ENHANCE_COST: Record<AccessoryStar, readonly number[]> = {
  4: [0, 0, 1_000, 2_000, 2_000, 3_000, 4_000, 5_000, 7_000, 10_000, 15_000, 20_000, 30_000, 40_000, 55_000, 75_000],
  5: [0, 0, 3_000, 5_000, 8_000, 12_000, 18_000, 25_000, 35_000, 50_000, 65_000, 80_000, 100_000, 125_000, 150_000, 200_000],
  6: [0, 0, 5_000, 8_000, 12_000, 18_000, 25_000, 35_000, 50_000, 70_000, 90_000, 120_000, 160_000, 200_000, 250_000, 300_000],
};

export function accessoryEnhanceCost(acc: Pick<Accessory, "star" | "level">): number {
  const table = ACCESSORY_ENHANCE_COST[acc.star];
  const next = clampLevel(acc.level) + 1;
  return table[next] ?? table[table.length - 1];
}

export function canEnhanceAccessory(acc: Pick<Accessory, "level">): boolean {
  return clampLevel(acc.level) < ACCESSORY_MAX_LEVEL;
}

/** 1段上げる。**失敗は無い。**ゴールドの支払いは呼ぶ側(`game/accessories.ts`) */
export function enhanceAccessory(acc: Accessory): boolean {
  if (!canEnhanceAccessory(acc)) return false;
  acc.level = clampLevel(acc.level) + 1;
  return true;
}

export function accessoryEnhanceTotalCost(star: AccessoryStar, from: number, to: number): number {
  let sum = 0;
  for (let lv = from + 1; lv <= to; lv += 1) sum += ACCESSORY_ENHANCE_COST[star][lv] ?? 0;
  return sum;
}

/**
 * 売値の基本額(ヒーロー・Lv1)。
 *
 * はじめは装備と同じ額(★4 8,000 / ★5 20,000)だったが、依頼主の指定で
 * ★4・★5だけを7割に下げた。★6は装備と同じまま。
 * 売値は持っている時点の値を焼かず、その都度ここから計算するので、控えの移行は要らない。
 */
const SELL_BASE: Record<AccessoryStar, number> = { 4: 5_600, 5: 14_000, 6: 40_000 };
const SELL_RARITY: Record<AccessoryRarity, number> = { HERO: 1, LEGEND: 1.25, EPIC: 1.5 };

/** 売値。装備と同じく、注ぎ込んだ強化費の3割を戻す */
export function accessorySellPrice(acc: Accessory): number {
  const invested = accessoryEnhanceTotalCost(acc.star, ACCESSORY_MIN_LEVEL, clampLevel(acc.level));
  return Math.round(SELL_BASE[acc.star] * SELL_RARITY[acc.rarity] + invested * 0.3);
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return ACCESSORY_MIN_LEVEL;
  return Math.max(ACCESSORY_MIN_LEVEL, Math.min(ACCESSORY_MAX_LEVEL, Math.floor(level)));
}

/* ==========================================================================
 * 表示
 * ========================================================================== */

function formatValue(value: number, unit: SpecialUnit): string {
  if (unit === "TIMES") return `×${(1 + value).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
  const pct = Math.round(value * 1000) / 10;
  const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
  return unit === "POINT" ? `${text}pt` : `${text}%`;
}

export function describeSpecial(roll: AccessorySpecialRoll): string {
  const def = ACCESSORY_SPECIALS[roll.id];
  return def.format.replace("{v}", formatValue(roll.value, def.unit));
}

export function describeWeak(id: AccessoryWeakId, level: number): string {
  const def = ACCESSORY_WEAKS[id];
  return def.format.replace("{v}", formatValue(weakValue(id, level), def.unit));
}

export function describeAccessoryMain(acc: Accessory): string {
  return `${ACCESSORY_MAIN_JA[acc.mainStat]} +${accessoryMainValue(acc).toLocaleString("ja-JP")}`;
}

export function accessoryTitle(acc: Accessory): string {
  return `★${acc.star} ${ACCESSORY_RARITY_JA[acc.rarity]} ${ACCESSORY_FAMILY_JA[acc.family]}のアクセ Lv${acc.level}`;
}

/* ==========================================================================
 * 読めないアクセを無害にする
 * ========================================================================== */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 外から来たアクセを検分する。**読めない時は null(= 着けていない)。**
 *
 * 旧セーブ・古い防衛データ・壊れた値・改ざんされた値のどれでも例外を投げない。
 * 数値は正規の範囲へ収める——防衛データの中身はサーバの照合表が見ていないので、
 * ここで範囲を超えた値(メイン+100万など)を正規の上限へ丸める。
 * 戦闘はクライアントもサーバもこの関数を通るので、両者で同じ結果になる。
 */
export function sanitizeAccessory(value: unknown): Accessory | null {
  try {
    if (!isRecord(value)) return null;
    const star = value.star;
    if (star !== 4 && star !== 5 && star !== 6) return null;
    const rarity = value.rarity;
    if (rarity !== "HERO" && rarity !== "LEGEND" && rarity !== "EPIC") return null;
    const family = value.family;
    if (typeof family !== "string" || !(ACCESSORY_FAMILIES as readonly string[]).includes(family)) return null;
    const mainStat = value.mainStat;
    if (typeof mainStat !== "string" || !(ACCESSORY_MAIN_STATS as readonly string[]).includes(mainStat)) return null;
    const level = typeof value.level === "number" && Number.isFinite(value.level) ? clampLevel(value.level) : ACCESSORY_MIN_LEVEL;
    const mainRoll = typeof value.mainRoll === "number" && Number.isFinite(value.mainRoll)
      ? Math.max(ACCESSORY_MAIN_ROLL_MIN, Math.min(ACCESSORY_MAIN_ROLL_MAX, value.mainRoll))
      : 1;
    const specials: AccessorySpecialRoll[] = [];
    const seen = new Set<string>();
    if (Array.isArray(value.specials)) {
      for (const raw of value.specials) {
        if (specials.length >= SPECIAL_COUNT[rarity]) break;
        if (!isRecord(raw) || !isAccessorySpecialId(raw.id) || seen.has(raw.id)) continue;
        if (ACCESSORY_SPECIALS[raw.id].family !== family) continue;
        if (typeof raw.value !== "number" || !Number.isFinite(raw.value)) continue;
        const [lo, hi] = specialRange(raw.id, rarity);
        seen.add(raw.id);
        specials.push({ id: raw.id, value: Math.max(lo, Math.min(hi, raw.value)) });
      }
    }
    const weak = isAccessoryWeakId(value.weak) && ACCESSORY_WEAKS[value.weak].family === family
      ? value.weak
      : weaksOfFamily(family as AccessoryFamily)[0];
    const acc: Accessory = {
      id: typeof value.id === "string" && value.id ? value.id : "acc_unknown",
      star, rarity, family: family as AccessoryFamily, level,
      mainStat: mainStat as AccessoryMainStat, mainRoll, specials, weak,
    };
    if (value.locked === true) acc.locked = true;
    return acc;
  } catch {
    return null;
  }
}

/* ==========================================================================
 * 戦闘での効き目
 *
 * アクセ1個を「どの仕組みにいくつ足すか」の平たい表へ直す。特殊と弱効果が
 * 同じ仕組みなら**足し合わせる**(それぞれの効き方——与ダメは加算、被ダメは乗算——は
 * エンジン側の `accessoryRuntime.ts` が決める)。
 * ========================================================================== */

export interface AccessoryBattleEffects {
  /** 属性ごとの与ダメUP */
  elementDamage: Partial<Record<Element, number>>;
  s1Damage: number; s2Damage: number; s3Damage: number;
  selfHp70: number; selfHp50: number; selfHp30: number;
  enemyHp30: number; enemyHp20: number;
  debuff1: number; debuff3: number;
  multi2: number; multi3: number;
  first: number;
  killGauge: number;
  followUpChance: number;
  lifesteal: number;
  critGauge: number;

  dmgTaken: number; critTaken: number;
  maxHp: number; defUp: number;
  low50: number; low30: number;
  startShield: number; shield50: number;
  turnHeal: number;
  hitHeal: number;
  /** 弱効果の「被弾時10%で回復」。特殊(15%)とは確率が違うので別に持つ */
  weakHitHeal: number;
  s1Taken: number; s2Taken: number; s3Taken: number;
  hp70Taken: number; debuffedTaken: number;
  singleTaken: number; aoeTaken: number;

  healUp: number; shieldUp: number;
  low50Heal: number;
  healedDr: number; healedShield: number; low50HealedShield: number; healedGauge: number;
  buffShield: number; buffGauge: number;

  debuffRate: number;
  s1Rate: number; s2Rate: number; s3Rate: number;
  gaugeDownUp: number; debuffedGaugeDown: number;
  debuffSelfGauge: number; stripSelfGauge: number; stripTargetGauge: number;
  stunnedDamage: number;
}

export function emptyAccessoryEffects(): AccessoryBattleEffects {
  return {
    elementDamage: {},
    s1Damage: 0, s2Damage: 0, s3Damage: 0,
    selfHp70: 0, selfHp50: 0, selfHp30: 0, enemyHp30: 0, enemyHp20: 0,
    debuff1: 0, debuff3: 0, multi2: 0, multi3: 0, first: 0, killGauge: 0,
    followUpChance: 0, lifesteal: 0, critGauge: 0,
    dmgTaken: 0, critTaken: 0, maxHp: 0, defUp: 0, low50: 0, low30: 0,
    startShield: 0, shield50: 0, turnHeal: 0, hitHeal: 0, weakHitHeal: 0,
    s1Taken: 0, s2Taken: 0, s3Taken: 0, hp70Taken: 0, debuffedTaken: 0, singleTaken: 0, aoeTaken: 0,
    healUp: 0, shieldUp: 0, low50Heal: 0, healedDr: 0, healedShield: 0, low50HealedShield: 0, healedGauge: 0,
    buffShield: 0, buffGauge: 0,
    debuffRate: 0, s1Rate: 0, s2Rate: 0, s3Rate: 0, gaugeDownUp: 0, debuffedGaugeDown: 0,
    debuffSelfGauge: 0, stripSelfGauge: 0, stripTargetGauge: 0, stunnedDamage: 0,
  };
}

type NumericEffectKey = Exclude<keyof AccessoryBattleEffects, "elementDamage">;

const SPECIAL_TO_EFFECT: Record<Exclude<AccessorySpecialId, ElementSpecialId>, NumericEffectKey> = {
  S1_DMG: "s1Damage", S2_DMG: "s2Damage", S3_DMG: "s3Damage",
  SELF_HP70: "selfHp70", SELF_HP50: "selfHp50", SELF_HP30: "selfHp30",
  ENEMY_HP30: "enemyHp30", ENEMY_HP20: "enemyHp20", DEBUFF1: "debuff1", DEBUFF3: "debuff3",
  MULTI2: "multi2", MULTI3: "multi3", FIRST: "first", KILL_GAUGE: "killGauge",
  DMG_TAKEN: "dmgTaken", CRIT_TAKEN: "critTaken", MAX_HP: "maxHp", DEF_UP: "defUp",
  LOW50: "low50", LOW30: "low30", START_SHIELD: "startShield", SHIELD50: "shield50",
  TURN_HEAL: "turnHeal", HIT_HEAL: "hitHeal",
  S1_TAKEN: "s1Taken", S2_TAKEN: "s2Taken", S3_TAKEN: "s3Taken",
  HP70_TAKEN: "hp70Taken", DEBUFFED_TAKEN: "debuffedTaken", SINGLE_TAKEN: "singleTaken", AOE_TAKEN: "aoeTaken",
  HEAL_UP: "healUp", SHIELD_UP: "shieldUp", LOW50_HEAL: "low50Heal",
  HEALED_DR: "healedDr", HEALED_SHIELD: "healedShield", LOW50_HEALED_SHIELD: "low50HealedShield",
  HEALED_GAUGE: "healedGauge", BUFF_SHIELD: "buffShield", BUFF_GAUGE: "buffGauge",
  DEBUFF_RATE: "debuffRate", S1_RATE: "s1Rate", S2_RATE: "s2Rate", S3_RATE: "s3Rate",
  GAUGE_DOWN_UP: "gaugeDownUp", DEBUFFED_GAUGE_DOWN: "debuffedGaugeDown",
  DEBUFF_SELF_GAUGE: "debuffSelfGauge", STRIP_SELF_GAUGE: "stripSelfGauge", STRIP_TARGET_GAUGE: "stripTargetGauge",
  STUNNED_DMG: "stunnedDamage",
};

const WEAK_TO_EFFECT: Record<AccessoryWeakId, NumericEffectKey> = {
  W_FOLLOWUP: "followUpChance", W_LIFESTEAL: "lifesteal", W_FINISH: "enemyHp20", W_CRIT_GAUGE: "critGauge",
  W_KILL_GAUGE: "killGauge", W_FIRST: "first", W_MULTI2: "multi2",
  W_MAX_HP: "maxHp", W_DEF: "defUp", W_DMG_TAKEN: "dmgTaken", W_CRIT_TAKEN: "critTaken", W_LOW30: "low30",
  W_TURN_HEAL: "turnHeal", W_START_SHIELD: "startShield", W_HIT_HEAL: "weakHitHeal",
  W_HEAL_UP: "healUp", W_SHIELD_UP: "shieldUp", W_HEALED_SHIELD: "healedShield", W_HEALED_GAUGE: "healedGauge",
  W_BUFF_SHIELD: "buffShield",
  W_DEBUFF_RATE: "debuffRate", W_S1_RATE: "s1Rate", W_S2_RATE: "s2Rate", W_S3_RATE: "s3Rate",
  W_GAUGE_DOWN: "gaugeDownUp", W_DEBUFF_GAUGE: "debuffSelfGauge", W_STRIP_GAUGE: "stripSelfGauge",
  W_STUNNED_DMG: "stunnedDamage",
};

export function accessoryBattleEffects(acc: Accessory): AccessoryBattleEffects {
  const out = emptyAccessoryEffects();
  for (const roll of acc.specials) {
    const element = elementOfSpecial(roll.id);
    if (element) {
      out.elementDamage[element] = (out.elementDamage[element] ?? 0) + roll.value;
      continue;
    }
    const key = SPECIAL_TO_EFFECT[roll.id as Exclude<AccessorySpecialId, ElementSpecialId>];
    if (key) out[key] += roll.value;
  }
  out[WEAK_TO_EFFECT[acc.weak]] += weakValue(acc.weak, acc.level);
  return out;
}

/** 戦闘中に見張る必要のある効果を1つでも持つか。持たなければエンジンは何もしない */
export function hasRuntimeAccessoryEffects(e: AccessoryBattleEffects): boolean {
  const keys = Object.keys(e) as (keyof AccessoryBattleEffects)[];
  for (const key of keys) {
    if (key === "elementDamage") {
      if (ELEMENTS.some((el) => (e.elementDamage[el] ?? 0) > 0)) return true;
      continue;
    }
    // 定義の段階で焼き込むものは見張らなくてよい
    if (key === "maxHp" || key === "defUp" || key === "turnHeal" || key === "startShield"
      || key === "healUp" || key === "shieldUp" || key === "debuffRate"
      || key === "s1Rate" || key === "s2Rate" || key === "s3Rate") continue;
    if ((e[key] as number) > 0) return true;
  }
  return false;
}
