/**
 * アクセサリー4系統(攻撃・耐久・サポート・妨害)の特殊効果と、エンジンへの差し込み。
 *
 * **検証専用。本番のアクセサリーではない。本番のエンジン・データは変えない。**
 *
 * 攻撃・耐久の2系統は前回の最終検証と同じもの(`../accessoryFinal/specials.ts`)を**そのまま呼ぶ。**
 * ここで足すのはサポート・妨害の2系統と、その弱効果だけ。
 *
 * ## どこで効かせているか
 *
 * 1. **戦闘定義の段階で効かせるもの**(`equip4`)。本番の戦闘補正の口をそのまま使う:
 *      回復量UP          … 各スキルの回復・継続回復の倍率とパッシブの回復値に掛ける
 *      シールド量UP      … `combatMods.shieldMultiplier`(本番の「張る側」の補正)
 *      S1/S2/S3 回復・シールド量UP … その枠のスキルの回復・継続回復・シールドの倍率に掛ける
 *      HP30%以下への回復量UP … 回復効果の `lowHpExtra`(本番の「緊急回復」の項目)
 *      弱体付与率UP      … `combatMods.debuffChanceBonus`(本番の才能・セットと同じ口。**抵抗判定は通る**)
 *      S1/S2/S3 弱体付与率UP … その枠の、敵へかける**抵抗判定を通る**効果の発動率に足す
 *                          (ゲージ減少は抵抗判定を通らないので対象外)
 *
 * 2. **戦闘中の出来事に反応するもの**(`attach4`)。エンジンのインスタンスに限って
 *    `applySkillEffects` などを包み、**呼ぶ前と後の盤面の差**で出来事を知る:
 *      強化付与時・回復を受けた時・弱体解除時・強化を剥がされた時・弱体付与成功時・解除成功時・
 *      ゲージ減少量UP・HP50%以下へのシールド量UP・初回行動時の付与率UP・行動不能中への与ダメUP・
 *      弱体3個以上の敵がいる時のSPD
 *
 *    **1回のスキル使用につき、対象1体に1回だけ**発動させる(同じ解決記録 `resolution` を鍵にする)。
 *    多段・複数効果で何度も発動しないようにするため(依頼で指定された扱い)。
 */
import type { BattleEngine } from "../../src/battle/engine.js";
import { applyHeal, countDebuffs, hasStatus, type BattleUnit } from "../../src/battle/unit.js";
import type { MonsterDefinition } from "../../src/core/monster.js";
import { STATUS_EFFECT_CATEGORY, type Skill, type SkillEffect } from "../../src/core/skill.js";
import { DEFAULT_COMBAT_MODIFIERS } from "../../src/core/equipment.js";
import {
  ATK_SPECIALS, DEF_SPECIALS, NONE, WEAKS, attachAccessories, equipDefinition, valueOf,
  type Accessory, type AtkSpecial, type DefSpecial, type Range, type Roll, type Stacking, type Tier, type WeakKey,
} from "../accessoryFinal/specials.js";

/** 行動ゲージの満タン値。本番の `engine.ts` の `ATB_THRESHOLD`(非公開)と同じ値 */
const ATB = 100;

type Ranges = Record<Tier, Range>;
const r = (hero: Range, legend: Range, epic: Range): Ranges => ({ HERO: hero, LEGEND: legend, EPIC: epic });
const fixed = (hero: number, legend: number, epic: number): Ranges => r([hero, hero], [legend, legend], [epic, epic]);

/* ================================================================ サポート */

export const SUP_SPECIALS = {
  HEAL_UP: { label: "回復量UP", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.11]) },
  SHIELD_UP: { label: "シールド量UP", ranges: r([0.05, 0.07], [0.07, 0.10], [0.10, 0.13]) },
  BUFF_GAUGE: { label: "強化付与時 対象ゲージUP", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]) },
  HEALED_GAUGE: { label: "回復を受けた味方のゲージUP", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]) },
  LOW30_HEAL: { label: "HP30%以下の味方への回復量UP", ranges: r([0.07, 0.10], [0.10, 0.13], [0.13, 0.17]) },
  S1_HEAL: { label: "S1回復・シールド量UP", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]) },
  S2_HEAL: { label: "S2回復・シールド量UP", ranges: r([0.04, 0.06], [0.06, 0.08], [0.08, 0.10]) },
  S3_HEAL: { label: "S3回復・シールド量UP", ranges: r([0.05, 0.07], [0.07, 0.09], [0.09, 0.12]) },
  STRIPPED_GAUGE: { label: "自身の強化が解除された時 自身ゲージUP", ranges: r([0.03, 0.04], [0.04, 0.06], [0.06, 0.08]) },
  CLEANSE_HEAL: { label: "弱体解除成功時 対象を追加回復(最大HP比)", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]) },
  /* 追加候補(10章) */
  REVIVE_HP: { label: "蘇生時の復帰HP追加", ranges: fixed(0.03, 0.05, 0.07) },
  CLEANSE_GAUGE: { label: "弱体解除時 解除された味方のゲージUP", ranges: fixed(0.02, 0.03, 0.04) },
  LOW50_SHIELD: { label: "HP50%以下の味方へのシールド量UP", ranges: r([0.05, 0.07], [0.07, 0.10], [0.10, 0.13]) },
  HEALER_GAUGE: { label: "回復スキル使用時 自身ゲージUP", ranges: fixed(0.02, 0.03, 0.04) },
  BUFF_HEAL: { label: "強化を付与した味方への小回復(最大HP比)", ranges: fixed(0.01, 0.015, 0.02) },
} as const;

/* ================================================================ 妨害 */

export const DIS_SPECIALS = {
  DEBUFF_RATE: { label: "弱体効果付与率UP", ranges: r([0.03, 0.03], [0.04, 0.05], [0.05, 0.07]) },
  GAUGE_DOWN_UP: { label: "行動ゲージ減少量UP", ranges: r([0.05, 0.07], [0.07, 0.10], [0.10, 0.13]) },
  DEBUFFED_GAUGE_DOWN: { label: "弱体中の敵へのゲージ減少量UP", ranges: r([0.05, 0.07], [0.07, 0.09], [0.09, 0.12]) },
  S1_RATE: { label: "S1弱体付与率UP", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]) },
  S2_RATE: { label: "S2弱体付与率UP", ranges: r([0.03, 0.04], [0.04, 0.05], [0.05, 0.06]) },
  S3_RATE: { label: "S3弱体付与率UP", ranges: r([0.03, 0.04], [0.04, 0.06], [0.06, 0.07]) },
  FIRST_RATE: { label: "初回行動時のみ弱体付与率UP", ranges: r([0.04, 0.05], [0.05, 0.07], [0.07, 0.09]) },
  DEBUFF_SELF_GAUGE: { label: "弱体付与成功時 自身ゲージUP", ranges: fixed(0.02, 0.03, 0.04) },
  STRIP_SELF_GAUGE: { label: "強化解除成功時 自身ゲージUP", ranges: r([0.03, 0.04], [0.04, 0.05], [0.05, 0.07]) },
  STRIP_TARGET_GAUGE: { label: "強化解除成功時 対象ゲージDOWN", ranges: r([0.02, 0.03], [0.03, 0.04], [0.04, 0.05]) },
  STUNNED_DMG: { label: "行動不能中の敵への与ダメUP", ranges: r([0.03, 0.05], [0.05, 0.07], [0.07, 0.09]) },
  SPD_IF_DEBUFF3: { label: "弱体3個以上の敵がいる時 自身SPD増加", ranges: r([0.03, 0.04], [0.04, 0.06], [0.06, 0.08]) },
} as const;

export type SupSpecial = keyof typeof SUP_SPECIALS;
export type DisSpecial = keyof typeof DIS_SPECIALS;
export type Special4 = AtkSpecial | DefSpecial | SupSpecial | DisSpecial;

/* ================================================================ 弱効果(サポート・妨害) */

/** 弱効果は「どの特殊効果と同じ仕組みで、いくつ足すか」で書く。特殊より明確に弱い値 */
export const WEAKS4 = {
  WS_HEAL: { label: "回復量+2%", as: "HEAL_UP", value: 0.02 },
  WS_SHIELD: { label: "シールド量+2%", as: "SHIELD_UP", value: 0.02 },
  WS_CLEANSE_HEAL: { label: "弱体解除時 対象HP1%回復", as: "CLEANSE_HEAL", value: 0.01 },
  WS_HEALED_GAUGE: { label: "味方回復時 対象ゲージ+1%", as: "HEALED_GAUGE", value: 0.01 },
  WS_BUFF_HEAL: { label: "強化付与時 対象HP1%回復", as: "BUFF_HEAL", value: 0.01 },
  WS_HEALER_GAUGE: { label: "回復スキル使用時 自身ゲージ+1%", as: "HEALER_GAUGE", value: 0.01 },
  WS_REVIVE: { label: "蘇生時の復帰HP+2%", as: "REVIVE_HP", value: 0.02 },
  WS_LOW30_HEAL: { label: "HP30%以下の味方への回復量+3%", as: "LOW30_HEAL", value: 0.03 },
  WD_RATE: { label: "弱体付与率+1pt", as: "DEBUFF_RATE", value: 0.01 },
  WD_S1_RATE: { label: "S1弱体付与率+1pt", as: "S1_RATE", value: 0.01 },
  WD_S2_RATE: { label: "S2弱体付与率+1pt", as: "S2_RATE", value: 0.01 },
  WD_S3_RATE: { label: "S3弱体付与率+1pt", as: "S3_RATE", value: 0.01 },
  WD_STRIP_GAUGE: { label: "強化解除成功時 自身ゲージ+2%", as: "STRIP_SELF_GAUGE", value: 0.02 },
  WD_DEBUFF_GAUGE: { label: "弱体成功時 自身ゲージ+1%", as: "DEBUFF_SELF_GAUGE", value: 0.01 },
  WD_GAUGE_DOWN: { label: "ゲージDOWN量+2%", as: "GAUGE_DOWN_UP", value: 0.02 },
  WD_STUNNED_DMG: { label: "行動不能中の敵への与ダメ+2%", as: "STUNNED_DMG", value: 0.02 },
} as const;
export type WeakKey4 = WeakKey | keyof typeof WEAKS4;

export const LABEL4: Record<string, string> = Object.fromEntries([
  ...Object.entries(ATK_SPECIALS), ...Object.entries(DEF_SPECIALS), ...Object.entries(SUP_SPECIALS), ...Object.entries(DIS_SPECIALS),
].map(([k, v]) => [k, v.label]));
export const WEAK_LABEL4: Record<string, string> = Object.fromEntries([
  ...Object.entries(WEAKS).map(([k, v]) => [k, v.label]), ...Object.entries(WEAKS4).map(([k, v]) => [k, v.label]),
]);

export type Family = "ATK" | "DEF" | "SUP" | "DIS";
export function familyOf(key: Special4): Family {
  if (key in ATK_SPECIALS) return "ATK";
  if (key in DEF_SPECIALS) return "DEF";
  if (key in SUP_SPECIALS) return "SUP";
  return "DIS";
}

/* ================================================================ アクセサリー */

export interface Acc4 {
  main: "ATK" | "HP" | "DEF" | null;
  mainValue: number;
  specials: readonly Special4[];
  tier: Tier;
  roll: Roll;
  weak: WeakKey4 | null;
}
export const NONE4: Acc4 = { main: null, mainValue: 0, specials: [], tier: "EPIC", roll: "STD", weak: null };

function rangesOf4(key: Special4): Ranges {
  const table = { ...ATK_SPECIALS, ...DEF_SPECIALS, ...SUP_SPECIALS, ...DIS_SPECIALS } as Record<string, { ranges: Ranges }>;
  return table[key].ranges;
}

/** サポート・妨害の効き目。特殊の値 + (同じ仕組みの弱効果があれば)その値 */
export function v4(acc: Acc4, key: SupSpecial | DisSpecial): number {
  if (new Set(acc.specials).size !== acc.specials.length) throw new Error("同一の特殊効果は1つのアクセに重複不可");
  const special = acc.specials.includes(key) ? valueOf(rangesOf4(key)[acc.tier], acc.roll) : 0;
  const weak = acc.weak && acc.weak in WEAKS4 && WEAKS4[acc.weak as keyof typeof WEAKS4].as === key ? WEAKS4[acc.weak as keyof typeof WEAKS4].value : 0;
  return special + weak;
}

/** 攻撃・耐久の2系統だけを取り出した、前回と同じ形のアクセ(`attachAccessories` に渡す) */
export function toOld(acc: Acc4): Accessory {
  return {
    main: acc.main, mainValue: acc.mainValue, tier: acc.tier, roll: acc.roll,
    specials: acc.specials.filter((k) => k in ATK_SPECIALS || k in DEF_SPECIALS) as (AtkSpecial | DefSpecial)[],
    weak: acc.weak && acc.weak in WEAKS ? (acc.weak as WeakKey) : null,
  };
}

export function describe4(acc: Acc4): string {
  if (!acc.main && acc.specials.length === 0 && !acc.weak) return "なし";
  const main = acc.main ? `${acc.main}+${Math.round(acc.mainValue).toLocaleString("en-US")}` : "";
  const specials = acc.specials.map((s) => {
    const v = valueOf(rangesOf4(s)[acc.tier], acc.roll);
    const unit = s.endsWith("_RATE") || s === "DEBUFF_RATE" ? "pt" : "%";
    return `${LABEL4[s]}${(v * 100).toFixed(1).replace(/\.0$/, "")}${unit}`;
  }).join("・");
  const weak = acc.weak ? `弱:${WEAK_LABEL4[acc.weak]}` : "";
  return [main, specials, weak].filter(Boolean).join(" + ");
}

/* ================================================================ 定義の段階で効かせる */

const ENEMY_KINDS = new Set(["DEBUFF", "STUN", "STRIP", "STEAL_BUFF", "HEAL_BLOCK", "POISON", "BURN", "BLIND", "COOLDOWN_EXTEND", "CURSE", "CONVERT_CURSES"]);

/** その効果が「敵へかける弱体(か解除)」で、発動率が書かれているか */
function isEnemyRollEffect(skill: Skill, e: SkillEffect): boolean {
  const onEnemy = skill.target === "ALL_ENEMIES" || skill.target === "SINGLE_ENEMY";
  const applyTo = (e as { applyTo?: string }).applyTo;
  if (!onEnemy || applyTo === "ALLIES" || applyTo === "SELF" || applyTo === "LOWEST_HP_ALLY") return false;
  if ((e as { chance?: number }).chance === undefined) return false;
  if (ENEMY_KINDS.has(e.kind)) return true;
  if (e.kind === "STATUS") return STATUS_EFFECT_CATEGORY[(e as { status: keyof typeof STATUS_EFFECT_CATEGORY }).status] === "DEBUFF";
  /*
   * 行動ゲージの減少は**抵抗の判定を通らない**(本番の GAUGE は発動率だけで決まる)。
   * ここへ付与率を足すと「抵抗を素通りする確率」が上がるので、付与率UPの対象から外す。
   * ゲージを減らす量は、別の特殊効果(行動ゲージ減少量UP)で扱う。
   */
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
 * 戦闘定義へ4系統のアクセを着ける。
 *
 * 1. 攻撃・耐久(メインを含む)は前回と同じ `equipDefinition` に任せる
 * 2. サポート・妨害のうち、定義で表せるものをここで足す(本番の戦闘補正の口を使う)
 */
export function equip4(def: MonsterDefinition, acc: Acc4): MonsterDefinition {
  const base = equipDefinition(def, toOld(acc));
  const heal = v4(acc, "HEAL_UP");
  const slotHeal = [v4(acc, "S1_HEAL"), v4(acc, "S2_HEAL"), v4(acc, "S3_HEAL")];
  const low30 = v4(acc, "LOW30_HEAL");
  const slotRate = [v4(acc, "S1_RATE"), v4(acc, "S2_RATE"), v4(acc, "S3_RATE")];
  const skills = base.skills.map((skill, slot) => {
    if (!skill) return skill;
    const healMul = (1 + heal) * (1 + slotHeal[slot]);
    const shieldMul = 1 + slotHeal[slot];
    const rateAdd = slotRate[slot];
    let changed = false;
    const effects = mapEffects(skill.effects, (e) => {
      let next = e;
      if ((e.kind === "HEAL" || e.kind === "REGEN") && healMul !== 1) { next = { ...next, healRate: (next as { healRate: number }).healRate * healMul } as SkillEffect; changed = true; }
      if (e.kind === "HEAL" && low30 > 0) {
        const cur = (next as { lowHpExtra?: { hpRatio: number; extra: number } }).lowHpExtra;
        // 本番の「緊急回復」と同じ項目。既に別の閾値がある時はそちらを優先し、ここでは足さない
        if (!cur || cur.hpRatio === 0.3) { next = { ...next, lowHpExtra: { hpRatio: 0.3, extra: (cur?.extra ?? 0) + low30 } } as SkillEffect; changed = true; }
      }
      if (e.kind === "SHIELD" && shieldMul !== 1) { next = { ...next, shieldRate: (next as { shieldRate: number }).shieldRate * shieldMul } as SkillEffect; changed = true; }
      if (rateAdd > 0 && isEnemyRollEffect(skill, e)) { next = { ...next, chance: Math.min(1, (e as { chance: number }).chance + rateAdd) } as SkillEffect; changed = true; }
      return next;
    });
    // パッシブの回復値(水の祝福・輪廻転生など)にも回復量UPを掛ける
    let passive = skill.passive;
    if (passive && heal > 0) {
      passive = { ...passive, levels: passive.levels.map((lv) => {
        const copy = { ...lv } as Record<string, unknown>;
        for (const f of HEAL_FIELDS) if (typeof copy[f] === "number") { copy[f] = (copy[f] as number) * (1 + heal); changed = true; }
        return copy;
      }) as typeof passive.levels };
    }
    return changed ? { ...skill, effects, passive } : skill;
  }) as MonsterDefinition["skills"];
  const mods = { ...DEFAULT_COMBAT_MODIFIERS, ...(base.combatMods ?? {}) };
  const shield = v4(acc, "SHIELD_UP");
  if (shield > 0) mods.shieldMultiplier = (mods.shieldMultiplier ?? 1) * (1 + shield);
  const rate = v4(acc, "DEBUFF_RATE");
  if (rate > 0) mods.debuffChanceBonus = (mods.debuffChanceBonus ?? 0) + rate;
  return { ...base, skills, combatMods: mods };
}

/* ================================================================ 戦闘中の計測 */

export interface Metrics4 {
  /** 陣営ごと(PLAYER=攻撃側 / ENEMY=防衛側)。「誰がやったか」の陣営で数える */
  strip: Record<"PLAYER" | "ENEMY", { att: number; ok: number; endureAtt: number; endureOk: number; defUpAtt: number; defUpOk: number; shieldAtt: number; shieldOk: number; invAtt: number; invOk: number }>;
  defDown: Record<"PLAYER" | "ENEMY", { att: number; ok: number }>;
  roll: Record<"PLAYER" | "ENEMY", { att: number; ok: number }>;
  /** 回復量(受け手の陣営)。エンジンの「回復」イベントの合計 */
  heal: Record<"PLAYER" | "ENEMY", number>;
  shield: Record<"PLAYER" | "ENEMY", number>;
  gaugeUp: Record<"PLAYER" | "ENEMY", number>;
  gaugeDown: Record<"PLAYER" | "ENEMY", number>;
  /** アクセの出来事の発動回数(効果キーごと) */
  procs: Record<string, number>;
  /** 我慢でHP1に踏みとどまった回数・最初の手番・その個体が倒れた手番 */
  endureSaves: number;
  endureFirstTurn: number | null;
  endureUnitDeathTurn: number | null;
  /** 我慢が強化解除で剥がされた回数 */
  endureStripped: number;
  /** 手番ごとに進めるカウンタ */
  turn: number;
  /** 各陣営の行動回数(手番の偏りを見る) */
  actions: Record<"PLAYER" | "ENEMY", number>;
  /** 敵全体のゲージが0の状態で相手が手番を迎えた回数など、永久妨害の兆候 */
  maxConsecutiveSameTeam: number;
}

export function newMetrics(): Metrics4 {
  const side = () => ({ att: 0, ok: 0, endureAtt: 0, endureOk: 0, defUpAtt: 0, defUpOk: 0, shieldAtt: 0, shieldOk: 0, invAtt: 0, invOk: 0 });
  return {
    strip: { PLAYER: side(), ENEMY: side() },
    defDown: { PLAYER: { att: 0, ok: 0 }, ENEMY: { att: 0, ok: 0 } },
    roll: { PLAYER: { att: 0, ok: 0 }, ENEMY: { att: 0, ok: 0 } },
    heal: { PLAYER: 0, ENEMY: 0 }, shield: { PLAYER: 0, ENEMY: 0 },
    gaugeUp: { PLAYER: 0, ENEMY: 0 }, gaugeDown: { PLAYER: 0, ENEMY: 0 },
    procs: {}, endureSaves: 0, endureFirstTurn: null, endureUnitDeathTurn: null, endureStripped: 0,
    turn: 0, actions: { PLAYER: 0, ENEMY: 0 }, maxConsecutiveSameTeam: 0,
  };
}

/* ---------------------------------------------------------------- 盤面の写し */

interface Snap {
  hp: number; shield: number; gauge: number; alive: boolean;
  buffs: number; debuffs: number;
  endure: boolean; defUp: boolean; defDown: boolean; hasShield: boolean; invincible: boolean; stunned: boolean;
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
  hasShield: u.shieldTurns > 0 && u.shieldValue > 0, invincible: hasStatus(u, "INVINCIBLE"), stunned: u.stunTurns > 0,
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
  act: (unit: BattleUnit, ...rest: unknown[]) => unknown;
  onUnitActed: (actor: BattleUnit) => unknown;
  applyTurnStart: (unit: BattleUnit, ...rest: unknown[]) => unknown;
  pushEvent: (event: { targetId: string; kind: string; amount?: number }) => unknown;
  advanceGaugesToNextBatch: () => BattleUnit[];
  gainGauge: (unit: BattleUnit, amount: number, message?: string) => void;
}

export interface Attach4Options {
  stackAtk: Stacking; stackDef: Stacking; rng: () => number;
  /** 行動ゲージ減少量UPの掛け方。MUL=元の減少量×(1+x) / ADD=x を加算(pt) */
  gaugeMode: "MUL" | "ADD";
}

/**
 * 1体のエンジンに4系統のアクセを差し込み、計測を始める。
 * 攻撃・耐久は前回の `attachAccessories` をそのまま呼ぶ(同じ判定を2か所に書かない)。
 */
export function attach4(engine: BattleEngine, accOf: (u: BattleUnit) => Acc4, options: Attach4Options): { metrics: Metrics4; old: { stats: { shield50: number; hitHeals: number; killGauge: number } } } {
  const old = attachAccessories(engine, (u) => toOld(accOf(u)), { stackAtk: options.stackAtk, stackDef: options.stackDef, rng: options.rng });
  const e = engine as unknown as Internals;
  const m = newMetrics();
  const proc = (key: string) => { m.procs[key] = (m.procs[key] ?? 0) + 1; };
  const allies = (u: BattleUnit) => e.units.filter((x) => x.team === u.team);
  const once = new WeakMap<object, Set<string>>();
  const first = (resolution: object | undefined, key: string): boolean => {
    if (!resolution) return true;
    let set = once.get(resolution);
    if (!set) { set = new Set(); once.set(resolution, set); }
    if (set.has(key)) return false;
    set.add(key);
    return true;
  };
  const gauge = (u: BattleUnit, amount: number) => { if (u.alive && amount !== 0) u.gauge = Math.max(0, Math.min(ATB, u.gauge + amount * ATB)); };
  const heal = (u: BattleUnit, ratio: number) => {
    if (!u.alive || ratio <= 0) return;
    const before = u.currentHp;
    applyHeal(u, Math.round(u.maxHp * ratio));
    const healed = u.currentHp - before;
    if (healed > 0) m.heal[u.team as "PLAYER" | "ENEMY"] += healed;
  };

  /* --- 回復量の計測(本番の「回復」イベント) --- */
  const originalPush = e.pushEvent.bind(engine);
  e.pushEvent = (event) => {
    if (event.kind === "HEAL" && event.amount && event.amount > 0) {
      const u = e.units.find((x) => x.instanceId === event.targetId);
      if (u) m.heal[u.team as "PLAYER" | "ENEMY"] += event.amount;
    }
    return originalPush(event);
  };

  /* --- 弱体付与の試行・成功の計測(本番の抵抗判定をそのまま通す) --- */
  const originalRoll = e.rollEffectSuccess.bind(engine);
  e.rollEffectSuccess = (source, target, baseChance, ...rest) => {
    const ok = originalRoll(source, target, baseChance, ...rest);
    if (source.team !== target.team) {
      const side = m.roll[source.team as "PLAYER" | "ENEMY"];
      side.att += 1; if (ok) side.ok += 1;
    }
    return ok;
  };

  /* --- 回復を受けた味方のゲージ・回復スキル使用時の自身ゲージ(パッシブの回復にも効かせる) --- */
  const healWindow = (actor: BattleUnit, before: Map<BattleUnit, Snap>, resolution: object | undefined) => {
    const acc = accOf(actor);
    const healedGauge = v4(acc, "HEALED_GAUGE");
    if (healedGauge <= 0) return;
    for (const ally of allies(actor)) {
      const b = before.get(ally);
      if (!b || !ally.alive || ally.currentHp <= b.hp) continue;
      if (!first(resolution, `healed:${ally.instanceId}`)) continue;
      gauge(ally, healedGauge); proc("HEALED_GAUGE");
    }
  };
  const snapAll = () => new Map(e.units.map((u) => [u, snap(u)] as const));

  const originalActed = e.onUnitActed.bind(engine);
  e.onUnitActed = (actor) => {
    const before = snapAll();
    const out = originalActed(actor);
    healWindow(actor, before, undefined);
    return out;
  };
  const originalTurnStart = e.applyTurnStart.bind(engine);
  e.applyTurnStart = (unit, ...rest) => {
    const before = snapAll();
    const out = originalTurnStart(unit, ...rest);
    // 手番開始時の回復のうち、自分以外の味方へのもの(輪廻転生など)だけを術者の回復として扱う
    const acc = accOf(unit);
    const healedGauge = v4(acc, "HEALED_GAUGE");
    if (healedGauge > 0) {
      for (const ally of allies(unit)) {
        const b = before.get(ally);
        if (ally === unit || !b || !ally.alive || ally.currentHp <= b.hp) continue;
        gauge(ally, healedGauge); proc("HEALED_GAUGE");
      }
    }
    return out;
  };

  /* --- 初回行動時の付与率UP --- */
  const acted = new Set<string>();
  const originalAct = e.act.bind(engine);
  e.act = (unit, ...rest) => {
    const bonus = acted.has(unit.instanceId) ? 0 : v4(accOf(unit), "FIRST_RATE");
    acted.add(unit.instanceId);
    const mods = unit.def.combatMods;
    if (bonus > 0 && mods) mods.debuffChanceBonus = (mods.debuffChanceBonus ?? 0) + bonus;
    try { return originalAct(unit, ...rest); } finally { if (bonus > 0 && mods) mods.debuffChanceBonus = (mods.debuffChanceBonus ?? 0) - bonus; }
  };

  /* --- 行動不能中の敵への与ダメUP(与ダメUPの他の特殊とは掛け算で扱う) --- */
  const originalIncoming = e.applyIncomingDamage.bind(engine);
  e.applyIncomingDamage = (target, amount, source, sourceType = "normal", resolution = null) => {
    let adjusted = amount;
    if (source && sourceType === "normal" && target.stunTurns > 0) {
      const bonus = v4(accOf(source), "STUNNED_DMG");
      if (bonus > 0) { adjusted = Math.round(amount * (1 + bonus)); proc("STUNNED_DMG"); }
    }
    const hpBefore = target.currentHp;
    const out = originalIncoming(target, adjusted, source, sourceType, resolution);
    // 我慢で踏みとどまった個体を追う(我慢対策の計測)
    if (target.alive && target.currentHp === 1 && hpBefore > 1 && hasStatus(target, "ENDURE")) {
      m.endureSaves += 1;
      if (m.endureFirstTurn === null) { m.endureFirstTurn = e.turns.length; endureUnit = target; }
    }
    return out;
  };
  let endureUnit: BattleUnit | null = null;

  /* --- 弱体3個以上の敵がいる時のSPD(ゲージを進める直前に毎回判定し直す) --- */
  const spdBase = new Map<string, number>();
  const originalAdvance = e.advanceGaugesToNextBatch.bind(engine);
  e.advanceGaugesToNextBatch = () => {
    for (const u of e.units) {
      const bonus = v4(accOf(u), "SPD_IF_DEBUFF3");
      if (bonus <= 0 || !u.alive) continue;
      if (!spdBase.has(u.instanceId)) spdBase.set(u.instanceId, u.flatStatBonus.spd ?? 0);
      const active = e.units.some((x) => x.alive && x.team !== u.team && countDebuffs(x) >= 3);
      u.flatStatBonus.spd = spdBase.get(u.instanceId)! + (active ? Math.round(u.def.stats.spd * bonus) : 0);
      if (active) proc("SPD_IF_DEBUFF3");
    }
    return originalAdvance();
  };

  /* --- スキル効果の解決。前後の盤面の差で出来事を拾う --- */
  let depth = 0;
  const originalApply = e.applySkillEffects.bind(engine);
  e.applySkillEffects = (source, target, skill, missed, sourceScoped, latent, resolution, perHit) => {
    if (depth > 0) return originalApply(source, target, skill, missed, sourceScoped, latent, resolution, perHit);
    const before = snapAll();
    depth += 1;
    let out: unknown;
    try { out = originalApply(source, target, skill, missed, sourceScoped, latent, resolution, perHit); } finally { depth -= 1; }
    const res = resolution as object | undefined;
    const acc = accOf(source);
    const srcTeam = source.team as "PLAYER" | "ENEMY";
    const tb = before.get(target)!;
    const ta = snap(target);
    const enemyTarget = target.team !== source.team;

    // 計測: 強化解除(剥がせる強化を持っていた相手に、解除の技が当たった時だけ分母に入れる)
    if (enemyTarget && skillHas(skill, (x) => x.kind === "STRIP" || x.kind === "STEAL_BUFF") && first(res, `strip:${target.instanceId}`)) {
      const s = m.strip[srcTeam];
      if (tb.buffs > 0) { s.att += 1; if (ta.buffs < tb.buffs) s.ok += 1; }
      if (tb.endure) { s.endureAtt += 1; if (!ta.endure) { s.endureOk += 1; m.endureStripped += 1; } }
      if (tb.defUp) { s.defUpAtt += 1; if (!ta.defUp) s.defUpOk += 1; }
      if (tb.hasShield) { s.shieldAtt += 1; if (!ta.hasShield) s.shieldOk += 1; }
      if (tb.invincible) { s.invAtt += 1; if (!ta.invincible) s.invOk += 1; }
    }
    // 計測: 防御DOWN(まだ掛かっていない生きた相手に、防御DOWNを持つ技が当たった時)
    if (enemyTarget && tb.alive && !tb.defDown && skillHas(skill, (x) => x.kind === "DEBUFF" && x.stat === "def") && first(res, `defdown:${target.instanceId}`)) {
      m.defDown[srcTeam].att += 1; if (ta.defDown) m.defDown[srcTeam].ok += 1;
    }

    // --- サポート ---
    const buffGauge = v4(acc, "BUFF_GAUGE");
    const buffHeal = v4(acc, "BUFF_HEAL");
    const cleanseHeal = v4(acc, "CLEANSE_HEAL");
    const cleanseGauge = v4(acc, "CLEANSE_GAUGE");
    const low50 = v4(acc, "LOW50_SHIELD");
    for (const ally of allies(source)) {
      const b = before.get(ally)!;
      const a = snap(ally);
      if (!ally.alive) continue;
      if (a.buffs > b.buffs && (buffGauge > 0 || buffHeal > 0) && first(res, `buff:${ally.instanceId}`)) {
        if (buffGauge > 0) { gauge(ally, buffGauge); proc("BUFF_GAUGE"); }
        if (buffHeal > 0) { heal(ally, buffHeal); proc("BUFF_HEAL"); }
      }
      if (a.debuffs < b.debuffs && skillHas(skill, (x) => x.kind === "CLEANSE") && (cleanseHeal > 0 || cleanseGauge > 0) && first(res, `cleanse:${ally.instanceId}`)) {
        if (cleanseHeal > 0) { heal(ally, cleanseHeal); proc("CLEANSE_HEAL"); }
        if (cleanseGauge > 0) { gauge(ally, cleanseGauge); proc("CLEANSE_GAUGE"); }
      }
      if (low50 > 0 && a.shield > b.shield && b.hp / ally.maxHp <= 0.5 && first(res, `low50:${ally.instanceId}`)) {
        ally.shieldValue += Math.round((a.shield - b.shield) * low50); proc("LOW50_SHIELD");
      }
    }
    if (skillHas(skill, (x) => x.kind === "HEAL") && sourceScoped !== false && v4(acc, "HEALER_GAUGE") > 0 && first(res, "healer")) {
      gauge(source, v4(acc, "HEALER_GAUGE")); proc("HEALER_GAUGE");
    }
    healWindow(source, before, res);
    // 強化を剥がされた側の「自身ゲージUP」
    if (enemyTarget && ta.buffs < tb.buffs && skillHas(skill, (x) => x.kind === "STRIP" || x.kind === "STEAL_BUFF")) {
      const g = v4(accOf(target), "STRIPPED_GAUGE");
      if (g > 0 && first(res, `stripped:${target.instanceId}`)) { gauge(target, g); proc("STRIPPED_GAUGE"); }
    }

    // --- 妨害 ---
    if (enemyTarget) {
      if (ta.debuffs > tb.debuffs && v4(acc, "DEBUFF_SELF_GAUGE") > 0 && first(res, "debuffSelf")) {
        gauge(source, v4(acc, "DEBUFF_SELF_GAUGE")); proc("DEBUFF_SELF_GAUGE");
      }
      if (ta.buffs < tb.buffs && skillHas(skill, (x) => x.kind === "STRIP" || x.kind === "STEAL_BUFF")) {
        if (v4(acc, "STRIP_SELF_GAUGE") > 0 && first(res, "stripSelf")) { gauge(source, v4(acc, "STRIP_SELF_GAUGE")); proc("STRIP_SELF_GAUGE"); }
        const down = v4(acc, "STRIP_TARGET_GAUGE");
        if (down > 0 && first(res, `stripTarget:${target.instanceId}`)) { gauge(target, -down); proc("STRIP_TARGET_GAUGE"); }
      }
      // ゲージ減少量UP: 元々ゲージを減らす技で、実際に減った相手だけ
      const dropped = tb.gauge - ta.gauge;
      if (dropped > 0 && skillHas(skill, (x) => x.kind === "GAUGE" && ((x as { amount: number }).amount < 0 || !!(x as { drain?: boolean }).drain))) {
        const up = v4(acc, "GAUGE_DOWN_UP");
        const cond = tb.debuffs > 0 ? v4(acc, "DEBUFFED_GAUGE_DOWN") : 0;
        if ((up > 0 || cond > 0) && first(res, `gaugeDown:${target.instanceId}`)) {
          const extra = options.gaugeMode === "MUL" ? dropped * (up + cond) : (up + cond) * ATB;
          target.gauge = Math.max(0, target.gauge - extra);
          proc(up > 0 ? "GAUGE_DOWN_UP" : "DEBUFFED_GAUGE_DOWN");
        }
      }
    }
    return out;
  };

  /* --- 手番ごとの集計(シールド・ゲージの増減、行動の偏り)。ゲージの増減はここでだけ数える --- */
  let lastTeam: string | null = null;
  let streak = 0;
  const originalRecord = e.recordTurn.bind(engine);
  e.recordTurn = (unit, ...rest) => {
    const before = snapAll();
    const out = originalRecord(unit, ...rest);
    m.turn = e.turns.length;
    const team = unit.team as "PLAYER" | "ENEMY";
    m.actions[team] += 1;
    streak = lastTeam === team ? streak + 1 : 1;
    lastTeam = team;
    m.maxConsecutiveSameTeam = Math.max(m.maxConsecutiveSameTeam, streak);
    for (const u of e.units) {
      const b = before.get(u)!;
      const t = u.team as "PLAYER" | "ENEMY";
      if (u.shieldValue > b.shield) m.shield[t] += u.shieldValue - b.shield;
      // 手番の主は `recordTurn` の前にゲージを消費済み。ここでの差は効果によるものだけ
      const dg = u.gauge - b.gauge;
      if (dg > 0) m.gaugeUp[t] += dg;
      if (dg < 0) m.gaugeDown[t === "PLAYER" ? "ENEMY" : "PLAYER"] += -dg;
    }
    if (endureUnit && m.endureUnitDeathTurn === null && !endureUnit.alive) m.endureUnitDeathTurn = e.turns.length;
    return out;
  };

  return { metrics: m, old };
}

export { NONE };
