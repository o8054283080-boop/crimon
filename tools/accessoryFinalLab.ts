/**
 * アクセサリー特殊効果の最終バランス検証。
 *
 * **検証専用。本番のデータには何も書かない。**`accessorySpecialLab.ts` の続き。
 * 特殊効果の値は依頼主が決めた「今回の新候補」だけを使う(`accessoryFinal/specials.ts`)。
 *
 * ## 何を通しているか
 *
 * 一撃の表: Battle Lab の `buildAlly` → `createBattleUnit` → **本番の `calcDamage`**。
 * 多段は本番と同じく1Hitずつ相手のHPを減らしてから次のHitを計算する。
 *
 * 実戦4対4・長期戦: **本番の `BattleEngine` をそのまま走らせる。**
 * アクセサリーの条件付き効果は、エンジンのインスタンスに限って差し込む
 * (`attachAccessories`。本番のエンジンのコードは変えない)。
 *
 * 攻撃UP・防御DOWNの量は本番の `statusValues.ts` から読む。
 *
 *   npx tsx tools/accessoryFinalLab.ts > 結果.md
 *   npx tsx tools/accessoryFinalLab.ts --battles 150   # 実戦の戦闘数(既定150)
 */
import { calcDamage, getFinalCritRate } from "../src/battle/damage.js";
import { BattleEngine } from "../src/battle/engine.js";
import {
  applyStatEffect,
  createBattleUnit,
  damageTakenMultiplier,
  getEffectiveStat,
  type BattleUnit,
} from "../src/battle/unit.js";
import type { DamageEffect } from "../src/core/skill.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { ATK_UP, DEF_DOWN } from "../src/core/statusValues.js";
import { balanceFlags } from "../src/core/balanceFlags.js";
import { buildAlly } from "./battleLab/build.js";
import { PRESETS } from "./battleLab/presets.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { AllySpec, GearGrade, PresetName } from "./battleLab/types.js";
import {
  ATK_SPECIALS,
  DEF_SPECIALS,
  NONE,
  SPECIAL_LABEL,
  WEAKS,
  attachAccessories,
  attackMultiplier,
  defenseMultiplier,
  describe,
  equipDefinition,
  skillTargetOf,
  sv,
  wv,
  type Accessory,
  type AtkSpecial,
  type DefSpecial,
  type HitContext,
  type Roll,
  type Special,
  type Stacking,
  type Tier,
  type WeakKey,
} from "./accessoryFinal/specials.js";

if (balanceFlags.defenseFormula !== "sw" || balanceFlags.elementMode !== "sw" || balanceFlags.swRatio !== 1.2) {
  throw new Error(`本番の既定ではない: ${JSON.stringify(balanceFlags)}`);
}

const argv = process.argv.slice(2);
const battlesArg = argv.indexOf("--battles");
const BATTLES = battlesArg >= 0 ? Number(argv[battlesArg + 1]) : 150;

/* ================================================================ 個体 */

interface Subject { label: string; templateId: string; element: AllySpec["element"]; preset: PresetName }
interface AttackerSpec extends Subject { skill: string; ignoresDefense: boolean }
interface DefenderSpec extends Subject { group: "HP型" | "DEF型"; seedPick?: "MAX_HP" | "MAX_DEF" }

const ATTACKERS: AttackerSpec[] = [
  { label: "闇ドラゴン", templateId: "dragon", element: "DARK", preset: "MAX_ATTACKER", skill: "破壊の流星", ignoresDefense: true },
  { label: "闇ネメシス", templateId: "nemesis", element: "DARK", preset: "MAX_ATTACKER", skill: "エンドオブオール", ignoresDefense: false },
  { label: "闇ウルフ", templateId: "wolf", element: "DARK", preset: "MAX_ATTACKER", skill: "シャドウレンド", ignoresDefense: false },
];
/*
 * 実戦4対4の4体目。**純ATKの単体1Hit技**(ホーリーピアース ATK×3.5系、条件付きの上乗せなし)。
 * 光→水は中立、光→闇は有利(クリ率+15ptのみ。かすりは出ない)。
 */
const FOURTH: AttackerSpec = { label: "光スコーピオン", templateId: "scorpion", element: "LIGHT", preset: "MAX_ATTACKER", skill: "ホーリーピアース", ignoresDefense: false };

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
const baseDef = (spec: Subject, seed: number, grade?: GearGrade): MonsterDefinition =>
  buildAlly({ label: spec.label, templateId: spec.templateId, element: spec.element, preset: spec.preset }, mulberry32(seed), grade);

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

const accessoryOfUnit = new WeakMap<BattleUnit, Accessory>();
const unitCache = new Map<string, BattleUnit>();
function unitFor(spec: Subject, acc: Accessory, team: "PLAYER" | "ENEMY", seed: number): BattleUnit {
  const key = `${team}:${spec.templateId}:${spec.element}:${seed}:${JSON.stringify(acc)}`;
  if (!unitCache.has(key)) {
    const unit = createBattleUnit(equipDefinition(baseDef(spec, seed), acc), team, `${team}_${spec.templateId}`);
    accessoryOfUnit.set(unit, acc);
    unitCache.set(key, unit);
  }
  return unitCache.get(key)!;
}
const attackerUnit = (spec: AttackerSpec, acc: Accessory, seed = SEED) => unitFor(spec, acc, "PLAYER", seed);
const defenderUnit = (spec: DefenderSpec, acc: Accessory, seed?: number) => unitFor(spec, acc, "ENEMY", seed ?? seedOf(spec));

function skillOf(unit: BattleUnit, name: string) {
  const index = unit.def.skills.findIndex((s) => s?.name === name);
  const skill = unit.def.skills[index];
  const effect = skill?.effects.find((e): e is DamageEffect => e.kind === "DAMAGE");
  if (!skill || !effect) throw new Error(`${name} が無い`);
  return { index: index as 0 | 1 | 2, skill, effect };
}

/* ================================================================ 一撃の解決 */

type Condition = "素" | "攻撃UP" | "防御DOWN" | "攻撃UP+防御DOWN";
const CONDITIONS: Condition[] = ["素", "攻撃UP", "防御DOWN", "攻撃UP+防御DOWN"];
/** 完全防御無視には防御DOWNの比較を持ち込まない(依頼どおり) */
const conditionsFor = (spec: AttackerSpec): Condition[] => (spec.ignoresDefense ? ["素", "攻撃UP"] : CONDITIONS);

let STACK_ATK: Stacking = "ADD";
let STACK_DEF: Stacking = "MUL";

interface Resolution {
  /** 1回目で与えた量。シールドへ吸われたぶんと、倒れた後のHitも含む(潜在量) */
  firstTotal: number;
  firstHitRaw: number;
  firstHitLanded: number;
  oneShot: boolean;
  uses: number;
  hp: number;
  startShield: number;
  def: number;
  atk: number;
  critRate: number;
  critDmg: number;
  atkParts: Partial<Record<string, number>>;
  defParts: Partial<Record<string, number>>;
  followupTotal: number;
  followupOneShot: boolean;
}

/** 本番の calcDamage を1Hitぶん。クリ率100%の個体でも非クリを出せるよう、非クリの時だけクリ率を0へ */
function rawHit(attacker: BattleUnit, defender: BattleUnit, effect: DamageEffect, crit: boolean): number {
  const saved = attacker.flatStatBonus.criRate;
  if (!crit) attacker.flatStatBonus.criRate = -10;
  const result = calcDamage(attacker, defender, { ...effect, hits: 1 }, () => (crit ? 0 : 0.999999));
  if (saved === undefined) delete attacker.flatStatBonus.criRate; else attacker.flatStatBonus.criRate = saved;
  if (result.isCrit !== crit || result.isGlancing) throw new Error("会心/かすりの固定に失敗した");
  return result.damage;
}

/**
 * 満タンの相手へ、倒れるまで同じスキルを撃ち続ける(相手は回復しない)。
 * 着弾の順番は実戦の差し込み(`attachAccessories`)と同じ:
 *   calcDamage → × 攻撃アクセ × 防御アクセ → 本番の着弾(潜在・パッシブの軽減)
 */
function resolve(attacker: BattleUnit, spec: AttackerSpec, defender: BattleUnit, condition: Condition, crit: boolean, startHpRatio = 1): Resolution {
  attacker.effects = [];
  defender.effects = [];
  if (condition === "攻撃UP" || condition === "攻撃UP+防御DOWN") applyStatEffect(attacker, "atk", ATK_UP, 2, "BUFF");
  if (condition === "防御DOWN" || condition === "攻撃UP+防御DOWN") applyStatEffect(defender, "def", -DEF_DOWN, 2, "DEBUFF");
  const { index, skill, effect } = skillOf(attacker, spec.skill);
  const hits = Math.max(1, Math.floor(effect.hits ?? 1));
  const aAcc = accessoryOfUnit.get(attacker) ?? NONE;
  const dAcc = accessoryOfUnit.get(defender) ?? NONE;
  const startShieldPct = defender.def.combatMods?.battleStartShieldPercent ?? 0;
  const startShield = Math.round(defender.maxHp * startShieldPct);
  let hp = Math.floor(defender.maxHp * startHpRatio);
  let shield = startHpRatio >= 1 ? startShield : 0;
  let shield50Used = startHpRatio <= 0.5;
  let firstTotal = 0, firstHitRaw = 0, firstHitLanded = 0, uses = 0, oneShot = false;
  let atkParts: Partial<Record<string, number>> = {};
  let defParts: Partial<Record<string, number>> = {};
  const latent = Math.max(0, Math.min(1, defender.def.latentAbility?.damageTakenMultiplier ?? 1));
  const hitOnce = (h: number, first: boolean, eff: DamageEffect, slot: 0 | 1 | 2 | null, target: "SINGLE" | "ALL" | null) => {
    defender.currentHp = Math.max(1, hp);
    const ctx: HitContext = {
      attacker, defender, attackerAcc: aAcc, defenderAcc: dAcc,
      skillSlot: slot, skillTarget: target, hitIndex: h, firstAttack: first, crit,
      stackAtk: STACK_ATK, stackDef: STACK_DEF,
    };
    const raw = rawHit(attacker, defender, eff, crit);
    const a = attackMultiplier(ctx);
    const d = defenseMultiplier(ctx);
    if (first && h === 0) { atkParts = a.parts; defParts = d.parts; }
    const amount = Math.max(1, Math.round(raw * a.factor * d.factor));
    return { raw, landed: Math.round(amount * latent * damageTakenMultiplier(defender, false)) };
  };
  const apply = (landed: number) => {
    const absorbed = Math.min(shield, landed);
    shield -= absorbed;
    hp -= landed - absorbed;
    if (!shield50Used && hp > 0 && hp <= defender.maxHp * 0.5 && sv(dAcc, "SHIELD50") > 0) {
      shield += Math.round(defender.maxHp * sv(dAcc, "SHIELD50"));
      shield50Used = true;
    }
  };
  let followupTotal = 0, followupOneShot = false;
  while (hp > 0 && uses < 40) {
    uses += 1;
    for (let h = 0; h < hits && (hp > 0 || uses === 1); h += 1) {
      const { raw, landed } = hitOnce(h, uses === 1, effect, index, skillTargetOf(skill));
      if (uses === 1) { firstTotal += landed; if (h === 0) { firstHitRaw = raw; firstHitLanded = landed; } }
      if (hp > 0) apply(landed);
    }
    if (uses === 1) {
      oneShot = hp <= 0;
      followupTotal = firstTotal;
      followupOneShot = oneShot;
      // 弱効果「小さな追撃」が発動した場合。ATK×0.15の追加の1Hit(スキルではない)
      if (!oneShot && wv(aAcc, "FOLLOWUP") > 0) {
        const { landed } = hitOnce(0, false, { kind: "DAMAGE", multiplier: wv(aAcc, "FOLLOWUP") }, null, null);
        followupTotal += landed;
        followupOneShot = hp - Math.max(0, landed - shield) <= 0;
      }
    }
  }
  const out: Resolution = {
    firstTotal, firstHitRaw, firstHitLanded, oneShot, uses: hp <= 0 ? uses : 99,
    hp: defender.maxHp, startShield, def: getEffectiveStat(defender, "def"),
    atk: getEffectiveStat(attacker, "atk"), critRate: getFinalCritRate(attacker, defender), critDmg: getEffectiveStat(attacker, "criDmg"),
    atkParts, defParts, followupTotal, followupOneShot,
  };
  attacker.effects = [];
  defender.effects = [];
  defender.currentHp = defender.maxHp;
  return out;
}

const rate = (r: Resolution) => r.firstTotal / (r.hp + r.startShield);
const n = (v: number) => Math.round(v).toLocaleString("en-US");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

/* ================================================================ 組み合わせ */

const ATK_MAIN = 2_000;
const HP_MAIN = 5_000;
const DEF_MAIN = 750;

interface Pattern<K> { name: string; specials: K[]; weak: WeakKey }

/*
 * 攻撃側の「そのモンスターに噛み合う」組み合わせ。先頭から順にヒーロー=1個・レジェンド=2個・エピック=3個。
 * 同じ特殊効果を1つのアクセに2つ入れない。属性特効の対象は「水」(防御側の多い属性)。
 */
const ATK_PATTERNS: Record<string, Pattern<AtkSpecial>[]> = {
  dragon: [
    { name: "開幕S3", specials: ["S3", "SELF_HP70", "ELEM"], weak: "FIRST_ASSIST" },
    { name: "初撃", specials: ["S3", "FIRST", "SELF_HP70"], weak: "FIRST_ASSIST" },
    { name: "初撃属性", specials: ["S3", "FIRST", "ELEM"], weak: "FIRST_ASSIST" },
  ],
  nemesis: [
    { name: "開幕S3", specials: ["S3", "SELF_HP70", "ELEM"], weak: "FIRST_ASSIST" },
    { name: "初撃", specials: ["S3", "FIRST", "SELF_HP70"], weak: "FIRST_ASSIST" },
    { name: "多段", specials: ["S3", "MULTI2", "SELF_HP70"], weak: "COMBO_ASSIST" },
    { name: "多段弱体", specials: ["S3", "MULTI2", "DEBUFF1"], weak: "COMBO_ASSIST" },
  ],
  wolf: [
    { name: "開幕S3", specials: ["S3", "SELF_HP70", "ELEM"], weak: "FIRST_ASSIST" },
    { name: "初撃", specials: ["S3", "FIRST", "SELF_HP70"], weak: "FIRST_ASSIST" },
    { name: "多段", specials: ["S3", "MULTI2", "MULTI3"], weak: "COMBO_ASSIST" },
    { name: "多段弱体", specials: ["S3", "MULTI2", "DEBUFF1"], weak: "COMBO_ASSIST" },
  ],
  scorpion: [
    { name: "初撃", specials: ["S3", "FIRST", "SELF_HP70"], weak: "FIRST_ASSIST" },
  ],
};

/*
 * 防御側。「基本」は依頼の基本候補。ほかは**特定のアタッカーに合わせて特化した**組。
 * 「特化」の表は、この中から相手ごとに最も硬いものを選ぶ。
 */
const DEF_PATTERNS: Record<"HP型" | "DEF型", Pattern<DefSpecial>[]> = {
  HP型: [
    { name: "基本", specials: ["DMG_TAKEN", "MAX_HP", "CRIT_TAKEN"], weak: "W_CRIT" },
    { name: "対S3全体", specials: ["S3_TAKEN", "AOE_TAKEN", "CRIT_TAKEN"], weak: "W_CRIT" },
    { name: "対S3単体", specials: ["S3_TAKEN", "SINGLE_TAKEN", "CRIT_TAKEN"], weak: "W_CRIT" },
    { name: "満タン", specials: ["HP70_TAKEN", "S3_TAKEN", "CRIT_TAKEN"], weak: "W_CRIT" },
    { name: "開幕盾", specials: ["SHIELD_START", "S3_TAKEN", "CRIT_TAKEN"], weak: "W_CRIT" },
  ],
  DEF型: [
    { name: "基本", specials: ["DMG_TAKEN", "DEF_UP", "CRIT_TAKEN"], weak: "W_CRIT" },
    { name: "対S3全体", specials: ["S3_TAKEN", "AOE_TAKEN", "CRIT_TAKEN"], weak: "W_CRIT" },
    { name: "対S3単体", specials: ["S3_TAKEN", "SINGLE_TAKEN", "CRIT_TAKEN"], weak: "W_CRIT" },
    { name: "満タン", specials: ["HP70_TAKEN", "S3_TAKEN", "CRIT_TAKEN"], weak: "W_CRIT" },
    { name: "開幕盾", specials: ["SHIELD_START", "S3_TAKEN", "CRIT_TAKEN"], weak: "W_CRIT" },
  ],
};

/** 防御側の弱効果(1章の比較で最も効いたものに差し替える) */
let DEF_WEAK: WeakKey = "W_CRIT";

const tierCount: Record<Tier, number> = { HERO: 1, LEGEND: 2, EPIC: 3 };
const mainOnly = (kind: "ATK" | "HP" | "DEF", value: number): Accessory => ({ ...NONE, main: kind, mainValue: value });
const defMain = (d: DefenderSpec, mult = 1, kind?: "HP" | "DEF") =>
  (kind ?? (d.group === "HP型" ? "HP" : "DEF")) === "HP" ? mainOnly("HP", HP_MAIN * mult) : mainOnly("DEF", DEF_MAIN * mult);

function atkAcc(spec: AttackerSpec, p: number, tier: Tier, roll: Roll, mult: number): Accessory {
  const pattern = ATK_PATTERNS[spec.templateId][p];
  return { main: "ATK", mainValue: ATK_MAIN * mult, specials: pattern.specials.slice(0, tierCount[tier]), tier, roll, weak: pattern.weak, targetElement: "WATER" };
}
function defAcc(d: DefenderSpec, p: number, tier: Tier, roll: Roll, mult: number, kind?: "HP" | "DEF"): Accessory {
  const pattern = DEF_PATTERNS[d.group][p];
  return { ...defMain(d, mult, kind), specials: pattern.specials.slice(0, tierCount[tier]), tier, roll, weak: DEF_WEAK };
}

interface Stage {
  key: string;
  label: string;
  atk: ((spec: AttackerSpec, p: number) => Accessory) | null;
  def: ((d: DefenderSpec, p: number) => Accessory) | null;
  /** 防御の組を選べるか。false なら「基本」に固定(汎用の理想エピック) */
  defChoose: boolean;
}

const fixedAtk = (acc: Accessory) => () => acc;
const STAGES: Stage[] = [
  { key: "A", label: "アクセなし同士", atk: null, def: null, defChoose: false },
  { key: "M", label: "メインのみ(ATK+2,000 / HP+5,000・DEF+750)", atk: fixedAtk(mainOnly("ATK", ATK_MAIN)), def: (d) => defMain(d), defChoose: false },
  { key: "H", label: "ヒーロー同士(特殊1+弱1・中央値)", atk: (s, p) => atkAcc(s, p, "HERO", "STD", 1), def: (d, p) => defAcc(d, p, "HERO", "STD", 1), defChoose: false },
  { key: "L", label: "レジェンド同士(特殊2+弱1・中央値)", atk: (s, p) => atkAcc(s, p, "LEGEND", "STD", 1), def: (d, p) => defAcc(d, p, "LEGEND", "STD", 1), defChoose: false },
  { key: "E", label: "エピック同士(特殊3+弱1・中央値)", atk: (s, p) => atkAcc(s, p, "EPIC", "STD", 1), def: (d, p) => defAcc(d, p, "EPIC", "STD", 1), defChoose: false },
  { key: "X", label: "理想エピック同士(メイン×1.2・特殊上限・防御は基本)", atk: (s, p) => atkAcc(s, p, "EPIC", "MAX", 1.2), def: (d, p) => defAcc(d, p, "EPIC", "MAX", 1.2), defChoose: false },
  { key: "X特", label: "理想エピック同士(防御は相手に特化)", atk: (s, p) => atkAcc(s, p, "EPIC", "MAX", 1.2), def: (d, p) => defAcc(d, p, "EPIC", "MAX", 1.2), defChoose: true },
  { key: "XA", label: "攻撃側だけ理想エピック(防御はアクセなし)", atk: (s, p) => atkAcc(s, p, "EPIC", "MAX", 1.2), def: null, defChoose: false },
  { key: "XD", label: "防御側だけ理想エピック(攻撃はアクセなし・防御は基本)", atk: null, def: (d, p) => defAcc(d, p, "EPIC", "MAX", 1.2), defChoose: false },
  { key: "XD特", label: "防御側だけ理想エピック(攻撃はアクセなし・防御は相手に特化)", atk: null, def: (d, p) => defAcc(d, p, "EPIC", "MAX", 1.2), defChoose: true },
];
const stage = (key: string) => STAGES.find((s) => s.key === key)!;

/** 攻撃は最も通る組、防御は(選べる段では)最も通さない組を選ぶ */
function bestPair(spec: AttackerSpec, d: DefenderSpec, st: Stage, c: Condition, seed?: number): { ap: number; dp: number } {
  const aChoices = st.atk && st.key !== "M" ? ATK_PATTERNS[spec.templateId].map((_, i) => i) : [0];
  const dChoices = st.def && st.defChoose ? DEF_PATTERNS[d.group].map((_, i) => i) : [0];
  let worst = { ap: 0, dp: 0, value: Infinity };
  for (const dp of dChoices) {
    let best = { ap: 0, value: -Infinity };
    for (const ap of aChoices) {
      const r = resolve(attackerUnit(spec, st.atk ? st.atk(spec, ap) : NONE), spec, defenderUnit(d, st.def ? st.def(d, dp) : NONE, seed), c, true);
      if (rate(r) > best.value) best = { ap, value: rate(r) };
    }
    if (best.value < worst.value) worst = { ap: best.ap, dp, value: best.value };
  }
  return { ap: worst.ap, dp: worst.dp };
}
const accsOf = (spec: AttackerSpec, d: DefenderSpec, st: Stage, c: Condition) => {
  const { ap, dp } = bestPair(spec, d, st, c);
  return { a: st.atk ? st.atk(spec, ap) : NONE, t: st.def ? st.def(d, dp) : NONE, ap, dp };
};

/* ================================================================ 出力 */

console.log("# アクセサリー特殊効果 最終検証 全表\n");
console.log(`防御式 1000/(1000+${balanceFlags.swRatio}×DEF) / 属性 ${balanceFlags.elementMode}方式 / 攻撃UP ${ATK_UP * 100}% / 防御DOWN ${DEF_DOWN * 100}%(本番の statusValues.ts から読む)\n`);

console.log("## 0. 使った値(今回の新候補のみ)\n");
console.log("| 効果 | ヒーロー | レジェンド | エピック |");
console.log("|---|---|---|---|");
const fmt = (x: readonly [number, number]) => `${+(x[0] * 100).toFixed(1)}〜${+(x[1] * 100).toFixed(1)}%`;
for (const v of [...Object.values(ATK_SPECIALS), ...Object.values(DEF_SPECIALS)]) {
  console.log(`| ${v.label} | ${fmt(v.ranges.HERO)} | ${fmt(v.ranges.LEGEND)} | ${fmt(v.ranges.EPIC)} |`);
}
console.log("\n| 弱効果 | 値 |");
console.log("|---|---:|");
for (const w of Object.values(WEAKS)) console.log(`| ${w.label} | ${+(w.value * 100).toFixed(1)}% |`);

/* ---------------------------------------------------------------- 1. 最大HP増加の適用順 */

console.log("\n## 1. 最大HP増加・DEF増加の適用順\n");
{
  const d = KEY_DEFENDERS[1];
  const bare = buildAlly({ templateId: d.templateId, element: d.element, preset: d.preset, gear: [] }, mulberry32(seedOf(d)));
  const full = baseDef(d, seedOf(d));
  const ideal: Accessory = { main: "HP", mainValue: 6_000, specials: ["MAX_HP"], tier: "EPIC", roll: "MAX", weak: "W_MAX_HP" };
  const finalStyle = createBattleUnit(equipDefinition(full, ideal), "ENEMY", "x").maxHp;
  const baseStyle = Math.round((full.stats.hp + 6_000 + bare.stats.hp * 0.06));
  console.log("| 方式 | 超HP(ベヒモス最良)の最大HP | アクセなしからの増分 |");
  console.log("|---|---:|---:|");
  console.log(`| アクセなし | ${n(full.stats.hp)} | - |`);
  console.log(`| **採用: メイン実数を足した最終値 × (1+最大HP増加)**(潜在「不屈装甲」と同じ位置) | ${n(finalStyle)} | +${n(finalStyle - full.stats.hp)} |`);
  console.log(`| 参考: 装備のHP%と同じく素の値にだけ掛ける | ${n(baseStyle)} | +${n(baseStyle - full.stats.hp)} |`);
  console.log(`\n素の値(装備なし)は ${n(bare.stats.hp)}。HP型の最大HPの大半は装備から来ているので、素の値に掛ける方式では割合の効きがおよそ1/${Math.round(full.stats.hp / bare.stats.hp)}になる。\n`);
}

/* ---------------------------------------------------------------- 2. 弱効果 */

console.log("## 2. 弱効果の比較\n");
console.log("### 防御側(1つだけ着けた時の、闇ネメシスS3クリ1回の削り率の変化)\n");
console.log("| 弱効果 | HP型・素 | HP型・防御DOWN | 超DEF・素 | 対闇ドラゴン(HP型) | 一撃に効くか |");
console.log("|---|---:|---:|---:|---:|---|");
{
  const nem = ATTACKERS[1];
  const dra = ATTACKERS[0];
  const scores: { key: WeakKey; total: number }[] = [];
  const keys: WeakKey[] = ["W_MAX_HP", "W_DEF", "W_DMG", "W_CRIT", "W_LOW30", "W_TURN_HEAL", "W_START_SHIELD", "W_HIT_HEAL"];
  for (const key of keys) {
    const cells = ([[nem, KEY_DEFENDERS[0], "素"], [nem, KEY_DEFENDERS[0], "防御DOWN"], [nem, KEY_DEFENDERS[3], "素"], [dra, KEY_DEFENDERS[0], "素"]] as const).map(([a, d, c]) => {
      const base = resolve(attackerUnit(a, mainOnly("ATK", ATK_MAIN)), a, defenderUnit(d, defMain(d)), c, true);
      const w = resolve(attackerUnit(a, mainOnly("ATK", ATK_MAIN)), a, defenderUnit(d, { ...defMain(d), weak: key }), c, true);
      return rate(w) / rate(base) - 1;
    });
    scores.push({ key, total: cells.slice(0, 3).reduce((x, y) => x + y, 0) });
    const direct = !["W_LOW30", "W_TURN_HEAL", "W_HIT_HEAL"].includes(key);
    console.log(`| ${WEAKS[key].label} | ${cells.map(signed).join(" | ")} | ${direct ? "効く" : "効かない(条件・長期戦)"} |`);
  }
  scores.sort((a, b) => a.total - b.total);
  DEF_WEAK = scores[0].key;
  for (const g of ["HP型", "DEF型"] as const) for (const p of DEF_PATTERNS[g]) p.weak = DEF_WEAK;
  console.log(`\n以降、防御側の弱効果は最も効いた **${WEAKS[DEF_WEAK].label}** を着ける(防御側に最も有利)。\n`);
}
console.log("### 攻撃側(闇ネメシス、メインのみの相手、1つだけ着けた時)\n");
console.log("| 弱効果 | HP型・素 | HP型・防御DOWN | 超DEF・素 | 追撃発動時の上乗せ(HP型・素) |");
console.log("|---|---:|---:|---:|---:|");
{
  const nem = ATTACKERS[1];
  for (const key of ["FIRST_ASSIST", "COMBO_ASSIST", "FINISH", "FOLLOWUP", "LIFESTEAL", "KILL_AFTERGLOW"] as WeakKey[]) {
    const cells = ([[KEY_DEFENDERS[0], "素"], [KEY_DEFENDERS[0], "防御DOWN"], [KEY_DEFENDERS[3], "素"]] as const).map(([d, c]) => {
      const base = resolve(attackerUnit(nem, mainOnly("ATK", ATK_MAIN)), nem, defenderUnit(d, defMain(d)), c, true);
      const w = resolve(attackerUnit(nem, { ...mainOnly("ATK", ATK_MAIN), weak: key }), nem, defenderUnit(d, defMain(d)), c, true);
      return signed(rate(w) / rate(base) - 1);
    });
    const f = resolve(attackerUnit(nem, { ...mainOnly("ATK", ATK_MAIN), weak: key }), nem, defenderUnit(KEY_DEFENDERS[0], defMain(KEY_DEFENDERS[0])), "素", true);
    const extra = key === "FOLLOWUP" ? `+${((f.followupTotal - f.firstTotal) / f.hp * 100).toFixed(1)}pt` : "-";
    console.log(`| ${WEAKS[key].label} | ${cells.join(" | ")} | ${extra} |`);
  }
  console.log("\n「小さな追撃」は発動率10〜15%の追加の1Hit。上の3列は発動しない前提、右端が発動した時の削り率の上乗せ。\n");
}

/* ---------------------------------------------------------------- 3. 1個ずつの寄与 */

console.log("## 3. 特殊効果1個ずつの寄与(エピック中央値・上限)\n");
console.log("攻撃側 ATK+2,000、防御側 HP+5,000 / DEF+750。その効果を1つ足した時の、スキル1回・クリの削り率の変化。\n");
{
  const nem = ATTACKERS[1];
  const wolf = ATTACKERS[2];
  const dra = ATTACKERS[0];
  type Col = { label: string; a: AttackerSpec; d: DefenderSpec; c: Condition; hp?: number };
  const cols: Col[] = [
    { label: "ネメ→HP型・素", a: nem, d: KEY_DEFENDERS[0], c: "素" },
    { label: "ネメ→HP型・防御DOWN", a: nem, d: KEY_DEFENDERS[0], c: "防御DOWN" },
    { label: "ウルフ→HP型・素", a: wolf, d: KEY_DEFENDERS[0], c: "素" },
    { label: "ネメ→HP型・敵HP30%", a: nem, d: KEY_DEFENDERS[0], c: "素", hp: 0.3 },
    { label: "ネメ→超DEF・素", a: nem, d: KEY_DEFENDERS[3], c: "素" },
    { label: "ドラゴン→HP型・素", a: dra, d: KEY_DEFENDERS[0], c: "素" },
  ];
  const r2 = (res: Resolution, hp = 1) => res.firstTotal / (res.hp * hp + (hp >= 1 ? res.startShield : 0));
  console.log("### 攻撃特殊\n");
  console.log(`| 効果 | 中央値 | 上限 | ${cols.map((c) => c.label).join(" | ")} |`);
  console.log(`|---|---:|---:|${cols.map(() => "---:").join("|")}|`);
  for (const key of Object.keys(ATK_SPECIALS) as AtkSpecial[]) {
    if (key === "KILL_GAUGE") continue;
    const cells = cols.map((c) => {
      const w = resolve(attackerUnit(c.a, { ...mainOnly("ATK", ATK_MAIN), specials: [key], tier: "EPIC", targetElement: "WATER" }), c.a, defenderUnit(c.d, defMain(c.d)), c.c, true, c.hp);
      const b = resolve(attackerUnit(c.a, mainOnly("ATK", ATK_MAIN)), c.a, defenderUnit(c.d, defMain(c.d)), c.c, true, c.hp);
      return signed(r2(w, c.hp) / r2(b, c.hp) - 1);
    });
    const range = ATK_SPECIALS[key].ranges.EPIC;
    console.log(`| ${SPECIAL_LABEL[key]} | ${pct((range[0] + range[1]) / 2)} | ${pct(range[1])} | ${cells.join(" | ")} |`);
  }
  console.log("\n### 防御特殊\n");
  const dcols: Col[] = [
    { label: "ネメ→HP型・素", a: nem, d: KEY_DEFENDERS[0], c: "素" },
    { label: "ネメ→HP型・防御DOWN", a: nem, d: KEY_DEFENDERS[0], c: "防御DOWN" },
    { label: "ネメ→HP型・HP50%から", a: nem, d: KEY_DEFENDERS[0], c: "素", hp: 0.5 },
    { label: "ウルフ(単体)→HP型・素", a: wolf, d: KEY_DEFENDERS[0], c: "素" },
    { label: "ネメ→超DEF・素", a: nem, d: KEY_DEFENDERS[3], c: "素" },
    { label: "ドラゴン(防御無視)→超DEF・素", a: dra, d: KEY_DEFENDERS[3], c: "素" },
  ];
  console.log(`| 効果 | 中央値 | 上限 | ${dcols.map((c) => c.label).join(" | ")} |`);
  console.log(`|---|---:|---:|${dcols.map(() => "---:").join("|")}|`);
  for (const key of Object.keys(DEF_SPECIALS) as DefSpecial[]) {
    if (key === "TURN_HEAL" || key === "HIT_HEAL") continue;
    const cells = dcols.map((c) => {
      const w = resolve(attackerUnit(c.a, mainOnly("ATK", ATK_MAIN)), c.a, defenderUnit(c.d, { ...defMain(c.d), specials: [key], tier: "EPIC" }), c.c, true, c.hp);
      const b = resolve(attackerUnit(c.a, mainOnly("ATK", ATK_MAIN)), c.a, defenderUnit(c.d, defMain(c.d)), c.c, true, c.hp);
      return signed(r2(w, c.hp) / r2(b, c.hp) - 1);
    });
    const range = DEF_SPECIALS[key].ranges.EPIC;
    console.log(`| ${SPECIAL_LABEL[key]} | ${pct((range[0] + range[1]) / 2)} | ${pct(range[1])} | ${cells.join(" | ")} |`);
  }
  console.log("\nターン開始時回復・被弾時回復は一撃には効かないので、9章(長期戦)で見る。\n");
}

/* ---------------------------------------------------------------- 4. 重ね方 */

console.log("## 4. 重ね方: 加算と乗算\n");
console.log("理想エピック同士(防御は相手に特化)で、スキル1回・クリの削り率。\n");
console.log("| 攻撃側 | 防御側 | 条件 | 攻加算・防加算 | 攻乗算・防乗算 | 攻加算・防乗算 | 攻乗算・防加算 | 攻撃3効果の合計(加算 / 乗算) | 防御の合計軽減(加算 / 乗算) |");
console.log("|---|---|---|---:|---:|---:|---:|---|---|");
for (const spec of ATTACKERS) {
  for (const d of [KEY_DEFENDERS[0], KEY_DEFENDERS[3]]) {
    for (const c of spec.ignoresDefense ? ["素"] as Condition[] : ["素", "攻撃UP+防御DOWN"] as Condition[]) {
      const { a, t } = accsOf(spec, d, stage("X特"), c);
      const cells: string[] = [];
      for (const [sa, sd] of [["ADD", "ADD"], ["MUL", "MUL"], ["ADD", "MUL"], ["MUL", "ADD"]] as [Stacking, Stacking][]) {
        STACK_ATK = sa; STACK_DEF = sd;
        cells.push(pct(rate(resolve(attackerUnit(spec, a), spec, defenderUnit(d, t), c, true))));
      }
      STACK_ATK = "ADD"; STACK_DEF = "ADD";
      const addR = resolve(attackerUnit(spec, a), spec, defenderUnit(d, t), c, true);
      const atkSumAdd = (Object.values(addR.atkParts) as number[]).reduce((x, y) => x + y, 0);
      const atkSumMul = (Object.values(addR.atkParts) as number[]).reduce((m, v) => m * (1 + v), 1) - 1;
      const defSumAdd = (Object.values(addR.defParts) as number[]).reduce((x, y) => x + y, 0);
      const defSumMul = 1 - (Object.values(addR.defParts) as number[]).reduce((m, v) => m * (1 - v), 1);
      STACK_ATK = "ADD"; STACK_DEF = "MUL";
      console.log(`| ${spec.label} | ${d.label} | ${c} | ${cells.join(" | ")} | +${pct(atkSumAdd)} / +${pct(atkSumMul)} | -${pct(defSumAdd)} / -${pct(defSumMul)} |`);
    }
  }
}
console.log("\n以降は **攻撃=加算 / 防御=乗算**(どちらも重ねた時に小さくなる側)で測る。\n");

/* ---------------------------------------------------------------- 5. 段階ごとの詳細 */

console.log("## 5. 段階ごとの詳細(代表の個体)\n");
console.log("攻撃は最も通る組を選ぶ。防御は「特」の段だけ相手に合わせて選び、それ以外は「基本」。**1Hit** は1Hit目の着弾値、**削り率**はスキル1回・着弾後の合計 ÷(最大HP+開始時シールド)。**撃破回数**は満タンから倒すまでのスキル使用回数(相手は回復しない)。**特殊増減**は同じメインで特殊・弱を外した時との比。\n");
console.log("| 段階 | 攻撃側 | 攻撃の組 | 防御側 | 防御の組 | 条件 | 攻撃 HP / ATK / DEF | クリ率 | クリダメ | 防御 HP / DEF | 開始盾 | 非クリ1Hit | クリ1Hit | 削り率 非クリ / クリ | 撃破回数 非クリ / クリ | 特殊増減 攻 / 防 |");
console.log("|---|---|---|---|---|---|---|---:|---:|---|---:|---:|---:|---|---|---|");
for (const st of STAGES) {
  for (const spec of ATTACKERS) {
    for (const d of KEY_DEFENDERS) {
      for (const c of conditionsFor(spec)) {
        const { a, t, ap, dp } = accsOf(spec, d, st, c);
        const A = attackerUnit(spec, a);
        const D = defenderUnit(d, t);
        const nc = resolve(A, spec, D, c, false);
        const cr = resolve(A, spec, D, c, true);
        const aMain = attackerUnit(spec, { ...a, specials: [], weak: null });
        const dMain = defenderUnit(d, { ...t, specials: [], weak: null });
        const base = rate(resolve(aMain, spec, dMain, c, true));
        const atkEff = a.specials.length ? signed(rate(resolve(A, spec, dMain, c, true)) / base - 1) : "-";
        const defEff = t.specials.length ? signed(rate(resolve(aMain, spec, D, c, true)) / base - 1) : "-";
        const aName = a.specials.length ? ATK_PATTERNS[spec.templateId][ap].name : "-";
        const dName = t.specials.length ? DEF_PATTERNS[d.group][dp].name : "-";
        console.log(`| ${st.key} | ${spec.label} | ${aName} | ${d.label} | ${dName} | ${c} | ${n(A.maxHp)} / ${n(getEffectiveStat(A, "atk"))} / ${n(getEffectiveStat(A, "def"))} | ${pct(cr.critRate)} | ${pct(cr.critDmg)} | ${n(cr.hp)} / ${n(getEffectiveStat(D, "def"))} | ${n(cr.startShield)} | ${n(nc.firstHitLanded)} | ${n(cr.firstHitLanded)} | ${pct(rate(nc))} / ${pct(rate(cr))}${cr.oneShot ? "★" : ""} | ${nc.uses} / ${cr.uses} | ${atkEff} / ${defEff} |`);
      }
    }
  }
}
console.log("\n★ = スキル1回で倒れる。\n");

/* ---------------------------------------------------------------- 6. 個体差 */

console.log("## 6. 個体差 0.8 / 1.0 / 1.2(エピック)\n");
console.log("メインの倍率と、特殊効果の値(0.8→幅の下端、1.0→真ん中、1.2→上端)を揃えて動かす。攻撃・防御とも同じ段。1マスはスキル1回・クリの削り率。\n");
{
  const rolls: [number, Roll][] = [[0.8, "MIN"], [1.0, "STD"], [1.2, "MAX"]];
  console.log("| 攻撃側 | 防御側 | 条件 | 0.8(ATK+1,600 / HP+4,000・DEF+600) | 1.0 | 1.2(ATK+2,400 / HP+6,000・DEF+900) | 攻1.2・防0.8 | 攻0.8・防1.2 |");
  console.log("|---|---|---|---:|---:|---:|---:|---:|");
  for (const spec of ATTACKERS) {
    for (const d of KEY_DEFENDERS) {
      const c = spec.ignoresDefense ? "攻撃UP" : "攻撃UP+防御DOWN";
      const ap = bestPair(spec, d, stage("E"), c).ap;
      const cell = (ra: [number, Roll], rd: [number, Roll]) => {
        const r = resolve(attackerUnit(spec, atkAcc(spec, ap, "EPIC", ra[1], ra[0])), spec, defenderUnit(d, defAcc(d, 0, "EPIC", rd[1], rd[0])), c, true);
        return `${pct(rate(r))}${r.oneShot ? "★" : ""}`;
      };
      console.log(`| ${spec.label} | ${d.label} | ${c} | ${cell(rolls[0], rolls[0])} | ${cell(rolls[1], rolls[1])} | ${cell(rolls[2], rolls[2])} | ${cell(rolls[2], rolls[0])} | ${cell(rolls[0], rolls[2])} |`);
    }
  }
  console.log("");
}

/* ---------------------------------------------------------------- 7. 400組 */

const PAIRS = 20;
function pairStats(spec: AttackerSpec, d: DefenderSpec, st: Stage, c: Condition, defOverride?: (d: DefenderSpec, p: number) => Accessory) {
  const s2: Stage = defOverride ? { ...st, def: defOverride } : st;
  const { ap, dp } = bestPair(spec, d, s2, c);
  const a = s2.atk ? s2.atk(spec, ap) : NONE;
  const t = s2.def ? s2.def(d, dp) : NONE;
  const ratios: number[] = [];
  let kills = 0;
  for (let i = 0; i < PAIRS; i += 1) {
    const A = attackerUnit(spec, a, 1000 + i);
    for (let j = 0; j < PAIRS; j += 1) {
      const r = resolve(A, spec, defenderUnit(d, t, 2000 + j), c, true);
      ratios.push(rate(r));
      if (r.oneShot) kills += 1;
    }
  }
  ratios.sort((x, y) => x - y);
  return { killed: kills / ratios.length, median: ratios[Math.floor(ratios.length / 2)] };
}

console.log(`## 7. 個体差込み(攻撃側${PAIRS} × 防御側${PAIRS} = ${PAIRS * PAIRS}組)\n`);
console.log("1マス = **クリ1回で倒れる組の割合**(括弧内は削り率の中央値)。攻撃側のクリ率は9割を超える。\n");
for (const spec of ATTACKERS) {
  const conds = conditionsFor(spec);
  console.log(`### ${spec.label}\n`);
  console.log(`| 段階 | 防御側 | ${conds.join(" | ")} |`);
  console.log(`|---|---|${conds.map(() => "---:").join("|")}|`);
  for (const st of STAGES) {
    for (const d of ALL_DEFENDERS) {
      const cells = conds.map((c) => { const r = pairStats(spec, d, st, c); return `${pct(r.killed)} (${pct(r.median)})`; });
      console.log(`| ${st.key} | ${d.label} | ${cells.join(" | ")} |`);
    }
  }
  console.log("");
}

/* ---------------------------------------------------------------- 8. メイン候補 */

console.log("## 8. HP・DEF メイン候補(理想エピック同士・防御は相手に特化・400組)\n");
console.log("防御側のメインだけを振る(着けるのはその値そのもの。1.2倍個体なら 4,800〜7,200 / 720〜1,080 に相当)。闇ネメシス。1マスはクリ1回で倒れる割合(削り率の中央値)。「交差」= HP型にDEFメイン、DEF型にHPメイン。\n");
{
  const nem = ATTACKERS[1];
  const cands: { label: string; kind: "HP" | "DEF"; value: number }[] = [
    { label: "HP+4,000", kind: "HP", value: 4_000 }, { label: "HP+5,000", kind: "HP", value: 5_000 }, { label: "HP+6,000", kind: "HP", value: 6_000 },
    { label: "DEF+600", kind: "DEF", value: 600 }, { label: "DEF+750", kind: "DEF", value: 750 }, { label: "DEF+900", kind: "DEF", value: 900 },
  ];
  for (const c of ["攻撃UP+防御DOWN", "防御DOWN"] as Condition[]) {
    console.log(`\n**${c}**\n`);
    console.log(`| 防御側 | 型 | ${cands.map((x) => x.label).join(" | ")} | 参考: A アクセなし同士 |`);
    console.log(`|---|---|${cands.map(() => "---:").join("|")}|---:|`);
    for (const d of ALL_DEFENDERS) {
      const cells = cands.map((cand) => {
        const r = pairStats(nem, d, stage("X特"), c, (dd, p) => ({ ...defAcc(dd, p, "EPIC", "MAX", 1), main: cand.kind, mainValue: cand.value }));
        return `${pct(r.killed)} (${pct(r.median)})`;
      });
      const a = pairStats(nem, d, stage("A"), c);
      console.log(`| ${d.label} | ${d.group} | ${cells.join(" | ")} | ${pct(a.killed)} (${pct(a.median)}) |`);
    }
  }
  console.log("");
}

/* ================================================================ 実戦(本番の BattleEngine) */

interface TeamMember { spec: Subject; acc: Accessory; grade?: GearGrade; seedOffset: number }

interface BattleStats {
  wins: number; losses: number; draws: number;
  turns: number[];
  firstKill: number;
  defenseHpAt: number[];
  shield50: number; hitHeals: number;
}

/**
 * 本番の BattleEngine で1戦。アクセは `attachAccessories` でこのエンジンにだけ差し込む。
 * 「初手1体撃破」= 攻撃側の最初の行動で、防御側が1体以上倒れたか。
 */
function runBattle(attack: TeamMember[], defense: TeamMember[], seed: number, maxTurns = 300, hitHealChance?: number) {
  const rng = mulberry32(seed);
  const accOf = new Map<string, Accessory>();
  const players = attack.map((m, i) => {
    accOf.set(`P${i + 1}`, m.acc);
    return equipDefinition(baseDef(m.spec, 1000 + m.seedOffset + seed % 20, m.grade), m.acc);
  });
  const enemies = defense.map((m, i) => {
    accOf.set(`E${i + 1}`, hitHealChance === undefined ? m.acc : { ...m.acc, hitHealChance });
    return equipDefinition(baseDef(m.spec, 2000 + m.seedOffset + seed % 20, m.grade), m.acc);
  });
  const engine = new BattleEngine(players, enemies, { rng, maxTurns });
  const attached = attachAccessories(engine, (u) => accOf.get(u.instanceId) ?? NONE, { stackAtk: STACK_ATK, stackDef: STACK_DEF, rng: mulberry32(seed ^ 0x9e3779b9) });
  const internals = engine as unknown as { units: BattleUnit[]; recordTurn: (unit: BattleUnit, ...rest: unknown[]) => unknown };
  const originalRecord = internals.recordTurn.bind(engine);
  let firstDone = false;
  let firstKill = false;
  internals.recordTurn = (unit, ...rest) => {
    if (!firstDone && unit.team === "PLAYER") {
      const before = internals.units.filter((u) => u.team === "ENEMY" && u.alive).length;
      const out = originalRecord(unit, ...rest);
      firstKill = internals.units.filter((u) => u.team === "ENEMY" && u.alive).length < before;
      firstDone = true;
      return out;
    }
    return originalRecord(unit, ...rest);
  };
  const result = engine.run();
  const enemiesLeft = internals.units.filter((u) => u.team === "ENEMY");
  const hpRatio = enemiesLeft.reduce((s, u) => s + Math.max(0, u.currentHp), 0) / enemiesLeft.reduce((s, u) => s + u.maxHp, 0);
  return { winner: result.winner, turns: result.turnsTaken, firstKill, hpRatio, ...attached.stats };
}

function runMany(attack: TeamMember[], defense: TeamMember[], count: number, maxTurns = 300, hitHealChance?: number): BattleStats {
  const s: BattleStats = { wins: 0, losses: 0, draws: 0, turns: [], firstKill: 0, defenseHpAt: [], shield50: 0, hitHeals: 0 };
  for (let i = 0; i < count; i += 1) {
    const r = runBattle(attack, defense, 50_000 + i, maxTurns, hitHealChance);
    if (r.winner === "PLAYER") s.wins += 1; else if (r.winner === "ENEMY") s.losses += 1; else s.draws += 1;
    s.turns.push(r.turns);
    if (r.firstKill) s.firstKill += 1;
    s.defenseHpAt.push(r.hpRatio);
    s.shield50 += r.shield50;
    s.hitHeals += r.hitHeals;
  }
  return s;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const ATTACK_TEAM: AttackerSpec[] = [ATTACKERS[0], ATTACKERS[1], ATTACKERS[2], FOURTH];
const DEFENSE_TEAM: DefenderSpec[] = [
  { label: "ミミック[水]", templateId: "mimic", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP型" },
  { label: "ベヒモス[水]", templateId: "behemoth", element: "WATER", preset: "HP_SCALE_ENDURE", group: "HP型" },
  { label: "シェルタートル[水]", templateId: "shellturtle", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF型" },
  { label: "グレイヴナイト[水]", templateId: "knight", element: "WATER", preset: "DEF_SCALE_ENDURE", group: "DEF型" },
];

/** 実戦では相手を見て付け替えられないので、攻撃側は各自の「初撃」、防御側は「基本」か「対S3全体」に固定する */
function teamFor(st: Stage, defPatternName: "基本" | "対S3全体", grade?: GearGrade): { attack: TeamMember[]; defense: TeamMember[] } {
  const attack = ATTACK_TEAM.map((spec, i) => {
    const p = ATK_PATTERNS[spec.templateId].findIndex((x) => x.name === "初撃");
    const acc = st.atk ? (st.key === "M" ? mainOnly("ATK", ATK_MAIN) : st.atk(spec, Math.max(0, p))) : NONE;
    return { spec, acc, grade, seedOffset: i };
  });
  const defense = DEFENSE_TEAM.map((d, i) => {
    const p = DEF_PATTERNS[d.group].findIndex((x) => x.name === defPatternName);
    const acc = st.def ? st.def(d, p) : NONE;
    return { spec: d, acc, seedOffset: i };
  });
  return { attack, defense };
}

function battleRow(label: string, s: BattleStats, total: number): string {
  // 上限300で止まった戦い(時間切れ)は決着に数えない
  const within = (t: number) => pct(s.turns.filter((x) => x <= t && x < 300).length / total);
  return `| ${label} | ${pct(s.wins / total)} | ${pct(s.losses / total)} | ${pct(s.draws / total)} | ${mean(s.turns).toFixed(1)} | ${median(s.turns)} | ${Math.max(...s.turns)} | ${pct(s.firstKill / total)} | ${within(20)} | ${within(80)} | ${within(160)} |`;
}

console.log(`\n## 9. 実戦4対4(本番の BattleEngine、各${BATTLES}戦)\n`);
console.log(`攻撃側: ${ATTACK_TEAM.map((a) => a.label).join("・")}(MAX_ATTACKER、各自「初撃」の組)。防御側: ${DEFENSE_TEAM.map((d) => d.label).join("・")}(HP型/DEF型の完成個体)。**ターン = エンジンの行動回数**(1体が1回動くと1)。上限300で引き分け。8体いるので、80行動 ≒ 10ラウンド、160行動 ≒ 20ラウンド。\n`);
console.log("| 段階 | 攻撃側勝率 | 防御側勝率 | 引き分け(時間切れ) | 平均ターン | 中央ターン | 最長ターン | 初手1体撃破率 | 20行動以内決着 | 80行動以内 | 160行動以内 |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
const battleStages: { st: Stage; def: "基本" | "対S3全体"; label: string }[] = [
  { st: stage("A"), def: "基本", label: "A アクセなし同士" },
  { st: stage("M"), def: "基本", label: "M メインのみ同士" },
  { st: stage("H"), def: "基本", label: "H ヒーロー同士" },
  { st: stage("L"), def: "基本", label: "L レジェンド同士" },
  { st: stage("E"), def: "基本", label: "E エピック同士" },
  { st: stage("X"), def: "基本", label: "X 理想エピック同士(防御は基本)" },
  { st: stage("X"), def: "対S3全体", label: "X特 理想エピック同士(防御は対S3全体)" },
  { st: stage("XA"), def: "基本", label: "XA 攻撃側だけ理想エピック" },
  { st: stage("XD"), def: "基本", label: "XD 防御側だけ理想エピック(基本)" },
  { st: stage("XD"), def: "対S3全体", label: "XD特 防御側だけ理想エピック(対S3全体)" },
];
for (const b of battleStages) {
  const { attack, defense } = teamFor(b.st, b.def);
  const s = runMany(attack, defense, BATTLES);
  console.log(battleRow(b.label, s, BATTLES));
}

/* ---------------------------------------------------------------- 10. 長期戦 */

console.log("\n## 10. 長期戦: 回復・シールドが重なった耐久編成\n");
console.log("防御側の4体すべてに同じ耐久アクセ(理想エピック・上限値)を着け、**低火力の攻撃編成**(同じ4体の装備を育成途中=MID に落とし、アクセなし)と、完成の攻撃編成(メインのみ)で戦わせる。防御側は全員が体力4セット(毎ターン最大HP5%回復)を持っている。\n");
{
  const sustainPatterns: { label: string; specials: DefSpecial[]; weak: WeakKey }[] = [
    { label: "回復特化(ターン回復・被弾回復・50%盾)+微回復", specials: ["TURN_HEAL", "HIT_HEAL", "SHIELD50"], weak: "W_TURN_HEAL" },
    { label: "回復+軽減(ターン回復・常時軽減・クリ軽減)+微回復", specials: ["TURN_HEAL", "DMG_TAKEN", "CRIT_TAKEN"], weak: "W_TURN_HEAL" },
    { label: "基本(常時軽減・HP/DEF・クリ軽減)+会心耐性", specials: [], weak: "W_CRIT" },
  ];
  const defenseWith = (sp: typeof sustainPatterns[number] | null): TeamMember[] => DEFENSE_TEAM.map((d, i) => {
    if (!sp) return { spec: d, acc: NONE, seedOffset: i };
    const specials = sp.specials.length ? sp.specials : DEF_PATTERNS[d.group][0].specials;
    return { spec: d, acc: { ...defMain(d, 1.2), specials, tier: "EPIC" as Tier, roll: "MAX" as Roll, weak: sp.weak }, seedOffset: i };
  });
  const lowAttack: TeamMember[] = ATTACK_TEAM.map((spec, i) => ({ spec, acc: NONE, grade: "MID", seedOffset: i }));
  const fullAttack: TeamMember[] = ATTACK_TEAM.map((spec, i) => ({ spec, acc: mainOnly("ATK", ATK_MAIN), seedOffset: i }));
  const count = Math.max(40, Math.floor(BATTLES / 2));
  console.log(`各${count}戦。「防御側の残りHP」は防御側4体の残りHPの合計 ÷ 最大HPの合計(倒れた個体は0)。\n`);
  console.log("| 攻撃編成 | 防御アクセ | 80行動時点(≒10ラウンド)の残りHP | 160行動時点(≒20ラウンド)の残りHP | 300行動で攻撃側勝ち | 防御側勝ち | 時間切れ |");
  console.log("|---|---|---:|---:|---:|---:|---:|");
  for (const [aLabel, attack] of [["低火力(MID装備・アクセなし)", lowAttack], ["完成(ATK+2,000のみ)", fullAttack]] as const) {
    for (const sp of [null, ...sustainPatterns]) {
      const defense = defenseWith(sp);
      const at80 = runMany(attack, defense, count, 80, 0.20);
      const at160 = runMany(attack, defense, count, 160, 0.20);
      const full = runMany(attack, defense, count, 300, 0.20);
      console.log(`| ${aLabel} | ${sp ? sp.label : "アクセなし"} | ${pct(mean(at80.defenseHpAt))} | ${pct(mean(at160.defenseHpAt))} | ${pct(full.wins / count)} | ${pct(full.losses / count)} | ${pct(full.draws / count)} |`);
    }
  }
  console.log("\n被弾時回復の発動率は、この表では最も強い **20%** にしている。\n");

  console.log("### 被弾時回復の発動率(10 / 15 / 20%)\n");
  console.log("| 発動率 | 1Hitあたりの期待回復(最大HP比、エピック2%) | 攻撃側4体の1巡で受けるHit数の目安 | 1巡あたりの期待回復 | 低火力相手の300行動: 攻撃側勝ち / 時間切れ |");
  console.log("|---:|---:|---:|---:|---|");
  const sp = sustainPatterns[0];
  for (const chance of [0.10, 0.15, 0.20]) {
    const s = runMany(lowAttack, defenseWith(sp), count, 300, chance);
    // 1巡(攻撃側4体が1回ずつ)で1体が受けるHit数の目安: 全体技(ドラゴン1・ネメシス2)+ 単体技(ウルフ3・スコーピオン1)の平均的な振り分け
    const hitsPerRound = 1 + 2 + (3 + 1) / 4;
    console.log(`| ${pct(chance)} | ${pct(chance * 0.02)} | 約${hitsPerRound.toFixed(1)} | ${pct(chance * 0.02 * hitsPerRound)} | ${pct(s.wins / count)} / ${pct(s.draws / count)} |`);
  }
  console.log("\n多段技を多く受けるほど抽選回数が増える。**回復量は最大HP比例なので、HP型ほど実数で大きい。**\n");
}
