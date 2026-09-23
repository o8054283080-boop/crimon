/**
 * アクセサリーの特殊効果込みで、攻撃と耐久のどちらかが壊れないかを見る。
 *
 * **検証専用。本番のデータには何も書かない。**`accessoryFullLab.ts` の続き。
 *
 * ## 何が「過去案」で、何が「検証仮値」「検証候補」か
 *
 * - 攻撃型: 依頼主が過去に設計した候補を使う。
 *   値があるもの(属性与ダメ・スキル別ダメ)は**過去案の幅そのまま**。
 *   値が残っていないもの(条件付き・多段・初撃)は**検証仮値**で、
 *   過去案にある3つの幅のどれかを、条件の厳しさに応じて借りた。
 * - 防御型: 正式な一覧はまだ無い。依頼主が挙げた候補の値を
 *   ヒーロー/レジェンド/エピックの3段に割り振った**検証候補**。
 *
 * どれも本番仕様ではない。
 *
 * ## 何を通しているか
 *
 * Battle Lab の `buildAlly` → `createBattleUnit` → **本番の `calcDamage`**。
 * 多段攻撃は本番と同じく**1Hitずつ相手のHPを減らしてから次のHitを計算する**
 * (`engine.ts` の DAMAGE 効果の解決)。低HP時軽減・HP50%シールド・敵HP条件は、
 * スキルの途中で条件を満たした次のHitから効く。
 *
 * 攻撃特殊は与ダメの倍率として本番の `combatMods.damageDealtMultiplier`
 * (力4セット・才能覚醒と同じ口)へ、Hitごとに条件を見て入れる。
 * 防御特殊の軽減は、本番の被ダメ軽減(潜在・パッシブ)の後に掛ける。
 * 攻撃UP・防御DOWNの量は本番の `statusValues.ts` から読む。
 *
 *   npx tsx tools/accessorySpecialLab.ts > 結果.md
 */
import { calcDamage, getFinalCritRate } from "../src/battle/damage.js";
import {
  applyStatEffect,
  countDebuffs,
  createBattleUnit,
  damageTakenMultiplier,
  getEffectiveStat,
  type BattleUnit,
} from "../src/battle/unit.js";
import type { DamageEffect } from "../src/core/skill.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { DEFAULT_COMBAT_MODIFIERS } from "../src/core/equipment.js";
import { ATK_DOWN, ATK_UP, DEF_DOWN, SPD_DOWN } from "../src/core/statusValues.js";
import { balanceFlags } from "../src/core/balanceFlags.js";
import { buildAlly } from "./battleLab/build.js";
import { PRESETS } from "./battleLab/presets.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { AllySpec, PresetName } from "./battleLab/types.js";

if (balanceFlags.defenseFormula !== "sw" || balanceFlags.elementMode !== "sw" || balanceFlags.swRatio !== 1.2) {
  throw new Error(`本番の既定ではない: ${JSON.stringify(balanceFlags)}`);
}

/* ================================================================ 特殊効果の定義 */

type Tier = "HERO" | "LEGEND" | "EPIC";
type Range = readonly [number, number];
type Ranges = Record<Tier, Range>;

/* 依頼主の過去案にある3つの幅。検証仮値はここから借りる */
const R_ELEM: Ranges = { HERO: [0.05, 0.08], LEGEND: [0.08, 0.12], EPIC: [0.12, 0.18] };
const R_S1: Ranges = { HERO: [0.04, 0.07], LEGEND: [0.07, 0.10], EPIC: [0.10, 0.14] };
const R_S2: Ranges = { HERO: [0.05, 0.08], LEGEND: [0.08, 0.12], EPIC: [0.12, 0.16] };
const R_S3: Ranges = { HERO: [0.06, 0.10], LEGEND: [0.10, 0.14], EPIC: [0.14, 0.20] };

type Source = "過去案" | "検証仮値" | "検証候補";

interface SpecialDef {
  label: string;
  side: "ATK" | "DEF";
  ranges: Ranges;
  source: Source;
  note: string;
}

const SPECIALS = {
  /* ---- 攻撃: 過去案 ---- */
  ELEM: { label: "対象属性への与ダメUP", side: "ATK", ranges: R_ELEM, source: "過去案", note: "対象属性の相手にだけ効く" },
  S3: { label: "S3ダメージUP", side: "ATK", ranges: R_S3, source: "過去案", note: "今回の3体はすべてS3で測る" },
  /* ---- 攻撃: 検証仮値(過去案に数値が無い) ---- */
  SELF_HP70: { label: "自分HP70%以上で与ダメUP", side: "ATK", ranges: R_ELEM, source: "検証仮値", note: "幅は属性与ダメUPから借用" },
  SELF_HP50: { label: "自分HP50%以上で与ダメUP", side: "ATK", ranges: R_S1, source: "検証仮値", note: "70%より緩い条件なので一段低いS1の幅" },
  SELF_HP30: { label: "自分HP30%以下で与ダメUP", side: "ATK", ranges: R_S3, source: "検証仮値", note: "厳しい条件なのでS3の幅" },
  ENEMY_HP30: { label: "敵HP30%以下への与ダメUP", side: "ATK", ranges: R_ELEM, source: "検証仮値", note: "属性与ダメUPの幅" },
  ENEMY_HP20: { label: "敵HP20%以下への与ダメUP", side: "ATK", ranges: R_S3, source: "検証仮値", note: "より厳しいのでS3の幅" },
  DEBUFF1: { label: "弱体1個以上の敵への与ダメUP", side: "ATK", ranges: R_S2, source: "検証仮値", note: "S2の幅" },
  DEBUFF3: { label: "弱体3個以上の敵への与ダメUP", side: "ATK", ranges: R_S3, source: "検証仮値", note: "厳しいのでS3の幅" },
  MULTI2: { label: "2Hit目以降ダメUP", side: "ATK", ranges: R_S2, source: "検証仮値", note: "1Hit目には効かない。S2の幅" },
  MULTI3: { label: "3Hit目以降ダメUP", side: "ATK", ranges: R_S3, source: "検証仮値", note: "3Hit目から。S3の幅" },
  FIRST: { label: "初撃ダメUP", side: "ATK", ranges: R_S3, source: "検証仮値", note: "戦闘で最初の攻撃だけ。S3の幅" },
  /* ---- 防御: 検証候補(依頼の候補値を3段へ割り振った) ---- */
  DMG_TAKEN: { label: "A 被ダメ軽減", side: "DEF", ranges: { HERO: [0.03, 0.05], LEGEND: [0.05, 0.07], EPIC: [0.07, 0.10] }, source: "検証候補", note: "候補 3/5/7/10%" },
  CRIT_TAKEN: { label: "B クリ被ダメ軽減", side: "DEF", ranges: { HERO: [0.05, 0.10], LEGEND: [0.10, 0.15], EPIC: [0.15, 0.20] }, source: "検証候補", note: "候補 5/10/15/20%" },
  MAX_HP: { label: "C 最大HP増加", side: "DEF", ranges: { HERO: [0.03, 0.05], LEGEND: [0.05, 0.07], EPIC: [0.07, 0.10] }, source: "検証候補", note: "候補 3/5/7/10%。メイン加算の後に掛ける" },
  DEF_UP: { label: "D DEF増加", side: "DEF", ranges: { HERO: [0.03, 0.05], LEGEND: [0.05, 0.07], EPIC: [0.07, 0.10] }, source: "検証候補", note: "候補 3/5/7/10%。メイン加算の後に掛ける" },
  LOW50: { label: "E HP50%以下で被ダメ軽減", side: "DEF", ranges: { HERO: [0.05, 0.10], LEGEND: [0.10, 0.15], EPIC: [0.15, 0.20] }, source: "検証候補", note: "候補 5/10/15/20%" },
  LOW30: { label: "E' HP30%以下で被ダメ軽減", side: "DEF", ranges: { HERO: [0.05, 0.10], LEGEND: [0.10, 0.15], EPIC: [0.15, 0.20] }, source: "検証候補", note: "候補 5/10/15/20%" },
  SHIELD_START: { label: "F 開始時シールド", side: "DEF", ranges: { HERO: [0.03, 0.05], LEGEND: [0.05, 0.07], EPIC: [0.07, 0.10] }, source: "検証候補", note: "候補 3/5/7/10%。1回だけ" },
  SHIELD50: { label: "F' HP50%到達時シールド", side: "DEF", ranges: { HERO: [0.03, 0.05], LEGEND: [0.05, 0.07], EPIC: [0.07, 0.10] }, source: "検証候補", note: "候補 3/5/7/10%。1戦に1回だけ" },
  HEAL: { label: "G ターン開始時回復", side: "DEF", ranges: { HERO: [0.01, 0.02], LEGEND: [0.02, 0.03], EPIC: [0.03, 0.05] }, source: "検証候補", note: "候補 1/2/3/5%。一撃には効かない(長期戦の表で見る)" },
} satisfies Record<string, SpecialDef>;

type SpecialKey = keyof typeof SPECIALS;

/* 弱効果。特殊効果より明確に小さい */
interface WeakDef { label: string; side: "ATK" | "DEF"; range: Range; source: Source; note: string }
const WEAKS = {
  /* 攻撃: 過去案 */
  FOLLOWUP: { label: "小さな追撃(10〜15%でATK×0.15〜0.20)", side: "ATK", range: [0.15, 0.20], source: "過去案", note: "一撃目に直接ダメージを足すのはこれだけ。表では「発動しない」前提、別に発動時を出す" },
  LIFESTEAL: { label: "軽い吸血 1〜2%", side: "ATK", range: [0.01, 0.02], source: "過去案", note: "ダメージは変わらない" },
  FINISH: { label: "止め刺し 敵HP20%以下+3%", side: "ATK", range: [0.03, 0.03], source: "過去案", note: "満タンからの一撃には効かない" },
  /* 防御: 検証候補 */
  W_DMG_TAKEN: { label: "被ダメ-1〜2%", side: "DEF", range: [0.01, 0.02], source: "検証候補", note: "" },
  W_CRIT_TAKEN: { label: "クリ被ダメ-2〜3%", side: "DEF", range: [0.02, 0.03], source: "検証候補", note: "" },
  W_MAX_HP: { label: "最大HP+1〜2%", side: "DEF", range: [0.01, 0.02], source: "検証候補", note: "" },
  W_DEF: { label: "DEF+1〜2%", side: "DEF", range: [0.01, 0.02], source: "検証候補", note: "" },
  W_LOW30: { label: "HP30%以下で被ダメ-3%", side: "DEF", range: [0.03, 0.03], source: "検証候補", note: "" },
  W_START_SHIELD: { label: "開始時シールド 最大HP1〜2%", side: "DEF", range: [0.01, 0.02], source: "検証候補", note: "" },
  W_TURN_HEAL: { label: "ターン開始時 HP0.5〜1%回復", side: "DEF", range: [0.005, 0.01], source: "検証候補", note: "一撃には効かない" },
} satisfies Record<string, WeakDef>;
type WeakKey = keyof typeof WEAKS;

/** 値の取り方。STD = その段の幅の中央、MAX = 上限 */
type Roll = "STD" | "MAX";
const valueOf = (r: Range, roll: Roll) => (roll === "MAX" ? r[1] : (r[0] + r[1]) / 2);

type Stacking = "ADD" | "MUL";

interface Accessory {
  main: "ATK" | "HP" | "DEF" | null;
  mainValue: number;
  specials: readonly SpecialKey[];
  tier: Tier;
  weak: WeakKey | null;
  roll: Roll;
  /** 攻撃特殊どうし・防御特殊どうしの重ね方 */
  stacking: Stacking;
  /** 対象属性への与ダメUPの対象 */
  targetElement?: AllySpec["element"];
}

const NONE: Accessory = { main: null, mainValue: 0, specials: [], tier: "EPIC", weak: null, roll: "STD", stacking: "ADD" };

function sv(acc: Accessory, key: SpecialKey): number {
  return acc.specials.includes(key) ? valueOf(SPECIALS[key].ranges[acc.tier], acc.roll) : 0;
}
function wv(acc: Accessory, key: WeakKey): number {
  return acc.weak === key ? valueOf(WEAKS[key].range, acc.roll) : 0;
}

function combine(values: number[], stacking: Stacking, sign: 1 | -1): number {
  const live = values.filter((v) => v > 0);
  if (stacking === "ADD") return Math.max(0.05, 1 + sign * live.reduce((a, b) => a + b, 0));
  return live.reduce((m, v) => m * (1 + sign * v), 1);
}

function describe(acc: Accessory): string {
  if (!acc.main && acc.specials.length === 0 && !acc.weak) return "なし";
  const main = acc.main ? `${acc.main}+${Math.round(acc.mainValue).toLocaleString("en-US")}` : "";
  const specials = acc.specials.map((s) => `${SPECIALS[s].label}${Math.round(sv(acc, s) * 1000) / 10}%`).join("・");
  const weak = acc.weak ? `弱:${WEAKS[acc.weak].label}` : "";
  return [main, specials, weak].filter(Boolean).join(" + ");
}

/* ================================================================ 個体 */

interface Subject { label: string; templateId: string; element: AllySpec["element"]; preset: PresetName }
interface AttackerSpec extends Subject { skill: string; ignoresDefense: boolean }
interface DefenderSpec extends Subject { group: "HP型" | "DEF型"; seedPick?: "MAX_HP" | "MAX_DEF" }

const ATTACKERS: AttackerSpec[] = [
  { label: "闇ドラゴン", templateId: "dragon", element: "DARK", preset: "MAX_ATTACKER", skill: "破壊の流星", ignoresDefense: true },
  { label: "闇ネメシス", templateId: "nemesis", element: "DARK", preset: "MAX_ATTACKER", skill: "エンドオブオール", ignoresDefense: false },
  { label: "闇ウルフ", templateId: "wolf", element: "DARK", preset: "MAX_ATTACKER", skill: "シャドウレンド", ignoresDefense: false },
];

const ALL_DEFENDERS: DefenderSpec[] = [
  { label: "ベヒモス[水]", templateId: "behemoth", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP型" },
  { label: "ミミック[水]", templateId: "mimic", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP型" },
  { label: "フェニックス[水]", templateId: "phoenix", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP型" },
  { label: "トレント[闇]", templateId: "treant", element: "DARK", preset: "HP_SCALE_ENDURE", group: "HP型" },
  { label: "グレイヴナイト[水]", templateId: "knight", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF型" },
  { label: "シェルタートル[水]", templateId: "shellturtle", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF型" },
  { label: "ゴーレム[水]", templateId: "golem", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF型" },
];

const KEY_DEFENDERS: DefenderSpec[] = [
  { label: "HP型(ミミック)", templateId: "mimic", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP型" },
  { label: "超HP(ベヒモス最良)", templateId: "behemoth", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP型", seedPick: "MAX_HP" },
  { label: "DEF型(グレイヴナイト)", templateId: "knight", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF型" },
  { label: "超DEF(シェルタートル最良)", templateId: "shellturtle", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF型", seedPick: "MAX_DEF" },
];

const SEED = 4242;
const baseDef = (spec: Subject, seed: number): MonsterDefinition =>
  buildAlly({ label: spec.label, templateId: spec.templateId, element: spec.element, preset: spec.preset }, mulberry32(seed));

const pickedSeed = new Map<string, number>();
function seedOf(spec: DefenderSpec): number {
  if (!spec.seedPick) return SEED + 1;
  const key = `${spec.templateId}:${spec.seedPick}`;
  if (!pickedSeed.has(key)) {
    let best = SEED + 1;
    let bestValue = -1;
    for (let i = 0; i < 30; i += 1) {
      const unit = createBattleUnit(baseDef(spec, 2000 + i), "ENEMY", "probe");
      const value = spec.seedPick === "MAX_HP" ? unit.maxHp : getEffectiveStat(unit, "def");
      if (value > bestValue) { bestValue = value; best = 2000 + i; }
    }
    pickedSeed.set(key, best);
  }
  return pickedSeed.get(key)!;
}

const accessoryOf = new WeakMap<BattleUnit, Accessory>();
const unitCache = new Map<string, BattleUnit>();

function equip(def: MonsterDefinition, acc: Accessory, team: "PLAYER" | "ENEMY", id: string): BattleUnit {
  const stats = { ...def.stats };
  if (acc.main === "ATK") stats.atk += acc.mainValue;
  if (acc.main === "HP") stats.hp += acc.mainValue;
  if (acc.main === "DEF") stats.def += acc.mainValue;
  // 割合は**メイン加算の後**に掛ける(「アクセサリー装着後の最大HPを割合増加」)
  stats.hp = Math.round(stats.hp * (1 + sv(acc, "MAX_HP") + wv(acc, "W_MAX_HP")));
  stats.def = Math.round(stats.def * (1 + sv(acc, "DEF_UP") + wv(acc, "W_DEF")));
  const mods = { ...DEFAULT_COMBAT_MODIFIERS, ...(def.combatMods ?? {}) };
  const unit = createBattleUnit({ ...def, stats, combatMods: mods }, team, id);
  accessoryOf.set(unit, acc);
  return unit;
}

function attackerUnit(spec: AttackerSpec, acc: Accessory, seed = SEED): BattleUnit {
  const key = `A:${spec.templateId}:${seed}:${JSON.stringify(acc)}`;
  if (!unitCache.has(key)) unitCache.set(key, equip(baseDef(spec, seed), acc, "PLAYER", `atk_${spec.templateId}`));
  return unitCache.get(key)!;
}
function defenderUnit(spec: DefenderSpec, acc: Accessory, seed?: number): BattleUnit {
  const s = seed ?? seedOf(spec);
  const key = `D:${spec.templateId}:${s}:${JSON.stringify(acc)}`;
  if (!unitCache.has(key)) unitCache.set(key, equip(baseDef(spec, s), acc, "ENEMY", `def_${spec.templateId}`));
  return unitCache.get(key)!;
}

function skillEffect(attacker: BattleUnit, spec: AttackerSpec): DamageEffect {
  const skill = attacker.def.skills.find((s) => s?.name === spec.skill);
  const effect = skill?.effects.find((e): e is DamageEffect => e.kind === "DAMAGE");
  if (!effect) throw new Error(`${spec.skill} が無い`);
  return effect;
}

/* ================================================================ 解決 */

type Condition = "素" | "攻撃UP" | "防御DOWN" | "攻撃UP+防御DOWN";
const CONDITIONS: Condition[] = ["素", "攻撃UP", "防御DOWN", "攻撃UP+防御DOWN"];
/*
 * 完全防御無視の技は、防御DOWNでダメージは変わらない。ただし**弱体としては数えられる**ので
 * 「弱体中の敵へ」の特殊効果の条件にはなる。見出しでそれと分かるようにする。
 */
const condLabel = (spec: AttackerSpec, c: Condition) =>
  spec.ignoresDefense ? c.replace("防御DOWN", "弱体あり") : c;

interface Setup {
  condition: Condition;
  /** 弱体の数を3つにする(弱体3個以上の条件を見る時だけ) */
  threeDebuffs?: boolean;
  /** 相手の残りHP(割合)。敵HP条件を見る時だけ下げる */
  targetHpRatio?: number;
}

function prepare(attacker: BattleUnit, defender: BattleUnit, setup: Setup): void {
  attacker.effects = [];
  defender.effects = [];
  const c = setup.condition;
  if (c === "攻撃UP" || c === "攻撃UP+防御DOWN") applyStatEffect(attacker, "atk", ATK_UP, 2, "BUFF");
  if (c === "防御DOWN" || c === "攻撃UP+防御DOWN") applyStatEffect(defender, "def", -DEF_DOWN, 2, "DEBUFF");
  if (setup.threeDebuffs) {
    // 攻撃DOWN・速度DOWNは受けるダメージに影響しない。弱体の数だけを増やす
    applyStatEffect(defender, "atk", -ATK_DOWN, 2, "DEBUFF");
    applyStatEffect(defender, "spd", -SPD_DOWN, 2, "DEBUFF");
  }
}

/** このHitに掛かる、攻撃アクセの与ダメ倍率 */
function attackFactor(attacker: BattleUnit, defender: BattleUnit, hitIndex: number, firstAttack: boolean): { factor: number; parts: Partial<Record<SpecialKey, number>> } {
  const acc = accessoryOf.get(attacker) ?? NONE;
  const selfRatio = attacker.currentHp / attacker.maxHp;
  const targetRatio = defender.currentHp / defender.maxHp;
  const debuffs = countDebuffs(defender);
  const active: Partial<Record<SpecialKey, number>> = {};
  const on = (k: SpecialKey, when: boolean) => { if (when && sv(acc, k) > 0) active[k] = sv(acc, k); };
  on("ELEM", acc.targetElement === defender.def.element);
  on("S3", true);
  on("SELF_HP70", selfRatio >= 0.7);
  on("SELF_HP50", selfRatio >= 0.5);
  on("SELF_HP30", selfRatio <= 0.3);
  on("ENEMY_HP30", targetRatio <= 0.3);
  on("ENEMY_HP20", targetRatio <= 0.2);
  on("DEBUFF1", debuffs >= 1);
  on("DEBUFF3", debuffs >= 3);
  on("MULTI2", hitIndex >= 1);
  on("MULTI3", hitIndex >= 2);
  on("FIRST", firstAttack);
  const values = Object.values(active) as number[];
  const finish = targetRatio <= 0.2 ? wv(acc, "FINISH") : 0;
  if (finish > 0) values.push(finish);
  return { factor: combine(values, acc.stacking, 1), parts: active };
}

/** このHitに掛かる、防御アクセの被ダメ倍率 */
function defenseFactor(defender: BattleUnit, crit: boolean): number {
  const acc = accessoryOf.get(defender) ?? NONE;
  const ratio = defender.currentHp / defender.maxHp;
  const values = [
    sv(acc, "DMG_TAKEN"),
    wv(acc, "W_DMG_TAKEN"),
    crit ? sv(acc, "CRIT_TAKEN") : 0,
    crit ? wv(acc, "W_CRIT_TAKEN") : 0,
    ratio <= 0.5 ? sv(acc, "LOW50") : 0,
    ratio <= 0.3 ? sv(acc, "LOW30") : 0,
    ratio <= 0.3 ? wv(acc, "W_LOW30") : 0,
  ];
  return combine(values, acc.stacking, -1);
}

/** 本番の calcDamage を1Hitぶん。与ダメ倍率は本番の口(damageDealtMultiplier)に入れる */
function rawHit(attacker: BattleUnit, defender: BattleUnit, effect: DamageEffect, crit: boolean, dealt: number): number {
  const original = attacker.def;
  const mods = original.combatMods ?? DEFAULT_COMBAT_MODIFIERS;
  (attacker as { def: MonsterDefinition }).def = { ...original, combatMods: { ...mods, damageDealtMultiplier: mods.damageDealtMultiplier * dealt } };
  // クリ率が100%に届く個体は非クリを起こせないので、非クリを測る時だけ0へ下げる
  const savedCrit = attacker.flatStatBonus.criRate;
  if (!crit) attacker.flatStatBonus.criRate = -10;
  const result = calcDamage(attacker, defender, { ...effect, hits: 1 }, () => (crit ? 0 : 0.999999));
  if (savedCrit === undefined) delete attacker.flatStatBonus.criRate; else attacker.flatStatBonus.criRate = savedCrit;
  (attacker as { def: MonsterDefinition }).def = original;
  if (result.isCrit !== crit || result.isGlancing) throw new Error("会心/かすりの固定に失敗した");
  return result.damage;
}

/** 着弾。本番の applyIncomingDamage と同じく、潜在の倍率 × 被ダメ軽減(パッシブ)を掛けて丸める */
function land(defender: BattleUnit, damage: number, crit: boolean): number {
  const latent = Math.max(0, Math.min(1, defender.def.latentAbility?.damageTakenMultiplier ?? 1));
  return Math.round(damage * latent * damageTakenMultiplier(defender, false) * defenseFactor(defender, crit));
}

interface Resolution {
  /** 1回目のスキルで与えた量。シールドへ吸われたぶんと、**倒れた後のHitも含む**(潜在量) */
  firstTotal: number;
  firstHitRaw: number;
  firstHitLanded: number;
  /** 1回目で倒れたか(本番どおり、倒れた所で打ち切って判定) */
  oneShot: boolean;
  /** 倒すまでのスキル使用回数(30回で打ち切り) */
  uses: number;
  hp: number;
  def: number;
  atk: number;
  critRate: number;
  critDmg: number;
  startShield: number;
  /** 追撃(弱効果)が発動した場合の1回目の合計 */
  firstTotalWithFollowup: number;
  oneShotWithFollowup: boolean;
}

/**
 * 満タンの相手へ、倒れるまでスキルを撃ち続ける。**相手は回復しない。**
 * 1Hitずつ残りHP・シールドを減らし、条件はそのHitの直前の状態で判定する(本番と同じ)。
 */
function resolve(attacker: BattleUnit, spec: AttackerSpec, defender: BattleUnit, setup: Setup, crit: boolean, followup = false): Resolution {
  prepare(attacker, defender, setup);
  const effect = skillEffect(attacker, spec);
  const hits = Math.max(1, Math.floor(effect.hits ?? 1));
  const dacc = accessoryOf.get(defender) ?? NONE;
  const aacc = accessoryOf.get(attacker) ?? NONE;
  const startShield = Math.round(defender.maxHp * (sv(dacc, "SHIELD_START") + wv(dacc, "W_START_SHIELD")));
  const startRatio = setup.targetHpRatio ?? 1;

  let hp = Math.floor(defender.maxHp * startRatio);
  let shield = startRatio >= 1 ? startShield : 0;
  let shield50Used = startRatio <= 0.5;
  let firstTotal = 0;
  let firstHitRaw = 0;
  let firstHitLanded = 0;
  let uses = 0;
  let firstTotalWithFollowup = 0;
  let oneShotWithFollowup = false;
  const applyDamage = (amount: number) => {
    const absorbed = Math.min(shield, amount);
    shield -= absorbed;
    hp -= amount - absorbed;
    if (!shield50Used && hp > 0 && hp <= defender.maxHp * 0.5 && sv(dacc, "SHIELD50") > 0) {
      shield += Math.round(defender.maxHp * sv(dacc, "SHIELD50"));
      shield50Used = true;
    }
  };
  let oneShot = false;
  while (hp > 0 && uses < 30) {
    uses += 1;
    /*
     * 1回目だけは、**倒れた後のHitも数える**(削り率の「潜在量」)。
     * 本番は倒れたところで残りのHitを打ち切るので、打ち切ったまま数えると
     * 強い組ほど削り率が小さく出る(1Hit目で倒すと2Hit目のぶんが消える)。
     * 「1回で倒れるか」は打ち切りのまま、本番どおりに判定する。
     */
    for (let h = 0; h < hits && (hp > 0 || uses === 1); h += 1) {
      defender.currentHp = Math.max(1, hp);
      const { factor } = attackFactor(attacker, defender, h, uses === 1);
      const raw = rawHit(attacker, defender, effect, crit, factor);
      const landed = land(defender, raw, crit);
      if (uses === 1) {
        firstTotal += landed;
        if (h === 0) { firstHitRaw = raw; firstHitLanded = landed; }
      }
      if (hp > 0) applyDamage(landed);
    }
    if (uses === 1) oneShot = hp <= 0;
    if (uses === 1) {
      firstTotalWithFollowup = firstTotal;
      oneShotWithFollowup = hp <= 0;
      // 弱効果「小さな追撃」が発動した場合。ATK×0.15〜0.20 の追加の1Hit(アクセの与ダメは乗せない)
      if (followup && hp > 0 && wv(aacc, "FOLLOWUP") > 0) {
        defender.currentHp = hp;
        const raw = rawHit(attacker, defender, { kind: "DAMAGE", multiplier: wv(aacc, "FOLLOWUP") }, crit, 1);
        const landed = land(defender, raw, crit);
        firstTotalWithFollowup += landed;
        oneShotWithFollowup = hp - Math.max(0, landed - shield) <= 0;
      }
    }
  }
  const result: Resolution = {
    firstTotal, firstHitRaw, firstHitLanded,
    oneShot,
    uses: hp <= 0 ? uses : 99,
    hp: defender.maxHp,
    def: getEffectiveStat(defender, "def"),
    atk: getEffectiveStat(attacker, "atk"),
    critRate: getFinalCritRate(attacker, defender),
    critDmg: getEffectiveStat(attacker, "criDmg"),
    startShield,
    firstTotalWithFollowup,
    oneShotWithFollowup,
  };
  attacker.effects = [];
  defender.effects = [];
  defender.currentHp = defender.maxHp;
  return result;
}

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

/* ================================================================ 組み合わせ */

const ATK_MAIN = 2_000;
const HP_MAIN = 5_000;
const DEF_MAIN = 750;

/*
 * 攻撃側の「そのモンスターに噛み合う」組み合わせ。先頭から順に、ヒーロー=1個、レジェンド=2個、エピック=3個。
 * 対象属性は、防御側の多い「水」を狙う(トレントは闇なので外れる)。
 */
const ATK_PATTERNS: Record<string, { name: string; specials: SpecialKey[]; weak: WeakKey }[]> = {
  dragon: [
    { name: "S3属性", specials: ["S3", "ELEM", "SELF_HP70"], weak: "FOLLOWUP" },
    { name: "初撃", specials: ["S3", "FIRST", "ELEM"], weak: "FOLLOWUP" },
    { name: "弱体", specials: ["S3", "ELEM", "DEBUFF1"], weak: "FOLLOWUP" },
  ],
  nemesis: [
    { name: "S3多段属性", specials: ["S3", "MULTI2", "ELEM"], weak: "FOLLOWUP" },
    { name: "S3多段弱体", specials: ["S3", "MULTI2", "DEBUFF1"], weak: "FOLLOWUP" },
    { name: "開幕", specials: ["S3", "FIRST", "SELF_HP70"], weak: "FOLLOWUP" },
  ],
  wolf: [
    { name: "S3多段弱体", specials: ["S3", "MULTI2", "DEBUFF1"], weak: "FOLLOWUP" },
    { name: "S3三段目属性", specials: ["S3", "MULTI3", "ELEM"], weak: "FOLLOWUP" },
    { name: "開幕", specials: ["S3", "FIRST", "SELF_HP70"], weak: "FOLLOWUP" },
  ],
};

/* 耐久側。HP型とDEF型で分ける。DEF増加は防御無視(闇ドラゴン)には効かない */
const DEF_PATTERNS: Record<"HP型" | "DEF型", { name: string; specials: SpecialKey[] }[]> = {
  HP型: [
    { name: "被ダメ・HP・クリ", specials: ["DMG_TAKEN", "MAX_HP", "CRIT_TAKEN"] },
    { name: "被ダメ・クリ・開始盾", specials: ["DMG_TAKEN", "CRIT_TAKEN", "SHIELD_START"] },
    { name: "被ダメ・クリ・低HP50", specials: ["DMG_TAKEN", "CRIT_TAKEN", "LOW50"] },
    { name: "クリ・HP・50%盾", specials: ["CRIT_TAKEN", "MAX_HP", "SHIELD50"] },
  ],
  DEF型: [
    { name: "被ダメ・DEF・クリ", specials: ["DMG_TAKEN", "DEF_UP", "CRIT_TAKEN"] },
    { name: "被ダメ・クリ・HP", specials: ["DMG_TAKEN", "CRIT_TAKEN", "MAX_HP"] },
    { name: "被ダメ・クリ・低HP50", specials: ["DMG_TAKEN", "CRIT_TAKEN", "LOW50"] },
    { name: "DEF・クリ・開始盾", specials: ["DEF_UP", "CRIT_TAKEN", "SHIELD_START"] },
  ],
};

/** 防御弱効果は、一撃に効くものの中で最も硬くなるものを後で選ぶ(9章の表で決める) */
let DEF_WEAK: WeakKey = "W_CRIT_TAKEN";

interface Stage {
  key: string;
  label: string;
  atk: (spec: AttackerSpec, p: number, stacking: Stacking) => Accessory;
  def: (spec: DefenderSpec, p: number, stacking: Stacking) => Accessory;
}

const mainAcc = (kind: "ATK" | "HP" | "DEF", value: number): Accessory => ({ ...NONE, main: kind, mainValue: value });
const defMain = (spec: DefenderSpec, mult = 1) => (spec.group === "HP型" ? mainAcc("HP", HP_MAIN * mult) : mainAcc("DEF", DEF_MAIN * mult));
const tierCount: Record<Tier, number> = { HERO: 1, LEGEND: 2, EPIC: 3 };

function atkTier(spec: AttackerSpec, p: number, tier: Tier, roll: Roll, mult: number, stacking: Stacking): Accessory {
  const pattern = ATK_PATTERNS[spec.templateId][p];
  return { main: "ATK", mainValue: ATK_MAIN * mult, specials: pattern.specials.slice(0, tierCount[tier]), tier, weak: pattern.weak, roll, stacking, targetElement: "WATER" };
}
function defTier(spec: DefenderSpec, p: number, tier: Tier, roll: Roll, mult: number, stacking: Stacking): Accessory {
  const pattern = DEF_PATTERNS[spec.group][p];
  return { ...defMain(spec, mult), specials: pattern.specials.slice(0, tierCount[tier]), tier, weak: DEF_WEAK, roll, stacking };
}

const STAGES: Stage[] = [
  { key: "1", label: "アクセなし同士", atk: () => NONE, def: () => NONE },
  { key: "2", label: "メインのみ(ATK+2,000 / HP+5,000・DEF+750)", atk: () => mainAcc("ATK", ATK_MAIN), def: (d) => defMain(d) },
  { key: "3", label: "ヒーロー同士(特殊1+弱1、中央値)", atk: (s, p, st) => atkTier(s, p, "HERO", "STD", 1, st), def: (d, p, st) => defTier(d, p, "HERO", "STD", 1, st) },
  { key: "4", label: "レジェンド同士(特殊2+弱1、中央値)", atk: (s, p, st) => atkTier(s, p, "LEGEND", "STD", 1, st), def: (d, p, st) => defTier(d, p, "LEGEND", "STD", 1, st) },
  { key: "5", label: "エピック同士(特殊3+弱1、中央値)", atk: (s, p, st) => atkTier(s, p, "EPIC", "STD", 1, st), def: (d, p, st) => defTier(d, p, "EPIC", "STD", 1, st) },
  { key: "6", label: "最上位同士(メイン×1.2+理想エピック、特殊・弱とも上限)", atk: (s, p, st) => atkTier(s, p, "EPIC", "MAX", 1.2, st), def: (d, p, st) => defTier(d, p, "EPIC", "MAX", 1.2, st) },
  { key: "6A", label: "攻撃側だけ最上位(防御はメインのみ)", atk: (s, p, st) => atkTier(s, p, "EPIC", "MAX", 1.2, st), def: (d) => defMain(d) },
  { key: "6D", label: "防御側だけ最上位(攻撃はメインのみ)", atk: () => mainAcc("ATK", ATK_MAIN), def: (d, p, st) => defTier(d, p, "EPIC", "MAX", 1.2, st) },
];

/** 攻撃は最も通る組、防御は最も通さない組を選ぶ(壊れているかの上限を見る) */
function bestPair(spec: AttackerSpec, d: DefenderSpec, stage: Stage, setup: Setup, stacking: Stacking, seed?: number): { ap: number; dp: number } {
  const aChoices = stage.key === "1" || stage.key === "2" || stage.key === "6D" ? [0] : [0, 1, 2];
  const dChoices = stage.key === "1" || stage.key === "2" || stage.key === "6A" ? [0] : [0, 1, 2, 3];
  let worstForAttack = { ap: 0, dp: 0, value: Infinity };
  for (const dp of dChoices) {
    let best = { ap: 0, value: -Infinity };
    for (const ap of aChoices) {
      const r = resolve(attackerUnit(spec, stage.atk(spec, ap, stacking)), spec, defenderUnit(d, stage.def(d, dp, stacking), seed), setup, true);
      const value = r.firstTotal / (r.hp + r.startShield);
      if (value > best.value) best = { ap, value };
    }
    if (best.value < worstForAttack.value) worstForAttack = { ap: best.ap, dp, value: best.value };
  }
  return { ap: worstForAttack.ap, dp: worstForAttack.dp };
}

/* ================================================================ 出力 */

console.log("# アクセサリー特殊効果込みの検証\n");
console.log(`防御式 1000/(1000+${balanceFlags.swRatio}×DEF) / 属性 ${balanceFlags.elementMode}方式 / 攻撃UP ${ATK_UP * 100}% / 防御DOWN ${DEF_DOWN * 100}%(いずれも本番の statusValues.ts)`);
console.log("攻撃側・防御側とも ★6 Lv60 / スキルLv最大 / タイプ転生 / 能力100 / 潜在 / ★6+15(前回と同じ型紙)。才能覚醒は含まない。\n");

console.log("## 0. 使った特殊効果と値\n");
console.log("「中央値」はその段の幅の真ん中、「上限」は幅の上端。**過去案**は依頼主の設計値、**検証仮値**は過去案に数値が無いもの、**検証候補**は防御型の今回だけの案。\n");
console.log("| 効果 | 区分 | ヒーロー | レジェンド | エピック | 注記 |");
console.log("|---|---|---|---|---|---|");
for (const s of Object.values(SPECIALS)) {
  const r = (t: Tier) => `${s.ranges[t][0] * 100}〜${s.ranges[t][1] * 100}%`;
  console.log(`| ${s.label} | ${s.source} | ${r("HERO")} | ${r("LEGEND")} | ${r("EPIC")} | ${s.note} |`);
}
console.log("\n| 弱効果 | 区分 | 値 | 注記 |");
console.log("|---|---|---|---|");
for (const w of Object.values(WEAKS)) console.log(`| ${w.label} | ${w.source} | ${w.range[0] * 100}〜${w.range[1] * 100}% | ${w.note} |`);
console.log("\n攻撃弱効果の「初撃補助」「連撃補助」は過去案に数値が無いので、使っていない。「会心余熱」「撃破余韻」は行動ゲージで、一撃のダメージには出ない。\n");

/* ---------------------------------------------------------------- 1. 防御弱効果の比較 */

console.log("## 1. 防御弱効果の比較(どれが体感できて壊れにくいか)\n");
console.log("闇ネメシス(ATK+2,000)の S3 クリ1回を、HP+5,000 のミミック / DEF+750 の超DEF が受けた時の、弱効果(上限値)による被ダメの変化。\n");
console.log("| 弱効果 | HP型(ミミック)・素 | HP型・防御DOWN | 超DEF・素 | 超DEF・防御DOWN | 一撃に効くか |");
console.log("|---|---:|---:|---:|---:|---|");
{
  const spec = ATTACKERS[1];
  const weakKeys: WeakKey[] = ["W_DMG_TAKEN", "W_CRIT_TAKEN", "W_MAX_HP", "W_DEF", "W_START_SHIELD", "W_LOW30", "W_TURN_HEAL"];
  const scores: { key: WeakKey; total: number }[] = [];
  for (const key of weakKeys) {
    let total = 0;
    const cells = [[KEY_DEFENDERS[0], "素"], [KEY_DEFENDERS[0], "防御DOWN"], [KEY_DEFENDERS[3], "素"], [KEY_DEFENDERS[3], "防御DOWN"]].map(([d, c]) => {
      const def = d as DefenderSpec;
      const base = resolve(attackerUnit(spec, mainAcc("ATK", ATK_MAIN)), spec, defenderUnit(def, defMain(def)), { condition: c as Condition }, true);
      const withWeak = resolve(attackerUnit(spec, mainAcc("ATK", ATK_MAIN)), spec, defenderUnit(def, { ...defMain(def), weak: key, roll: "MAX" }), { condition: c as Condition }, true);
      const change = withWeak.firstTotal / (withWeak.hp + withWeak.startShield) / (base.firstTotal / (base.hp + base.startShield)) - 1;
      total += change;
      return signed(change);
    });
    scores.push({ key, total });
    const direct = !["W_LOW30", "W_TURN_HEAL"].includes(key);
    console.log(`| ${WEAKS[key].label} | ${cells.join(" | ")} | ${direct ? "効く" : "効かない(条件・長期戦)"} |`);
  }
  scores.sort((a, b) => a.total - b.total);
  DEF_WEAK = scores[0].key;
  console.log(`\n以降の防御側の弱効果は、この表で最も効いた **${WEAKS[DEF_WEAK].label}** を使う(防御側に最も有利な選び方)。\n`);
}

/* ---------------------------------------------------------------- 2. 1個ずつの寄与 */

console.log("## 2. 特殊効果1個ずつの寄与(エピック中央値)\n");
console.log("攻撃側 ATK+2,000、防御側 HP+5,000 / DEF+750。**その効果を足した時に、スキル1回・クリの削り率が何%変わるか**。条件が成立しない場面は0になる。\n");
{
  const cols: { label: string; d: DefenderSpec; setup: Setup }[] = [
    { label: "HP型・素", d: KEY_DEFENDERS[0], setup: { condition: "素" } },
    { label: "HP型・防御DOWN", d: KEY_DEFENDERS[0], setup: { condition: "防御DOWN" } },
    { label: "HP型・弱体3個", d: KEY_DEFENDERS[0], setup: { condition: "防御DOWN", threeDebuffs: true } },
    { label: "HP型・敵HP30%", d: KEY_DEFENDERS[0], setup: { condition: "素", targetHpRatio: 0.3 } },
    { label: "HP型・敵HP20%", d: KEY_DEFENDERS[0], setup: { condition: "素", targetHpRatio: 0.2 } },
    { label: "超DEF・素", d: KEY_DEFENDERS[3], setup: { condition: "素" } },
    { label: "超DEF・防御DOWN", d: KEY_DEFENDERS[3], setup: { condition: "防御DOWN" } },
  ];
  const ratio = (r: Resolution, start: number) => r.firstTotal / (r.hp * start + (start >= 1 ? r.startShield : 0));
  for (const spec of [ATTACKERS[1], ATTACKERS[2]]) {
    console.log(`### 攻撃特殊(${spec.label}「${spec.skill}」)\n`);
    console.log(`| 効果 | 区分 | ${cols.map((c) => c.label).join(" | ")} |`);
    console.log(`|---|---|${cols.map(() => "---:").join("|")}|`);
    const keys: SpecialKey[] = ["S3", "ELEM", "MULTI2", "MULTI3", "FIRST", "SELF_HP70", "SELF_HP50", "SELF_HP30", "DEBUFF1", "DEBUFF3", "ENEMY_HP30", "ENEMY_HP20"];
    for (const key of keys) {
      const cells = cols.map((c) => {
        const start = c.setup.targetHpRatio ?? 1;
        const withAcc: Accessory = { ...mainAcc("ATK", ATK_MAIN), specials: [key], tier: "EPIC", targetElement: "WATER" };
        const a = resolve(attackerUnit(spec, withAcc), spec, defenderUnit(c.d, defMain(c.d)), c.setup, true);
        const b = resolve(attackerUnit(spec, mainAcc("ATK", ATK_MAIN)), spec, defenderUnit(c.d, defMain(c.d)), c.setup, true);
        return signed(ratio(a, start) / ratio(b, start) - 1);
      });
      console.log(`| ${SPECIALS[key].label} | ${SPECIALS[key].source} | ${cells.join(" | ")} |`);
    }
    console.log("");
  }
  console.log("### 防御特殊(攻撃側 闇ネメシス)\n");
  const dcols: { label: string; d: DefenderSpec; setup: Setup; crit: boolean }[] = [
    { label: "HP型・素・クリ", d: KEY_DEFENDERS[0], setup: { condition: "素" }, crit: true },
    { label: "HP型・素・非クリ", d: KEY_DEFENDERS[0], setup: { condition: "素" }, crit: false },
    { label: "HP型・防御DOWN", d: KEY_DEFENDERS[0], setup: { condition: "防御DOWN" }, crit: true },
    { label: "HP型・自HP50%から", d: KEY_DEFENDERS[0], setup: { condition: "素", targetHpRatio: 0.5 }, crit: true },
    { label: "DEF型・素", d: KEY_DEFENDERS[2], setup: { condition: "素" }, crit: true },
    { label: "超DEF・素", d: KEY_DEFENDERS[3], setup: { condition: "素" }, crit: true },
    { label: "超DEF・防御DOWN", d: KEY_DEFENDERS[3], setup: { condition: "防御DOWN" }, crit: true },
  ];
  console.log(`| 効果 | ${dcols.map((c) => c.label).join(" | ")} |`);
  console.log(`|---|${dcols.map(() => "---:").join("|")}|`);
  const spec = ATTACKERS[1];
  for (const key of ["DMG_TAKEN", "CRIT_TAKEN", "MAX_HP", "DEF_UP", "LOW50", "LOW30", "SHIELD_START", "SHIELD50"] as SpecialKey[]) {
    const cells = dcols.map((c) => {
      const start = c.setup.targetHpRatio ?? 1;
      const a = resolve(attackerUnit(spec, mainAcc("ATK", ATK_MAIN)), spec, defenderUnit(c.d, { ...defMain(c.d), specials: [key], tier: "EPIC" }), c.setup, c.crit);
      const b = resolve(attackerUnit(spec, mainAcc("ATK", ATK_MAIN)), spec, defenderUnit(c.d, defMain(c.d)), c.setup, c.crit);
      return signed(ratio(a, start) / ratio(b, start) - 1);
    });
    console.log(`| ${SPECIALS[key].label} | ${cells.join(" | ")} |`);
  }
  console.log("\n闇ドラゴン(完全防御無視)に対する DEF増加 の寄与は 0%(防御を見ないため)。\n");
}

/* ---------------------------------------------------------------- 3. 重ね方: 加算か乗算か */

console.log("## 3. 特殊効果どうしの重ね方: 加算と乗算\n");
console.log("最上位同士(6)の組み合わせで、攻撃特殊どうし・防御特殊どうしを「加算」「乗算」で重ねた時の、スキル1回・クリの削り率。\n");
console.log("| 攻撃側 | 防御側 | 条件 | 攻撃=加算 / 防御=加算 | 攻撃=乗算 / 防御=乗算 | 攻撃=加算 / 防御=乗算 | 攻撃=乗算 / 防御=加算 |");
console.log("|---|---|---|---:|---:|---:|---:|");
for (const spec of ATTACKERS) {
  for (const d of KEY_DEFENDERS) {
    for (const c of ["素", "攻撃UP+防御DOWN"] as Condition[]) {
      const stage = STAGES.find((s) => s.key === "6")!;
      const { ap, dp } = bestPair(spec, d, stage, { condition: c }, "ADD");
      const cells = ([["ADD", "ADD"], ["MUL", "MUL"], ["ADD", "MUL"], ["MUL", "ADD"]] as [Stacking, Stacking][]).map(([as, ds]) => {
        const r = resolve(attackerUnit(spec, stage.atk(spec, ap, as)), spec, defenderUnit(d, stage.def(d, dp, ds)), { condition: c }, true);
        return pct(r.firstTotal / (r.hp + r.startShield));
      });
      console.log(`| ${spec.label} | ${d.label} | ${condLabel(spec, c)} | ${cells.join(" | ")} |`);
    }
  }
}
console.log("\n以降は **攻撃=加算 / 防御=乗算** で測る(どちらも重ねた時に小さくなる側 = 壊れにくい方式)。\n");
const STACK_ATK: Stacking = "ADD";
const STACK_DEF: Stacking = "MUL";

/* ---------------------------------------------------------------- 4. 段階ごとの詳細 */

console.log("## 4. 段階ごとの詳細(1〜6)\n");
console.log("攻撃は最も通る組、防御は最も通さない組を選んだ場合。**削り率**はスキル1回・着弾後の合計 ÷ (最大HP+開始時シールド)。**撃破回数**は満タンから倒すまでのスキル使用回数(相手は回復しない)。**特殊増減**は同じ段のメインだけの時との比(攻撃特殊の寄与 / 防御特殊の寄与)。\n");
console.log("| 段階 | 攻撃側 | 攻撃の組 | 防御側 | 防御の組 | 条件 | 攻撃 HP/ATK/DEF | クリ率 | クリダメ | 防御 HP/DEF | 開始盾 | 非クリ1Hit | クリ1Hit | 削り率 非クリ/クリ | 撃破回数 非クリ/クリ | 特殊増減 攻/防 |");
console.log("|---|---|---|---|---|---|---|---:|---:|---|---:|---:|---:|---|---|---|");
for (const stage of STAGES) {
  for (const spec of ATTACKERS) {
    for (const d of KEY_DEFENDERS) {
      for (const c of CONDITIONS) {
        const { ap, dp } = bestPair(spec, d, stage, { condition: c }, STACK_ATK);
        const aAcc = stage.atk(spec, ap, STACK_ATK);
        const dAcc = stage.def(d, dp, STACK_DEF);
        const A = attackerUnit(spec, aAcc);
        const D = defenderUnit(d, dAcc);
        const nc = resolve(A, spec, D, { condition: c }, false);
        const cr = resolve(A, spec, D, { condition: c }, true);
        // 特殊効果の寄与: 同じメインで特殊・弱を外した場合との比
        const aMainOnly = attackerUnit(spec, { ...aAcc, specials: [], weak: null });
        const dMainOnly = defenderUnit(d, { ...dAcc, specials: [], weak: null });
        const rate = (r: Resolution) => r.firstTotal / (r.hp + r.startShield);
        const atkEffect = rate(resolve(A, spec, dMainOnly, { condition: c }, true)) / rate(resolve(aMainOnly, spec, dMainOnly, { condition: c }, true)) - 1;
        const defEffect = rate(resolve(aMainOnly, spec, D, { condition: c }, true)) / rate(resolve(aMainOnly, spec, dMainOnly, { condition: c }, true)) - 1;
        const aName = aAcc.specials.length ? ATK_PATTERNS[spec.templateId][ap].name : "-";
        const dName = dAcc.specials.length ? DEF_PATTERNS[d.group][dp].name : "-";
        console.log(`| ${stage.key} | ${spec.label} | ${aName} | ${d.label} | ${dName} | ${condLabel(spec, c)} | ${n(A.maxHp)} / ${n(getEffectiveStat(A, "atk"))} / ${n(getEffectiveStat(A, "def"))} | ${pct(cr.critRate)} | ${pct(cr.critDmg)} | ${n(cr.hp)} / ${n(D.def.stats.def)} | ${n(cr.startShield)} | ${n(nc.firstHitLanded)} | ${n(cr.firstHitLanded)} | ${pct(nc.firstTotal / (nc.hp + nc.startShield))} / ${pct(cr.firstTotal / (cr.hp + cr.startShield))}${cr.oneShot ? "★" : ""} | ${nc.uses} / ${cr.uses} | ${aAcc.specials.length ? signed(atkEffect) : "-"} / ${dAcc.specials.length ? signed(defEffect) : "-"} |`);
      }
    }
  }
}
console.log("\n★ = スキル1回で倒れる。攻撃HP/ATK/DEFは強化・弱体を入れる前の最終値。\n");

/* ---------------------------------------------------------------- 5. 900組 → ここでは 20×20 */

const PAIRS = 20;

/**
 * 攻撃側20個体 × 防御側20個体の全組で、クリ1回で倒れる割合と削り率の中央値。
 * 組み合わせ(攻撃の組・防御の組)は代表の個体で最悪の組を先に決め、全組で固定する。
 */
function pairStats(spec: AttackerSpec, d: DefenderSpec, stage: Stage, c: Condition): { killed: number; median: number; ap: number; dp: number } {
  const { ap, dp } = bestPair(spec, d, stage, { condition: c }, STACK_ATK);
  const aAcc = stage.atk(spec, ap, STACK_ATK);
  const dAcc = stage.def(d, dp, STACK_DEF);
  const ratios: number[] = [];
  let kills = 0;
  for (let i = 0; i < PAIRS; i += 1) {
    const attacker = attackerUnit(spec, aAcc, 1000 + i);
    for (let j = 0; j < PAIRS; j += 1) {
      const defender = defenderUnit(d, dAcc, 2000 + j);
      const r = resolve(attacker, spec, defender, { condition: c }, true);
      ratios.push(r.firstTotal / (r.hp + r.startShield));
      if (r.oneShot) kills += 1;
    }
  }
  ratios.sort((x, y) => x - y);
  return { killed: kills / ratios.length, median: ratios[Math.floor(ratios.length / 2)], ap, dp };
}

console.log(`## 5. 個体差込みの最終比較(攻撃側${PAIRS} × 防御側${PAIRS} = ${PAIRS * PAIRS}組)\n`);
console.log("1マス = **クリ1回で倒れる組の割合**(括弧内は削り率の中央値)。攻撃側のクリ率は9割を超えるので、実戦ではほぼこの値になる。\n");
for (const spec of ATTACKERS) {
  console.log(`### ${spec.label}\n`);
  console.log(`| 段階 | 防御側 | ${CONDITIONS.map((c) => condLabel(spec, c)).join(" | ")} |`);
  console.log(`|---|---|${CONDITIONS.map(() => "---:").join("|")}|`);
  for (const stage of STAGES) {
    for (const d of ALL_DEFENDERS) {
      const cells = CONDITIONS.map((c) => { const r = pairStats(spec, d, stage, c); return `${pct(r.killed)} (${pct(r.median)})`; });
      console.log(`| ${stage.key} | ${d.label} | ${cells.join(" | ")} |`);
    }
  }
  console.log("");
}

/* ---------------------------------------------------------------- 6. メイン候補 */

console.log("## 6. HP・DEF メイン候補の再確認(最上位同士、個体差込み)\n");
console.log("最上位同士(6)で、防御側のメインだけを振った。**そのメインを×1.2した値**を着ける。闇ネメシス・攻撃UP+防御DOWN(通常技が最も通る条件)。1マスはクリ1回で倒れる割合(削り率の中央値)。\n");
{
  const spec = ATTACKERS[1];
  const candidates: { label: string; kind: "HP" | "DEF"; value: number }[] = [
    { label: "HP+4,000", kind: "HP", value: 4_000 }, { label: "HP+5,000", kind: "HP", value: 5_000 }, { label: "HP+6,000", kind: "HP", value: 6_000 }, { label: "HP+7,000", kind: "HP", value: 7_000 },
    { label: "DEF+600", kind: "DEF", value: 600 }, { label: "DEF+750", kind: "DEF", value: 750 }, { label: "DEF+900", kind: "DEF", value: 900 }, { label: "DEF+1,000", kind: "DEF", value: 1_000 },
  ];
  for (const c of ["攻撃UP+防御DOWN", "素"] as Condition[]) {
    console.log(`\n**${c}**\n`);
    console.log(`| 防御側 | 型 | ${candidates.map((x) => x.label).join(" | ")} |`);
    console.log(`|---|---|${candidates.map(() => "---:").join("|")}|`);
    for (const d of ALL_DEFENDERS) {
      const cells = candidates.map((cand) => {
        const stage: Stage = {
          key: "6", label: "",
          atk: STAGES[5].atk,
          def: (dd, p, st) => ({ ...defTier(dd, p, "EPIC", "MAX", 1.2, st), main: cand.kind, mainValue: cand.value * 1.2 }),
        };
        const r = pairStats(spec, d, stage, c);
        return c === "素" ? pct(r.median) : `${pct(r.killed)} (${pct(r.median)})`;
      });
      console.log(`| ${d.label} | ${d.group} | ${cells.join(" | ")} |`);
    }
  }
}

/* ---------------------------------------------------------------- 7. 長期戦(回復) */

console.log("\n## 7. 長期戦: 回復(G)は積み上がるか\n");
console.log("一撃の表には出ないので、**毎ターン受けるダメージ(最大HP比)と毎ターンの回復(最大HP比)**から、倒れるまでのターン数を出す。回復は最大HP比例なので、最大HPを増やしても割合は変わらない(**指数的には伸びない**)。ただし、HP型の型紙は既に体力4セット(毎ターン最大HP5%回復)を持っている。\n");
console.log("| 毎ターンの被ダメ | 回復なし | 体力4セットのみ(5%) | +G 1% | +G 2% | +G 3% | +G 5% |");
console.log("|---:|---:|---:|---:|---:|---:|---:|");
for (const intake of [0.06, 0.08, 0.10, 0.15, 0.20, 0.30]) {
  const turns = (heal: number) => (intake - heal <= 0 ? "倒れない" : `${Math.ceil(1 / (intake - heal))}ターン`);
  console.log(`| ${pct(intake)} | ${turns(0)} | ${turns(0.05)} | ${turns(0.06)} | ${turns(0.07)} | ${turns(0.08)} | ${turns(0.10)} |`);
}
console.log("\n参考: 最上位同士(6)で、闇ネメシスのS3を4ターンに1回撃つと、ミミック・素なら1ターンあたり最大HPの約1割強。S1やほかの味方の攻撃は含まない。\n");

/* ---------------------------------------------------------------- 8. 小さな追撃 */

console.log("## 8. 攻撃弱効果「小さな追撃」が発動した場合(最上位同士)\n");
console.log("| 攻撃側 | 防御側 | 条件 | 追撃なし | 追撃あり | 1回で倒れるか(なし→あり) |");
console.log("|---|---|---|---:|---:|---|");
for (const spec of ATTACKERS) {
  for (const d of KEY_DEFENDERS) {
    for (const c of ["素", "攻撃UP+防御DOWN"] as Condition[]) {
      const stage = STAGES[5];
      const { ap, dp } = bestPair(spec, d, stage, { condition: c }, STACK_ATK);
      const r = resolve(attackerUnit(spec, stage.atk(spec, ap, STACK_ATK)), spec, defenderUnit(d, stage.def(d, dp, STACK_DEF)), { condition: c }, true, true);
      const base = r.hp + r.startShield;
      console.log(`| ${spec.label} | ${d.label} | ${condLabel(spec, c)} | ${pct(r.firstTotal / base)} | ${pct(r.firstTotalWithFollowup / base)} | ${r.oneShot ? "倒れる" : "倒れない"} → ${r.oneShotWithFollowup ? "倒れる" : "倒れない"} |`);
    }
  }
}
