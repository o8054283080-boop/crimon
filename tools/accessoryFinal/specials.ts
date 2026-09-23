/**
 * アクセサリーの特殊効果(最終検証の候補値)と、その判定。
 *
 * **検証専用。本番のアクセサリーではない。**
 *
 * 一撃の表(`accessoryFinalLab.ts`)と、実戦4対4(同じファイルの Battle Lab 部分)の
 * **両方がここを呼ぶ。**判定を2か所に書くと、片方だけ直した日に表と実戦が食い違う。
 *
 * 値は依頼主が決めた「今回の新候補」だけを使う。前回の仮値は使わない。
 */
import type { BattleEngine } from "../../src/battle/engine.js";
import { applyHeal, countDebuffs, type BattleUnit } from "../../src/battle/unit.js";
import type { MonsterDefinition } from "../../src/core/monster.js";
import type { Skill } from "../../src/core/skill.js";
import { DEFAULT_COMBAT_MODIFIERS } from "../../src/core/equipment.js";
import type { AllySpec } from "../battleLab/types.js";

export type Tier = "HERO" | "LEGEND" | "EPIC";
export type Range = readonly [number, number];
type Ranges = Record<Tier, Range>;
const r = (hero: Range, legend: Range, epic: Range): Ranges => ({ HERO: hero, LEGEND: legend, EPIC: epic });

/** 特殊効果の値の取り方。MIN=幅の下端、STD=真ん中、MAX=上端 */
export type Roll = "MIN" | "STD" | "MAX";
export const valueOf = (range: Range, roll: Roll) => (roll === "MIN" ? range[0] : roll === "MAX" ? range[1] : (range[0] + range[1]) / 2);

/* ---------------------------------------------------------------- 攻撃 */

export const ATK_SPECIALS = {
  ELEM: { label: "対象属性への与ダメUP", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.11]) },
  S1: { label: "S1ダメージUP", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]) },
  S2: { label: "S2ダメージUP", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]) },
  S3: { label: "S3ダメージUP", ranges: r([0.05, 0.07], [0.07, 0.09], [0.09, 0.12]) },
  SELF_HP70: { label: "自分HP70%以上で与ダメUP", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]) },
  SELF_HP50: { label: "自分HP50%以上で与ダメUP", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]) },
  SELF_HP30: { label: "自分HP30%以下で与ダメUP", ranges: r([0.07, 0.10], [0.10, 0.13], [0.13, 0.17]) },
  ENEMY_HP30: { label: "敵HP30%以下への与ダメUP", ranges: r([0.06, 0.08], [0.08, 0.11], [0.11, 0.14]) },
  ENEMY_HP20: { label: "敵HP20%以下への与ダメUP", ranges: r([0.08, 0.10], [0.10, 0.13], [0.13, 0.17]) },
  DEBUFF1: { label: "弱体1個以上の敵への与ダメUP", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]) },
  DEBUFF3: { label: "弱体3個以上の敵への与ダメUP", ranges: r([0.07, 0.09], [0.09, 0.12], [0.12, 0.15]) },
  MULTI2: { label: "2Hit目以降ダメUP", ranges: r([0.04, 0.06], [0.06, 0.09], [0.09, 0.12]) },
  MULTI3: { label: "3Hit目以降ダメUP", ranges: r([0.06, 0.08], [0.08, 0.11], [0.11, 0.15]) },
  /*
   * 実戦アリーナ最終検証(`arenaFinalLab.ts`)で微調整した値。
   * 前回の最終検証(`accessoryFinalLab.ts` のレポート)は レジェンド7〜10% / エピック10〜13% で測っている。
   */
  FIRST: { label: "最初の攻撃ダメUP", ranges: r([0.05, 0.07], [0.07, 0.09], [0.09, 0.12]) },
  KILL_GAUGE: { label: "撃破時 行動ゲージUP", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]) },
} as const;

/* ---------------------------------------------------------------- 防御 */

export const DEF_SPECIALS = {
  DMG_TAKEN: { label: "常時 被ダメ軽減", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]) },
  CRIT_TAKEN: { label: "クリ被ダメ軽減", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]) },
  MAX_HP: { label: "最大HP増加", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]) },
  DEF_UP: { label: "DEF増加", ranges: r([0.03, 0.04], [0.04, 0.06], [0.06, 0.08]) },
  LOW50: { label: "HP50%以下で被ダメ軽減", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.11]) },
  LOW30: { label: "HP30%以下で被ダメ軽減", ranges: r([0.06, 0.08], [0.08, 0.11], [0.11, 0.14]) },
  SHIELD_START: { label: "戦闘開始時シールド", ranges: r([0.03, 0.04], [0.04, 0.05], [0.05, 0.07]) },
  SHIELD50: { label: "HP50%到達時シールド", ranges: r([0.04, 0.05], [0.05, 0.07], [0.07, 0.09]) },
  TURN_HEAL: { label: "ターン開始時HP回復", ranges: r([0.005, 0.01], [0.01, 0.015], [0.015, 0.02]) },
  HIT_HEAL: { label: "被弾時HP回復(低確率)", ranges: r([0.01, 0.01], [0.015, 0.015], [0.02, 0.02]) },
  S1_TAKEN: { label: "S1から受けるダメ軽減", ranges: r([0.03, 0.04], [0.04, 0.06], [0.06, 0.08]) },
  S2_TAKEN: { label: "S2から受けるダメ軽減", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]) },
  S3_TAKEN: { label: "S3から受けるダメ軽減", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]) },
  HP70_TAKEN: { label: "HP70%以上で被ダメ軽減", ranges: r([0.02, 0.03], [0.03, 0.05], [0.05, 0.07]) },
  DEBUFFED_TAKEN: { label: "弱体中の被ダメ軽減", ranges: r([0.03, 0.04], [0.04, 0.06], [0.06, 0.08]) },
  SINGLE_TAKEN: { label: "単体攻撃から受けるダメ軽減", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]) },
  AOE_TAKEN: { label: "全体攻撃から受けるダメ軽減", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]) },
} as const;

export type AtkSpecial = keyof typeof ATK_SPECIALS;
export type DefSpecial = keyof typeof DEF_SPECIALS;
export type Special = AtkSpecial | DefSpecial;

export const SPECIAL_LABEL: Record<Special, string> = Object.fromEntries(
  [...Object.entries(ATK_SPECIALS), ...Object.entries(DEF_SPECIALS)].map(([k, v]) => [k, v.label]),
) as Record<Special, string>;

function rangesOf(key: Special): Ranges {
  return (key in ATK_SPECIALS ? ATK_SPECIALS[key as AtkSpecial] : DEF_SPECIALS[key as DefSpecial]).ranges;
}

/* ---------------------------------------------------------------- 弱効果 */

export const WEAKS = {
  /* 攻撃 */
  FOLLOWUP: { label: "小さな追撃(10〜15%でATK×0.15)", side: "ATK", value: 0.15 },
  LIFESTEAL: { label: "軽い吸血(与ダメの1〜2%回復)", side: "ATK", value: 0.015 },
  FINISH: { label: "止め刺し(敵HP20%以下+3%)", side: "ATK", value: 0.03 },
  FIRST_ASSIST: { label: "初撃補助(最初の攻撃+2%)", side: "ATK", value: 0.02 },
  COMBO_ASSIST: { label: "連撃補助(2Hit目以降+2%)", side: "ATK", value: 0.02 },
  KILL_AFTERGLOW: { label: "撃破余韻(撃破時ゲージ+4%)", side: "ATK", value: 0.04 },
  /* 防御 */
  W_MAX_HP: { label: "最大HP微増(+1%)", side: "DEF", value: 0.01 },
  W_DEF: { label: "DEF微増(+1%)", side: "DEF", value: 0.01 },
  W_DMG: { label: "微軽減(被ダメ-1%)", side: "DEF", value: 0.01 },
  W_CRIT: { label: "会心耐性(クリ被ダメ-2%)", side: "DEF", value: 0.02 },
  W_LOW30: { label: "瀕死耐性(HP30%以下で-2%)", side: "DEF", value: 0.02 },
  W_TURN_HEAL: { label: "微回復(ターン開始時0.5%)", side: "DEF", value: 0.005 },
  W_START_SHIELD: { label: "開幕小シールド(最大HP1.5%)", side: "DEF", value: 0.015 },
  W_HIT_HEAL: { label: "被弾小回復(10%で最大HP1%)", side: "DEF", value: 0.01 },
} as const;
export type WeakKey = keyof typeof WEAKS;

/* ---------------------------------------------------------------- アクセサリー */

export type Stacking = "ADD" | "MUL";

export interface Accessory {
  main: "ATK" | "HP" | "DEF" | null;
  /** メインの実数。**個体差(0.8〜1.2)を掛けた後の値** */
  mainValue: number;
  specials: readonly Special[];
  tier: Tier;
  roll: Roll;
  weak: WeakKey | null;
  /** 属性特効の対象 */
  targetElement?: AllySpec["element"];
  /** 被弾時HP回復の発動率(本番未定。10/15/20%を比べる) */
  hitHealChance?: number;
}

export const NONE: Accessory = { main: null, mainValue: 0, specials: [], tier: "EPIC", roll: "STD", weak: null };

export function sv(acc: Accessory, key: Special): number {
  if (new Set(acc.specials).size !== acc.specials.length) throw new Error("同一の特殊効果は1つのアクセに重複不可");
  return acc.specials.includes(key) ? valueOf(rangesOf(key)[acc.tier], acc.roll) : 0;
}
export function wv(acc: Accessory, key: WeakKey): number {
  return acc.weak === key ? WEAKS[key].value : 0;
}

export function describe(acc: Accessory): string {
  if (!acc.main && acc.specials.length === 0 && !acc.weak) return "なし";
  const main = acc.main ? `${acc.main}+${Math.round(acc.mainValue).toLocaleString("en-US")}` : "";
  const specials = acc.specials.map((s) => `${SPECIAL_LABEL[s]}${(sv(acc, s) * 100).toFixed(1).replace(/\.0$/, "")}%`).join("・");
  const weak = acc.weak ? `弱:${WEAKS[acc.weak].label}` : "";
  return [main, specials, weak].filter(Boolean).join(" + ");
}

/**
 * 戦闘定義へアクセサリーを着ける。
 *
 * ## 適用順(依頼で明示を求められた所)
 *
 *   1. 装備込みの最終値(`toBattleDefinition` の出力)へ、**メインの実数を足す**
 *   2. そこへ**最大HP増加・DEF増加(特殊・弱)を割合で掛ける**
 *   3. 潜在覚醒の倍率(`createBattleUnit`)がさらに掛かる
 *
 * 2 を「最終値」に掛けるのは、潜在覚醒「不屈装甲」(最大HP・DEFの割合増加)が
 * 同じく装備込みの最終値に掛かる作りだから。**特殊効果どうしで揃える。**
 * 装備の HP% のように「素の値にだけ掛ける」方式にすると、効きはおよそ1/3になる(レポートに記載)。
 */
export function equipDefinition(def: MonsterDefinition, acc: Accessory): MonsterDefinition {
  const stats = { ...def.stats };
  if (acc.main === "ATK") stats.atk += acc.mainValue;
  if (acc.main === "HP") stats.hp += acc.mainValue;
  if (acc.main === "DEF") stats.def += acc.mainValue;
  stats.hp = Math.round(stats.hp * (1 + sv(acc, "MAX_HP") + wv(acc, "W_MAX_HP")));
  stats.def = Math.round(stats.def * (1 + sv(acc, "DEF_UP") + wv(acc, "W_DEF")));
  const mods = { ...DEFAULT_COMBAT_MODIFIERS, ...(def.combatMods ?? {}) };
  // ターン開始時回復は、体力4セットと同じ口へ**足す**(本番のエンジンがそのまま回復する)
  mods.turnHealPercent = (mods.turnHealPercent ?? 0) + sv(acc, "TURN_HEAL") + wv(acc, "W_TURN_HEAL");
  // 戦闘開始時シールドは、障壁セットと同じ口(本番のエンジンが開始時に張る)
  const shield = sv(acc, "SHIELD_START") + wv(acc, "W_START_SHIELD");
  if (shield > 0) mods.battleStartShieldPercent = (mods.battleStartShieldPercent ?? 0) + shield;
  return { ...def, stats, combatMods: mods };
}

/* ---------------------------------------------------------------- 1Hitの判定 */

export interface HitContext {
  attacker: BattleUnit;
  defender: BattleUnit;
  attackerAcc: Accessory;
  defenderAcc: Accessory;
  /** 0=S1, 1=S2, 2=S3。スキル以外(反射・継続ダメージ)は null */
  skillSlot: 0 | 1 | 2 | null;
  /** 単体か全体か。スキル以外は null */
  skillTarget: "SINGLE" | "ALL" | null;
  /** そのスキルの、その相手への何Hit目か(0始まり) */
  hitIndex: number;
  /** その攻撃役の、戦闘で最初の攻撃か */
  firstAttack: boolean;
  crit: boolean;
  stackAtk: Stacking;
  stackDef: Stacking;
}

function combine(values: number[], stacking: Stacking, sign: 1 | -1): number {
  const live = values.filter((v) => v > 0);
  if (stacking === "ADD") return Math.max(0.05, 1 + sign * live.reduce((a, b) => a + b, 0));
  return live.reduce((m, v) => m * (1 + sign * v), 1);
}

/** 攻撃アクセの与ダメ倍率と、効いた効果の内訳 */
export function attackMultiplier(ctx: HitContext): { factor: number; parts: Partial<Record<string, number>> } {
  const acc = ctx.attackerAcc;
  const parts: Partial<Record<string, number>> = {};
  const on = (key: string, value: number, when: boolean) => { if (when && value > 0) parts[key] = value; };
  const self = ctx.attacker.currentHp / ctx.attacker.maxHp;
  const target = ctx.defender.currentHp / ctx.defender.maxHp;
  const debuffs = countDebuffs(ctx.defender);
  on("ELEM", sv(acc, "ELEM"), acc.targetElement === ctx.defender.def.element);
  on("S1", sv(acc, "S1"), ctx.skillSlot === 0);
  on("S2", sv(acc, "S2"), ctx.skillSlot === 1);
  on("S3", sv(acc, "S3"), ctx.skillSlot === 2);
  on("SELF_HP70", sv(acc, "SELF_HP70"), self >= 0.7);
  on("SELF_HP50", sv(acc, "SELF_HP50"), self >= 0.5);
  on("SELF_HP30", sv(acc, "SELF_HP30"), self <= 0.3);
  on("ENEMY_HP30", sv(acc, "ENEMY_HP30"), target <= 0.3);
  on("ENEMY_HP20", sv(acc, "ENEMY_HP20"), target <= 0.2);
  on("DEBUFF1", sv(acc, "DEBUFF1"), debuffs >= 1);
  on("DEBUFF3", sv(acc, "DEBUFF3"), debuffs >= 3);
  on("MULTI2", sv(acc, "MULTI2"), ctx.hitIndex >= 1);
  on("MULTI3", sv(acc, "MULTI3"), ctx.hitIndex >= 2);
  on("FIRST", sv(acc, "FIRST"), ctx.firstAttack);
  on("FINISH", wv(acc, "FINISH"), target <= 0.2);
  on("FIRST_ASSIST", wv(acc, "FIRST_ASSIST"), ctx.firstAttack);
  on("COMBO_ASSIST", wv(acc, "COMBO_ASSIST"), ctx.hitIndex >= 1);
  return { factor: combine(Object.values(parts) as number[], ctx.stackAtk, 1), parts };
}

/** 防御アクセの被ダメ倍率と、効いた効果の内訳 */
export function defenseMultiplier(ctx: HitContext): { factor: number; parts: Partial<Record<string, number>> } {
  const acc = ctx.defenderAcc;
  const parts: Partial<Record<string, number>> = {};
  const on = (key: string, value: number, when: boolean) => { if (when && value > 0) parts[key] = value; };
  const ratio = ctx.defender.currentHp / ctx.defender.maxHp;
  on("DMG_TAKEN", sv(acc, "DMG_TAKEN"), true);
  on("W_DMG", wv(acc, "W_DMG"), true);
  on("CRIT_TAKEN", sv(acc, "CRIT_TAKEN"), ctx.crit);
  on("W_CRIT", wv(acc, "W_CRIT"), ctx.crit);
  on("LOW50", sv(acc, "LOW50"), ratio <= 0.5);
  on("LOW30", sv(acc, "LOW30"), ratio <= 0.3);
  on("W_LOW30", wv(acc, "W_LOW30"), ratio <= 0.3);
  on("HP70_TAKEN", sv(acc, "HP70_TAKEN"), ratio >= 0.7);
  on("DEBUFFED_TAKEN", sv(acc, "DEBUFFED_TAKEN"), countDebuffs(ctx.defender) >= 1);
  on("S1_TAKEN", sv(acc, "S1_TAKEN"), ctx.skillSlot === 0);
  on("S2_TAKEN", sv(acc, "S2_TAKEN"), ctx.skillSlot === 1);
  on("S3_TAKEN", sv(acc, "S3_TAKEN"), ctx.skillSlot === 2);
  on("SINGLE_TAKEN", sv(acc, "SINGLE_TAKEN"), ctx.skillTarget === "SINGLE");
  on("AOE_TAKEN", sv(acc, "AOE_TAKEN"), ctx.skillTarget === "ALL");
  return { factor: combine(Object.values(parts) as number[], ctx.stackDef, -1), parts };
}

export function skillTargetOf(skill: Skill | undefined): "SINGLE" | "ALL" | null {
  if (!skill) return null;
  if (skill.target === "ALL_ENEMIES") return "ALL";
  if (skill.target === "SINGLE_ENEMY") return "SINGLE";
  return null;
}

/* ---------------------------------------------------------------- 実戦へ差し込む */

interface EngineInternals {
  applySkillEffects: (source: BattleUnit, target: BattleUnit, skill: Skill, ...rest: unknown[]) => unknown;
  applyIncomingDamage: (target: BattleUnit, amount: number, source?: BattleUnit, sourceType?: string, resolution?: { critCount: number } | null) => { died?: boolean };
  onKill: (killer: BattleUnit | undefined) => void;
  gainGauge: (unit: BattleUnit, amount: number, message?: string) => void;
}

/**
 * 1体のエンジンにだけ、アクセサリーの条件付き効果を差し込む。
 *
 * **本番のエンジンのコードは変えない。**`tools/battleLab/hook.ts` と同じく、
 * インスタンスのプロパティとして関数を置き、`this.xxx()` がそちらを先に見るようにする。
 * 包むのは次の3つ。中では元の処理をそのまま呼ぶ。
 *
 *   applySkillEffects    解決中のスキル(S1〜S3・単体/全体)を控えるだけ
 *   applyIncomingDamage  着弾の直前に、攻撃アクセの倍率 × 防御アクセの倍率を掛ける。
 *                        直後に HP50%シールド・被弾時回復を処理する
 *   onKill               撃破時の行動ゲージ(特殊・弱)
 *
 * 会心かどうかは、スキル解決の `critCount` が増えたかで知る(本番は着弾の直前に数える)。
 */
export function attachAccessories(
  engine: BattleEngine,
  accessoryOf: (unit: BattleUnit) => Accessory,
  options: { stackAtk: Stacking; stackDef: Stacking; rng: () => number; shield50Turns?: number },
): { stats: { shield50: number; hitHeals: number; killGauge: number } } {
  const e = engine as unknown as EngineInternals;
  const stats = { shield50: 0, hitHeals: 0, killGauge: 0 };
  const skillStack: { source: BattleUnit; skill: Skill }[] = [];
  const firstResolution = new Map<string, object>();
  const hitCount = new WeakMap<object, Map<string, number>>();
  const lastCrit = new WeakMap<object, number>();
  const shield50Used = new Set<string>();

  const originalApply = e.applySkillEffects.bind(engine);
  e.applySkillEffects = (source, target, skill, ...rest) => {
    skillStack.push({ source, skill });
    try { return originalApply(source, target, skill, ...rest); } finally { skillStack.pop(); }
  };

  const originalIncoming = e.applyIncomingDamage.bind(engine);
  e.applyIncomingDamage = (target, amount, source, sourceType = "normal", resolution = null) => {
    let adjusted = amount;
    const defenderAcc = accessoryOf(target);
    if (source && sourceType === "normal" && resolution) {
      const entry = [...skillStack].reverse().find((s) => s.source === source);
      const slotIndex = entry ? source.def.skills.findIndex((s) => s?.id === entry.skill.id) : -1;
      const crit = resolution.critCount > (lastCrit.get(resolution) ?? 0);
      lastCrit.set(resolution, resolution.critCount);
      let counts = hitCount.get(resolution);
      if (!counts) { counts = new Map(); hitCount.set(resolution, counts); }
      const hitIndex = counts.get(target.instanceId) ?? 0;
      counts.set(target.instanceId, hitIndex + 1);
      if (!firstResolution.has(source.instanceId)) firstResolution.set(source.instanceId, resolution);
      const ctx: HitContext = {
        attacker: source, defender: target,
        attackerAcc: accessoryOf(source), defenderAcc,
        skillSlot: slotIndex >= 0 && slotIndex <= 2 ? (slotIndex as 0 | 1 | 2) : null,
        skillTarget: skillTargetOf(entry?.skill),
        hitIndex, firstAttack: firstResolution.get(source.instanceId) === resolution, crit,
        stackAtk: options.stackAtk, stackDef: options.stackDef,
      };
      adjusted = Math.max(1, Math.round(amount * attackMultiplier(ctx).factor * defenseMultiplier(ctx).factor));
    } else if (sourceType !== "reflect") {
      // スキル以外(継続ダメージなど)は、条件の無い軽減だけを見る
      const ctx: HitContext = {
        attacker: source ?? target, defender: target, attackerAcc: NONE, defenderAcc,
        skillSlot: null, skillTarget: null, hitIndex: 0, firstAttack: false, crit: false,
        stackAtk: options.stackAtk, stackDef: options.stackDef,
      };
      adjusted = Math.max(1, Math.round(amount * defenseMultiplier(ctx).factor));
    }
    const result = originalIncoming(target, adjusted, source, sourceType, resolution);
    if (target.alive) {
      const shield50 = sv(defenderAcc, "SHIELD50");
      if (shield50 > 0 && !shield50Used.has(target.instanceId) && target.currentHp <= target.maxHp * 0.5) {
        // **1戦に1回だけ。**回復で50%を超えて、また下回っても出さない
        shield50Used.add(target.instanceId);
        target.shieldValue += Math.round(target.maxHp * shield50);
        target.shieldTurns = Math.max(target.shieldTurns, options.shield50Turns ?? 2);
        stats.shield50 += 1;
      }
      if (source && sourceType === "normal") {
        const heal = Math.max(sv(defenderAcc, "HIT_HEAL"), 0);
        const weakHeal = wv(defenderAcc, "W_HIT_HEAL");
        if (heal > 0 && options.rng() < (defenderAcc.hitHealChance ?? 0.15)) { applyHeal(target, Math.round(target.maxHp * heal)); stats.hitHeals += 1; }
        if (weakHeal > 0 && options.rng() < 0.10) { applyHeal(target, Math.round(target.maxHp * weakHeal)); stats.hitHeals += 1; }
      }
    }
    return result;
  };

  const originalKill = e.onKill.bind(engine);
  e.onKill = (killer) => {
    originalKill(killer);
    if (!killer?.alive) return;
    const acc = accessoryOf(killer);
    const gauge = sv(acc, "KILL_GAUGE") + wv(acc, "KILL_AFTERGLOW");
    if (gauge > 0) { e.gainGauge(killer, gauge); stats.killGauge += 1; }
  };

  return { stats };
}
