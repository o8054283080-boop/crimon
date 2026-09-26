import { MonsterTemplate } from "../../core/monster.js";
import {
  ATK_DOWN, DEF_DOWN, DEF_UP, POISON_RATE, SPD_DOWN, SPD_UP, passive,
} from "./shared.js";

/*
 * 星3の3種。
 *
 * 星3は**最初に手に入って、最後まで使える**位置づけ。
 * 「ふつうのモンスターでも、育てて装備を整えれば奥まで行ける」という
 * このゲームの芯(docs/design-concept.md)を、いちばん体現する層になる。
 * だから役割は尖らせるが、数字そのものは既存の星3と同じ水準に置いてある。
 */

/**
 * マッシュルン。**毒と弱体で、時間をかけて相手を崩す。**
 *
 * 毒は既にスライムが持っているが、あちらは「全体に撒く」役。
 * こちらは**弱体を重ねて、重ねた分だけ痛くする**方向にしてある。
 * 光は味方の立て直し、闇は重ねた弱体を火力へ変換する。
 */
export const MUSHROON: MonsterTemplate = {
  templateId: "mushroon",
  baseName: "マッシュルン",
  role: "デバッファー",
  emoji: "🍄",
  gachaStar: 3,
  baseStats: { hp: 1250, atk: 95, def: 82, spd: 96, criRate: 0.15, criDmg: 1.5, resistance: 0.18, accuracy: 0.22 },
  skill1: {
    id: "mushroon_s1",
    name: "胞子弾",
    description: "ダメージ倍率 1.00倍。60%で毒1スタック (1スタックにつき最大HPの5%、最大5スタック、2ターン)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1 },
      { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.6 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1 }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.6 }] },
      // Lv2 ダメージ倍率 1.00倍→1.10倍 / 毒1スタック 5%→5.5%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "POISON", damageRatePerStack: 0.055, durationTurns: 2, chance: 0.6 }] },
      // Lv3 毒の発動率 60%→70% / 毒1スタック 5.5%→6%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 2, chance: 0.7 }] },
      // Lv4 ダメージ倍率 1.10倍→1.20倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 2, chance: 0.7 }] },
      // Lv5 毒の発動率 70%→80% / 毒の持続 2→3ターン / 毒1スタック 6%→6.5%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "POISON", damageRatePerStack: 0.065, durationTurns: 3, chance: 0.8 }] },
    ],
  },
  skill2Variants: [
    {
      id: "mushroon_s2_a",
      name: "毒胞子の雨",
      description: "ダメージ倍率 0.90倍。75%で毒2スタック (1スタックにつき最大HPの5%、最大5スタック、2ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.9 },
        { kind: "POISON", damageRatePerStack: 0.05, stacks: 2, chance: 0.75, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.9 }, { kind: "POISON", damageRatePerStack: 0.05, stacks: 2, chance: 0.75, durationTurns: 2 }] },
        // Lv2 ダメージ倍率 0.90倍→1.00倍 / 毒の発動率 75%→80% / 毒1スタック 5%→5.5%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1 }, { kind: "POISON", damageRatePerStack: 0.055, stacks: 2, chance: 0.8, durationTurns: 2 }] },
        // Lv3 毒の発動率 80%→85% / 毒1スタック 5.5%→6%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1 }, { kind: "POISON", damageRatePerStack: 0.06, stacks: 2, chance: 0.85, durationTurns: 2 }] },
        // Lv4 ダメージ倍率 1.00倍→1.10倍 / 毒の発動率 85%→90%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "POISON", damageRatePerStack: 0.06, stacks: 2, chance: 0.9, durationTurns: 2 }] },
        // Lv5 クールタイム -1(4→3ターン) / 毒の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "POISON", damageRatePerStack: 0.06, stacks: 2, chance: 0.9, durationTurns: 3 }] },
      ],
    },
    {
      id: "mushroon_s2_b",
      name: "衰弱胞子",
      description: "ダメージ倍率 1.40倍。80%で攻撃力-50% (2ターン)。80%で治癒阻害 (2ターン、回復を受けられない)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.4 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.8 },
        { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.8 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.8 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.8 }] },
        // Lv2 ダメージ倍率 1.40倍→1.50倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.8 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.8 }] },
        // Lv3 弱体の発動率 80%→90% / 治癒阻害の発動率 80%→90%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.9 }] },
        // Lv4 ダメージ倍率 1.50倍→1.60倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.6 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.9 }] },
        // Lv5 クールタイム -1(4→3ターン) / 弱体の発動率 90%→100% / 弱体の持続 2→3ターン / 治癒阻害の発動率 90%→100% / 治癒阻害の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.6 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 3, chance: 1 }, { kind: "HEAL_BLOCK", durationTurns: 3, chance: 1 }] },
      ],
    },
    {
      id: "mushroon_s2_c",
      name: "しびれ胞子",
      description: "ダメージ倍率 1.30倍。80%で速度-30% (2ターン)。行動ゲージ-35%",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.35 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.8 }, { kind: "GAUGE", amount: -0.35 }] },
        // Lv2 ダメージ倍率 1.30倍→1.40倍 / 弱体の発動率 80%→90%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.35 }] },
        // Lv3 行動ゲージ -35%→-40%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.4 }] },
        // Lv4 ダメージ倍率 1.40倍→1.50倍 / 弱体の発動率 90%→100%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 1 }, { kind: "GAUGE", amount: -0.4 }] },
        // Lv5 クールタイム -1(4→3ターン) / 弱体の持続 2→3ターン / 行動ゲージ -40%→-45%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3, chance: 1 }, { kind: "GAUGE", amount: -0.45 }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "mushroon_s3_a",
      name: "毒床",
      description: "ダメージ倍率 1.00倍。80%で毒1スタック (1スタックにつき最大HPの5%、最大5スタック、3ターン) (既に毒状態ならさらに1スタック)",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1 },
        { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 3, chance: 0.8, extraStacksIfPoisoned: 1 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1 }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 3, chance: 0.8, extraStacksIfPoisoned: 1 }] },
        // Lv2 ダメージ倍率 1.00倍→1.10倍 / 毒1スタック 5%→5.5%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "POISON", damageRatePerStack: 0.055, durationTurns: 3, chance: 0.8, extraStacksIfPoisoned: 1 }] },
        // Lv3 毒の発動率 80%→90% / 毒1スタック 5.5%→6%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 3, chance: 0.9, extraStacksIfPoisoned: 1 }] },
        // Lv4 ダメージ倍率 1.10倍→1.20倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 3, chance: 0.9, extraStacksIfPoisoned: 1 }] },
        // Lv5 クールタイム -1(5→4ターン) / 毒の発動率 90%→100% / 毒の持続 3→4ターン
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 4, chance: 1, extraStacksIfPoisoned: 1 }] },
      ],
    },
    {
      id: "mushroon_s3_b",
      name: "腐敗の胞子",
      description: "ダメージ倍率 1.20倍。80%で防御力-75% (2ターン)。対象が弱体状態なら行動ゲージ-25%",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.25, requires: "TARGET_HAS_DEBUFF" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }, { kind: "GAUGE", amount: -0.25, requires: "TARGET_HAS_DEBUFF" }] },
        // Lv2 ダメージ倍率 1.20倍→1.30倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }, { kind: "GAUGE", amount: -0.25, requires: "TARGET_HAS_DEBUFF" }] },
        // Lv3 弱体の発動率 80%→90% / 行動ゲージ -25%→-30%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.3, requires: "TARGET_HAS_DEBUFF" }] },
        // Lv4 ダメージ倍率 1.30倍→1.40倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.3, requires: "TARGET_HAS_DEBUFF" }] },
        // Lv5 クールタイム -1(5→4ターン) / 弱体の発動率 90%→100% / 弱体の持続 2→3ターン / 行動ゲージ -30%→-35%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 1 }, { kind: "GAUGE", amount: -0.35, requires: "TARGET_HAS_DEBUFF" }] },
      ],
    },
    {
      id: "mushroon_s3_c",
      name: "菌糸支配",
      description: "パッシブ。敵が毒ダメージを受けるたび、自身の行動ゲージ+7%(敵1ターンにつき1回)",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: {
        trigger: "ENEMY_POISON_DAMAGE",
        levels: [
          { kind: "GAUGE_ON_ENEMY_POISON", gauge: 0.07 },
          { kind: "GAUGE_ON_ENEMY_POISON", gauge: 0.08 },
          { kind: "GAUGE_ON_ENEMY_POISON", gauge: 0.09 },
          { kind: "GAUGE_ON_ENEMY_POISON", gauge: 0.1 },
          { kind: "GAUGE_ON_ENEMY_POISON", gauge: 0.12 },
        ],
      },
    },
  ],
  lightSkill3: {
    id: "mushroon_s3_light",
    name: "聖樹の胞子",
    description: "味方全体のデバフを1個解除。味方全体を回復 最大HPの20.0%。80%で攻撃力-50% (2ターン)",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "CLEANSE", count: 1, applyTo: "ALLIES" },
      { kind: "HEAL", healRate: 0.2, applyTo: "ALLIES" },
      { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.8 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "CLEANSE", count: 1, applyTo: "ALLIES" }, { kind: "HEAL", healRate: 0.2, applyTo: "ALLIES" }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.8 }] },
      // Lv2 回復量 20%→22% / 弱体の発動率 80%→85%
      { cooldownTurns: 5, effects: [{ kind: "CLEANSE", count: 1, applyTo: "ALLIES" }, { kind: "HEAL", healRate: 0.22, applyTo: "ALLIES" }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.85 }] },
      // Lv3 回復量 22%→23% / 弱体の発動率 85%→90%
      { cooldownTurns: 5, effects: [{ kind: "CLEANSE", count: 1, applyTo: "ALLIES" }, { kind: "HEAL", healRate: 0.23, applyTo: "ALLIES" }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.9 }] },
      // Lv4 回復量 23%→24% / 弱体の発動率 90%→95%
      { cooldownTurns: 5, effects: [{ kind: "CLEANSE", count: 1, applyTo: "ALLIES" }, { kind: "HEAL", healRate: 0.24, applyTo: "ALLIES" }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.95 }] },
      // Lv5 クールタイム -1(5→4ターン) / 弱体の持続 2→3ターン
      { cooldownTurns: 4, effects: [{ kind: "CLEANSE", count: 1, applyTo: "ALLIES" }, { kind: "HEAL", healRate: 0.24, applyTo: "ALLIES" }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 3, chance: 0.95 }] },
    ],
  },
  darkSkill3: {
    id: "mushroon_s3_dark",
    name: "終末胞子",
    description: "ダメージ倍率 1.20倍 対象の弱体効果1個につき最終ダメージ+6%(最大+30%)。80%で毒1スタック (1スタックにつき最大HPの5%、最大5スタック、2ターン)",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 1.2, debuffDamageBonus: { perDebuff: 0.06, maxBonus: 0.3 } },
      { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.8 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.2, debuffDamageBonus: { perDebuff: 0.06, maxBonus: 0.3 } }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.8 }] },
      // Lv2 ダメージ倍率 1.20倍→1.30倍 / 毒の発動率 80%→85% / 毒1スタック 5%→5.5%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.3, debuffDamageBonus: { perDebuff: 0.07, maxBonus: 0.35 } }, { kind: "POISON", damageRatePerStack: 0.055, durationTurns: 2, chance: 0.85 }] },
      // Lv3 毒の発動率 85%→90% / 毒1スタック 5.5%→6%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.3, debuffDamageBonus: { perDebuff: 0.07, maxBonus: 0.35 } }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 2, chance: 0.9 }] },
      // Lv4 ダメージ倍率 1.30倍→1.40倍 / 毒の発動率 90%→95%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.4, debuffDamageBonus: { perDebuff: 0.08, maxBonus: 0.4 } }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 2, chance: 0.95 }] },
      // Lv5 クールタイム -1(5→4ターン) / 効果が増える
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.4, debuffDamageBonus: { perDebuff: 0.08, maxBonus: 0.4 } }, { kind: "POISON", damageRatePerStack: 0.059, stacks: 1, chance: 0.95, durationTurns: 3 }, { kind: "DAMAGE", multiplier: 0.5, debuffDamageBonus: { perDebuff: 0.08, maxBonus: 0.4 } }, { kind: "POISON", damageRatePerStack: 0.059, stacks: 1, chance: 0.65, durationTurns: 3 }, { kind: "DAMAGE", multiplier: 0.5, debuffDamageBonus: { perDebuff: 0.08, maxBonus: 0.4 } }, { kind: "POISON", damageRatePerStack: 0.059, stacks: 1, chance: 0.65, durationTurns: 3 }] },
    ],
  },
  skillAssignment: {
    FIRE: { skill2: 0, skill3: 0 },
    GRASS: { skill2: 1, skill3: 2 },
    ELECTRIC: { skill2: 2, skill3: 1 },
    WATER: { skill2: 0, skill3: 2 },
    LIGHT: { skill2: 1 },
    DARK: { skill2: 2 },
  },
};

/**
 * シェルタートル。**倒れないことそのものが仕事。**
 *
 * 防御力でダメージを出すので、硬く育てるほど攻めにも回る。
 * 既存のゴーレムが「自分が耐える」役なのに対し、こちらは
 * **かばう・軽減・挑発で他人を生かす**方へ寄せてある。
 */
export const SHELLTURTLE: MonsterTemplate = {
  templateId: "shellturtle",
  baseName: "シェルタートル",
  role: "ディフェンダー",
  emoji: "🐢",
  gachaStar: 3,
  baseStats: { hp: 1450, atk: 80, def: 122, spd: 86, criRate: 0.15, criDmg: 1.5, resistance: 0.24, accuracy: 0.12 },
  skill1: {
    id: "shellturtle_s1",
    name: "こうら突進",
    description: "ダメージ倍率 0.60倍(防御力の85%を加算)。60%で攻撃力-50% (2ターン)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.6, defCoefficient: 0.85 },
      { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.6 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.6, defCoefficient: 0.85 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.6 }] },
      // Lv2 ダメージ倍率 0.60倍→0.65倍 / 防御力比例 85%→90%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.65, defCoefficient: 0.9 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.6 }] },
      // Lv3 ダメージ倍率 0.65倍→0.70倍 / 防御力比例 90%→100% / 弱体の発動率 60%→70%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.7, defCoefficient: 1 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 }] },
      // Lv4 ダメージ倍率 0.70倍→0.75倍 / 防御力比例 100%→110%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.75, defCoefficient: 1.1 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 }] },
      // Lv5 ダメージ倍率 0.75倍→0.80倍 / 防御力比例 110%→120% / 弱体の発動率 70%→80% / 弱体の持続 2→3ターン
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.8, defCoefficient: 1.2 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 3, chance: 0.8 }] },
    ],
  },
  skill2Variants: [
    {
      id: "shellturtle_s2_a",
      name: "かばう",
      description: "保護 (2ターン、対象が受けるダメージの50%を自身が肩代わり)。自身の防御力+30% (2ターン)",
      target: "SINGLE_ALLY",
      cooldownTurns: 4,
      effects: [
        { kind: "PROTECT", share: 0.5, durationTurns: 2 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2, applyTo: "SELF" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "PROTECT", share: 0.5, durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2, applyTo: "SELF" }] },
        // Lv2
        { cooldownTurns: 4, effects: [{ kind: "PROTECT", share: 0.55, durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2, applyTo: "SELF" }] },
        // Lv3
        { cooldownTurns: 4, effects: [{ kind: "PROTECT", share: 0.6, durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2, applyTo: "SELF" }] },
        // Lv4 効果が増える
        { cooldownTurns: 4, effects: [{ kind: "PROTECT", share: 0.6, durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2, applyTo: "SELF" }, { kind: "GAUGE", amount: 0.2, applyTo: "SELF" }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "PROTECT", share: 0.6, durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "GAUGE", amount: 0.2, applyTo: "SELF" }] },
      ],
    },
    {
      id: "shellturtle_s2_b",
      name: "シェルバッシュ",
      description: "ダメージ倍率 1.00倍(防御力の125%を加算)。80%で挑発 (2ターン)。行動ゲージ-25%",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1, defCoefficient: 1.25 },
        { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.25 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1, defCoefficient: 1.25 }, { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.8 }, { kind: "GAUGE", amount: -0.25 }] },
        // Lv2 ダメージ倍率 1.00倍→1.10倍 / 防御力比例 125%→135% / 発動率 80%→90% / 行動ゲージ -25%→-30%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.1, defCoefficient: 1.35 }, { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.3 }] },
        // Lv3 防御力比例 135%→145%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.1, defCoefficient: 1.45 }, { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.3 }] },
        // Lv4 ダメージ倍率 1.10倍→1.20倍 / 防御力比例 145%→160% / 発動率 90%→100% / 行動ゲージ -30%→-35%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.2, defCoefficient: 1.6 }, { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 1 }, { kind: "GAUGE", amount: -0.35 }] },
        // Lv5 クールタイム -1(4→3ターン) / 持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.2, defCoefficient: 1.6 }, { kind: "STATUS", status: "TAUNT", durationTurns: 3, chance: 1 }, { kind: "GAUGE", amount: -0.35 }] },
      ],
    },
    {
      id: "shellturtle_s2_c",
      name: "甲羅再生",
      description: "自身を回復 最大HPの30.0%。自身のデバフを1個解除。継続回復 最大HPの10.0% (2ターン、自身のターン開始時)",
      target: "SELF",
      cooldownTurns: 5,
      effects: [
        { kind: "HEAL", healRate: 0.3, applyTo: "SELF" },
        { kind: "CLEANSE", count: 1, applyTo: "SELF" },
        { kind: "REGEN", healRate: 0.1, durationTurns: 2, applyTo: "SELF" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.3, applyTo: "SELF" }, { kind: "CLEANSE", count: 1, applyTo: "SELF" }, { kind: "REGEN", healRate: 0.1, durationTurns: 2, applyTo: "SELF" }] },
        // Lv2 回復量 30%→35%
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.35, applyTo: "SELF" }, { kind: "CLEANSE", count: 1, applyTo: "SELF" }, { kind: "REGEN", healRate: 0.1, durationTurns: 2, applyTo: "SELF" }] },
        // Lv3 回復量 10%→12%
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.35, applyTo: "SELF" }, { kind: "CLEANSE", count: 2, applyTo: "SELF" }, { kind: "REGEN", healRate: 0.12, durationTurns: 2, applyTo: "SELF" }] },
        // Lv4 回復量 35%→40%
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.4, applyTo: "SELF" }, { kind: "CLEANSE", count: 2, applyTo: "SELF" }, { kind: "REGEN", healRate: 0.12, durationTurns: 2, applyTo: "SELF" }] },
        // Lv5 クールタイム -1(5→4ターン) / 継続回復の持続 2→3ターン / 回復量 12%→15%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.4, applyTo: "SELF" }, { kind: "CLEANSE", count: 2, applyTo: "SELF" }, { kind: "REGEN", healRate: 0.15, durationTurns: 3, applyTo: "SELF" }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "shellturtle_s3_a",
      name: "守護陣",
      description: "受けるダメージ-20% (2ターン)。自身の防御力+30% (2ターン)",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "MITIGATE", amount: 0.2, durationTurns: 2 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2, applyTo: "SELF" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "MITIGATE", amount: 0.2, durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2, applyTo: "SELF" }] },
        // Lv2 被ダメージ軽減 20%→22%
        { cooldownTurns: 5, effects: [{ kind: "MITIGATE", amount: 0.22, durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2, applyTo: "SELF" }] },
        // Lv3 被ダメージ軽減 22%→25%
        { cooldownTurns: 5, effects: [{ kind: "MITIGATE", amount: 0.25, durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2, applyTo: "SELF" }] },
        // Lv4 効果が増える
        { cooldownTurns: 5, effects: [{ kind: "MITIGATE", amount: 0.25, durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2, applyTo: "SELF" }, { kind: "GAUGE", amount: 0.1 }] },
        // Lv5 クールタイム -1(5→4ターン) / 被ダメージ軽減の持続 2→3ターン / 強化の持続 2→3ターン
        { cooldownTurns: 4, effects: [{ kind: "MITIGATE", amount: 0.25, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "GAUGE", amount: 0.1 }] },
      ],
    },
    {
      id: "shellturtle_s3_b",
      name: "大地震",
      description: "ダメージ倍率 1.10倍(防御力の130%を加算)。80%で攻撃力-50% (2ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.1, defCoefficient: 1.3 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.8 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.1, defCoefficient: 1.3 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.8 }] },
        // Lv2 ダメージ倍率 1.10倍→1.20倍 / 防御力比例 130%→140%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.2, defCoefficient: 1.4 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.8 }] },
        // Lv3 防御力比例 140%→150% / 弱体の発動率 80%→90%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.2, defCoefficient: 1.5 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.9 }] },
        // Lv4 ダメージ倍率 1.20倍→1.30倍 / 防御力比例 150%→170%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.3, defCoefficient: 1.7 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.9 }] },
        // Lv5 クールタイム -1(5→4ターン) / 弱体の発動率 90%→100% / 弱体の持続 2→3ターン
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.3, defCoefficient: 1.7 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 3, chance: 1 }] },
      ],
    },
    {
      id: "shellturtle_s3_c",
      name: "最後の砦",
      description: "パッシブ。自身のHPが50%以下の間、防御力+20%・受けるダメージ-10%",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: {
        trigger: "ALWAYS",
        levels: [
          { kind: "LAST_STAND", hpRatio: 0.5, defUp: 0.2, damageTaken: 0.1 },
          { kind: "LAST_STAND", hpRatio: 0.5, defUp: 0.25, damageTaken: 0.1 },
          { kind: "LAST_STAND", hpRatio: 0.5, defUp: 0.3, damageTaken: 0.15 },
          { kind: "LAST_STAND", hpRatio: 0.5, defUp: 0.35, damageTaken: 0.15 },
          { kind: "LAST_STAND", hpRatio: 0.5, defUp: 0.4, damageTaken: 0.2 },
        ],
      },
    },
  ],
  lightSkill3: {
    id: "shellturtle_s3_light",
    name: "聖なる大甲羅",
    description: "デバフを1個解除。防御力+30% (2ターン)。受けるダメージ-20% (2ターン)",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "CLEANSE", count: 1 },
      { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
      { kind: "MITIGATE", amount: 0.2, durationTurns: 2 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "CLEANSE", count: 1 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "MITIGATE", amount: 0.2, durationTurns: 2 }] },
      // Lv2 被ダメージ軽減 20%→22%
      { cooldownTurns: 5, effects: [{ kind: "CLEANSE", count: 1 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "MITIGATE", amount: 0.22, durationTurns: 2 }] },
      // Lv3 被ダメージ軽減 22%→23%
      { cooldownTurns: 5, effects: [{ kind: "CLEANSE", count: 1 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "MITIGATE", amount: 0.23, durationTurns: 2 }] },
      // Lv4 被ダメージ軽減 23%→25%
      { cooldownTurns: 5, effects: [{ kind: "CLEANSE", count: 1 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "MITIGATE", amount: 0.25, durationTurns: 2 }] },
      // Lv5 クールタイム -1(5→4ターン) / 強化の持続 2→3ターン / 被ダメージ軽減の持続 2→3ターン
      { cooldownTurns: 4, effects: [{ kind: "CLEANSE", count: 1 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "MITIGATE", amount: 0.25, durationTurns: 3 }] },
    ],
  },
  darkSkill3: {
    id: "shellturtle_s3_dark",
    name: "アビスシェル",
    description: "ダメージ倍率 1.70倍(防御力の160%を加算)。80%で防御力-75% (2ターン)。自身に反射 (2ターン)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 1.7, defCoefficient: 1.6 },
      { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 },
      { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.7, defCoefficient: 1.6 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }, { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" }] },
      // Lv2 ダメージ倍率 1.70倍→1.80倍 / 防御力比例 160%→170% / 弱体の発動率 80%→90%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.8, defCoefficient: 1.7 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" }] },
      // Lv3 ダメージ倍率 1.80倍→1.90倍 / 防御力比例 170%→180%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.9, defCoefficient: 1.8 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" }] },
      // Lv4 ダメージ倍率 1.90倍→2.00倍 / 防御力比例 180%→200% / 弱体の発動率 90%→100%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2, defCoefficient: 2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 1 }, { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" }] },
      // Lv5 クールタイム -1(5→4ターン) / 弱体の持続 2→3ターン / 持続 2→3ターン
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2, defCoefficient: 2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 1 }, { kind: "STATUS", status: "REFLECT", durationTurns: 3, applyTo: "SELF" }] },
    ],
  },
  skillAssignment: {
    FIRE: { skill2: 1, skill3: 1 },
    GRASS: { skill2: 0, skill3: 2 },
    ELECTRIC: { skill2: 1, skill3: 0 },
    WATER: { skill2: 2, skill3: 2 },
    LIGHT: { skill2: 0 },
    DARK: { skill2: 2 },
  },
};

/**
 * コボルト。**弱った相手を仕留めるのが仕事。**
 *
 * 素の火力は星3相応でしかない。**相手のHPが減っているほど伸びる**ので、
 * 誰かが削った後に入ることで初めて本領が出る。
 * 単独で強いのではなく、編成の中の順番で強くなるモンスター。
 */
export const KOBOLD: MonsterTemplate = {
  templateId: "kobold",
  baseName: "コボルト",
  role: "アタッカー",
  emoji: "🗡️",
  gachaStar: 3,
  baseStats: { hp: 1000, atk: 145, def: 58, spd: 114, criRate: 0.2, criDmg: 1.6, resistance: 0.1, accuracy: 0.14 },
  skill1: {
    id: "kobold_s1",
    name: "すばやい斬撃",
    description: "ダメージ倍率 1.10倍 対象HP50%以下で最終ダメージ+25%",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.1, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.25 }] },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.25 }] }] },
      // Lv2 ダメージ倍率 1.10倍→1.20倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.2, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.25 }] }] },
      // Lv3 ダメージ倍率 1.20倍→1.30倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.3, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }] }] },
      // Lv4 ダメージ倍率 1.30倍→1.40倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.4, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }] }] },
      // Lv5 ダメージ倍率 1.40倍→1.50倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.5, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.35 }] }] },
    ],
  },
  skill2Variants: [
    {
      id: "kobold_s2_a",
      name: "急所突き",
      description: "ダメージ倍率 2.00倍(防御力25%無視) 対象HP50%以下で防御力100%無視",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 2, ignoreDefenseRatio: 0.25, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 1 }] },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2, ignoreDefenseRatio: 0.25, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 1 }] }] },
        // Lv2 ダメージ倍率 2.00倍→2.10倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.1, ignoreDefenseRatio: 0.3, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 1 }] }] },
        // Lv3 ダメージ倍率 2.10倍→2.20倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.2, ignoreDefenseRatio: 0.4, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 1 }] }] },
        // Lv4 ダメージ倍率 2.20倍→2.40倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.4, ignoreDefenseRatio: 0.5, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 1 }] }] },
        // Lv5 クールタイム -1(4→3ターン)
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.4, ignoreDefenseRatio: 0.5, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 1 }] }] },
      ],
    },
    {
      id: "kobold_s2_b",
      name: "追い討ち",
      description: "ダメージ倍率 1.75倍 対象HP50%以下で最終ダメージ+40%。行動ゲージを30%吸収",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.75, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.4 }] },
        { kind: "GAUGE", amount: 0.3, drain: true },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.75, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.4 }] }, { kind: "GAUGE", amount: 0.3, drain: true }] },
        // Lv2 ダメージ倍率 1.75倍→1.90倍 / 行動ゲージ 30%→35%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.9, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.4 }] }, { kind: "GAUGE", amount: 0.35, drain: true }] },
        // Lv3 ダメージ倍率 1.90倍→2.00倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.5 }] }, { kind: "GAUGE", amount: 0.35, drain: true }] },
        // Lv4 ダメージ倍率 2.00倍→2.10倍 / 行動ゲージ 35%→40%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.1, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.5 }] }, { kind: "GAUGE", amount: 0.4, drain: true }] },
        // Lv5 クールタイム -2(4→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 2.1, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.6 }] }, { kind: "GAUGE", amount: 0.4, drain: true }] },
      ],
    },
    {
      id: "kobold_s2_c",
      name: "足狩り",
      description: "ダメージ倍率 1.40倍。80%で速度-30% (2ターン)。行動ゲージ-40%",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.4 },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.4 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.8 }, { kind: "GAUGE", amount: -0.4 }] },
        // Lv2 ダメージ倍率 1.40倍→1.50倍 / 弱体の発動率 80%→90%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.4 }] },
        // Lv3 ダメージ倍率 1.50倍→1.60倍 / 行動ゲージ -40%→-45%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.6 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.45 }] },
        // Lv4 ダメージ倍率 1.60倍→1.70倍 / 弱体の発動率 90%→100% / 行動ゲージ -45%→-50%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 1 }, { kind: "GAUGE", amount: -0.5 }] },
        // Lv5 クールタイム -1(4→3ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3, chance: 1 }, { kind: "GAUGE", amount: -0.5 }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "kobold_s3_a",
      name: "処刑の一撃",
      description: "ダメージ倍率 3.00倍 対象HP30%以下で最終ダメージ+50% 対象HP30%以下で防御力100%無視",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 3, targetHpIgnoreDefense: [{ hpRatio: 0.3, ratio: 1 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.5 }] },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3, targetHpIgnoreDefense: [{ hpRatio: 0.3, ratio: 1 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.5 }] }] },
        // Lv2 ダメージ倍率 3.00倍→3.40倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.4, targetHpIgnoreDefense: [{ hpRatio: 0.3, ratio: 1 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.5 }] }] },
        // Lv3 ダメージ倍率 3.40倍→3.80倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.8, targetHpIgnoreDefense: [{ hpRatio: 0.3, ratio: 1 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.6 }] }] },
        // Lv4 ダメージ倍率 3.80倍→4.20倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.2, targetHpIgnoreDefense: [{ hpRatio: 0.3, ratio: 1 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.6 }] }] },
        // Lv5 クールタイム -1(5→4ターン) / ダメージ倍率 4.20倍→4.50倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 4.5, targetHpIgnoreDefense: [{ hpRatio: 0.3, ratio: 1 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.7 }] }] },
      ],
    },
    {
      id: "kobold_s3_b",
      name: "狩りの連鎖",
      description: "ダメージ倍率 2.40倍。相手を倒したら自身の行動ゲージ+60%。自身の全スキルのクールタイムを1ターン短縮",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.4 },
        { kind: "GAUGE", amount: 0.6, applyTo: "SELF", requires: "KILLED_TARGET" },
        { kind: "COOLDOWN_REDUCE", turns: 1, applyTo: "SELF", slot: 1, requires: "KILLED_TARGET" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.4 }, { kind: "GAUGE", amount: 0.6, applyTo: "SELF", requires: "KILLED_TARGET" }, { kind: "COOLDOWN_REDUCE", turns: 1, applyTo: "SELF", slot: 1, requires: "KILLED_TARGET" }] },
        // Lv2 ダメージ倍率 2.40倍→2.70倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.7 }, { kind: "GAUGE", amount: 0.6, applyTo: "SELF", requires: "KILLED_TARGET" }, { kind: "COOLDOWN_REDUCE", turns: 1, applyTo: "SELF", slot: 1, requires: "KILLED_TARGET" }] },
        // Lv3 ダメージ倍率 2.70倍→3.00倍 / 行動ゲージ 60%→70%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3 }, { kind: "GAUGE", amount: 0.7, applyTo: "SELF", requires: "KILLED_TARGET" }, { kind: "COOLDOWN_REDUCE", turns: 1, applyTo: "SELF", slot: 1, requires: "KILLED_TARGET" }] },
        // Lv4 ダメージ倍率 3.00倍→3.40倍 / ターン数 1→2ターン
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.4 }, { kind: "GAUGE", amount: 0.7, applyTo: "SELF", requires: "KILLED_TARGET" }, { kind: "COOLDOWN_REDUCE", turns: 2, applyTo: "SELF", slot: 1, requires: "KILLED_TARGET" }] },
        // Lv5 クールタイム -1(5→4ターン) / ダメージ倍率 3.40倍→3.80倍 / 行動ゲージ 70%→80%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 3.8 }, { kind: "GAUGE", amount: 0.8, applyTo: "SELF", requires: "KILLED_TARGET" }, { kind: "COOLDOWN_REDUCE", turns: 2, applyTo: "SELF", slot: 1, requires: "KILLED_TARGET" }] },
      ],
    },
    {
      id: "kobold_s3_c",
      name: "獲物の匂い",
      description: "パッシブ。HPが50%以下の敵への最終ダメージ+20%。常時攻撃力+25%・速度+15。すべての攻撃に速度比例を加算(速度200で倍率+0.15)",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: {
        trigger: "ALWAYS",
        levels: [
          { kind: "SCENT_OF_PREY", hpRatio: 0.5, damageUp: 0.2, atkUp: 0.25, spd: 15, speedCoefficient: 0.15 },
          { kind: "SCENT_OF_PREY", hpRatio: 0.5, damageUp: 0.3, atkUp: 0.25, spd: 15, speedCoefficient: 0.15 },
          { kind: "SCENT_OF_PREY", hpRatio: 0.5, damageUp: 0.45, atkUp: 0.25, spd: 15, speedCoefficient: 0.15 },
          { kind: "SCENT_OF_PREY", hpRatio: 0.5, damageUp: 0.6, atkUp: 0.25, spd: 15, speedCoefficient: 0.15 },
          { kind: "SCENT_OF_PREY", hpRatio: 0.5, damageUp: 0.75, atkUp: 0.25, spd: 15, speedCoefficient: 0.15 },
        ],
      },
    },
  ],
  lightSkill3: {
    id: "kobold_s3_light",
    name: "神速の号令",
    description: "行動ゲージ+25%。味方全体の速度+20% (2ターン)。自身の行動ゲージ+20%。味方全体の全スキルのクールタイムを1ターン短縮",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "GAUGE", amount: 0.25 },
      { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2, applyTo: "ALLIES" },
      { kind: "GAUGE", amount: 0.2, applyTo: "SELF" },
      { kind: "COOLDOWN_REDUCE", turns: 1, applyTo: "ALLIES" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.25 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.2, applyTo: "SELF" }, { kind: "COOLDOWN_REDUCE", turns: 1, applyTo: "ALLIES" }] },
      // Lv2 行動ゲージ 25%→30% / 行動ゲージ 20%→25%
      { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.3 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.25, applyTo: "SELF" }, { kind: "COOLDOWN_REDUCE", turns: 1, applyTo: "ALLIES" }] },
      // Lv3
      { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.3 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.25, applyTo: "SELF" }, { kind: "COOLDOWN_REDUCE", turns: 1, applyTo: "ALLIES" }] },
      // Lv4 行動ゲージ 30%→35%
      { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.35 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.25, applyTo: "SELF" }, { kind: "COOLDOWN_REDUCE", turns: 1, applyTo: "ALLIES" }] },
      // Lv5 クールタイム -1(5→4ターン) / 強化の持続 2→3ターン / 行動ゲージ 25%→30%
      { cooldownTurns: 4, effects: [{ kind: "GAUGE", amount: 0.35 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.3, applyTo: "SELF" }, { kind: "COOLDOWN_REDUCE", turns: 1, applyTo: "ALLIES" }] },
    ],
  },
  darkSkill3: {
    id: "kobold_s3_dark",
    name: "暗殺",
    description: "ダメージ倍率 2.60倍 対象HP30%以下で最終ダメージ+30% 対象HP50%以下で防御力50%無視",
    target: "SINGLE_ENEMY",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 2.6, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.5 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.3 }] },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.6, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.5 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.3 }] }] },
      // Lv2 ダメージ倍率 2.60倍→2.90倍
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.9, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.6 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.3 }] }] },
      // Lv3 ダメージ倍率 2.90倍→3.30倍
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.3, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.6 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.4 }] }] },
      // Lv4 ダメージ倍率 3.30倍→3.70倍
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.7, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.7 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.4 }] }] },
      // Lv5 クールタイム -1(5→4ターン) / ダメージ倍率 3.70倍→4.00倍
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 4, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.7 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.5 }] }] },
    ],
  },
  skillAssignment: {
    FIRE: { skill2: 0, skill3: 0 },
    GRASS: { skill2: 1, skill3: 2 },
    ELECTRIC: { skill2: 2, skill3: 1 },
    WATER: { skill2: 1, skill3: 0 },
    LIGHT: { skill2: 0 },
    DARK: { skill2: 2 },
  },
};

/** 星3の追加3種 */
export const NEW_STAR3_TEMPLATES: MonsterTemplate[] = [MUSHROON, SHELLTURTLE, KOBOLD];
