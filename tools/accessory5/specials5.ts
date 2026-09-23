/**
 * アクセサリー4系統の最終調整検証: **再設計したサポート型と、修正版の妨害型。**
 *
 * **検証専用。本番のアクセサリーではない。本番のエンジン・データ・我慢の仕様は変えない。**
 *
 * 攻撃・耐久の2系統は前回までと同じもの(`../accessoryFinal/specials.ts`)を**そのまま呼ぶ**(数値も変えない)。
 * 前回の旧サポート・旧妨害(`../accessory4/specials4.ts`)は使わない。
 *
 * ## 今回の設計
 *
 *   耐久   = 装備者**本人**を死ににくくする(前回のまま)
 *   サポート = 装備者ではなく**味方**を死ににくくする・味方を動かす(今回作り直した)
 *   妨害   = 敵に予定どおり行動させない(危ないものだけ直した)
 *
 * ## サポートの発動の数え方(依頼8章)
 *
 * **1回のスキル使用につき、条件を満たした対象1体あたり1回。**
 * スキルの解決記録 `resolution` を鍵にして、同じ対象へ2回目は出さない。
 * 全体回復なら4体それぞれに1回、同じ対象を3Hit回復しても1回、1スキルでバフを3種類配っても1回。
 *
 * 「回復した味方」は、そのスキル(か回復パッシブの1回の発動)の中で**回復イベントを受けた味方**。
 * 回復イベントは本番のエンジンが出すもの(`pushEvent` の HEAL)をそのまま拾う。
 * 継続回復の毎ターンの回復は、誰が張ったかが本番に残らないので**数えない**。
 *
 * ## アクセ由来のシールド
 *
 * 本番のシールドは1つの器(`shieldValue`)で、スキルのシールドは「大きい方を採る」。
 * アクセのシールドは前回の耐久の「HP50%以下でシールド」と同じく**器へ足す**(持続2ターン)のを第一候補にし、
 * 本番のスキルと同じ「大きい方を採る」でも比べる(`shieldMode`)。
 * シールド量UPは、装備者が張るアクセ由来のシールドにも掛かる(本番の `shieldMultiplier` と同じ扱い)。
 *
 * ## 回復時の被ダメ軽減
 *
 * 回復を受けた味方に「次の自分の手番が始まるまで」被ダメ×(1−x)。本番の1ターンの状態と同じく、
 * **受け手自身の手番の頭で消える。**同じ効果を何度受けても重ねず、大きい方で**更新だけ**する。
 * 他の軽減(耐久アクセ・パッシブ・防御UP・シールド)とは**乗算**(別々の段で掛かる)。
 */
import type { BattleEngine } from "../../src/battle/engine.js";
import { applyHeal, countDebuffs, hasStatus, passiveEffectOf, type BattleUnit } from "../../src/battle/unit.js";
import type { MonsterDefinition } from "../../src/core/monster.js";
import { STATUS_EFFECT_CATEGORY, type Skill, type SkillEffect } from "../../src/core/skill.js";
import { DEFAULT_COMBAT_MODIFIERS } from "../../src/core/equipment.js";
import {
  ATK_SPECIALS, DEF_SPECIALS, WEAKS, attachAccessories, equipDefinition, valueOf,
  type Accessory, type AtkSpecial, type DefSpecial, type Range, type Roll, type Stacking, type Tier, type WeakKey,
} from "../accessoryFinal/specials.js";

/** 行動ゲージの満タン値。本番の `engine.ts` の `ATB_THRESHOLD`(非公開)と同じ値 */
const ATB = 100;

type Ranges = Record<Tier, Range>;
const r = (hero: Range, legend: Range, epic: Range): Ranges => ({ HERO: hero, LEGEND: legend, EPIC: epic });
const fixed = (hero: number, legend: number, epic: number): Ranges => r([hero, hero], [legend, legend], [epic, epic]);

/* ================================================================ サポート(依頼6章 A〜O) */

export const SUP5 = {
  HEAL_UP: { id: "A", label: "回復量UP", ranges: r([0.05, 0.07], [0.07, 0.10], [0.10, 0.14]) },
  SHIELD_UP: { id: "B", label: "シールド量UP", ranges: r([0.10, 0.15], [0.15, 0.22], [0.25, 0.35]) },
  LOW50_HEAL: { id: "C", label: "HP50%以下の味方への回復量UP", ranges: r([0.08, 0.11], [0.11, 0.15], [0.15, 0.20]) },
  HEALED_DR: { id: "D", label: "回復した味方に1ターン被ダメ軽減", ranges: r([0.03, 0.04], [0.04, 0.06], [0.06, 0.08]) },
  HEALED_SHIELD: { id: "E", label: "回復した味方にシールド(対象最大HP比)", ranges: fixed(0.02, 0.03, 0.04) },
  LOW50_HEALED_SHIELD: { id: "F", label: "HP50%以下の味方を回復した時シールド(対象最大HP比)", ranges: r([0.03, 0.03], [0.04, 0.04], [0.05, 0.06]) },
  CLEANSE_SHIELD: { id: "G", label: "弱体解除した味方にシールド(対象最大HP比)", ranges: r([0.02, 0.02], [0.03, 0.03], [0.04, 0.05]) },
  CLEANSE_HEAL: { id: "H", label: "弱体解除した味方を追加回復(対象最大HP比)", ranges: r([0.02, 0.02], [0.03, 0.03], [0.04, 0.05]) },
  HEALED_GAUGE: { id: "I", label: "回復した味方の行動ゲージUP", ranges: fixed(0.02, 0.03, 0.04) },
  CLEANSE_GAUGE: { id: "J", label: "弱体解除した味方の行動ゲージUP", ranges: fixed(0.02, 0.03, 0.04) },
  BUFF_SHIELD: { id: "K", label: "強化を付与した味方にシールド(対象最大HP比)", ranges: fixed(0.015, 0.025, 0.035) },
  BUFF_GAUGE: { id: "L", label: "強化を付与した味方の行動ゲージUP", ranges: fixed(0.02, 0.03, 0.04) },
  REVIVE_HP: { id: "M", label: "蘇生時の復帰HP追加(pt)", ranges: fixed(0.03, 0.05, 0.07) },
  REVIVE_SHIELD: { id: "N", label: "蘇生対象にシールド(対象最大HP比)", ranges: fixed(0.03, 0.05, 0.07) },
  SUPPORT_SELF_GAUGE: { id: "O", label: "回復・弱体解除スキル使用時 自身ゲージUP", ranges: fixed(0.02, 0.03, 0.04) },
} as const;

/* ================================================================ 妨害(依頼11章 A〜J。SPD系は削除) */

export const DIS5 = {
  DEBUFF_RATE: { id: "A", label: "弱体付与率UP(pt)", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]) },
  S1_RATE: { id: "B", label: "S1弱体付与率UP(pt)", ranges: fixed(0.02, 0.03, 0.04) },
  S2_RATE: { id: "C", label: "S2弱体付与率UP(pt)", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]) },
  S3_RATE: { id: "D", label: "S3弱体付与率UP(pt)", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]) },
  GAUGE_DOWN_UP: { id: "E", label: "行動ゲージ減少量UP(元の減少量×)", ranges: r([0.05, 0.07], [0.07, 0.09], [0.09, 0.12]) },
  DEBUFFED_GAUGE_DOWN: { id: "F", label: "弱体中の敵へのゲージ減少量UP(元の減少量×)", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]) },
  DEBUFF_SELF_GAUGE: { id: "G", label: "弱体付与成功時 自身ゲージUP", ranges: fixed(0.02, 0.03, 0.04) },
  STRIP_SELF_GAUGE: { id: "H", label: "強化解除成功時 自身ゲージUP", ranges: r([0.03, 0.03], [0.04, 0.05], [0.05, 0.06]) },
  STRIP_TARGET_GAUGE: { id: "I", label: "強化解除成功時 対象ゲージDOWN", ranges: fixed(0.02, 0.03, 0.04) },
  STUNNED_DMG: { id: "J", label: "行動不能中の敵への与ダメUP", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]) },
} as const;

export type Sup5 = keyof typeof SUP5;
export type Dis5 = keyof typeof DIS5;
export type Special5 = AtkSpecial | DefSpecial | Sup5 | Dis5;

/* ================================================================ 弱効果(依頼7章・13章) */

/** 弱効果は「どの特殊と同じ仕組みで、いくつ足すか」で書く。特殊より明確に弱い値 */
export const WEAK5 = {
  WS_HEAL: { label: "回復量+2%", as: "HEAL_UP", value: 0.02 },
  WS_SHIELD: { label: "シールド量+5%", as: "SHIELD_UP", value: 0.05 },
  WS_HEALED_SHIELD: { label: "回復した味方に最大HP1%シールド", as: "HEALED_SHIELD", value: 0.01 },
  WS_CLEANSE_HEAL: { label: "弱体解除した味方を最大HP1%回復", as: "CLEANSE_HEAL", value: 0.01 },
  WS_HEALED_GAUGE: { label: "回復した味方のゲージ+1%", as: "HEALED_GAUGE", value: 0.01 },
  WS_CLEANSE_GAUGE: { label: "弱体解除した味方のゲージ+1%", as: "CLEANSE_GAUGE", value: 0.01 },
  WS_BUFF_SHIELD: { label: "強化付与した味方に最大HP1%シールド", as: "BUFF_SHIELD", value: 0.01 },
  WS_REVIVE: { label: "蘇生時の復帰HP+2pt", as: "REVIVE_HP", value: 0.02 },
  WD_RATE: { label: "弱体付与率+1pt", as: "DEBUFF_RATE", value: 0.01 },
  WD_S1_RATE: { label: "S1弱体付与率+1pt", as: "S1_RATE", value: 0.01 },
  WD_S2_RATE: { label: "S2弱体付与率+1pt", as: "S2_RATE", value: 0.01 },
  WD_S3_RATE: { label: "S3弱体付与率+1pt", as: "S3_RATE", value: 0.01 },
  WD_GAUGE_DOWN: { label: "ゲージ減少量×1.02", as: "GAUGE_DOWN_UP", value: 0.02 },
  WD_DEBUFF_GAUGE: { label: "弱体成功時 自身ゲージ+1%", as: "DEBUFF_SELF_GAUGE", value: 0.01 },
  WD_STRIP_GAUGE: { label: "強化解除成功時 自身ゲージ+2%", as: "STRIP_SELF_GAUGE", value: 0.02 },
  WD_STUNNED_DMG: { label: "行動不能中への与ダメ+2%", as: "STUNNED_DMG", value: 0.02 },
} as const;
export type Weak5 = keyof typeof WEAK5;
export type WeakKey5 = WeakKey | Weak5;

export const LABEL5: Record<string, string> = Object.fromEntries([
  ...Object.entries(ATK_SPECIALS), ...Object.entries(DEF_SPECIALS), ...Object.entries(SUP5), ...Object.entries(DIS5),
].map(([k, v]) => [k, v.label]));
export const WEAK_LABEL5: Record<string, string> = Object.fromEntries([
  ...Object.entries(WEAKS).map(([k, v]) => [k, v.label]), ...Object.entries(WEAK5).map(([k, v]) => [k, v.label]),
]);

export type Family = "ATK" | "DEF" | "SUP" | "DIS";
export function familyOf(key: Special5): Family {
  if (key in ATK_SPECIALS) return "ATK";
  if (key in DEF_SPECIALS) return "DEF";
  if (key in SUP5) return "SUP";
  return "DIS";
}

/* ================================================================ アクセサリー */

export interface Acc5 {
  main: "ATK" | "HP" | "DEF" | null;
  mainValue: number;
  specials: readonly Special5[];
  tier: Tier;
  roll: Roll;
  weak: WeakKey5 | null;
  /**
   * **値振り専用。**特殊の値を直接指定する(例: シールド量UP を 0.25 / 0.30 / 0.35 で比べる)。
   * その特殊を持っている時だけ効く。
   */
  override?: Partial<Record<Sup5 | Dis5, number>>;
}
export const NONE5: Acc5 = { main: null, mainValue: 0, specials: [], tier: "EPIC", roll: "STD", weak: null };

function rangesOf5(key: Sup5 | Dis5): Ranges {
  return ((SUP5 as Record<string, { ranges: Ranges }>)[key] ?? (DIS5 as Record<string, { ranges: Ranges }>)[key]).ranges;
}

/**
 * **再調整候補を測るためだけの倍率。**既定は1(依頼の候補値そのまま)。
 * 環境変数 `ACC5_SUP_SCALE` で、サポート特殊の値(上書き値を含む・弱効果は含まない)だけを何倍かにする。
 */
function supScale(key: Sup5 | Dis5): number {
  if (!(key in SUP5)) return 1;
  const v = Number(process.env.ACC5_SUP_SCALE ?? "1");
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** サポート・妨害の効き目。特殊の値 + (同じ仕組みの弱効果があれば)その値 */
export function v5(acc: Acc5, key: Sup5 | Dis5): number {
  if (new Set(acc.specials).size !== acc.specials.length) throw new Error("同一の特殊効果は1つのアクセに重複不可");
  let special = 0;
  if (acc.specials.includes(key)) special = (acc.override?.[key] ?? valueOf(rangesOf5(key)[acc.tier], acc.roll)) * supScale(key);
  const w = acc.weak && acc.weak in WEAK5 ? WEAK5[acc.weak as Weak5] : null;
  return special + (w && w.as === key ? w.value : 0);
}

/** 攻撃・耐久の2系統だけを取り出した、前回と同じ形のアクセ(`attachAccessories` に渡す) */
export function toOld5(acc: Acc5): Accessory {
  return {
    main: acc.main, mainValue: acc.mainValue, tier: acc.tier, roll: acc.roll,
    specials: acc.specials.filter((k) => k in ATK_SPECIALS || k in DEF_SPECIALS) as (AtkSpecial | DefSpecial)[],
    weak: acc.weak && acc.weak in WEAKS ? (acc.weak as WeakKey) : null,
  };
}

export function describe5(acc: Acc5): string {
  if (!acc.main && acc.specials.length === 0 && !acc.weak) return "なし";
  const main = acc.main ? `${acc.main}+${Math.round(acc.mainValue).toLocaleString("en-US")}` : "";
  const specials = acc.specials.map((s) => {
    if (s in ATK_SPECIALS || s in DEF_SPECIALS) {
      const table = { ...ATK_SPECIALS, ...DEF_SPECIALS } as Record<string, { ranges: Ranges }>;
      return `${LABEL5[s]}${+(valueOf(table[s].ranges[acc.tier], acc.roll) * 100).toFixed(1)}%`;
    }
    const k = s as Sup5 | Dis5;
    const v = acc.override?.[k] ?? valueOf(rangesOf5(k)[acc.tier], acc.roll);
    if (k === "GAUGE_DOWN_UP" || k === "DEBUFFED_GAUGE_DOWN") return `${LABEL5[s].replace(/\(元の減少量×\)/, "")}×${(1 + v).toFixed(3).replace(/0+$/, "")}`;
    const unit = k.endsWith("_RATE") || k === "REVIVE_HP" ? "pt" : "%";
    return `${LABEL5[s].replace(/\((pt|対象最大HP比)\)/, "")}${+(v * 100).toFixed(1)}${unit}`;
  }).join("・");
  const weak = acc.weak ? `弱:${WEAK_LABEL5[acc.weak]}` : "";
  return [main, specials, weak].filter(Boolean).join(" + ");
}

/* ================================================================ 定義の段階で効かせる */

const ENEMY_KINDS = new Set(["DEBUFF", "STUN", "STRIP", "STEAL_BUFF", "HEAL_BLOCK", "POISON", "BURN", "BLIND", "COOLDOWN_EXTEND", "CURSE", "CONVERT_CURSES"]);

/** その効果が「敵へかける弱体(か解除)」で、発動率が書かれているか。**ゲージ減少は含めない**(抵抗判定を通らない) */
function isEnemyRollEffect(skill: Skill, e: SkillEffect): boolean {
  const onEnemy = skill.target === "ALL_ENEMIES" || skill.target === "SINGLE_ENEMY";
  const applyTo = (e as { applyTo?: string }).applyTo;
  if (!onEnemy || applyTo === "ALLIES" || applyTo === "SELF" || applyTo === "LOWEST_HP_ALLY") return false;
  if ((e as { chance?: number }).chance === undefined) return false;
  if (ENEMY_KINDS.has(e.kind)) return true;
  if (e.kind === "STATUS") return STATUS_EFFECT_CATEGORY[(e as { status: keyof typeof STATUS_EFFECT_CATEGORY }).status] === "DEBUFF";
  return false;
}

function mapEffects(effects: readonly SkillEffect[], f: (e: SkillEffect) => SkillEffect): SkillEffect[] {
  return effects.map((e) => {
    const next = f(e);
    if (next.kind === "DAMAGE" && next.perHitEffects) return { ...next, perHitEffects: mapEffects(next.perHitEffects, f) };
    return next;
  });
}

const HEAL_FIELDS = ["healOnAct", "heal", "healOnTurn"] as const;

/**
 * 戦闘定義へアクセを着ける。
 *
 * 1. 攻撃・耐久(メインを含む)は前回と同じ `equipDefinition` に任せる
 * 2. 回復量UP … 各スキルの回復・継続回復の倍率と、パッシブの回復値に掛ける(前回と同じ)
 *    シールド量UP … `combatMods.shieldMultiplier`(本番の「張る側」の補正)
 *    弱体付与率UP … `combatMods.debuffChanceBonus`(本番の才能・セットと同じ口。抵抗判定は通る)
 *    S1/S2/S3 付与率UP … その枠の、抵抗判定を通る敵への効果の発動率に足す
 */
export function equip5(def: MonsterDefinition, acc: Acc5): MonsterDefinition {
  const base = equipDefinition(def, toOld5(acc));
  const heal = v5(acc, "HEAL_UP");
  const slotRate = [v5(acc, "S1_RATE"), v5(acc, "S2_RATE"), v5(acc, "S3_RATE")];
  const skills = base.skills.map((skill, slot) => {
    if (!skill) return skill;
    const rateAdd = slotRate[slot];
    let changed = false;
    const effects = mapEffects(skill.effects, (e) => {
      let next = e;
      if ((e.kind === "HEAL" || e.kind === "REGEN") && heal > 0) { next = { ...next, healRate: (next as { healRate: number }).healRate * (1 + heal) } as SkillEffect; changed = true; }
      if (rateAdd > 0 && isEnemyRollEffect(skill, e)) { next = { ...next, chance: Math.min(1, (e as { chance: number }).chance + rateAdd) } as SkillEffect; changed = true; }
      return next;
    });
    let passive = skill.passive;
    if (passive && heal > 0) {
      passive = { ...passive, levels: passive.levels.map((lv) => {
        const copy = { ...lv } as Record<string, unknown>;
        for (const f of HEAL_FIELDS) if (typeof copy[f] === "number") { copy[f] = (copy[f] as number) * (1 + heal); changed = true; }
        return copy;
      }) as unknown as typeof passive.levels };
    }
    return changed ? { ...skill, effects, passive } : skill;
  }) as MonsterDefinition["skills"];
  const mods = { ...DEFAULT_COMBAT_MODIFIERS, ...(base.combatMods ?? {}) };
  const shield = v5(acc, "SHIELD_UP");
  if (shield > 0) mods.shieldMultiplier = (mods.shieldMultiplier ?? 1) * (1 + shield);
  const rate = v5(acc, "DEBUFF_RATE");
  if (rate > 0) mods.debuffChanceBonus = (mods.debuffChanceBonus ?? 0) + rate;
  return { ...base, skills, combatMods: mods };
}

/* ================================================================ 戦闘中の計測 */

type Side = "PLAYER" | "ENEMY";
const sides = <T>(f: () => T): Record<Side, T> => ({ PLAYER: f(), ENEMY: f() });

export interface Metrics5 {
  strip: Record<Side, { att: number; ok: number; endureAtt: number; endureOk: number; defUpAtt: number; defUpOk: number; shieldAtt: number; shieldOk: number; invAtt: number; invOk: number }>;
  defDown: Record<Side, { att: number; ok: number }>;
  roll: Record<Side, { att: number; ok: number }>;
  /** 回復量(受け手の陣営)。本番の HEAL イベント + アクセの追加回復 */
  heal: Record<Side, number>;
  /** うちアクセ由来の追加回復 */
  accHeal: Record<Side, number>;
  /** シールドの増えた量(受け手の陣営)。スキル + アクセ */
  shield: Record<Side, number>;
  /** うちアクセ由来のシールド。付与回数・受け手最大HP比の合計・付与直後の器の最大(最大HP比) */
  accShield: Record<Side, number>;
  accShieldCount: Record<Side, number>;
  accShieldRatioSum: Record<Side, number>;
  accShieldPeak: Record<Side, number>;
  /** 回復時軽減で減らしたダメージ量 */
  drSaved: Record<Side, number>;
  drHits: Record<Side, number>;
  gaugeUp: Record<Side, number>;
  gaugeDown: Record<Side, number>;
  /** 蘇生(復活状態・転生)の回数 */
  revives: Record<Side, number>;
  procs: Record<string, number>;
  endureSaves: number;
  endureStripped: number;
  actions: Record<Side, number>;
  /** 個体ごとの行動回数 */
  unitActions: Record<string, number>;
  /** 同じ陣営が続けて動いた最長 */
  maxConsecutiveSameTeam: number;
  /** 手番の区切りごとの、陣営の行動数(100手番・200手番の時点) */
  actionsAt: Record<number, Record<Side, number>>;
}

export function newMetrics5(): Metrics5 {
  const stripSide = () => ({ att: 0, ok: 0, endureAtt: 0, endureOk: 0, defUpAtt: 0, defUpOk: 0, shieldAtt: 0, shieldOk: 0, invAtt: 0, invOk: 0 });
  const z = () => 0;
  return {
    strip: sides(stripSide), defDown: sides(() => ({ att: 0, ok: 0 })), roll: sides(() => ({ att: 0, ok: 0 })),
    heal: sides(z), accHeal: sides(z), shield: sides(z), accShield: sides(z), accShieldCount: sides(z), accShieldRatioSum: sides(z), accShieldPeak: sides(z),
    drSaved: sides(z), drHits: sides(z), gaugeUp: sides(z), gaugeDown: sides(z), revives: sides(z),
    procs: {}, endureSaves: 0, endureStripped: 0, actions: sides(z), unitActions: {}, maxConsecutiveSameTeam: 0, actionsAt: {},
  };
}

/* ---------------------------------------------------------------- 盤面の写し */

interface Snap {
  hp: number; shield: number; gauge: number; alive: boolean; buffs: number; debuffs: number;
  endure: boolean; defUp: boolean; defDown: boolean; hasShield: boolean; invincible: boolean; revive: boolean;
}

/** 強化の数え方は本番の `stripBuffs` が剥がすものに合わせる */
export function buffCount(u: BattleUnit): number {
  return Number(u.immuneTurns > 0) + Number(u.shieldTurns > 0) + Number(u.regenTurns > 0)
    + u.effects.filter((e) => e.kind === "BUFF").length
    + u.statusEffects.filter((e) => e.category === "BUFF").length
    + Number((u.damageDealtBonusTurns ?? 0) > 0) + Number(u.mitigateTurns > 0) + Number(u.protectTurns > 0)
    + Number(u.counterTurns > 0) + Number(u.hitGaugeTurns > 0);
}
const snap = (u: BattleUnit): Snap => ({
  hp: u.currentHp, shield: u.shieldValue, gauge: u.gauge, alive: u.alive,
  buffs: buffCount(u), debuffs: countDebuffs(u),
  endure: hasStatus(u, "ENDURE"), defUp: u.effects.some((e) => e.kind === "BUFF" && e.stat === "def"),
  defDown: u.effects.some((e) => e.kind === "DEBUFF" && e.stat === "def"),
  hasShield: u.shieldTurns > 0 && u.shieldValue > 0, invincible: hasStatus(u, "INVINCIBLE"), revive: hasStatus(u, "REVIVE"),
});

function skillHas(skill: Skill, pred: (e: SkillEffect) => boolean): boolean {
  const walk = (effects: readonly SkillEffect[]): boolean => effects.some((e) => pred(e) || (e.kind === "DAMAGE" && !!e.perHitEffects && walk(e.perHitEffects)));
  return walk(skill.effects);
}

/* ---------------------------------------------------------------- 差し込み */

interface Internals {
  units: BattleUnit[];
  turns: unknown[];
  applySkillEffects: (source: BattleUnit, target: BattleUnit, skill: Skill, missed?: boolean, sourceScoped?: boolean, latent?: unknown, resolution?: object, perHit?: boolean) => unknown;
  rollEffectSuccess: (source: BattleUnit, target: BattleUnit, baseChance: number | undefined, ...rest: unknown[]) => boolean;
  applyIncomingDamage: (target: BattleUnit, amount: number, source?: BattleUnit, sourceType?: string, resolution?: unknown) => unknown;
  recordTurn: (unit: BattleUnit, ...rest: unknown[]) => unknown;
  onUnitActed: (actor: BattleUnit) => unknown;
  applyTurnStart: (unit: BattleUnit, ...rest: unknown[]) => unknown;
  pushEvent: (event: { targetId: string; kind: string; amount?: number }) => unknown;
}

export interface Attach5Options {
  stackAtk: Stacking; stackDef: Stacking; rng: () => number;
  /** アクセ由来のシールドの重ね方。ADD=器へ足す(第一候補) / MAX=本番のスキルと同じく大きい方 */
  shieldMode?: "ADD" | "MAX";
  /** ゲージ減少量UPの掛け方。MUL=元の減少量×(1+x)(第一候補・依頼の指定) / ADD=x を pt で加算(危険確認用) */
  gaugeMode?: "MUL" | "ADD";
}

/** 回復を拾う窓。スキル1回の解決、または回復パッシブ1回の発動 */
interface Window { source: BattleUnit; before: Map<BattleUnit, Snap>; healed: Set<BattleUnit>; key: object }

/**
 * 1体のエンジンに4系統のアクセを差し込み、計測を始める。
 * 攻撃・耐久は前回の `attachAccessories` をそのまま呼ぶ(同じ判定を2か所に書かない)。
 */
export function attach5(engine: BattleEngine, accOf: (u: BattleUnit) => Acc5, options: Attach5Options): { metrics: Metrics5 } {
  attachAccessories(engine, (u) => toOld5(accOf(u)), { stackAtk: options.stackAtk, stackDef: options.stackDef, rng: options.rng });
  const e = engine as unknown as Internals;
  const m = newMetrics5();
  const shieldMode = options.shieldMode ?? "ADD";
  const gaugeMode = options.gaugeMode ?? "MUL";
  const proc = (key: string) => { m.procs[key] = (m.procs[key] ?? 0) + 1; };
  const allies = (u: BattleUnit) => e.units.filter((x) => x.team === u.team);
  const once = new WeakMap<object, Set<string>>();
  const first = (key0: object | undefined, key: string): boolean => {
    if (!key0) return true;
    let set = once.get(key0);
    if (!set) { set = new Set(); once.set(key0, set); }
    if (set.has(key)) return false;
    set.add(key);
    return true;
  };
  const side = (u: BattleUnit) => u.team as Side;
  const gauge = (u: BattleUnit, amount: number) => { if (u.alive && amount !== 0) u.gauge = Math.max(0, Math.min(ATB, u.gauge + amount * ATB)); };
  const heal = (u: BattleUnit, amount: number) => {
    if (!u.alive || amount <= 0) return;
    const before = u.currentHp;
    applyHeal(u, Math.round(amount));
    const healed = u.currentHp - before;
    if (healed > 0) { m.heal[side(u)] += healed; m.accHeal[side(u)] += healed; }
  };
  /** アクセ由来のシールド。術者のシールド量UP(`shieldMultiplier`)も掛かる */
  const shieldUp = (giver: BattleUnit, u: BattleUnit, ratio: number, key: string) => {
    if (!u.alive || ratio <= 0) return;
    if (hasStatus(u, "BUFF_BLOCK")) return;
    const amount = Math.round(u.maxHp * ratio * (giver.def.combatMods?.shieldMultiplier ?? 1));
    const before = u.shieldValue;
    u.shieldValue = shieldMode === "ADD" ? u.shieldValue + amount : Math.max(u.shieldValue, amount);
    u.shieldTurns = Math.max(u.shieldTurns, 2);
    const added = u.shieldValue - before;
    m.accShield[side(u)] += added;
    m.accShieldCount[side(u)] += 1;
    m.accShieldRatioSum[side(u)] += added / u.maxHp;
    m.accShieldPeak[side(u)] = Math.max(m.accShieldPeak[side(u)], u.shieldValue / u.maxHp);
    proc(key);
  };

  /* --- 回復時の被ダメ軽減。受け手自身の次の手番の頭で消える。重ねず大きい方で更新 --- */
  const dr = new Map<string, number>();

  /* --- 回復の窓 --- */
  const windows: Window[] = [];
  const snapAll = () => new Map(e.units.map((u) => [u, snap(u)] as const));
  const originalPush = e.pushEvent.bind(engine);
  e.pushEvent = (event) => {
    if (event.kind === "HEAL" && event.amount && event.amount > 0) {
      const u = e.units.find((x) => x.instanceId === event.targetId);
      if (u) {
        m.heal[side(u)] += event.amount;
        const w = windows[windows.length - 1];
        if (w && u.team === w.source.team) {
          w.healed.add(u);
          // HP50%以下の味方への回復量UP: 回復直前(窓の開始時)のHPで判定し、その回復の量×x を足す
          const low = v5(accOf(w.source), "LOW50_HEAL");
          const b = w.before.get(u);
          if (low > 0 && b && b.hp / u.maxHp <= 0.5) { heal(u, event.amount * low); proc("LOW50_HEAL"); }
        }
      }
    }
    return originalPush(event);
  };

  /** 窓を閉じる時に、回復を受けた味方へサポート効果を配る */
  const closeHealWindow = (w: Window) => {
    const acc = accOf(w.source);
    const healedDr = v5(acc, "HEALED_DR");
    const healedShield = v5(acc, "HEALED_SHIELD");
    const lowShield = v5(acc, "LOW50_HEALED_SHIELD");
    const healedGauge = v5(acc, "HEALED_GAUGE");
    if (healedDr + healedShield + lowShield + healedGauge <= 0) return;
    for (const ally of w.healed) {
      if (!ally.alive || !first(w.key, `healed:${ally.instanceId}`)) continue;
      const b = w.before.get(ally);
      if (healedDr > 0) { dr.set(ally.instanceId, Math.max(dr.get(ally.instanceId) ?? 0, healedDr)); proc("HEALED_DR"); }
      if (healedShield > 0) shieldUp(w.source, ally, healedShield, "HEALED_SHIELD");
      if (lowShield > 0 && b && b.hp / ally.maxHp <= 0.5) shieldUp(w.source, ally, lowShield, "LOW50_HEALED_SHIELD");
      if (healedGauge > 0) { gauge(ally, healedGauge); proc("HEALED_GAUGE"); }
    }
  };

  /* --- 回復パッシブ(水の祝福=行動後 / 輪廻転生=手番の頭)も「1回の発動」を1つの窓にする --- */
  const originalActed = e.onUnitActed.bind(engine);
  e.onUnitActed = (actor) => {
    const isHealer = passiveEffectOf(actor)?.kind === "WATER_BLESSING";
    const w: Window | null = isHealer ? { source: actor, before: snapAll(), healed: new Set(), key: {} } : null;
    if (w) windows.push(w);
    try { return originalActed(actor); } finally { if (w) { windows.pop(); closeHealWindow(w); } }
  };
  const originalTurnStart = e.applyTurnStart.bind(engine);
  e.applyTurnStart = (unit, ...rest) => {
    // 回復時の軽減は、受け手自身の手番が始まったら消える
    dr.delete(unit.instanceId);
    const isHealer = passiveEffectOf(unit)?.kind === "REBIRTH";
    const w: Window | null = isHealer ? { source: unit, before: snapAll(), healed: new Set(), key: {} } : null;
    if (w) windows.push(w);
    try { return originalTurnStart(unit, ...rest); } finally { if (w) { windows.pop(); closeHealWindow(w); } }
  };

  /* --- 弱体付与の試行・成功の計測(本番の抵抗判定をそのまま通す) --- */
  const originalRoll = e.rollEffectSuccess.bind(engine);
  e.rollEffectSuccess = (source, target, baseChance, ...rest) => {
    const ok = originalRoll(source, target, baseChance, ...rest);
    if (source.team !== target.team) { const s = m.roll[side(source)]; s.att += 1; if (ok) s.ok += 1; }
    return ok;
  };

  /* --- 被ダメ: 行動不能中への与ダメUP・回復時の被ダメ軽減・蘇生の追加効果 --- */
  const reviveGiver = new Map<string, BattleUnit>();
  const originalIncoming = e.applyIncomingDamage.bind(engine);
  e.applyIncomingDamage = (target, amount, source, sourceType = "normal", resolution = null) => {
    let adjusted = amount;
    if (source && sourceType === "normal") {
      if (target.stunTurns > 0) {
        const bonus = v5(accOf(source), "STUNNED_DMG");
        if (bonus > 0) { adjusted = Math.round(adjusted * (1 + bonus)); proc("STUNNED_DMG"); }
      }
      const cut = dr.get(target.instanceId) ?? 0;
      if (cut > 0 && target.team !== source.team) {
        const reduced = Math.max(1, Math.round(adjusted * (1 - cut)));
        m.drSaved[side(target)] += adjusted - reduced;
        m.drHits[side(target)] += 1;
        adjusted = reduced;
      }
    }
    const hpBefore = target.currentHp;
    const hadRevive = hasStatus(target, "REVIVE");
    const rebirth = passiveEffectOf(target);
    const rebirthReady = rebirth?.kind === "REBIRTH" && target.passiveCooldown <= 0;
    const out = originalIncoming(target, adjusted, source, sourceType, resolution);
    if (target.alive && target.currentHp === 1 && hpBefore > 1 && hasStatus(target, "ENDURE")) m.endureSaves += 1;
    // 蘇生: 復活状態が消えて生きている / 転生のクールタイムが回り始めた
    const revivedByStatus = hadRevive && !hasStatus(target, "REVIVE") && target.alive;
    const revivedByRebirth = rebirthReady && target.passiveCooldown > 0 && target.alive;
    if (revivedByStatus || revivedByRebirth) {
      m.revives[side(target)] += 1;
      // 復活状態は付与した味方のアクセを、転生(自分のパッシブ)は本人のアクセを見る
      const giver = revivedByStatus ? (reviveGiver.get(target.instanceId) ?? target) : target;
      const acc = accOf(giver);
      const hpPlus = v5(acc, "REVIVE_HP");
      if (hpPlus > 0 && target.currentHp < target.maxHp) { heal(target, target.maxHp * hpPlus); proc("REVIVE_HP"); }
      const rs = v5(acc, "REVIVE_SHIELD");
      if (rs > 0) shieldUp(giver, target, rs, "REVIVE_SHIELD");
    }
    return out;
  };

  /* --- スキル効果の解決。前後の盤面の差で出来事を拾う --- */
  let depth = 0;
  const originalApply = e.applySkillEffects.bind(engine);
  e.applySkillEffects = (source, target, skill, missed, sourceScoped, latent, resolution, perHit) => {
    if (depth > 0) return originalApply(source, target, skill, missed, sourceScoped, latent, resolution, perHit);
    const before = snapAll();
    const res = (resolution as object | undefined) ?? {};
    const isHeal = skillHas(skill, (x) => x.kind === "HEAL");
    const w: Window | null = isHeal ? { source, before, healed: new Set(), key: res } : null;
    if (w) windows.push(w);
    depth += 1;
    let out: unknown;
    try { out = originalApply(source, target, skill, missed, sourceScoped, latent, resolution, perHit); } finally { depth -= 1; if (w) windows.pop(); }
    const acc = accOf(source);
    const srcSide = side(source);
    const tb = before.get(target)!;
    const after = new Map(e.units.map((u) => [u, snap(u)] as const));
    const ta = after.get(target)!;
    const enemyTarget = target.team !== source.team;
    const isStrip = skillHas(skill, (x) => x.kind === "STRIP" || x.kind === "STEAL_BUFF");
    const isCleanse = skillHas(skill, (x) => x.kind === "CLEANSE");

    // 計測: 強化解除
    if (enemyTarget && isStrip && first(res, `strip:${target.instanceId}`)) {
      const s = m.strip[srcSide];
      if (tb.buffs > 0) { s.att += 1; if (ta.buffs < tb.buffs) s.ok += 1; }
      if (tb.endure) { s.endureAtt += 1; if (!ta.endure) { s.endureOk += 1; m.endureStripped += 1; } }
      if (tb.defUp) { s.defUpAtt += 1; if (!ta.defUp) s.defUpOk += 1; }
      if (tb.hasShield) { s.shieldAtt += 1; if (!ta.hasShield) s.shieldOk += 1; }
      if (tb.invincible) { s.invAtt += 1; if (!ta.invincible) s.invOk += 1; }
    }
    // 計測: 防御DOWN
    if (enemyTarget && tb.alive && !tb.defDown && skillHas(skill, (x) => x.kind === "DEBUFF" && x.stat === "def") && first(res, `defdown:${target.instanceId}`)) {
      m.defDown[srcSide].att += 1; if (ta.defDown) m.defDown[srcSide].ok += 1;
    }

    // 復活状態を付与したのは誰か(本番は付与者を残さないので、ここで控える)
    for (const ally of allies(source)) if (!before.get(ally)!.revive && after.get(ally)!.revive) reviveGiver.set(ally.instanceId, source);

    // --- サポート ---
    if (w) closeHealWindow(w);
    const cShield = v5(acc, "CLEANSE_SHIELD");
    const cHeal = v5(acc, "CLEANSE_HEAL");
    const cGauge = v5(acc, "CLEANSE_GAUGE");
    const bShield = v5(acc, "BUFF_SHIELD");
    const bGauge = v5(acc, "BUFF_GAUGE");
    for (const ally of allies(source)) {
      const b = before.get(ally)!;
      const a = after.get(ally)!;
      if (!ally.alive) continue;
      if (isCleanse && a.debuffs < b.debuffs && cShield + cHeal + cGauge > 0 && first(res, `cleanse:${ally.instanceId}`)) {
        if (cShield > 0) shieldUp(source, ally, cShield, "CLEANSE_SHIELD");
        if (cHeal > 0) { heal(ally, ally.maxHp * cHeal); proc("CLEANSE_HEAL"); }
        if (cGauge > 0) { gauge(ally, cGauge); proc("CLEANSE_GAUGE"); }
      }
      if (a.buffs > b.buffs && bShield + bGauge > 0 && first(res, `buff:${ally.instanceId}`)) {
        if (bShield > 0) shieldUp(source, ally, bShield, "BUFF_SHIELD");
        if (bGauge > 0) { gauge(ally, bGauge); proc("BUFF_GAUGE"); }
      }
    }
    if ((isHeal || isCleanse) && v5(acc, "SUPPORT_SELF_GAUGE") > 0 && first(res, "supportSelf")) {
      gauge(source, v5(acc, "SUPPORT_SELF_GAUGE")); proc("SUPPORT_SELF_GAUGE");
    }

    // --- 妨害 ---
    if (enemyTarget) {
      if (ta.debuffs > tb.debuffs && v5(acc, "DEBUFF_SELF_GAUGE") > 0 && first(res, "debuffSelf")) {
        gauge(source, v5(acc, "DEBUFF_SELF_GAUGE")); proc("DEBUFF_SELF_GAUGE");
      }
      if (isStrip && ta.buffs < tb.buffs) {
        if (v5(acc, "STRIP_SELF_GAUGE") > 0 && first(res, "stripSelf")) { gauge(source, v5(acc, "STRIP_SELF_GAUGE")); proc("STRIP_SELF_GAUGE"); }
        const down = v5(acc, "STRIP_TARGET_GAUGE");
        if (down > 0 && first(res, `stripTarget:${target.instanceId}`)) { gauge(target, -down); proc("STRIP_TARGET_GAUGE"); }
      }
      // ゲージ減少量UP: 元々ゲージを減らす技で、実際に減った相手だけ。E と F が両方成り立つ時は**乗算**
      const dropped = tb.gauge - ta.gauge;
      if (dropped > 0 && skillHas(skill, (x) => x.kind === "GAUGE" && ((x as { amount: number }).amount < 0 || !!(x as { drain?: boolean }).drain))) {
        const up = v5(acc, "GAUGE_DOWN_UP");
        const cond = tb.debuffs > 0 ? v5(acc, "DEBUFFED_GAUGE_DOWN") : 0;
        if ((up > 0 || cond > 0) && first(res, `gaugeDown:${target.instanceId}`)) {
          const extra = gaugeMode === "MUL" ? dropped * ((1 + up) * (1 + cond) - 1) : (up + cond) * ATB;
          target.gauge = Math.max(0, target.gauge - extra);
          if (up > 0) proc("GAUGE_DOWN_UP");
          if (cond > 0) proc("DEBUFFED_GAUGE_DOWN");
        }
      }
    }
    return out;
  };

  /* --- 手番ごとの集計 --- */
  let lastTeam: string | null = null;
  let streak = 0;
  const originalRecord = e.recordTurn.bind(engine);
  e.recordTurn = (unit, ...rest) => {
    const before = snapAll();
    const out = originalRecord(unit, ...rest);
    const team = side(unit);
    m.actions[team] += 1;
    m.unitActions[unit.instanceId] = (m.unitActions[unit.instanceId] ?? 0) + 1;
    streak = lastTeam === team ? streak + 1 : 1;
    lastTeam = team;
    m.maxConsecutiveSameTeam = Math.max(m.maxConsecutiveSameTeam, streak);
    const n = e.turns.length;
    if (n === 100 || n === 200) m.actionsAt[n] = { ...m.actions };
    for (const u of e.units) {
      const b = before.get(u)!;
      const t = side(u);
      if (u.shieldValue > b.shield) m.shield[t] += u.shieldValue - b.shield;
      const dg = u.gauge - b.gauge;
      if (dg > 0) m.gaugeUp[t] += dg;
      if (dg < 0) m.gaugeDown[t === "PLAYER" ? "ENEMY" : "PLAYER"] += -dg;
    }
    return out;
  };

  return { metrics: m };
}
