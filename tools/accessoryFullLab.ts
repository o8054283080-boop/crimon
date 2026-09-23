/**
 * アクセサリーを**攻撃側も防御側も**着けた完成アリーナ環境の、一撃ぶんの測定。
 *
 * **検証専用。本番のデータには何も書かない。**前回の `accessoryAtkLab.ts` の続き。
 *
 * ## アクセサリーはまだ本番に無い
 *
 * リポジトリにもドキュメントにも、アクセサリーの仕様・特殊効果の候補は無い
 * (塔の検証資料に「将来のアクセサリーを見越して」とあるだけ)。
 * そこで特殊効果は**ここだけで仮実装**し、効果量は**既存の似た効果**に寄せる。
 * 本番に置く時の値を決めたものではない。
 *
 * ## 何を通しているか
 *
 * 前回と同じ。Battle Lab の `buildAlly`(createMonsterInstance → 装備 →
 * toBattleDefinition)→ `createBattleUnit` → **本編の `calcDamage`**。
 * 特殊効果は、本番に同じ働きの口があるものはその口へ入れる。
 *
 *   与ダメ増加        combatMods.damageDealtMultiplier(力4セット・才能覚醒と同じ口)
 *   被ダメ軽減        combatMods.damageTakenMultiplier(守護4セット・才能覚醒と同じ口)
 *   防御無視          combatMods.defenseIgnoreRatio(崩壊4セットと同じ口。エンジンと同じくスキルの無視率を大きい方で上書き)
 *   開始時シールド    combatMods.battleStartShieldPercent(障壁セットと同じ口。量はエンジンと同じ round(最大HP×割合))
 *   クリダメ          stats.criDmg への加算(会心4セットと同じ)
 *   最大HP・DEF       stats.hp / stats.def への掛け算
 *   敵HP条件の火力    スキル効果の targetHpBonus(既存の「HPが低い相手ほど」と同じ足し算の枠)
 *   弱体中の敵へ火力  スキル効果の conditionalBonus(TARGET_HAS_DEBUFF。同じ足し算の枠)
 *
 * 本番に口が無い2つだけ、ここで掛ける。
 *
 *   クリ被ダメ軽減    ジョーカー「イカサマ」と同じく、会心した一撃だけに (1-値) を掛ける
 *   HP50%以下で軽減   シェルタートル「最後の砦」と同じく、被ダメ軽減の合計へ足す(上限90%も同じ)
 *
 *   npx tsx tools/accessoryFullLab.ts > 結果.md
 */
import { calcDamage, getFinalCritRate } from "../src/battle/damage.js";
import {
  applyStatEffect,
  createBattleUnit,
  damageTakenMultiplier,
  getEffectiveStat,
  type BattleUnit,
} from "../src/battle/unit.js";
import type { DamageEffect } from "../src/core/skill.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { DEFAULT_COMBAT_MODIFIERS } from "../src/core/equipment.js";
import { ATK_UP, DEF_DOWN } from "../src/core/statusValues.js";
import { balanceFlags } from "../src/core/balanceFlags.js";
import { buildAlly } from "./battleLab/build.js";
import { PRESETS } from "./battleLab/presets.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { AllySpec, PresetName } from "./battleLab/types.js";

if (balanceFlags.defenseFormula !== "sw" || balanceFlags.elementMode !== "sw" || balanceFlags.swRatio !== 1.2) {
  throw new Error(`本番の既定ではない: ${JSON.stringify(balanceFlags)}`);
}

/* ================================================================ 仮の特殊効果 */

type AtkSpecial = "DMG_UP" | "CRIT_DMG" | "IGNORE_DEF" | "LOW_HP_TARGET" | "DEBUFFED_TARGET";
type DefSpecial = "DMG_TAKEN" | "CRIT_TAKEN" | "MAX_HP" | "DEF_UP" | "LAST_STAND" | "SHIELD";
type Special = AtkSpecial | DefSpecial;

/**
 * 特殊効果1個あたりの仮の値。**既存の似た効果より強くしない。**
 * 右の注記が根拠(同じ働きをする、いま本番にあるもの)。
 */
const SPECIAL_BASE: Record<Special, { value: number; label: string; basis: string }> = {
  DMG_UP: { value: 0.10, label: "与ダメ+10%", basis: "才能覚醒の与ダメ最大7% / 力4セット20%" },
  CRIT_DMG: { value: 0.20, label: "クリダメ+20%", basis: "会心4セット・クリダメUPバフ 30%" },
  IGNORE_DEF: { value: 0.15, label: "防御無視15%", basis: "潜在「攻勢」20% / 崩壊4セット 50%で50%" },
  LOW_HP_TARGET: { value: 0.15, label: "HP50%以下の敵へ与ダメ+15%", basis: "コボルト「獲物の匂い」8〜20%" },
  DEBUFFED_TARGET: { value: 0.12, label: "弱体中の敵へ与ダメ+12%", basis: "潜在「攻勢」弱体1個につき5%(最大25%)" },
  DMG_TAKEN: { value: 0.08, label: "被ダメ-8%", basis: "潜在「不屈装甲」8% / 才能覚醒 最大7%" },
  CRIT_TAKEN: { value: 0.15, label: "クリ被ダメ-15%", basis: "ジョーカー「イカサマ」30〜50%" },
  MAX_HP: { value: 0.08, label: "最大HP+8%", basis: "潜在「不屈装甲」10% / 体力2セット20%" },
  DEF_UP: { value: 0.10, label: "DEF+10%", basis: "潜在「不屈装甲」12% / 守護2セット20%" },
  LAST_STAND: { value: 0.12, label: "自HP50%以下で被ダメ-12%", basis: "シェルタートル「最後の砦」8〜15%" },
  SHIELD: { value: 0.08, label: "開始時シールド 最大HP8%", basis: "障壁2セット 8%" },
};

type MainKind = "ATK" | "HP" | "DEF";

interface Accessory {
  main: MainKind | null;
  /** 中央値。個体差の倍率 `roll` を掛けた値が乗る */
  mainValue: number;
  roll: number;
  specials: readonly Special[];
  /** 特殊効果1個の強さの倍率。感度を見るため(1 = 上の表どおり) */
  power?: number;
}

const NONE: Accessory = { main: null, mainValue: 0, roll: 1, specials: [] };

function specialValue(acc: Accessory, special: Special): number {
  return acc.specials.includes(special) ? SPECIAL_BASE[special].value * (acc.power ?? 1) : 0;
}

function describe(acc: Accessory): string {
  if (!acc.main && acc.specials.length === 0) return "なし";
  const main = acc.main ? `${acc.main}+${Math.round(acc.mainValue * acc.roll).toLocaleString("en-US")}` : "";
  const specials = acc.specials.map((s) => SPECIAL_BASE[s].label).join("・");
  const power = acc.power && acc.power !== 1 ? `(効果×${acc.power})` : "";
  return [main, specials].filter(Boolean).join(" + ") + power;
}

/* ================================================================ 個体 */

interface Subject {
  label: string;
  templateId: string;
  element: AllySpec["element"];
  preset: PresetName;
}

interface AttackerSpec extends Subject { skill: string; ignoresDefense: boolean }
interface DefenderSpec extends Subject { group: "HP特化" | "DEF特化"; seedPick?: "MAX_HP" | "MAX_DEF" }

/* 前回と同じ3体。防御側とは相性が中立(闇→水・闇→闇) */
const ATTACKERS: AttackerSpec[] = [
  { label: "闇ドラゴン", templateId: "dragon", element: "DARK", preset: "MAX_ATTACKER", skill: "破壊の流星", ignoresDefense: true },
  { label: "闇ネメシス", templateId: "nemesis", element: "DARK", preset: "MAX_ATTACKER", skill: "エンドオブオール", ignoresDefense: false },
  { label: "闇ウルフ", templateId: "wolf", element: "DARK", preset: "MAX_ATTACKER", skill: "シャドウレンド", ignoresDefense: false },
];

/*
 * 前回と同じ8体。**代表4体**を別に立てる。
 *
 * 「非常にHPが高い」「非常にDEFが高い」は、同じ型紙を30通りの種で作り、
 * その中で最もHP(DEF)が高く出た1体。装備の引きが一番良かった個体にあたる。
 */
const ALL_DEFENDERS: DefenderSpec[] = [
  { label: "ベヒモス[水]", templateId: "behemoth", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP特化" },
  { label: "ミミック[水]", templateId: "mimic", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP特化" },
  { label: "フェニックス[水]", templateId: "phoenix", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP特化" },
  { label: "トレント[闇]", templateId: "treant", element: "DARK", preset: "HP_SCALE_ENDURE", group: "HP特化" },
  { label: "グレイヴナイト[水]", templateId: "knight", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF特化" },
  { label: "シェルタートル[水]", templateId: "shellturtle", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF特化" },
  { label: "ゴーレム[水]", templateId: "golem", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF特化" },
];

const KEY_DEFENDERS: DefenderSpec[] = [
  { label: "HP特化(ミミック)", templateId: "mimic", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP特化" },
  { label: "超HP(ベヒモス最良)", templateId: "behemoth", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP特化", seedPick: "MAX_HP" },
  { label: "DEF特化(グレイヴナイト)", templateId: "knight", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF特化" },
  { label: "超DEF(シェルタートル最良)", templateId: "shellturtle", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF特化", seedPick: "MAX_DEF" },
];

const SEED = 4242;

function baseDef(spec: Subject, seed: number): MonsterDefinition {
  return buildAlly({ label: spec.label, templateId: spec.templateId, element: spec.element, preset: spec.preset }, mulberry32(seed));
}

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

/** アクセサリーを着けた戦闘単位。**本番に口があるものは、その口に入れる** */
const accessoryOf = new WeakMap<BattleUnit, Accessory>();
function equip(def: MonsterDefinition, acc: Accessory, team: "PLAYER" | "ENEMY", id: string): BattleUnit {
  const stats = { ...def.stats };
  const mainAmount = acc.mainValue * acc.roll;
  if (acc.main === "ATK") stats.atk += mainAmount;
  if (acc.main === "HP") stats.hp += mainAmount;
  if (acc.main === "DEF") stats.def += mainAmount;
  stats.hp = Math.round(stats.hp * (1 + specialValue(acc, "MAX_HP")));
  stats.def = Math.round(stats.def * (1 + specialValue(acc, "DEF_UP")));
  stats.criDmg += specialValue(acc, "CRIT_DMG");
  const mods = { ...DEFAULT_COMBAT_MODIFIERS, ...(def.combatMods ?? {}) };
  mods.damageDealtMultiplier *= 1 + specialValue(acc, "DMG_UP");
  mods.damageTakenMultiplier *= 1 - specialValue(acc, "DMG_TAKEN");
  const ignore = specialValue(acc, "IGNORE_DEF");
  if (ignore > 0) {
    mods.defenseIgnoreChance = 1;
    mods.defenseIgnoreRatio = Math.max(mods.defenseIgnoreRatio ?? 0, ignore);
  }
  const shield = specialValue(acc, "SHIELD");
  if (shield > 0) mods.battleStartShieldPercent = Math.max(mods.battleStartShieldPercent ?? 0, shield);
  const unit = createBattleUnit({ ...def, stats, combatMods: mods }, team, id);
  // 開始時シールド。エンジンの開始処理と同じ量(round(最大HP×割合))
  if ((mods.battleStartShieldPercent ?? 0) > 0) {
    unit.shieldValue = Math.round(unit.maxHp * (mods.battleStartShieldPercent ?? 0));
    unit.shieldTurns = (mods.battleStartShieldTurns ?? 0) + 1;
  }
  accessoryOf.set(unit, acc);
  return unit;
}

function attackerUnit(spec: AttackerSpec, acc: Accessory, seed = SEED): BattleUnit {
  return equip(baseDef(spec, seed), acc, "PLAYER", `atk_${spec.templateId}`);
}
function defenderUnit(spec: DefenderSpec, acc: Accessory, seed?: number): BattleUnit {
  return equip(baseDef(spec, seed ?? seedOf(spec)), acc, "ENEMY", `def_${spec.templateId}`);
}

/**
 * 攻撃側のスキル効果。アクセサリーの効果を足す。
 * 防御無視は**エンジンと同じ変換**(`engine.ts` の崩壊セットの処理)。
 */
function effectOf(attacker: BattleUnit, spec: AttackerSpec): DamageEffect {
  const skill = attacker.def.skills.find((s) => s?.name === spec.skill);
  const base = skill?.effects.find((e): e is DamageEffect => e.kind === "DAMAGE");
  if (!base) throw new Error(`${spec.skill} が無い`);
  const acc = accessoryOf.get(attacker) ?? NONE;
  const effect: DamageEffect = { ...base };
  const ratio = attacker.def.combatMods?.defenseIgnoreRatio ?? 0;
  if ((attacker.def.combatMods?.defenseIgnoreChance ?? 0) >= 1 && ratio > 0) {
    effect.ignoreDefenseRatio = Math.max(effect.ignoreDefenseRatio ?? 0, ratio);
  }
  const lowHp = specialValue(acc, "LOW_HP_TARGET");
  if (lowHp > 0) {
    if (effect.targetHpBonus?.length) throw new Error("既存の targetHpBonus と重なる(仮実装の前提が崩れる)");
    effect.targetHpBonus = [{ hpRatio: 0.5, bonus: lowHp }];
  }
  const debuffed = specialValue(acc, "DEBUFFED_TARGET");
  if (debuffed > 0) effect.conditionalBonus = [...(effect.conditionalBonus ?? []), { when: "TARGET_HAS_DEBUFF", bonus: debuffed }];
  return effect;
}

/* ================================================================ 1撃 */

type Condition = "素" | "攻撃UP" | "防御DOWN" | "攻撃UP+防御DOWN";
const CONDITIONS: Condition[] = ["素", "攻撃UP", "防御DOWN", "攻撃UP+防御DOWN"];
const conditionsFor = (spec: AttackerSpec): Condition[] => (spec.ignoresDefense ? ["素", "攻撃UP"] : CONDITIONS);

interface Hit {
  hits: number;
  normal: number;
  crit: number;
  /** 着弾後(潜在・パッシブ・アクセの軽減込み)、1Hitぶん */
  landedNormal: number;
  landedCrit: number;
  critRate: number;
  hp: number;
  current: number;
  shield: number;
  def: number;
  atk: number;
  critDmg: number;
}

function strike(attacker: BattleUnit, spec: AttackerSpec, defender: BattleUnit, condition: Condition, targetHpRatio = 1): Hit {
  attacker.effects = [];
  defender.effects = [];
  if (condition === "攻撃UP" || condition === "攻撃UP+防御DOWN") applyStatEffect(attacker, "atk", ATK_UP, 2, "BUFF");
  if (condition === "防御DOWN" || condition === "攻撃UP+防御DOWN") applyStatEffect(defender, "def", -DEF_DOWN, 2, "DEBUFF");
  // **切り捨て。**四捨五入だと最大HPが奇数の時に50.0004%になり、「50%以下」の条件を外す
  defender.currentHp = Math.floor(defender.maxHp * targetHpRatio);
  const effect = effectOf(attacker, spec);
  const hits = Math.max(1, Math.floor(effect.hits ?? 1));
  const once = (crit: boolean) => {
    /*
     * 装備の引きでクリ率が100%に届く個体がいる。その個体は**非クリを起こせない**ので、
     * 非クリを測る時だけクリ率を0へ下げる(クリ率はダメージ量そのものには関わらない)。
     */
    const saved = attacker.flatStatBonus.criRate;
    if (!crit) attacker.flatStatBonus.criRate = -10;
    const result = calcDamage(attacker, defender, { ...effect, hits: 1 }, () => (crit ? 0 : 0.999999));
    if (saved === undefined) delete attacker.flatStatBonus.criRate; else attacker.flatStatBonus.criRate = saved;
    if (result.isCrit !== crit || result.isGlancing) throw new Error("会心/かすりの固定に失敗した");
    return result.damage;
  };
  const normal = once(false);
  const crit = once(true);
  const acc = accessoryOf.get(defender) ?? NONE;
  const latent = Math.max(0, Math.min(1, defender.def.latentAbility?.damageTakenMultiplier ?? 1));
  // 被ダメ軽減の合計。**本番の damageTakenMultiplier と同じく足し算で、上限90%**
  const baseReduction = 1 - damageTakenMultiplier(defender, false);
  const lastStand = targetHpRatio <= 0.5 ? specialValue(acc, "LAST_STAND") : 0;
  const incoming = latent * Math.max(0.05, 1 - Math.min(0.9, baseReduction + lastStand));
  const critTaken = specialValue(acc, "CRIT_TAKEN");
  const landedNormal = Math.round(normal * incoming);
  const landedCrit = Math.round(Math.round(crit * (1 - critTaken)) * incoming);
  const result: Hit = {
    hits, normal, crit, landedNormal, landedCrit,
    critRate: getFinalCritRate(attacker, defender),
    hp: defender.maxHp,
    current: defender.currentHp,
    // 開始時シールドは1ターンだけ。**HP50%まで削れた時点では消えている**とみなす
    shield: targetHpRatio >= 1 ? defender.shieldValue : 0,
    def: getEffectiveStat(defender, "def"),
    atk: getEffectiveStat(attacker, "atk"),
    critDmg: getEffectiveStat(attacker, "criDmg"),
  };
  attacker.effects = [];
  defender.effects = [];
  defender.currentHp = defender.maxHp;
  return result;
}

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
/** スキル1回ぶんの削り率(最大HP比、着弾後) */
const ratioOf = (h: Hit, crit = true) => ((crit ? h.landedCrit : h.landedNormal) * h.hits) / h.hp;
/** 1回で倒せるか(残りHP+シールドを越えるか) */
const killsOf = (h: Hit, crit = true) => (crit ? h.landedCrit : h.landedNormal) * h.hits >= h.current + h.shield;
/** 満タンから倒すのに要るHit数 */
const hitsToKill = (h: Hit, crit = true) => Math.ceil((h.current + h.shield) / Math.max(1, crit ? h.landedCrit : h.landedNormal));

/* ================================================================ 組み合わせ */

const ATK_MAIN = 2_000;
const HP_MAINS = [5_000, 7_000, 9_000];
const DEF_MAINS = [750, 1_000, 1_250];
const ROLLS = [0.8, 1.0, 1.2];

/*
 * 攻撃側の「実戦で強い組み合わせ」。**完全防御無視の技には防御無視を付けない**(意味が無い)。
 * 並びは強い順。ヒーロー=先頭1個、レジェンド=2個、エピック=3個。
 */
const ATK_PATTERNS: Record<"通常技" | "防御無視技", { name: string; specials: AtkSpecial[] }[]> = {
  通常技: [
    { name: "貫通", specials: ["IGNORE_DEF", "DMG_UP", "CRIT_DMG"] },
    { name: "弱体追撃", specials: ["IGNORE_DEF", "DEBUFFED_TARGET", "DMG_UP"] },
    { name: "処刑", specials: ["IGNORE_DEF", "LOW_HP_TARGET", "DMG_UP"] },
  ],
  防御無視技: [
    { name: "会心", specials: ["DMG_UP", "CRIT_DMG", "DEBUFFED_TARGET"] },
    { name: "弱体追撃", specials: ["DEBUFFED_TARGET", "DMG_UP", "CRIT_DMG"] },
    { name: "処刑", specials: ["LOW_HP_TARGET", "DMG_UP", "CRIT_DMG"] },
  ],
};

/* 耐久側。攻撃側のクリ率が9割を超えるので、クリ被ダメ軽減はほぼ常時効く */
const DEF_PATTERNS: { name: string; specials: DefSpecial[] }[] = [
  { name: "堅牢", specials: ["CRIT_TAKEN", "DMG_TAKEN", "MAX_HP"] },
  { name: "障壁", specials: ["CRIT_TAKEN", "DMG_TAKEN", "SHIELD"] },
  { name: "粘り", specials: ["CRIT_TAKEN", "DMG_TAKEN", "LAST_STAND"] },
  { name: "装甲", specials: ["CRIT_TAKEN", "DMG_TAKEN", "DEF_UP"] },
];

const atkPatterns = (spec: AttackerSpec) => ATK_PATTERNS[spec.ignoresDefense ? "防御無視技" : "通常技"];
const atkAcc = (spec: AttackerSpec, specials: readonly Special[], roll = 1, power = 1): Accessory =>
  ({ main: "ATK", mainValue: ATK_MAIN, roll, specials, power });
/** 型ごとの既定のメイン。HP特化はHP、DEF特化はDEF(依頼の例どおり) */
const defAcc = (spec: DefenderSpec, value: number | null, specials: readonly Special[] = [], roll = 1, power = 1, main?: MainKind): Accessory =>
  value === null ? { ...NONE, specials, power } : { main: main ?? (spec.group === "HP特化" ? "HP" : "DEF"), mainValue: value, roll, specials, power };

const midMain = (spec: DefenderSpec) => (spec.group === "HP特化" ? 7_000 : 1_000);

/* ================================================================ 出力 */

console.log("# アクセサリー完成環境の検証(双方装備・特殊効果込み)\n");
console.log(`防御式 1000/(1000+${balanceFlags.swRatio}×DEF) / 属性 ${balanceFlags.elementMode}方式 / 防御DOWN ${DEF_DOWN * 100}% / 攻撃UP ${ATK_UP * 100}%`);
console.log("攻撃側・防御側とも ★6 Lv60 / スキルLv最大 / タイプ転生 / 能力100 / 潜在 / ★6+15(前回と同じ型紙)。才能覚醒は含まない(前回と同じ)。\n");

console.log("## 0. 仮の特殊効果(ここだけの仮実装)\n");
console.log("| 効果 | 仮の値 | 根拠(いま本番にある、同じ働きのもの) |");
console.log("|---|---:|---|");
for (const [key, s] of Object.entries(SPECIAL_BASE)) console.log(`| ${key} | ${s.label} | ${s.basis} |`);

/* ---------------------------------------------------------------- 1. 完成ステータス */

console.log("\n## 1. 完成ステータス\n");
console.log("### 攻撃側\n");
console.log("| 攻撃側 | アクセ | 最終HP | 最終ATK | 最終DEF | クリ率 | クリダメ | 技 |");
console.log("|---|---|---:|---:|---:|---:|---:|---|");
for (const spec of ATTACKERS) {
  const epic = atkPatterns(spec)[0].specials;
  for (const acc of [NONE, atkAcc(spec, []), atkAcc(spec, epic), atkAcc(spec, epic, 1.2)]) {
    const u = attackerUnit(spec, acc);
    const effect = effectOf(u, spec);
    console.log(`| ${spec.label} | ${describe(acc)} | ${n(u.maxHp)} | ${n(getEffectiveStat(u, "atk"))} | ${n(getEffectiveStat(u, "def"))} | ${pct(getEffectiveStat(u, "criRate"))} | ${pct(getEffectiveStat(u, "criDmg"))} | ${spec.skill} ×${effect.multiplier.toFixed(2)}${(effect.hits ?? 1) > 1 ? `×${effect.hits}Hit` : ""}${effect.ignoreDefense ? " 完全防御無視" : ""} |`);
  }
}

console.log("\n### 防御側\n");
console.log("| 防御側 | 型 | タイプ | 装備 | アクセ | 最終HP | 最終DEF | 開始シールド |");
console.log("|---|---|---|---|---|---:|---:|---:|");
for (const spec of KEY_DEFENDERS) {
  const preset = PRESETS[spec.preset];
  const gear = `${preset.gear[0].set}4+${preset.gear[5].set}2 / ${[preset.gear[1].main, preset.gear[3].main, preset.gear[5].main].join("/")}`;
  const mains = spec.group === "HP特化" ? HP_MAINS : DEF_MAINS;
  const accs: Accessory[] = [NONE, ...mains.map((v) => defAcc(spec, v)), defAcc(spec, midMain(spec), DEF_PATTERNS[0].specials), defAcc(spec, midMain(spec), DEF_PATTERNS[0].specials, 1.2)];
  for (const acc of accs) {
    const u = defenderUnit(spec, acc);
    console.log(`| ${spec.label} | ${spec.group} | ${preset.type} | ${gear} | ${describe(acc)} | ${n(u.maxHp)} | ${n(getEffectiveStat(u, "def"))} | ${n(u.shieldValue)} |`);
  }
}

/* ---------------------------------------------------------------- 2. メインステ比較 */

/**
 * 1マス = スキル1回ぶんのクリの削り率。1回で倒せる時は ★ を付ける。
 * 非クリ・クリの実数とHit数は、下の「詳細」に出す。
 */
function cell(h: Hit): string {
  return `${pct(ratioOf(h))}${killsOf(h) ? "★" : ""}`;
}

console.log("\n## 2. メインステ比較(特殊効果なし・中央値1.0)\n");
console.log("1マス = **スキル1回ぶん・クリの削り率**(着弾後の全Hit合計 ÷ 最大HP)。★ はシールド込みで1回で倒せる。\n");
for (const spec of ATTACKERS) {
  console.log(`### ${spec.label}「${spec.skill}」\n`);
  const conds = conditionsFor(spec);
  console.log(`| 防御側 | 防御アクセ | 攻撃アクセ | ${conds.join(" | ")} |`);
  console.log(`|---|---|---|${conds.map(() => "---:").join("|")}|`);
  for (const d of KEY_DEFENDERS) {
    const own = d.group === "HP特化" ? HP_MAINS : DEF_MAINS;
    const cross: Accessory[] = d.group === "HP特化"
      ? [defAcc(d, 1_000, [], 1, 1, "DEF")]
      : [defAcc(d, 7_000, [], 1, 1, "HP")];
    const defAccs: Accessory[] = [NONE, ...own.map((v) => defAcc(d, v)), ...cross];
    for (const dacc of defAccs) {
      for (const aacc of [NONE, atkAcc(spec, [])]) {
        if (dacc !== NONE && aacc === NONE) continue; // 防御側だけ着けて攻撃側が素、は比較の軸にしない
        const cells = conds.map((c) => cell(strike(attackerUnit(spec, aacc), spec, defenderUnit(d, dacc), c)));
        console.log(`| ${d.label} | ${describe(dacc)} | ${describe(aacc)} | ${cells.join(" | ")} |`);
      }
    }
  }
  console.log("");
}

/* 依頼の11番の項目を全部出す詳細。代表の組だけ */
console.log("### 詳細(依頼の項目すべて)\n");
console.log("| 攻撃側 | 防御側 | 条件 | 攻撃アクセ | 防御アクセ | 攻撃ATK | クリ率 | クリダメ | 防御HP | 防御DEF | 非クリ1Hit | クリ1Hit | 全Hit 非クリ/クリ | 削り率 非クリ/クリ | 撃破Hit数 非クリ/クリ |");
console.log("|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const spec of ATTACKERS) {
  for (const d of KEY_DEFENDERS) {
    for (const c of conditionsFor(spec)) {
      for (const [aacc, dacc] of [[NONE, NONE], [atkAcc(spec, []), defAcc(d, midMain(d))]] as const) {
        const h = strike(attackerUnit(spec, aacc), spec, defenderUnit(d, dacc), c);
        console.log(`| ${spec.label} | ${d.label} | ${c} | ${describe(aacc)} | ${describe(dacc)} | ${n(h.atk)} | ${pct(h.critRate)} | ${pct(h.critDmg)} | ${n(h.hp)} | ${n(h.def)} | ${n(h.landedNormal)} | ${n(h.landedCrit)} | ${n(h.landedNormal * h.hits)} / ${n(h.landedCrit * h.hits)} | ${pct(ratioOf(h, false))} / ${pct(ratioOf(h))} | ${hitsToKill(h, false)} / ${hitsToKill(h)} |`);
      }
    }
  }
}

/* ---------------------------------------------------------------- 3. 特殊効果比較 */

console.log("\n## 3. 特殊効果比較(エピック=3個、メイン中央値)\n");
console.log("攻撃 ATK+2,000、防御 HP特化=HP+7,000 / DEF特化=DEF+1,000。1マスはスキル1回・クリの削り率。「HP50%」列は、半分まで削れた相手への追撃(処刑・粘りの条件が成立)で、★は残りHPを削りきる。\n");
for (const spec of ATTACKERS) {
  console.log(`### ${spec.label}\n`);
  const conds = conditionsFor(spec);
  console.log(`| 攻撃パターン | 防御側 | 防御パターン | ${conds.join(" | ")} | HP50%・${conds[conds.length - 1]} |`);
  console.log(`|---|---|---|${conds.map(() => "---:").join("|")}|---:|`);
  for (const d of [KEY_DEFENDERS[0], KEY_DEFENDERS[3]]) {
    for (const ap of [{ name: "特殊なし", specials: [] as AtkSpecial[] }, ...atkPatterns(spec)]) {
      for (const dp of [{ name: "特殊なし", specials: [] as DefSpecial[] }, ...DEF_PATTERNS]) {
        const make = () => [attackerUnit(spec, atkAcc(spec, ap.specials)), defenderUnit(d, defAcc(d, midMain(d), dp.specials))] as const;
        const cells = conds.map((c) => { const [a, t] = make(); return cell(strike(a, spec, t, c)); });
        const [a, t] = make();
        const half = strike(a, spec, t, conds[conds.length - 1], 0.5);
        console.log(`| ${ap.name} | ${d.label} | ${dp.name} | ${cells.join(" | ")} | ${pct(ratioOf(half))}${killsOf(half) ? "★" : ""} |`);
      }
    }
  }
  console.log("");
}

/* 寄与。1つずつ外して、最終ダメージがどれだけ変わるか */
console.log("### 特殊効果1個ずつの寄与(外した時との比)\n");
console.log("攻撃側は「その効果でクリダメージが何%増えたか」、防御側は「その効果で受けるダメージが何%減ったか(シールドは実効HPの増分)」。条件が成立しない効果は0になる。\n");
console.log("| 側 | 効果 | 対 HP特化・素 | 対 HP特化・防御DOWN | 対 HP特化・HP50% | 対 超DEF・素 | 対 超DEF・防御DOWN |");
console.log("|---|---|---:|---:|---:|---:|---:|");
{
  const spec = ATTACKERS[1]; // 通常技の代表(ネメシス)
  const all: AtkSpecial[] = ["IGNORE_DEF", "DMG_UP", "CRIT_DMG", "DEBUFFED_TARGET", "LOW_HP_TARGET"];
  const measureAtk = (specials: AtkSpecial[], d: DefenderSpec, c: Condition, hpRatio = 1) =>
    strike(attackerUnit(spec, atkAcc(spec, specials)), spec, defenderUnit(d, defAcc(d, midMain(d))), c, hpRatio).landedCrit;
  for (const s of all) {
    const cells = [
      [KEY_DEFENDERS[0], "素" as Condition, 1], [KEY_DEFENDERS[0], "防御DOWN" as Condition, 1], [KEY_DEFENDERS[0], "素" as Condition, 0.5],
      [KEY_DEFENDERS[3], "素" as Condition, 1], [KEY_DEFENDERS[3], "防御DOWN" as Condition, 1],
    ].map(([d, c, r]) => `+${pct(measureAtk([s], d as DefenderSpec, c as Condition, r as number) / measureAtk([], d as DefenderSpec, c as Condition, r as number) - 1)}`);
    console.log(`| 攻撃(ネメシス) | ${SPECIAL_BASE[s].label} | ${cells.join(" | ")} |`);
  }
  const allDef: DefSpecial[] = ["CRIT_TAKEN", "DMG_TAKEN", "MAX_HP", "DEF_UP", "LAST_STAND", "SHIELD"];
  const measureDef = (specials: DefSpecial[], d: DefenderSpec, c: Condition, hpRatio = 1) => {
    const h = strike(attackerUnit(spec, atkAcc(spec, [])), spec, defenderUnit(d, defAcc(d, midMain(d), specials)), c, hpRatio);
    // 「どれだけ倒しにくくなったか」= 削り率の逆数(シールドは実効HPとして入れる)
    return (h.landedCrit * h.hits) / (h.hp + h.shield);
  };
  for (const s of allDef) {
    const cells = [
      [KEY_DEFENDERS[0], "素" as Condition, 1], [KEY_DEFENDERS[0], "防御DOWN" as Condition, 1], [KEY_DEFENDERS[0], "素" as Condition, 0.5],
      [KEY_DEFENDERS[3], "素" as Condition, 1], [KEY_DEFENDERS[3], "防御DOWN" as Condition, 1],
    ].map(([d, c, r]) => `-${pct(1 - measureDef([s], d as DefenderSpec, c as Condition, r as number) / measureDef([], d as DefenderSpec, c as Condition, r as number))}`);
    console.log(`| 防御 | ${SPECIAL_BASE[s].label} | ${cells.join(" | ")} |`);
  }
}

/* ---------------------------------------------------------------- 4. Hero / Legend / Epic */

const TIERS = [
  { name: "特殊なし", count: 0 },
  { name: "ヒーロー(1個)", count: 1 },
  { name: "レジェンド(2個)", count: 2 },
  { name: "エピック(3個)", count: 3 },
];

console.log("\n## 4. ヒーロー / レジェンド / エピック\n");
console.log("攻撃は各技で最も通る組み合わせ(通常技=貫通、防御無視技=会心)、防御は「堅牢」を強い順に1個ずつ足す。メインは中央値。1マスはスキル1回・クリの削り率。\n");
for (const spec of ATTACKERS) {
  const conds = conditionsFor(spec);
  console.log(`### ${spec.label}\n`);
  console.log(`| 攻撃アクセ | 防御アクセ | 防御側 | ${conds.join(" | ")} |`);
  console.log(`|---|---|---|${conds.map(() => "---:").join("|")}|`);
  for (const d of KEY_DEFENDERS) {
    for (const tier of TIERS) {
      const a = atkAcc(spec, atkPatterns(spec)[0].specials.slice(0, tier.count));
      const t = defAcc(d, midMain(d), DEF_PATTERNS[0].specials.slice(0, tier.count));
      const cells = conds.map((c) => cell(strike(attackerUnit(spec, a), spec, defenderUnit(d, t), c)));
      console.log(`| ${tier.name} | ${tier.name} | ${d.label} | ${cells.join(" | ")} |`);
    }
    // 片側だけエピック。どちらの特殊効果が強いかを分けて見る
    const aEpic = atkAcc(spec, atkPatterns(spec)[0].specials);
    const dEpic = defAcc(d, midMain(d), DEF_PATTERNS[0].specials);
    const oneSide = [
      ["エピック", "特殊なし", aEpic, defAcc(d, midMain(d))],
      ["特殊なし", "エピック", atkAcc(spec, []), dEpic],
    ] as const;
    for (const [la, ld, a, t] of oneSide) {
      const cells = conds.map((c) => cell(strike(attackerUnit(spec, a), spec, defenderUnit(d, t), c)));
      console.log(`| ${la} | ${ld} | ${d.label} | ${cells.join(" | ")} |`);
    }
  }
  console.log("");
}

/* ---------------------------------------------------------------- 5. 個体差 */

console.log("## 5. 個体差 0.8 / 1.0 / 1.2(両側エピック理想)\n");
console.log("メインだけを揺らす(特殊効果は固定)。1マスはスキル1回・クリの削り率。\n");
for (const spec of ATTACKERS) {
  const conds = conditionsFor(spec);
  console.log(`### ${spec.label}\n`);
  console.log(`| 攻撃メイン | 防御メイン | 防御側 | ${conds.join(" | ")} |`);
  console.log(`|---|---|---|${conds.map(() => "---:").join("|")}|`);
  for (const d of KEY_DEFENDERS) {
    for (const ra of ROLLS) {
      for (const rd of ROLLS) {
        if (ra !== rd && !(ra === 1.2 && rd === 0.8) && !(ra === 0.8 && rd === 1.2)) continue;
        const a = atkAcc(spec, atkPatterns(spec)[0].specials, ra);
        const t = defAcc(d, midMain(d), DEF_PATTERNS[0].specials, rd);
        const cells = conds.map((c) => cell(strike(attackerUnit(spec, a), spec, defenderUnit(d, t), c)));
        console.log(`| ATK+${n(ATK_MAIN * ra)} (×${ra}) | ${describe(t).split(" + ")[0]} (×${rd}) | ${d.label} | ${cells.join(" | ")} |`);
      }
    }
  }
  console.log("");
}

/* ---------------------------------------------------------------- 6. 最終環境 A〜D(900組) */

interface Stage {
  key: string;
  label: string;
  atk: (spec: AttackerSpec, pattern: number) => Accessory;
  def: (spec: DefenderSpec, pattern: number, mainValue?: number, mainKind?: MainKind) => Accessory;
}

const STAGES: Stage[] = [
  { key: "A", label: "アクセなし vs アクセなし", atk: () => NONE, def: () => NONE },
  { key: "B", label: "ATK+2,000 vs メインのみ", atk: (s) => atkAcc(s, []), def: (d, _p, v, k) => defAcc(d, v ?? midMain(d), [], 1, 1, k) },
  { key: "C", label: "ATK+2,000+エピック vs メイン+エピック", atk: (s, p) => atkAcc(s, atkPatterns(s)[p].specials), def: (d, p, v, k) => defAcc(d, v ?? midMain(d), DEF_PATTERNS[p].specials, 1, 1, k) },
  { key: "D", label: "×1.2+エピック vs ×1.2+エピック", atk: (s, p) => atkAcc(s, atkPatterns(s)[p].specials, 1.2), def: (d, p, v, k) => defAcc(d, v ?? midMain(d), DEF_PATTERNS[p].specials, 1.2, 1, k) },
];

const PAIR_COUNT = 30;

/**
 * 攻撃側30個体 × 防御側30個体の全組で、クリ1回で倒れる割合と、削り率の中央値。
 * 特殊効果の組み合わせは、**攻撃側は最も通る組、防御側は最も通さない組**を取る
 * (どちらも相手を知った上で最善を選んだ場合 = 壊れているかどうかの上限)。
 */
function pairStats(spec: AttackerSpec, d: DefenderSpec, c: Condition, stage: Stage, mainValue?: number, mainKind?: MainKind, power = 1): { killed: number; median: number } {
  const atkChoices = stage.key === "A" || stage.key === "B" ? [0] : [0, 1, 2];
  const defChoices = stage.key === "A" || stage.key === "B" ? [0] : [0, 1, 2, 3];
  let worst: { killed: number; median: number } | null = null;
  for (const dp of defChoices) {
    let best: { killed: number; median: number } | null = null;
    const defenders = Array.from({ length: PAIR_COUNT }, (_, i) => defenderUnit(d, { ...stage.def(d, dp, mainValue, mainKind), power }, 2000 + i));
    for (const ap of atkChoices) {
      const ratios: number[] = [];
      let kills = 0;
      for (let i = 0; i < PAIR_COUNT; i += 1) {
        const attacker = attackerUnit(spec, { ...stage.atk(spec, ap), power }, 1000 + i);
        for (const defender of defenders) {
          const h = strike(attacker, spec, defender, c);
          ratios.push(ratioOf(h));
          if (killsOf(h)) kills += 1;
        }
      }
      ratios.sort((x, y) => x - y);
      const result = { killed: kills / ratios.length, median: ratios[Math.floor(ratios.length / 2)] };
      if (!best || result.median > best.median) best = result;
    }
    if (!worst || best!.median < worst.median) worst = best!;
  }
  return worst!;
}

console.log("## 6. 最終環境 A〜D(攻撃側30 × 防御側30 = 900組)\n");
console.log("1マス = **クリ1回で倒れる組の割合**(括弧内は削り率の中央値)。C・Dは、攻撃側が最も通る特殊効果、防御側が最も通さない特殊効果を選んだ場合。\n");
for (const spec of ATTACKERS) {
  const conds = conditionsFor(spec);
  console.log(`### ${spec.label}\n`);
  console.log(`| 段階 | 防御側 | ${conds.join(" | ")} |`);
  console.log(`|---|---|${conds.map(() => "---:").join("|")}|`);
  for (const stage of STAGES) {
    for (const d of ALL_DEFENDERS) {
      const cells = conds.map((c) => { const r = pairStats(spec, d, c, stage); return `${pct(r.killed)} (${pct(r.median)})`; });
      console.log(`| ${stage.key} | ${d.label} | ${cells.join(" | ")} |`);
    }
  }
  console.log("");
}

/* ---------------------------------------------------------------- 7. メイン候補ごとのD */

console.log("## 7. 防御メインの候補ごとの最上位環境(D: ×1.2+エピック同士)\n");
console.log("ネメシス・攻撃UP+防御DOWN(通常技にとって最も通る条件)。1マスはクリ1回で倒れる割合(削り率の中央値)。「交差」は HP特化にDEFメイン、DEF特化にHPメインを着けた場合。\n");
{
  const spec = ATTACKERS[1];
  const header = ["HP+5,000", "HP+7,000", "HP+9,000", "DEF+750", "DEF+1,000", "DEF+1,250"];
  console.log(`| 防御側 | 型 | ${header.join(" | ")} |`);
  console.log(`|---|---|${header.map(() => "---:").join("|")}|`);
  for (const d of ALL_DEFENDERS) {
    const cells = [
      ...HP_MAINS.map((v) => pairStats(spec, d, "攻撃UP+防御DOWN", STAGES[3], v, "HP")),
      ...DEF_MAINS.map((v) => pairStats(spec, d, "攻撃UP+防御DOWN", STAGES[3], v, "DEF")),
    ].map((r) => `${pct(r.killed)} (${pct(r.median)})`);
    console.log(`| ${d.label} | ${d.group} | ${cells.join(" | ")} |`);
  }
  console.log("\n素(バフ・デバフなし)で同じ表:\n");
  console.log(`| 防御側 | 型 | ${header.join(" | ")} |`);
  console.log(`|---|---|${header.map(() => "---:").join("|")}|`);
  for (const d of ALL_DEFENDERS) {
    const cells = [
      ...HP_MAINS.map((v) => pairStats(spec, d, "素", STAGES[3], v, "HP")),
      ...DEF_MAINS.map((v) => pairStats(spec, d, "素", STAGES[3], v, "DEF")),
    ].map((r) => `${pct(r.median)}`);
    console.log(`| ${d.label} | ${d.group} | ${cells.join(" | ")} |`);
  }
}

/* ---------------------------------------------------------------- 8. 感度 */

console.log("\n## 8. 感度: 特殊効果1個の強さを1.5倍にしたら(D・900組)\n");
console.log("仮の値が結論を左右していないかを見る。1マスはクリ1回で倒れる割合(削り率の中央値)。\n");
{
  console.log("| 攻撃側 | 条件 | 防御側 | 効果×1.0 | 効果×1.5 |");
  console.log("|---|---|---|---:|---:|");
  for (const spec of ATTACKERS) {
    for (const c of spec.ignoresDefense ? ["攻撃UP"] as Condition[] : ["素", "攻撃UP+防御DOWN"] as Condition[]) {
      for (const d of [ALL_DEFENDERS[0], ALL_DEFENDERS[1], ALL_DEFENDERS[5]]) {
        const [x1, x15] = [1, 1.5].map((p) => pairStats(spec, d, c, STAGES[3], undefined, undefined, p));
        console.log(`| ${spec.label} | ${c} | ${d.label} | ${pct(x1.killed)} (${pct(x1.median)}) | ${pct(x15.killed)} (${pct(x15.median)}) |`);
      }
    }
  }
}

/* ---------------------------------------------------------------- 9. 片側だけ最上位 */

/*
 * **両側がそろうとは限らない。**
 *
 * 実際のアリーナでは、エピックを引いた人と引いていない人が当たる。
 * 両側そろえた表(C・D)では、攻撃と防御の特殊効果が打ち消し合って穏やかに見えるが、
 * 片側だけが持つと差は大きく開く。壊れているかどうかは、こちらで判断する。
 */
const ONE_SIDED: Stage[] = [
  { key: "E", label: "×1.2+エピック vs メインのみ(中央)", atk: (s, p) => atkAcc(s, atkPatterns(s)[p].specials, 1.2), def: (d, _p, v, k) => defAcc(d, v ?? midMain(d), [], 1, 1, k) },
  { key: "F", label: "ATK+2,000のみ vs ×1.2+エピック", atk: (s) => atkAcc(s, []), def: (d, p, v, k) => defAcc(d, v ?? midMain(d), DEF_PATTERNS[p].specials, 1.2, 1, k) },
];

console.log("\n## 9. 片側だけ最上位(900組)\n");
console.log("E = 攻撃側だけ ×1.2+エピック(防御側はメイン中央値のみ)。F = 防御側だけ ×1.2+エピック(攻撃側は ATK+2,000 のみ)。比べやすいよう A・B を並べる。1マスはクリ1回で倒れる割合(削り率の中央値)。\n");
for (const spec of ATTACKERS) {
  const conds = conditionsFor(spec);
  console.log(`### ${spec.label}\n`);
  console.log(`| 段階 | 防御側 | ${conds.join(" | ")} |`);
  console.log(`|---|---|${conds.map(() => "---:").join("|")}|`);
  for (const d of ALL_DEFENDERS) {
    for (const stage of [STAGES[0], STAGES[1], ...ONE_SIDED]) {
      const cells = conds.map((c) => { const r = pairStats(spec, d, c, stage); return `${pct(r.killed)} (${pct(r.median)})`; });
      console.log(`| ${stage.key} | ${d.label} | ${cells.join(" | ")} |`);
    }
  }
  console.log("");
}
