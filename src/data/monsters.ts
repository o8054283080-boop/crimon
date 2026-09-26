import { SCORPION, HARPY, PHOENIX, JOKER } from "./newMonsters/fourSpecies.js";
import { MonsterTemplate, createAllVariants } from "../core/monster.js";
import { Skill } from "../core/skill.js";
import { setCreatedSkillResolver } from "../core/monsterInstance.js";
import { NEW_MONSTER_TEMPLATES, NEW_STAR3_TEMPLATES, NEW_STAR4_TEMPLATES, NEW_STAR5_TEMPLATES } from "./newMonsters/index.js";
import { COLLAB_MONSTER_TEMPLATES, GUJIRA, MOCCHI, SUEZO, UNDINE } from "./collabMonsters/index.js";
import { CRIMOARK, CRIMOARK_ATTACK, CRIMOARK_DEBUFF, CRIMOARK_SUPPORT } from "./crimoark.js";
import { ARCHEOS, TALENT_SHARD_ATK, TALENT_SHARD_DEF } from "./awakeningDepthsMonsters.js";
import {
  ATK_UP, DEF_UP, SPD_UP, CRI_RATE_UP, CRI_DMG_UP,
  ATK_DOWN, DEF_DOWN, SPD_DOWN,
} from "../core/statusValues.js";

const SLIME: MonsterTemplate = {
  templateId: "slime",
  baseName: "スライム",
  role: "アタッカー",
  emoji: "🟢",
  baseStats: {
    hp: 1200,
    atk: 120,
    def: 70,
    spd: 100,
    criRate: 0.18,
    criDmg: 1.58,
    resistance: 0.12,
    accuracy: 0.1,
  },
  skill1: {
    id: "slime_s1",
    name: "たたく",
    description: "ダメージ倍率 1.00倍",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1 }] },
      // Lv2 ダメージ倍率 1.00倍→1.10倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1 }] },
      // Lv3 ダメージ倍率 1.10倍→1.15倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.15 }] },
      // Lv4 ダメージ倍率 1.15倍→1.20倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.2 }] },
      // Lv5 ダメージ倍率 1.20倍→1.25倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.25 }] },
    ],
  },
  skill2Variants: [
    {
      id: "slime_s2_a",
      name: "エレメンタルバースト",
      description: "ダメージ倍率 1.05倍。45%で攻撃力-50% (2ターン)。50%で強化不可 (2ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.05 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.45 },
        { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.5, durationTurns: 2, fixedDuration: true },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.05 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.45 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.5, durationTurns: 2, fixedDuration: true }] },
        // Lv2 ダメージ倍率 1.05倍→1.15倍 / 弱体の発動率 45%→50%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.15 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.5 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.5, durationTurns: 2, fixedDuration: true }] },
        // Lv3 ダメージ倍率 1.15倍→1.20倍 / 弱体の発動率 50%→60%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.6 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.5, durationTurns: 2, fixedDuration: true }] },
        // Lv4 ダメージ倍率 1.20倍→1.25倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.25 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.6 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.5, durationTurns: 2, fixedDuration: true }] },
        // Lv5 クールタイム -1(3→2ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.25 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 3, chance: 0.6 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.5, durationTurns: 2, fixedDuration: true }] },
      ],
    },
    {
      id: "slime_s2_b",
      name: "どくづき",
      description: "ダメージ倍率 1.30倍。60%で毒1スタック (1スタックにつき最大HPの5%、最大5スタック、2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.6 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.6 }] },
        // Lv2 ダメージ倍率 1.30倍→1.40倍 / 毒1スタック 5%→5.5% / 毒の発動率 60%→65%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "POISON", damageRatePerStack: 0.055, durationTurns: 2, chance: 0.65 }] },
        // Lv3 ダメージ倍率 1.40倍→1.50倍 / 毒1スタック 5.5%→6% / 毒の発動率 65%→75%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 2, chance: 0.75 }] },
        // Lv4 ダメージ倍率 1.50倍→1.55倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.55 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 2, chance: 0.75 }] },
        // Lv5 クールタイム -1(3→2ターン) / 毒の持続 2→3ターン
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.55 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 3, chance: 0.75 }] },
      ],
    },
    {
      id: "slime_s2_c",
      name: "ねばつく一撃",
      description: "ダメージ倍率 1.30倍。70%で速度-30% (2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.7 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.7 }] },
        // Lv2 ダメージ倍率 1.30倍→1.40倍 / 弱体の発動率 70%→75%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.75 }] },
        // Lv3 ダメージ倍率 1.40倍→1.50倍 / 弱体の発動率 75%→85%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.85 }] },
        // Lv4 ダメージ倍率 1.50倍→1.55倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.55 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.85 }] },
        // Lv5 クールタイム -1(3→2ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.55 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3, chance: 0.85 }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "slime_s3_a",
      name: "げんかいとっぱ",
      description: "ダメージ倍率 1.80倍。相手を倒したら自身の行動ゲージ+20%。自身の攻撃力+30% (2ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8 },
        { kind: "GAUGE", amount: 0.2, applyTo: "SELF", requires: "KILLED_TARGET" },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "SELF" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "GAUGE", amount: 0.2, applyTo: "SELF", requires: "KILLED_TARGET" }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "SELF" }] },
        // Lv2 ダメージ倍率 1.80倍→1.95倍 / 行動ゲージ 20%→25%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.95 }, { kind: "GAUGE", amount: 0.25, applyTo: "SELF", requires: "KILLED_TARGET" }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "SELF" }] },
        // Lv3 ダメージ倍率 1.95倍→2.05倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.05 }, { kind: "GAUGE", amount: 0.25, applyTo: "SELF", requires: "KILLED_TARGET" }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "SELF" }] },
        // Lv4 ダメージ倍率 2.05倍→2.15倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.15 }, { kind: "GAUGE", amount: 0.25, applyTo: "SELF", requires: "KILLED_TARGET" }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "SELF" }] },
        // Lv5 クールタイム -1(4→3ターン)
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.15 }, { kind: "GAUGE", amount: 0.25, applyTo: "SELF", requires: "KILLED_TARGET" }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "SELF" }] },
      ],
    },
    {
      id: "slime_s3_b",
      name: "毒噴射",
      description: "ダメージ倍率 1.10倍 × 2回。70%で毒1スタック (1スタックにつき最大HPの5%、最大5スタック、2ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.1, hits: 2 },
        { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.7 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.1, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.7 }] },
        // Lv2 ダメージ倍率 1.10倍→1.20倍 / 毒1スタック 5%→5.5% / 毒の発動率 70%→75%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.2, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.055, durationTurns: 2, chance: 0.75 }] },
        // Lv3 ダメージ倍率 1.20倍→1.25倍 / 毒1スタック 5.5%→6% / 毒の発動率 75%→85%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.25, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 2, chance: 0.85 }] },
        // Lv4 ダメージ倍率 1.25倍→1.30倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.3, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 2, chance: 0.85 }] },
        // Lv5 クールタイム -1(5→4ターン) / 毒の持続 2→3ターン
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.3, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 3, chance: 0.85 }] },
      ],
    },
    {
      id: "slime_s3_c",
      name: "スラフラッシュ",
      description: "ダメージ倍率 1.50倍。75%で暗闇 (2ターン、攻撃時50%でダメージ-75%・追加効果なし)",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5 },
        { kind: "BLIND", durationTurns: 2, chance: 0.75 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "BLIND", durationTurns: 2, chance: 0.75 }] },
        // Lv2 ダメージ倍率 1.50倍→1.60倍 / 暗闇の発動率 75%→80%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.6 }, { kind: "BLIND", durationTurns: 2, chance: 0.8 }] },
        // Lv3 ダメージ倍率 1.60倍→1.70倍 / 暗闇の発動率 80%→85%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "BLIND", durationTurns: 2, chance: 0.85 }] },
        // Lv4 ダメージ倍率 1.70倍→1.80倍 / 暗闇の発動率 85%→90%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "BLIND", durationTurns: 2, chance: 0.9 }] },
        // Lv5 クールタイム -1(4→3ターン)
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "BLIND", durationTurns: 2, chance: 0.9 }] },
      ],
    },
  ],
  /**
   * 光/闇の固有スキル3。
   * 光と闇は召喚でしか手に入らないため、同じ種族の他属性より明確に強くしてある。
   * ただし役割は変えない(スライムは全体攻撃役のまま)。
   */
  lightSkill3: {
    id: "slime_s3_light",
    name: "セイントスラッシュ",
    // 全体技なので、HEALではなくLIFESTEALで組む。
    // HEALをそのまま置くと対象(=敵)を回復してしまう。当たった数に比例させたいのでLIFESTEALを使う
    description: "ダメージ倍率 1.50倍。70%で暗闇 (2ターン、攻撃時50%でダメージ-75%・追加効果なし)。与えたダメージの20%を自身が回復",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 1.5 },
      { kind: "BLIND", durationTurns: 2, chance: 0.7 },
      { kind: "LIFESTEAL", healRate: 0.2 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "BLIND", durationTurns: 2, chance: 0.7 }, { kind: "LIFESTEAL", healRate: 0.2 }] },
      // Lv2 ダメージ倍率 1.50倍→1.60倍 / 暗闇の発動率 70%→75% / 回復量 20%→22%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.6 }, { kind: "BLIND", durationTurns: 2, chance: 0.75 }, { kind: "LIFESTEAL", healRate: 0.22 }] },
      // Lv3 ダメージ倍率 1.60倍→1.70倍 / 暗闇の発動率 75%→85% / 回復量 22%→23%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "BLIND", durationTurns: 2, chance: 0.85 }, { kind: "LIFESTEAL", healRate: 0.23 }] },
      // Lv4 ダメージ倍率 1.70倍→1.80倍 / 回復量 23%→25%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "BLIND", durationTurns: 2, chance: 0.85 }, { kind: "LIFESTEAL", healRate: 0.25 }] },
      // Lv5 クールタイム -1(4→3ターン)
      { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "BLIND", durationTurns: 2, chance: 0.85 }, { kind: "LIFESTEAL", healRate: 0.25 }] },
    ],
  },
  darkSkill3: {
    id: "slime_s3_dark",
    name: "アビススラッジ",
    description: "ダメージ倍率 1.30倍 × 2回。80%で毒1スタック (1スタックにつき最大HPの6%、最大5スタック、3ターン)",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 1.3, hits: 2 },
      { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 3, chance: 0.8 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.3, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 3, chance: 0.8 }] },
      // Lv2 ダメージ倍率 1.30倍→1.40倍 / 毒1スタック 6%→6.5% / 毒の発動率 80%→85%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.4, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.065, durationTurns: 3, chance: 0.85 }] },
      // Lv3 ダメージ倍率 1.40倍→1.50倍 / 毒1スタック 6.5%→7% / 毒の発動率 85%→90%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.07, durationTurns: 3, chance: 0.9 }] },
      // Lv4 ダメージ倍率 1.50倍→1.55倍 / 毒1スタック 7%→7.5% / 毒の発動率 90%→95%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.55, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.075, durationTurns: 3, chance: 0.95 }] },
      // Lv5 クールタイム -1(4→3ターン) / 毒の持続 3→4ターン
      { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.55, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.075, durationTurns: 4, chance: 0.95 }] },
    ],
  },
};

const WOLF: MonsterTemplate = {
  templateId: "wolf",
  baseName: "ウルフ",
  emoji: "🐺",
  role: "アタッカー",
  baseStats: {
    hp: 1050,
    atk: 150,
    def: 60,
    spd: 110,
    criRate: 0.2,
    criDmg: 1.65,
    resistance: 0.1,
    accuracy: 0.15,
  },
  skill1: {
    id: "wolf_s1",
    name: "かみつく",
    description: "ダメージ倍率 0.80倍(自身の速度が高いほど上昇)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.8, scaleBonus: { stat: "spd", bonusAtReference: 0.3 } },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.8, scaleBonus: { stat: "spd", bonusAtReference: 0.3 } }] },
      // Lv2 ダメージ倍率 0.80倍→0.85倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.85, scaleBonus: { stat: "spd", bonusAtReference: 0.3 } }] },
      // Lv3 ダメージ倍率 0.85倍→0.90倍 / 速度比例 30%→35%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.9, scaleBonus: { stat: "spd", bonusAtReference: 0.35 } }] },
      // Lv4 ダメージ倍率 0.90倍→0.95倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.95, scaleBonus: { stat: "spd", bonusAtReference: 0.35 } }] },
      // Lv5 ダメージ倍率 0.95倍→1.00倍 / 速度比例 35%→40%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } }] },
    ],
  },
  skill2Variants: [
    {
      id: "wolf_s2_a",
      name: "ふいうちの牙",
      description: "ダメージ倍率 0.45倍 × 2回(自身の速度が高いほど上昇)(防御力無視)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 2,
      effects: [
        { kind: "DAMAGE", multiplier: 0.45, hits: 2, ignoreDefense: true, scaleBonus: { stat: "spd", bonusAtReference: 0.1 } },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 0.45, hits: 2, ignoreDefense: true, scaleBonus: { stat: "spd", bonusAtReference: 0.1 } }] },
        // Lv2 ダメージ倍率 0.45倍→0.50倍
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 0.5, hits: 2, ignoreDefense: true, scaleBonus: { stat: "spd", bonusAtReference: 0.1 } }] },
        // Lv3
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 0.5, hits: 2, ignoreDefense: true, scaleBonus: { stat: "spd", bonusAtReference: 0.1 } }] },
        // Lv4 ダメージ倍率 0.50倍→0.55倍
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 0.55, hits: 2, ignoreDefense: true, scaleBonus: { stat: "spd", bonusAtReference: 0.1 } }] },
        // Lv5 クールタイム -1(2→1ターン)
        { cooldownTurns: 1, effects: [{ kind: "DAMAGE", multiplier: 0.55, hits: 2, ignoreDefense: true, scaleBonus: { stat: "spd", bonusAtReference: 0.1 } }] },
      ],
    },
    {
      id: "wolf_s2_b",
      name: "いあつ",
      description: "50%で有利な効果(シールド・無効・能力上昇)を解除。70%で攻撃力-50% (2ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "STRIP", chance: 0.5 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "STRIP", chance: 0.5 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 }] },
        // Lv2 強化解除の発動率 50%→60% / 弱体の発動率 70%→75%
        { cooldownTurns: 3, effects: [{ kind: "STRIP", chance: 0.6 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.75 }] },
        // Lv3 強化解除の発動率 60%→75% / 弱体の発動率 75%→80%
        { cooldownTurns: 3, effects: [{ kind: "STRIP", chance: 0.75 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.8 }] },
        // Lv4 弱体の発動率 80%→85%
        { cooldownTurns: 3, effects: [{ kind: "STRIP", chance: 0.75 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.85 }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "STRIP", chance: 0.75 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.85 }] },
      ],
    },
    {
      id: "wolf_s2_c",
      name: "するどいツメ",
      description: "ダメージ倍率 1.65倍。毒1スタック (1スタックにつき最大HPの5%、最大5スタック、2ターン)。70%で治癒阻害 (2ターン、回復を受けられない)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.65 },
        { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2 },
        { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.7 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.65 }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.7 }] },
        // Lv2 ダメージ倍率 1.65倍→1.80倍 / 毒1スタック 5%→5.5% / 治癒阻害の発動率 70%→75%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "POISON", damageRatePerStack: 0.055, durationTurns: 2 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.75 }] },
        // Lv3 ダメージ倍率 1.80倍→1.85倍 / 毒1スタック 5.5%→6% / 治癒阻害の発動率 75%→85%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.85 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 2 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.85 }] },
        // Lv4 ダメージ倍率 1.85倍→1.95倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.95 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 2 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.85 }] },
        // Lv5 クールタイム -1(3→2ターン) / 治癒阻害の持続 2→3ターン
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.95 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 2 }, { kind: "HEAL_BLOCK", durationTurns: 3, chance: 0.85 }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "wolf_s3_a",
      name: "全力の一撃",
      description: "ダメージ倍率 2.80倍(自身の速度が高いほど上昇) 対象HP50%以下で最終ダメージ+30%。50%でスタン (1ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 2.8, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }], scaleBonus: { stat: "spd", bonusAtReference: 0.2 } },
        { kind: "STUN", durationTurns: 1, chance: 0.5 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.8, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }], scaleBonus: { stat: "spd", bonusAtReference: 0.2 } }, { kind: "STUN", durationTurns: 1, chance: 0.5 }] },
        // Lv2 ダメージ倍率 2.80倍→3.00倍 / スタンの発動率 50%→55%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 3, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }], scaleBonus: { stat: "spd", bonusAtReference: 0.2 } }, { kind: "STUN", durationTurns: 1, chance: 0.55 }] },
        // Lv3 ダメージ倍率 3.00倍→3.15倍 / スタンの発動率 55%→65%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 3.15, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }], scaleBonus: { stat: "spd", bonusAtReference: 0.2 } }, { kind: "STUN", durationTurns: 1, chance: 0.65 }] },
        // Lv4 ダメージ倍率 3.15倍→3.30倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 3.3, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }], scaleBonus: { stat: "spd", bonusAtReference: 0.2 } }, { kind: "STUN", durationTurns: 1, chance: 0.65 }] },
        // Lv5 クールタイム -1(4→3ターン)
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3.3, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }], scaleBonus: { stat: "spd", bonusAtReference: 0.2 } }, { kind: "STUN", durationTurns: 1, chance: 0.65 }] },
      ],
    },
    {
      id: "wolf_s3_b",
      name: "ウルフスラッシュ",
      /*
       * 以前は防御低下を**3つ重ねて確定で**かける技だった。同じ弱体を重ねない
       * 決まりに揃えたので、**1撃ごとに25%の独立判定**へ作り直してある。
       * 3回とも外す確率は 0.75^3 なので、**1回以上入るのは約57.8%**。
       * 何度成功しても効果量は共通値の1つぶんで、ターンだけが長い方に揃う。
       * 重ねがけぶんの火力が消えたので、1撃の倍率を 0.7 → 0.9 に上げた。
       */
      description: "ダメージ倍率 0.95倍 × 3回。各ヒットごとに: 25%で防御力-75% (2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.95, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.25 }] },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.95, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.25 }] }] },
        // Lv2 ダメージ倍率 0.95倍→1.00倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.25 }] }] },
        // Lv3 弱体の発動率 25%→35%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.35 }] }] },
        // Lv4
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.35 }] }] },
        // Lv5 クールタイム -1(4→3ターン)
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.35 }] }] },
      ],
    },
    {
      id: "wolf_s3_c",
      name: "はやての号令",
      description: "行動ゲージ+20%。速度+20% (2ターン)。使用後、即時に追加ターンを獲得",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "GAUGE", amount: 0.2 },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 },
      ],
      extraTurn: true,
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "GAUGE", amount: 0.2 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }] },
        // Lv2 行動ゲージ 20%→25%
        { cooldownTurns: 4, effects: [{ kind: "GAUGE", amount: 0.25 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }] },
        // Lv3 行動ゲージ 25%→30%
        { cooldownTurns: 4, effects: [{ kind: "GAUGE", amount: 0.3 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }] },
        // Lv4 行動ゲージ 30%→35%
        { cooldownTurns: 4, effects: [{ kind: "GAUGE", amount: 0.35 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "GAUGE", amount: 0.35 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }] },
      ],
    },
  ],
  lightSkill3: {
    id: "wolf_s3_light",
    name: "ホーリーファング",
    // 吸収にしないと、敵を狙う技なので相手のゲージを進めてしまう
    description: "ダメージ倍率 3.60倍(自身の速度が高いほど上昇)。行動ゲージを30%吸収",
    target: "SINGLE_ENEMY",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 3.6, scaleBonus: { stat: "spd", bonusAtReference: 1.2 } },
      { kind: "GAUGE", amount: 0.3, drain: true },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 3.6, scaleBonus: { stat: "spd", bonusAtReference: 1.2 } }, { kind: "GAUGE", amount: 0.3, drain: true }] },
      // Lv2 ダメージ倍率 3.60倍→3.85倍 / 行動ゲージ 30%→35%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 3.85, scaleBonus: { stat: "spd", bonusAtReference: 1.2 } }, { kind: "GAUGE", amount: 0.35, drain: true }] },
      // Lv3 ダメージ倍率 3.85倍→4.05倍 / 速度比例 120%→130%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 4.05, scaleBonus: { stat: "spd", bonusAtReference: 1.3 } }, { kind: "GAUGE", amount: 0.35, drain: true }] },
      // Lv4 ダメージ倍率 4.05倍→4.25倍 / 行動ゲージ 35%→40%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 4.25, scaleBonus: { stat: "spd", bonusAtReference: 1.3 } }, { kind: "GAUGE", amount: 0.4, drain: true }] },
      // Lv5 クールタイム -1(4→3ターン) / 速度比例 130%→140%
      { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 4.25, scaleBonus: { stat: "spd", bonusAtReference: 1.4 } }, { kind: "GAUGE", amount: 0.4, drain: true }] },
    ],
  },
  darkSkill3: {
    id: "wolf_s3_dark",
    name: "シャドウレンド",
    description: "ダメージ倍率 1.55倍 × 3回。各ヒットごとに: 30%で速度-30% (2ターン)。与えたダメージの30%を自身が回復",
    target: "SINGLE_ENEMY",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 1.55, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.3 }] },
      { kind: "LIFESTEAL", healRate: 0.3 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.55, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.3 }] }, { kind: "LIFESTEAL", healRate: 0.3 }] },
      // Lv2 ダメージ倍率 1.55倍→1.60倍 / 弱体の発動率 30%→40% / 回復量 30%→32%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.6, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.4 }] }, { kind: "LIFESTEAL", healRate: 0.32 }] },
      // Lv3 ダメージ倍率 1.60倍→1.70倍 / 回復量 32%→35%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.7, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.4 }] }, { kind: "LIFESTEAL", healRate: 0.35 }] },
      // Lv4 ダメージ倍率 1.70倍→1.80倍 / 回復量 35%→36%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.8, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.4 }] }, { kind: "LIFESTEAL", healRate: 0.36 }] },
      // Lv5 クールタイム -1(4→3ターン)
      { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.8, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.4 }] }, { kind: "LIFESTEAL", healRate: 0.36 }] },
    ],
  },
};

const GOLEM: MonsterTemplate = {
  templateId: "golem",
  baseName: "ゴーレム",
  emoji: "🗿",
  role: "ディフェンダー",
  baseStats: {
    hp: 1600,
    atk: 90,
    def: 130,
    spd: 80,
    criRate: 0.17,
    criDmg: 1.55,
    resistance: 0.25,
    accuracy: 0.1,
  },
  skill1: {
    id: "golem_s1",
    name: "たいあたり",
    description: "ダメージ倍率 0.70倍(防御力の85%を加算)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.7, defCoefficient: 0.85 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.7, defCoefficient: 0.85 }] },
      // Lv2 ダメージ倍率 0.70倍→0.75倍 / 防御力比例 85%→95%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.75, defCoefficient: 0.95 }] },
      // Lv3 ダメージ倍率 0.75倍→0.80倍 / 防御力比例 95%→105%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.8, defCoefficient: 1.05 }] },
      // Lv4 ダメージ倍率 0.80倍→0.85倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.85, defCoefficient: 1.05 }] },
      // Lv5 ダメージ倍率 0.85倍→0.90倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.9, defCoefficient: 1.05 }] },
    ],
  },
  skill2Variants: [
    {
      id: "golem_s2_a",
      name: "岩石落とし",
      description: "ダメージ倍率 0.95倍(防御力の120%を加算)",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 0.95, defCoefficient: 1.2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.95, defCoefficient: 1.2 }] },
        // Lv2 防御力比例 120%→130%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.95, defCoefficient: 1.3 }] },
        // Lv3 ダメージ倍率 0.95倍→1.05倍 / 防御力比例 130%→140%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.05, defCoefficient: 1.4 }] },
        // Lv4 ダメージ倍率 1.05倍→1.10倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.1, defCoefficient: 1.4 }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.1, defCoefficient: 1.4 }] },
      ],
    },
    {
      id: "golem_s2_b",
      name: "たいあたりラッシュ",
      description: "ダメージ倍率 0.48倍 × 3回(防御力の80%を加算)",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 0.48, hits: 3, defCoefficient: 0.8 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.48, hits: 3, defCoefficient: 0.8 }] },
        // Lv2 ダメージ倍率 0.48倍→0.52倍 / 防御力比例 80%→85%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.52, hits: 3, defCoefficient: 0.85 }] },
        // Lv3
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.52, hits: 3, defCoefficient: 0.85 }] },
        // Lv4 ダメージ倍率 0.52倍→0.55倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.55, hits: 3, defCoefficient: 0.85 }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 0.55, hits: 3, defCoefficient: 0.85 }] },
      ],
    },
    {
      id: "golem_s2_c",
      name: "いわくだき",
      // 持続1ターンと短いぶん、通る確率を上げてある(60%→80%)
      description: "ダメージ倍率 1.50倍(防御力の60%を加算)。85%で防御力-75% (2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5, defCoefficient: 0.6 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.85, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.5, defCoefficient: 0.6 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.85, durationTurns: 2 }] },
        // Lv2 ダメージ倍率 1.50倍→1.60倍 / 防御力比例 60%→65% / 弱体の発動率 85%→95%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.6, defCoefficient: 0.65 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 0.95, durationTurns: 2 }] },
        // Lv3 ダメージ倍率 1.60倍→1.70倍 / 弱体の発動率 95%→100%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.7, defCoefficient: 0.65 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 1, durationTurns: 2 }] },
        // Lv4 ダメージ倍率 1.70倍→1.80倍 / 防御力比例 65%→75%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.8, defCoefficient: 0.75 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 1, durationTurns: 2 }] },
        // Lv5 クールタイム -1(3→2ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.8, defCoefficient: 0.75 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, chance: 1, durationTurns: 3 }] },
      ],
    },
  ],
  skill3Variants: [
    // 火のゴーレムが溶岩落としを覚えるよう、この並びを先頭に置いている
    {
      id: "golem_s3_b",
      name: "溶岩落とし",
      description: "ダメージ倍率 1.20倍(防御力の75%を加算)。100%で火傷 (2ターン、自身のターン終了時に自身の攻撃力分のダメージ)",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2, defCoefficient: 0.75 },
        { kind: "BURN", durationTurns: 2, chance: 1 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.2, defCoefficient: 0.75 }, { kind: "BURN", durationTurns: 2, chance: 1 }] },
        // Lv2 ダメージ倍率 1.20倍→1.30倍 / 防御力比例 75%→80%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.3, defCoefficient: 0.8 }, { kind: "BURN", durationTurns: 2, chance: 1 }] },
        // Lv3 ダメージ倍率 1.30倍→1.35倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.35, defCoefficient: 0.8 }, { kind: "BURN", durationTurns: 2, chance: 1 }] },
        // Lv4 ダメージ倍率 1.35倍→1.45倍 / 防御力比例 80%→90%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.45, defCoefficient: 0.9 }, { kind: "BURN", durationTurns: 2, chance: 1 }] },
        // Lv5 クールタイム -1(4→3ターン)
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.45, defCoefficient: 0.9 }, { kind: "BURN", durationTurns: 2, chance: 1 }] },
      ],
    },
    {
      id: "golem_s3_a",
      name: "てっぺき",
      description: "味方全体に最大HPの20%のシールドを2ターン張る。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [{ kind: "SHIELD", shieldRate: 0.2, durationTurns: 2 }],
    },
    {
      id: "golem_s3_c",
      name: "きょじんのふんぬ",
      description: "攻撃力+30% (2ターン)。防御力+30% (2ターン)。自身の行動ゲージ+30%",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
        { kind: "GAUGE", amount: 0.3, applyTo: "SELF" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.3, applyTo: "SELF" }] },
        // Lv2 行動ゲージ 30%→35%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.35, applyTo: "SELF" }] },
        // Lv3 行動ゲージ 35%→40%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF" }] },
        // Lv4 行動ゲージ 40%→50%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.5, applyTo: "SELF" }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 2→3ターン / 「自身に反射 (3ターン)」が付く
        { cooldownTurns: 3, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.5, applyTo: "SELF" }, { kind: "STATUS", status: "REFLECT", durationTurns: 3, applyTo: "SELF" }] },
      ],
    },
  ],
  lightSkill3: {
    id: "golem_s3_light",
    name: "オーロラウォール",
    // 攻撃を持たないぶん、量で釣り合わせないと通常のスキル3(溶岩落とし)に届かない
    description: "シールド 最大HPの40% (3ターン、ダメージを肩代わり)。防御力+30% (3ターン)。継続回復 最大HPの8.0% (3ターン、自身のターン開始時)。デバフを解除。回復 最大HPの25.0%",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "SHIELD", shieldRate: 0.4, durationTurns: 3 },
      { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 },
      { kind: "REGEN", healRate: 0.08, durationTurns: 3 },
      { kind: "CLEANSE" },
      { kind: "HEAL", healRate: 0.25 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.4, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "REGEN", healRate: 0.08, durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "HEAL", healRate: 0.25 }] },
      // Lv2 シールド量 40%→43% / 回復量 8%→10%
      { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.43, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "REGEN", healRate: 0.1, durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "HEAL", healRate: 0.25 }] },
      // Lv3 シールド量 43%→45%
      { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.45, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "REGEN", healRate: 0.1, durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "HEAL", healRate: 0.25 }] },
      // Lv4 シールド量 45%→48% / 回復量 10%→12%
      { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.48, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "REGEN", healRate: 0.12, durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "HEAL", healRate: 0.25 }] },
      // Lv5 クールタイム -1(5→4ターン) / シールドの持続 3→4ターン / 強化の持続 3→4ターン / 継続回復の持続 3→4ターン
      { cooldownTurns: 4, effects: [{ kind: "SHIELD", shieldRate: 0.48, durationTurns: 4 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 4 }, { kind: "REGEN", healRate: 0.12, durationTurns: 4 }, { kind: "CLEANSE" }, { kind: "HEAL", healRate: 0.25 }] },
    ],
  },
  darkSkill3: {
    id: "golem_s3_dark",
    name: "オブシディアンクラッシュ",
    description: "ダメージ倍率 1.70倍(防御力の160%を加算)。70%で防御力-75% (2ターン)",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 1.7, defCoefficient: 1.6 },
      { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.7, defCoefficient: 1.6 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7 }] },
      // Lv2 弱体の発動率 70%→85%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.7, defCoefficient: 1.6 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 }] },
      // Lv3 ダメージ倍率 1.70倍→1.80倍 / 防御力比例 160%→175%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.8, defCoefficient: 1.75 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 }] },
      // Lv4 ダメージ倍率 1.80倍→1.90倍
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.9, defCoefficient: 1.75 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 }] },
      // Lv5 クールタイム -1(4→3ターン) / 弱体の持続 2→3ターン
      { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.9, defCoefficient: 1.75 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.85 }] },
    ],
  },
};

const FAIRY: MonsterTemplate = {
  templateId: "fairy",
  baseName: "フェアリー",
  emoji: "🧚",
  role: "ヒーラー",
  baseStats: {
    hp: 950,
    atk: 80,
    def: 65,
    spd: 105,
    criRate: 0.15,
    criDmg: 1.5,
    resistance: 0.22,
    accuracy: 0.12,
  },
  skill1: {
    id: "fairy_s1",
    name: "ちいさな一撃",
    description: "ダメージ倍率 0.85倍。自身を回復 最大HPの5.0%",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.85 },
      { kind: "HEAL", healRate: 0.05, applyTo: "SELF" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.85 }, { kind: "HEAL", healRate: 0.05, applyTo: "SELF" }] },
      // Lv2 ダメージ倍率 0.85倍→0.95倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.95 }, { kind: "HEAL", healRate: 0.05, applyTo: "SELF" }] },
      // Lv3 回復量 5%→7%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.95 }, { kind: "HEAL", healRate: 0.07, applyTo: "SELF" }] },
      // Lv4 ダメージ倍率 0.95倍→1.05倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.05 }, { kind: "HEAL", healRate: 0.07, applyTo: "SELF" }] },
      // Lv5 回復量 7%→10%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.05 }, { kind: "HEAL", healRate: 0.1, applyTo: "SELF" }] },
    ],
  },
  skill2Variants: [
    {
      id: "fairy_s2_a",
      name: "いやしのかぜ",
      description: "回復 最大HPの25.0%",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "HEAL", healRate: 0.25 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.25 }] },
        // Lv2 回復量 25%→27%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.27 }] },
        // Lv3 回復量 27%→30%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.3 }] },
        // Lv4 回復量 30%→33%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.33 }] },
        // Lv5 クールタイム -1(4→3ターン)
        { cooldownTurns: 3, effects: [{ kind: "HEAL", healRate: 0.33 }] },
      ],
    },
    {
      id: "fairy_s2_b",
      name: "せいすいのしずく",
      description: "回復 最大HPの40.0%。デバフを解除。行動ゲージ+20%",
      target: "SINGLE_ALLY",
      cooldownTurns: 3,
      effects: [
        { kind: "HEAL", healRate: 0.4 },
        { kind: "CLEANSE" },
        { kind: "GAUGE", amount: 0.2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "HEAL", healRate: 0.4 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.2 }] },
        // Lv2 回復量 40%→45% / 行動ゲージ 20%→25%
        { cooldownTurns: 3, effects: [{ kind: "HEAL", healRate: 0.45 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.25 }] },
        // Lv3 回復量 45%→50%
        { cooldownTurns: 3, effects: [{ kind: "HEAL", healRate: 0.5 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.25 }] },
        // Lv4
        { cooldownTurns: 3, effects: [{ kind: "HEAL", healRate: 0.5 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.25 }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "HEAL", healRate: 0.5 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.25 }] },
      ],
    },
    {
      id: "fairy_s2_c",
      name: "せいめいの葉",
      description: "回復 最大HPの15.0%。継続回復 最大HPの8.0% (3ターン、自身のターン開始時)",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "HEAL", healRate: 0.15 },
        { kind: "REGEN", healRate: 0.08, durationTurns: 3 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.15 }, { kind: "REGEN", healRate: 0.08, durationTurns: 3 }] },
        // Lv2 回復量 15%→18%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.18 }, { kind: "REGEN", healRate: 0.08, durationTurns: 3 }] },
        // Lv3 回復量 8%→10%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.18 }, { kind: "REGEN", healRate: 0.1, durationTurns: 3 }] },
        // Lv4 回復量 18%→20%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.2 }, { kind: "REGEN", healRate: 0.1, durationTurns: 3 }] },
        // Lv5 クールタイム -1(4→3ターン) / 継続回復の持続 3→4ターン
        { cooldownTurns: 3, effects: [{ kind: "HEAL", healRate: 0.2 }, { kind: "REGEN", healRate: 0.1, durationTurns: 4 }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "fairy_s3_a",
      name: "せいれいの加護",
      description: "攻撃力+30% (2ターン)。デバフを解除。行動ゲージ+20%",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 },
        { kind: "CLEANSE" },
        { kind: "GAUGE", amount: 0.2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.2 }] },
        // Lv2 行動ゲージ 20%→25%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.25 }] },
        // Lv3 行動ゲージ 25%→30%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.3 }] },
        // Lv4 行動ゲージ 30%→35%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.35 }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.35 }] },
      ],
    },
    {
      id: "fairy_s3_b",
      name: "だいちのめぐみ",
      description: "回復 最大HPの40.0%。シールド 最大HPの15% (2ターン、ダメージを肩代わり)",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "HEAL", healRate: 0.4 },
        { kind: "SHIELD", shieldRate: 0.15, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.4 }, { kind: "SHIELD", shieldRate: 0.15, durationTurns: 2 }] },
        // Lv2 回復量 40%→45% / シールド量 15%→20%
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.45 }, { kind: "SHIELD", shieldRate: 0.2, durationTurns: 2 }] },
        // Lv3 回復量 45%→50%
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.5 }, { kind: "SHIELD", shieldRate: 0.2, durationTurns: 2 }] },
        // Lv4
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.5 }, { kind: "SHIELD", shieldRate: 0.2, durationTurns: 2 }] },
        // Lv5 クールタイム -1(5→4ターン)
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.5 }, { kind: "SHIELD", shieldRate: 0.2, durationTurns: 2 }] },
      ],
    },
    {
      id: "fairy_s3_c",
      name: "れいこんのもり",
      description: "回復 最大HPの25.0%。防御力+30% (2ターン)。継続回復 最大HPの10.0% (2ターン、自身のターン開始時)",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "HEAL", healRate: 0.25 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
        { kind: "REGEN", healRate: 0.1, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.25 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "REGEN", healRate: 0.1, durationTurns: 2 }] },
        // Lv2 回復量 25%→28% / 回復量 10%→12%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.28 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "REGEN", healRate: 0.12, durationTurns: 2 }] },
        // Lv3
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.28 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "REGEN", healRate: 0.12, durationTurns: 2 }] },
        // Lv4 回復量 28%→32%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.32 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "REGEN", healRate: 0.12, durationTurns: 2 }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "HEAL", healRate: 0.32 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "REGEN", healRate: 0.12, durationTurns: 2 }] },
      ],
    },
  ],
  lightSkill3: {
    id: "fairy_s3_light",
    name: "セラフィックブレス",
    // 通常の「だいちのめぐみ」が35%回復。40%では差が5ポイントしかなく、
    // 実測でも通常と区別がつかなかったので、継続回復で厚みを付ける
    description: "回復 最大HPの45.0%。継続回復 最大HPの10.0% (3ターン、自身のターン開始時)。デバフを解除。状態異常無効 (2ターン)",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "HEAL", healRate: 0.45 },
      { kind: "REGEN", healRate: 0.1, durationTurns: 3 },
      { kind: "CLEANSE" },
      { kind: "IMMUNITY", durationTurns: 2 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.45 }, { kind: "REGEN", healRate: 0.1, durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 2 }] },
      // Lv2 回復量 10%→12%
      { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.45 }, { kind: "REGEN", healRate: 0.12, durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 2 }] },
      // Lv3 回復量 45%→50%
      { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.5 }, { kind: "REGEN", healRate: 0.12, durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 2 }] },
      // Lv4
      { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.5 }, { kind: "REGEN", healRate: 0.12, durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 2 }] },
      // Lv5 クールタイム -1(5→4ターン) / 継続回復の持続 3→4ターン / 免疫の持続 2→3ターン
      { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.5 }, { kind: "REGEN", healRate: 0.12, durationTurns: 4 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 3 }] },
    ],
  },
  darkSkill3: {
    id: "fairy_s3_dark",
    name: "ナイトメアミスト",
    description: "回復 最大HPの35.0%。速度+20% (3ターン)。行動ゲージ+35%",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "HEAL", healRate: 0.35 },
      { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 },
      { kind: "GAUGE", amount: 0.35 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.35 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.35 }] },
      // Lv2 行動ゲージ 35%→40%
      { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.35 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.4 }] },
      // Lv3 回復量 35%→40%
      { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.4 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.4 }] },
      // Lv4 行動ゲージ 40%→45%
      { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.4 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.45 }] },
      // Lv5 クールタイム -1(5→4ターン) / 強化の持続 3→4ターン
      { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.4 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 4 }, { kind: "GAUGE", amount: 0.45 }] },
    ],
  },
};

/**
 * インプ。素早さと命中に全振りした妨害役。
 *
 * 通常入手できるモンスターにデバッファーが1体も居らず、
 * 「状態異常を入れて相手の手数を削る」という戦い方そのものが選べなかった。
 * 火力は最下位クラスに置き、当てる能力(命中)で存在価値を出している。
 */
const IMP: MonsterTemplate = {
  templateId: "imp",
  baseName: "インプ",
  emoji: "👿",
  role: "デバッファー",
  baseStats: {
    hp: 1000,
    atk: 110,
    def: 62,
    spd: 118,
    criRate: 0.15,
    criDmg: 1.5,
    resistance: 0.12,
    accuracy: 0.25,
  },
  skill1: {
    id: "imp_s1",
    name: "ひっかき",
    description: "ダメージ倍率 1.00倍。40%で攻撃力-50% (2ターン)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1 },
      { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.4 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.4 }] },
      // Lv2 ダメージ倍率 1.00倍→1.10倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.4 }] },
      // Lv3 弱体の発動率 40%→55%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.55 }] },
      // Lv4 ダメージ倍率 1.10倍→1.20倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.55 }] },
      // Lv5 弱体の発動率 55%→70%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 }] },
    ],
  },
  skill2Variants: [
    {
      id: "imp_s2_a",
      name: "のろいのつめ",
      description: "ダメージ倍率 1.40倍。70%で防御力-75% (2ターン)。70%で毒1スタック (1スタックにつき最大HPの5%、最大5スタック、2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.4 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7 },
        { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.7 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7 }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.7 }] },
        // Lv2 ダメージ倍率 1.40倍→1.55倍 / 弱体の発動率 70%→75%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.55 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.75 }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.7 }] },
        // Lv3 弱体の発動率 75%→85%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.55 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.7 }] },
        // Lv4 ダメージ倍率 1.55倍→1.70倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.7 }] },
        // Lv5 クールタイム -1(3→2ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.85 }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.7 }] },
      ],
    },
    {
      id: "imp_s2_b",
      name: "めつぶし",
      description: "ダメージ倍率 1.00倍。60%で暗闇 (2ターン、攻撃時50%でダメージ-75%・追加効果なし)",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1 },
        { kind: "BLIND", durationTurns: 2, chance: 0.6 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1 }, { kind: "BLIND", durationTurns: 2, chance: 0.6 }] },
        // Lv2 ダメージ倍率 1.00倍→1.10倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "BLIND", durationTurns: 2, chance: 0.6 }] },
        // Lv3 暗闇の発動率 60%→75%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "BLIND", durationTurns: 2, chance: 0.75 }] },
        // Lv4 ダメージ倍率 1.10倍→1.20倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "BLIND", durationTurns: 2, chance: 0.75 }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "BLIND", durationTurns: 2, chance: 0.75 }] },
      ],
    },
    {
      id: "imp_s2_c",
      name: "あしばらい",
      description: "ダメージ倍率 1.20倍。行動ゲージを15%吸収。70%で速度-30% (2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2 },
        { kind: "GAUGE", amount: 0.15, drain: true },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.7 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "GAUGE", amount: 0.15, drain: true }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.7 }] },
        // Lv2 ダメージ倍率 1.20倍→1.35倍 / 行動ゲージ 15%→20% / 弱体の発動率 70%→75%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.35 }, { kind: "GAUGE", amount: 0.2, drain: true }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.75 }] },
        // Lv3 弱体の発動率 75%→80%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.35 }, { kind: "GAUGE", amount: 0.2, drain: true }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.8 }] },
        // Lv4 ダメージ倍率 1.35倍→1.45倍 / 弱体の発動率 80%→85%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.45 }, { kind: "GAUGE", amount: 0.2, drain: true }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.85 }] },
        // Lv5 クールタイム -1(3→2ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.45 }, { kind: "GAUGE", amount: 0.2, drain: true }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3, chance: 0.85 }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "imp_s3_a",
      name: "あくいのばらまき",
      description: "ダメージ倍率 1.25倍。75%で攻撃力-50% (2ターン)。行動ゲージ-15%。70%で治癒阻害 (2ターン、回復を受けられない)。50%で呪い1個(対象の2回目のターン開始時、付与時攻撃力×4の固定ダメージと1ターンスタン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.25 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.75 },
        { kind: "GAUGE", amount: -0.15 },
        { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.7 },
        { kind: "CURSE", chance: 0.5 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.25 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.75 }, { kind: "GAUGE", amount: -0.15 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.7 }, { kind: "CURSE", chance: 0.5 }] },
        // Lv2 ダメージ倍率 1.25倍→1.35倍 / 弱体の発動率 75%→80% / 行動ゲージ -15%→-20%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.35 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.8 }, { kind: "GAUGE", amount: -0.2 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.7 }, { kind: "CURSE", chance: 0.5 }] },
        // Lv3 弱体の発動率 80%→85% / 治癒阻害の発動率 70%→80%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.35 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.85 }, { kind: "GAUGE", amount: -0.2 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.8 }, { kind: "CURSE", chance: 0.5 }] },
        // Lv4 ダメージ倍率 1.35倍→1.50倍 / 弱体の発動率 85%→90%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.2 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.8 }, { kind: "CURSE", chance: 0.5 }] },
        // Lv5 クールタイム -1(4→3ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 3, chance: 0.9 }, { kind: "GAUGE", amount: -0.2 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.8 }, { kind: "CURSE", chance: 0.5 }] },
      ],
    },
    {
      id: "imp_s3_b",
      name: "ふういんのわらい",
      // CT5でクールタイム延長1ターンだけでは、妨害役の目安にも届いていなかった
      description: "ダメージ倍率 1.20倍。75%で敵の全スキルのクールタイムを1ターン延長。70%で強化不可 (2ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2 },
        { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.75 },
        { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.7, durationTurns: 2, fixedDuration: true },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.75 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.7, durationTurns: 2, fixedDuration: true }] },
        // Lv2 ダメージ倍率 1.20倍→1.35倍 / CT延長の発動率 75%→80%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.35 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.8 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.7, durationTurns: 2, fixedDuration: true }] },
        // Lv3 CT延長の発動率 80%→85% / 発動率 70%→85%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.35 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.85 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.85, durationTurns: 2, fixedDuration: true }] },
        // Lv4 CT延長の発動率 85%→90%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.35 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.9 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.85, durationTurns: 2, fixedDuration: true }] },
        // Lv5 クールタイム -1(4→3ターン)
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.35 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.9 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.85, durationTurns: 2, fixedDuration: true }] },
      ],
    },
    {
      id: "imp_s3_c",
      name: "どくのきり",
      description: "ダメージ倍率 0.75倍 × 2回。70%で毒1スタック (1スタックにつき最大HPの5%、最大5スタック、3ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.75, hits: 2 },
        { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 3, chance: 0.7 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.75, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 3, chance: 0.7 }] },
        // Lv2 ダメージ倍率 0.75倍→0.80倍 / 毒1スタック 5%→5.5% / 毒の発動率 70%→80%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.055, durationTurns: 3, chance: 0.8 }] },
        // Lv3 ダメージ倍率 0.80倍→0.90倍 / 毒1スタック 5.5%→6%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 3, chance: 0.8 }] },
        // Lv4
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 3, chance: 0.8 }] },
        // Lv5 クールタイム -1(4→3ターン) / 毒の持続 3→4ターン
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 2 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 4, chance: 0.8 }] },
      ],
    },
  ],
  lightSkill3: {
    id: "imp_s3_light",
    name: "ジャッジメントヘイズ",
    description: "ダメージ倍率 1.55倍。70%で攻撃力-50% (2ターン)。60%で暗闇 (2ターン、攻撃時50%でダメージ-75%・追加効果なし)",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 1.55 },
      { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 },
      { kind: "BLIND", durationTurns: 2, chance: 0.6 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.55 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 }, { kind: "BLIND", durationTurns: 2, chance: 0.6 }] },
      // Lv2 弱体の発動率 70%→75% / 暗闇の発動率 60%→75%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.55 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.75 }, { kind: "BLIND", durationTurns: 2, chance: 0.75 }] },
      // Lv3 ダメージ倍率 1.55倍→1.70倍 / 弱体の発動率 75%→85%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.85 }, { kind: "BLIND", durationTurns: 2, chance: 0.75 }] },
      // Lv4
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.85 }, { kind: "BLIND", durationTurns: 2, chance: 0.75 }] },
      // Lv5 クールタイム -1(4→3ターン) / 弱体の持続 2→3ターン
      { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 3, chance: 0.85 }, { kind: "BLIND", durationTurns: 2, chance: 0.75 }] },
    ],
  },
  darkSkill3: {
    id: "imp_s3_dark",
    name: "サイレントカース",
    // 延長を2ターン100%から1ターン70%へ落としたぶん、火力と毒で釣り合わせる
    // (実測で通常のスキル3を0.17下回っていた)
    // 2ターン延長は、当たった相手が2巡ぶん何もできなくなる。1ターンでも十分に重い
    description: "ダメージ倍率 2.00倍。70%で敵の全スキルのクールタイムを1ターン延長。85%で毒1スタック (1スタックにつき最大HPの8%、最大5スタック、4ターン)",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 2 },
      { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.7 },
      { kind: "POISON", damageRatePerStack: 0.08, durationTurns: 4, chance: 0.85 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.7 }, { kind: "POISON", damageRatePerStack: 0.08, durationTurns: 4, chance: 0.85 }] },
      // Lv2 ダメージ倍率 2.00倍→2.15倍 / CT延長の発動率 70%→75% / 毒1スタック 8%→8.5% / 毒の発動率 85%→95%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.15 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.75 }, { kind: "POISON", damageRatePerStack: 0.085, durationTurns: 4, chance: 0.95 }] },
      // Lv3 ダメージ倍率 2.15倍→2.25倍 / CT延長の発動率 75%→80% / 毒1スタック 8.5%→9% / 毒の発動率 95%→100%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.25 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.8 }, { kind: "POISON", damageRatePerStack: 0.09, durationTurns: 4, chance: 1 }] },
      // Lv4 ダメージ倍率 2.25倍→2.40倍 / CT延長の発動率 80%→85% / 毒1スタック 9%→9.5%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.4 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.85 }, { kind: "POISON", damageRatePerStack: 0.095, durationTurns: 4, chance: 1 }] },
      // Lv5 クールタイム -1(5→4ターン) / 毒の持続 4→5ターン
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.4 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.85 }, { kind: "POISON", damageRatePerStack: 0.095, durationTurns: 5, chance: 1 }] },
    ],
  },
};

/**
 * ウィスプ。味方を強化することしかできない、純粋なサポート。
 *
 * 単体では何も倒せないが、スキル1の時点で味方全体に効果が乗るため、
 * 長期戦のダンジョンでは1枠を割く価値が出る。
 * 攻撃役を並べるだけの編成に、初めて「入れ替える理由」を作るための1体。
 */
const WISP: MonsterTemplate = {
  templateId: "wisp",
  baseName: "ウィスプ",
  emoji: "🔮",
  role: "サポート",
  baseStats: {
    hp: 1100,
    atk: 80,
    def: 82,
    spd: 112,
    criRate: 0.15,
    criDmg: 1.5,
    resistance: 0.25,
    accuracy: 0.12,
  },
  skill1: {
    id: "wisp_s1",
    name: "ほのかなともしび",
    description: "ダメージ倍率 0.80倍。味方全体の防御力+30% (1ターン)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.8 },
      { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 1, applyTo: "ALLIES" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.8 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 1, applyTo: "ALLIES" }] },
      // Lv2 ダメージ倍率 0.80倍→0.90倍 / 「自身の行動ゲージ+10%」が付く
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.9 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 1, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.1, applyTo: "SELF" }] },
      // Lv3 ダメージ倍率 0.90倍→1.00倍 / 行動ゲージ 10%→20%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 1, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.2, applyTo: "SELF" }] },
      // Lv4
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 1, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.2, applyTo: "SELF" }] },
      // Lv5 強化の持続 1→2ターン
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.2, applyTo: "SELF" }] },
    ],
  },
  skill2Variants: [
    {
      id: "wisp_s2_a",
      name: "まもりのりんこう",
      // シールドと状態異常無効が同時に乗ると、受けを一枚で成立させてしまい強すぎた。
      // 無効を解除に置き換え、「先回りして防ぐ」のではなく「掛かった後に立て直す」役に寄せている
      description: "シールド 最大HPの20% (3ターン、ダメージを肩代わり)。デバフを解除",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "SHIELD", shieldRate: 0.2, durationTurns: 3 },
        { kind: "CLEANSE" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.2, durationTurns: 3 }, { kind: "CLEANSE" }] },
        // Lv2 シールド量 20%→22%
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.22, durationTurns: 3 }, { kind: "CLEANSE" }] },
        // Lv3 「行動ゲージ+10%」が付く
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.22, durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.1 }] },
        // Lv4 シールド量 22%→25%
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.25, durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.1 }] },
        // Lv5 クールタイム -1(5→4ターン) / シールドの持続 3→4ターン
        { cooldownTurns: 4, effects: [{ kind: "SHIELD", shieldRate: 0.25, durationTurns: 4 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.1 }] },
      ],
    },
    {
      id: "wisp_s2_b",
      name: "かそくのりんこう",
      description: "速度+20% (2ターン)。行動ゲージ+25%",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 },
        { kind: "GAUGE", amount: 0.25 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.25 }] },
        // Lv2 行動ゲージ 25%→30%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.3 }] },
        // Lv3
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.3 }] },
        // Lv4
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.3 }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.3 }] },
      ],
    },
    {
      id: "wisp_s2_c",
      name: "いやしのりんこう",
      description: "回復 最大HPの18.0%。継続回復 最大HPの8.0% (2ターン、自身のターン開始時)",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "HEAL", healRate: 0.18 },
        { kind: "REGEN", healRate: 0.08, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.18 }, { kind: "REGEN", healRate: 0.08, durationTurns: 2 }] },
        // Lv2 回復量 18%→20%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.2 }, { kind: "REGEN", healRate: 0.08, durationTurns: 2 }] },
        // Lv3 回復量 8%→10%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.2 }, { kind: "REGEN", healRate: 0.1, durationTurns: 2 }] },
        // Lv4 回復量 20%→22%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.22 }, { kind: "REGEN", healRate: 0.1, durationTurns: 2 }] },
        // Lv5 クールタイム -1(4→3ターン) / 継続回復の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "HEAL", healRate: 0.22 }, { kind: "REGEN", healRate: 0.1, durationTurns: 3 }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "wisp_s3_a",
      name: "ほしくずのわ",
      // 効果量が共通値に下がったぶん、回せる速さで釣り合わせる(5→4)
      description: "攻撃力+30% (2ターン)。クリ率+20% (2ターン)。クリダメ+30% (2ターン)。行動ゲージ+10%",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 },
        { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 },
        { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 },
        { kind: "GAUGE", amount: 0.1 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.1 }] },
        // Lv2 行動ゲージ 10%→15%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.15 }] },
        // Lv3 行動ゲージ 15%→20%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.2 }] },
        // Lv4
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.2 }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.2 }] },
      ],
    },
    {
      id: "wisp_s3_b",
      name: "じょうかのひかり",
      // 解除・回復・無効の3つが1つに乗っていて、これ1枚で崩れなくなっていた。
      // 解除は「まもりのりんこう」の役目に移し、こちらは回復と無効に絞る
      description: "回復 最大HPの30.0%。状態異常無効 (2ターン)。デバフを解除",
      target: "ALL_ALLIES",
      cooldownTurns: 6,
      effects: [
        { kind: "HEAL", healRate: 0.3 },
        { kind: "IMMUNITY", durationTurns: 2 },
        { kind: "CLEANSE" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 6, effects: [{ kind: "HEAL", healRate: 0.3 }, { kind: "IMMUNITY", durationTurns: 2 }, { kind: "CLEANSE" }] },
        // Lv2 回復量 30%→35%
        { cooldownTurns: 6, effects: [{ kind: "HEAL", healRate: 0.35 }, { kind: "IMMUNITY", durationTurns: 2 }, { kind: "CLEANSE" }] },
        // Lv3 「行動ゲージ+15%」が付く
        { cooldownTurns: 6, effects: [{ kind: "HEAL", healRate: 0.35 }, { kind: "IMMUNITY", durationTurns: 2 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.15 }] },
        // Lv4 回復量 35%→40%
        { cooldownTurns: 6, effects: [{ kind: "HEAL", healRate: 0.4 }, { kind: "IMMUNITY", durationTurns: 2 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.15 }] },
        // Lv5 クールタイム -1(6→5ターン) / 免疫の持続 2→3ターン
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.4 }, { kind: "IMMUNITY", durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.15 }] },
      ],
    },
    {
      id: "wisp_s3_c",
      name: "ときわたりのひかり",
      description: "味方全体の行動ゲージを30%進め、素早さを2ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "GAUGE", amount: 0.3 },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 },
      ],
    },
  ],
  lightSkill3: {
    id: "wisp_s3_light",
    name: "ラディアントブレッシング",
    description: "攻撃力+30% (3ターン)。クリ率+20% (3ターン)。行動ゲージ+25%。クリダメ+30% (3ターン)",
    target: "ALL_ALLIES",
    cooldownTurns: 6,
    effects: [
      { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 },
      { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3 },
      { kind: "GAUGE", amount: 0.25 },
      { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 6, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.25 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 }] },
      // Lv2 行動ゲージ 25%→30%
      { cooldownTurns: 6, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.3 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 }] },
      // Lv3 行動ゲージ 30%→35%
      { cooldownTurns: 6, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.35 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 }] },
      // Lv4 行動ゲージ 35%→40%
      { cooldownTurns: 6, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.4 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 }] },
      // Lv5 クールタイム -1(6→5ターン) / 強化の持続 3→4ターン
      { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 4 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 4 }, { kind: "GAUGE", amount: 0.4 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 }] },
    ],
  },
  darkSkill3: {
    id: "wisp_s3_dark",
    name: "ヴォイドシフト",
    description: "行動ゲージ+100%。攻撃力+30% (2ターン)。自身の行動ゲージ+20%",
    target: "SINGLE_ALLY",
    cooldownTurns: 3,
    effects: [
      { kind: "GAUGE", amount: 1 },
      { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 },
      { kind: "GAUGE", amount: 0.2, applyTo: "SELF" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 3, effects: [{ kind: "GAUGE", amount: 1 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.2, applyTo: "SELF" }] },
      // Lv2 行動ゲージ 20%→25%
      { cooldownTurns: 3, effects: [{ kind: "GAUGE", amount: 1 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.25, applyTo: "SELF" }] },
      // Lv3 行動ゲージ 25%→30%
      { cooldownTurns: 3, effects: [{ kind: "GAUGE", amount: 1 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.3, applyTo: "SELF" }] },
      // Lv4 行動ゲージ 30%→40%
      { cooldownTurns: 3, effects: [{ kind: "GAUGE", amount: 1 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF" }] },
      // Lv5 クールタイム -1(3→2ターン)
      { cooldownTurns: 2, effects: [{ kind: "GAUGE", amount: 1 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF" }] },
    ],
  },
};

/**
 * トレント。ゴーレムと同じ壁役だが、硬さではなくHPの多さで受ける。
 *
 * ゴーレムが「防御力を上げて一撃を軽くする」のに対し、
 * こちらは「HPの絶対量と継続回復で削り切られない」方向。
 * 防御無視や毒のように防御力が効かない相手に対して、はっきり別の答えになる。
 */
const TREANT: MonsterTemplate = {
  templateId: "treant",
  baseName: "トレント",
  emoji: "🌳",
  role: "ディフェンダー",
  baseStats: {
    hp: 1950,
    atk: 85,
    def: 96,
    spd: 72,
    criRate: 0.17,
    criDmg: 1.55,
    resistance: 0.28,
    accuracy: 0.1,
  },
  skill1: {
    id: "treant_s1",
    name: "えだのひとふり",
    description: "ダメージ倍率 0.60倍(最大HPの7.5%を加算)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.6, hpCoefficient: 0.075 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.6, hpCoefficient: 0.075 }] },
      // Lv2 ダメージ倍率 0.60倍→0.65倍 / 最大HP比例 7.5%→8%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.65, hpCoefficient: 0.08 }] },
      // Lv3 ダメージ倍率 0.65倍→0.70倍 / 最大HP比例 8%→8.5%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.7, hpCoefficient: 0.085 }] },
      // Lv4 ダメージ倍率 0.70倍→0.75倍 / 最大HP比例 8.5%→9.5%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.75, hpCoefficient: 0.095 }] },
      // Lv5 最大HP比例 9.5%→10.5%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.75, hpCoefficient: 0.105 }] },
    ],
  },
  skill2Variants: [
    {
      id: "treant_s2_a",
      name: "からみつくねっこ",
      description: "ダメージ倍率 0.70倍(最大HPの7.5%を加算)。50%でスタン (1ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.7, hpCoefficient: 0.075 },
        { kind: "STUN", durationTurns: 1, chance: 0.5 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.7, hpCoefficient: 0.075 }, { kind: "STUN", durationTurns: 1, chance: 0.5 }] },
        // Lv2 ダメージ倍率 0.70倍→0.75倍 / 最大HP比例 7.5%→8.5%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.75, hpCoefficient: 0.085 }, { kind: "STUN", durationTurns: 1, chance: 0.5 }] },
        // Lv3 ダメージ倍率 0.75倍→0.80倍 / スタンの発動率 50%→60%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.8, hpCoefficient: 0.085 }, { kind: "STUN", durationTurns: 1, chance: 0.6 }] },
        // Lv4 ダメージ倍率 0.80倍→0.85倍 / 最大HP比例 8.5%→10%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.85, hpCoefficient: 0.1 }, { kind: "STUN", durationTurns: 1, chance: 0.6 }] },
        // Lv5 クールタイム -1(4→3ターン)
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.85, hpCoefficient: 0.1 }, { kind: "STUN", durationTurns: 1, chance: 0.6 }] },
      ],
    },
    {
      id: "treant_s2_b",
      name: "ねづよいかまえ",
      description: "防御力+30% (3ターン)。シールド 最大HPの25% (3ターン、ダメージを肩代わり)。デバフを解除",
      target: "SELF",
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 },
        { kind: "SHIELD", shieldRate: 0.25, durationTurns: 3 },
        { kind: "CLEANSE" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "SHIELD", shieldRate: 0.25, durationTurns: 3 }, { kind: "CLEANSE" }] },
        // Lv2 シールド量 25%→30%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "SHIELD", shieldRate: 0.3, durationTurns: 3 }, { kind: "CLEANSE" }] },
        // Lv3 「自身の行動ゲージ+20%」が付く
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "SHIELD", shieldRate: 0.3, durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.2, applyTo: "SELF" }] },
        // Lv4 シールド量 30%→35%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "SHIELD", shieldRate: 0.35, durationTurns: 3 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.2, applyTo: "SELF" }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 3→4ターン / シールドの持続 3→4ターン
        { cooldownTurns: 3, effects: [{ kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 4 }, { kind: "SHIELD", shieldRate: 0.35, durationTurns: 4 }, { kind: "CLEANSE" }, { kind: "GAUGE", amount: 0.2, applyTo: "SELF" }] },
      ],
    },
    {
      id: "treant_s2_c",
      name: "ようぶんきゅうしゅう",
      description: "ダメージ倍率 0.90倍(最大HPの10%を加算)。与えたダメージの50%を自身が回復 (自身の最大HPの30%まで)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 0.9, hpCoefficient: 0.1 },
        { kind: "LIFESTEAL", healRate: 0.5, maxSourceHpRate: 0.3 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.9, hpCoefficient: 0.1 }, { kind: "LIFESTEAL", healRate: 0.5, maxSourceHpRate: 0.3 }] },
        // Lv2 ダメージ倍率 0.90倍→0.95倍 / 最大HP比例 10%→11%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.95, hpCoefficient: 0.11 }, { kind: "LIFESTEAL", healRate: 0.5, maxSourceHpRate: 0.3 }] },
        // Lv3 ダメージ倍率 0.95倍→1.05倍 / 回復量 50%→60%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.05, hpCoefficient: 0.11 }, { kind: "LIFESTEAL", healRate: 0.6, maxSourceHpRate: 0.3 }] },
        // Lv4 ダメージ倍率 1.05倍→1.10倍 / 最大HP比例 11%→13%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.1, hpCoefficient: 0.13 }, { kind: "LIFESTEAL", healRate: 0.6, maxSourceHpRate: 0.3 }] },
        // Lv5 クールタイム -1(3→2ターン) / ダメージ倍率 1.10倍→1.50倍
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.5, hpCoefficient: 0.13 }, { kind: "LIFESTEAL", healRate: 0.6, maxSourceHpRate: 0.3 }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "treant_s3_a",
      name: "もりのゆりかご",
      description: "回復 最大HPの20.0%。継続回復 最大HPの10.0% (3ターン、自身のターン開始時)。シールド 最大HPの15% (3ターン、ダメージを肩代わり)",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "HEAL", healRate: 0.2 },
        { kind: "REGEN", healRate: 0.1, durationTurns: 3 },
        { kind: "SHIELD", shieldRate: 0.15, durationTurns: 3 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.2 }, { kind: "REGEN", healRate: 0.1, durationTurns: 3 }, { kind: "SHIELD", shieldRate: 0.15, durationTurns: 3 }] },
        // Lv2 回復量 20%→23%
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.23 }, { kind: "REGEN", healRate: 0.1, durationTurns: 3 }, { kind: "SHIELD", shieldRate: 0.15, durationTurns: 3 }] },
        // Lv3 回復量 10%→12%
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.23 }, { kind: "REGEN", healRate: 0.12, durationTurns: 3 }, { kind: "SHIELD", shieldRate: 0.15, durationTurns: 3 }] },
        // Lv4 シールド量 15%→20%
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.23 }, { kind: "REGEN", healRate: 0.12, durationTurns: 3 }, { kind: "SHIELD", shieldRate: 0.2, durationTurns: 3 }] },
        // Lv5 クールタイム -1(5→4ターン) / 継続回復の持続 3→4ターン
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.23 }, { kind: "REGEN", healRate: 0.12, durationTurns: 4 }, { kind: "SHIELD", shieldRate: 0.2, durationTurns: 3 }] },
      ],
    },
    {
      id: "treant_s3_b",
      name: "たいじゅのいかり",
      description: "ダメージ倍率 0.80倍(最大HPの11%を加算)。70%で速度-30% (2ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.8, hpCoefficient: 0.11 },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.7 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.8, hpCoefficient: 0.11 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.7 }] },
        // Lv2 ダメージ倍率 0.80倍→0.85倍 / 最大HP比例 11%→12%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.85, hpCoefficient: 0.12 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.7 }] },
        // Lv3 ダメージ倍率 0.85倍→0.90倍 / 弱体の発動率 70%→85%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.9, hpCoefficient: 0.12 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.85 }] },
        // Lv4 ダメージ倍率 0.90倍→0.95倍 / 最大HP比例 12%→14%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.95, hpCoefficient: 0.14 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.85 }] },
        // Lv5 クールタイム -1(4→3ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.95, hpCoefficient: 0.14 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3, chance: 0.85 }] },
      ],
    },
    {
      id: "treant_s3_c",
      name: "だいちのとりで",
      description: "シールド 最大HPの25% (3ターン、ダメージを肩代わり)。状態異常無効 (2ターン)。防御力+30% (2ターン)",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "SHIELD", shieldRate: 0.25, durationTurns: 3 },
        { kind: "IMMUNITY", durationTurns: 2 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.25, durationTurns: 3 }, { kind: "IMMUNITY", durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv2 シールド量 25%→28%
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.28, durationTurns: 3 }, { kind: "IMMUNITY", durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv3 シールド量 28%→30%
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.3, durationTurns: 3 }, { kind: "IMMUNITY", durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv4 シールド量 30%→35%
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.35, durationTurns: 3 }, { kind: "IMMUNITY", durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv5 クールタイム -1(5→4ターン) / シールドの持続 3→4ターン / 免疫の持続 2→3ターン
        { cooldownTurns: 4, effects: [{ kind: "SHIELD", shieldRate: 0.35, durationTurns: 4 }, { kind: "IMMUNITY", durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
      ],
    },
  ],
  lightSkill3: {
    id: "treant_s3_light",
    name: "ワールドツリー",
    description: "回復 最大HPの25.0%。継続回復 最大HPの10.0% (4ターン、自身のターン開始時)。デバフを解除",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "HEAL", healRate: 0.25 },
      { kind: "REGEN", healRate: 0.1, durationTurns: 4 },
      { kind: "CLEANSE" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.25 }, { kind: "REGEN", healRate: 0.1, durationTurns: 4 }, { kind: "CLEANSE" }] },
      // Lv2 回復量 25%→28% / 回復量 10%→11%
      { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.28 }, { kind: "REGEN", healRate: 0.11, durationTurns: 4 }, { kind: "CLEANSE" }] },
      // Lv3 回復量 11%→12%
      { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.28 }, { kind: "REGEN", healRate: 0.12, durationTurns: 4 }, { kind: "CLEANSE" }] },
      // Lv4 回復量 28%→32%
      { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.32 }, { kind: "REGEN", healRate: 0.12, durationTurns: 4 }, { kind: "CLEANSE" }] },
      // Lv5 クールタイム -1(5→4ターン) / 継続回復の持続 4→5ターン
      { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.32 }, { kind: "REGEN", healRate: 0.12, durationTurns: 5 }, { kind: "CLEANSE" }] },
    ],
  },
  darkSkill3: {
    id: "treant_s3_dark",
    name: "ソウルルート",
    // トレントは味方を保たせる種族。火力だけを積んでも、通常のスキル3(もりのゆりかご)を
    // 外したぶんの穴が埋まらず、実測では30戦中29敗になっていた。
    // **役割を捨てさせないこと。**吸った分を味方へ回す形にして、闇でも支え役として成立させる
    description: "ダメージ倍率 2.00倍(最大HPの13%を加算)。与えたダメージの40%を自身が回復。60%で速度-30% (2ターン)。味方全体を回復 最大HPの15.0%。味方全体の防御力+30% (3ターン)",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 2, hpCoefficient: 0.13 },
      { kind: "LIFESTEAL", healRate: 0.4 },
      { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.6 },
      { kind: "HEAL", healRate: 0.15, applyTo: "ALLIES" },
      { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, applyTo: "ALLIES" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2, hpCoefficient: 0.13 }, { kind: "LIFESTEAL", healRate: 0.4 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.6 }, { kind: "HEAL", healRate: 0.15, applyTo: "ALLIES" }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, applyTo: "ALLIES" }] },
      // Lv2 ダメージ倍率 2.00倍→2.15倍 / 最大HP比例 13%→15% / 回復量 40%→43% / 弱体の発動率 60%→65% / 回復量 15%→16%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.15, hpCoefficient: 0.15 }, { kind: "LIFESTEAL", healRate: 0.43 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.65 }, { kind: "HEAL", healRate: 0.16, applyTo: "ALLIES" }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, applyTo: "ALLIES" }] },
      // Lv3 ダメージ倍率 2.15倍→2.25倍 / 回復量 43%→50% / 弱体の発動率 65%→75% / 回復量 16%→17%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.25, hpCoefficient: 0.15 }, { kind: "LIFESTEAL", healRate: 0.5 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.75 }, { kind: "HEAL", healRate: 0.17, applyTo: "ALLIES" }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, applyTo: "ALLIES" }] },
      // Lv4 ダメージ倍率 2.25倍→2.40倍 / 最大HP比例 15%→18% / 回復量 17%→20%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.4, hpCoefficient: 0.18 }, { kind: "LIFESTEAL", healRate: 0.5 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.75 }, { kind: "HEAL", healRate: 0.2, applyTo: "ALLIES" }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, applyTo: "ALLIES" }] },
      // Lv5 クールタイム -1(4→3ターン) / 弱体の持続 2→3ターン / 強化の持続 3→4ターン
      { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.4, hpCoefficient: 0.18 }, { kind: "LIFESTEAL", healRate: 0.5 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3, chance: 0.75 }, { kind: "HEAL", healRate: 0.2, applyTo: "ALLIES" }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 4, applyTo: "ALLIES" }] },
    ],
  },
};

/**
 * グレイヴナイト。攻守を1体で兼ねるバランス型。
 *
 * 尖った性能はないが、盾役と攻撃役の両方が足りない編成の穴埋めになる。
 * 序盤に配りやすく、育てても腐らないことを狙った基準値のような1体。
 */
const KNIGHT: MonsterTemplate = {
  templateId: "knight",
  baseName: "グレイヴナイト",
  emoji: "⚔️",
  role: "バランス型",
  baseStats: {
    hp: 1350,
    atk: 122,
    def: 95,
    spd: 96,
    criRate: 0.16,
    criDmg: 1.53,
    resistance: 0.15,
    accuracy: 0.12,
  },
  skill1: {
    id: "knight_s1",
    name: "なぎはらい",
    description: "ダメージ倍率 1.00倍(防御力の90%を加算)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1, defCoefficient: 0.9 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1, defCoefficient: 0.9 }] },
      // Lv2 ダメージ倍率 1.00倍→1.10倍 / 防御力比例 90%→100%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1, defCoefficient: 1 }] },
      // Lv3 ダメージ倍率 1.10倍→1.15倍 / 防御力比例 100%→110%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.15, defCoefficient: 1.1 }] },
      // Lv4 ダメージ倍率 1.15倍→1.20倍 / 防御力比例 110%→120%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.2, defCoefficient: 1.2 }] },
      // Lv5 ダメージ倍率 1.20倍→1.25倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.25, defCoefficient: 1.2 }] },
    ],
  },
  skill2Variants: [
    {
      id: "knight_s2_a",
      name: "かぶとわり",
      description: "ダメージ倍率 1.60倍。70%で防御力-75% (2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.6 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.6 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7 }] },
        // Lv2 ダメージ倍率 1.60倍→1.75倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.75 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7 }] },
        // Lv3 弱体の発動率 70%→85%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.75 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 }] },
        // Lv4 ダメージ倍率 1.75倍→1.90倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.9 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 }] },
        // Lv5 クールタイム -1(3→2ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.9 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.85 }] },
      ],
    },
    {
      id: "knight_s2_b",
      name: "たてうけ",
      description: "デバフを解除。自身の防御力+30% (3ターン)。シールド 最大HPの10% (2ターン、ダメージを肩代わり)",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "CLEANSE" },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, applyTo: "SELF" },
        { kind: "SHIELD", shieldRate: 0.1, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "CLEANSE" }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "SHIELD", shieldRate: 0.1, durationTurns: 2 }] },
        // Lv2 シールド量 10%→12%
        { cooldownTurns: 4, effects: [{ kind: "CLEANSE" }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "SHIELD", shieldRate: 0.12, durationTurns: 2 }] },
        // Lv3 シールド量 12%→15%
        { cooldownTurns: 4, effects: [{ kind: "CLEANSE" }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "SHIELD", shieldRate: 0.15, durationTurns: 2 }] },
        // Lv4 シールド量 15%→18%
        { cooldownTurns: 4, effects: [{ kind: "CLEANSE" }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "SHIELD", shieldRate: 0.18, durationTurns: 2 }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 3→4ターン
        { cooldownTurns: 3, effects: [{ kind: "CLEANSE" }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 4, applyTo: "SELF" }, { kind: "SHIELD", shieldRate: 0.18, durationTurns: 2 }] },
      ],
    },
    {
      id: "knight_s2_c",
      name: "れんげき",
      description: "ダメージ倍率 0.75倍 × 3回。各ヒットごとに: 25%で防御力-75% (2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 0.75, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.25 }] },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.75, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.25 }] }] },
        // Lv2 ダメージ倍率 0.75倍→0.80倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.25 }] }] },
        // Lv3 弱体の発動率 25%→35%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.35 }] }] },
        // Lv4 ダメージ倍率 0.80倍→0.90倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.35 }] }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 3, perHitEffects: [{ kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.35 }] }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "knight_s3_a",
      name: "しんげきのごうれい",
      description: "ダメージ倍率 2.00倍。味方全体の攻撃力+30% (2ターン)。味方全体の行動ゲージ+15%",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 2 },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" },
        { kind: "GAUGE", amount: 0.15, applyTo: "ALLIES" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.15, applyTo: "ALLIES" }] },
        // Lv2 ダメージ倍率 2.00倍→2.20倍 / 行動ゲージ 15%→20%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.2 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.2, applyTo: "ALLIES" }] },
        // Lv3 ダメージ倍率 2.20倍→2.40倍 / 行動ゲージ 20%→25%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.4 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.25, applyTo: "ALLIES" }] },
        // Lv4
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.4 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.25, applyTo: "ALLIES" }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.4 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.25, applyTo: "ALLIES" }] },
      ],
    },
    {
      id: "knight_s3_b",
      name: "じゅうじざん",
      description: "ダメージ倍率 1.50倍。60%でスタン (1ターン)。70%で攻撃力-50% (2ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5 },
        { kind: "STUN", durationTurns: 1, chance: 0.6 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "STUN", durationTurns: 1, chance: 0.6 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 }] },
        // Lv2 ダメージ倍率 1.50倍→1.65倍 / スタンの発動率 60%→65%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.65 }, { kind: "STUN", durationTurns: 1, chance: 0.65 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 }] },
        // Lv3 ダメージ倍率 1.65倍→1.70倍 / スタンの発動率 65%→70%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "STUN", durationTurns: 1, chance: 0.7 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 }] },
        // Lv4 ダメージ倍率 1.70倍→1.80倍 / スタンの発動率 70%→75% / 弱体の発動率 70%→85%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "STUN", durationTurns: 1, chance: 0.75 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.85 }] },
        // Lv5 クールタイム -1(5→4ターン)
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "STUN", durationTurns: 1, chance: 0.75 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.85 }] },
      ],
    },
    {
      id: "knight_s3_c",
      name: "きしのちかい",
      description: "シールド 最大HPの20% (3ターン、ダメージを肩代わり)。防御力+30% (2ターン)。クリ率+20% (2ターン)",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "SHIELD", shieldRate: 0.2, durationTurns: 3 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
        { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.2, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }] },
        // Lv2 シールド量 20%→23%
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.23, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }] },
        // Lv3 シールド量 23%→25%
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.25, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }] },
        // Lv4 シールド量 25%→30%
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.3, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }] },
        // Lv5 クールタイム -1(5→4ターン) / シールドの持続 3→4ターン / 強化の持続 2→3ターン
        { cooldownTurns: 4, effects: [{ kind: "SHIELD", shieldRate: 0.3, durationTurns: 4 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3 }] },
      ],
    },
  ],
  lightSkill3: {
    id: "knight_s3_light",
    name: "セイクリッドオーダー",
    description: "攻撃力+30% (3ターン)。防御力+30% (3ターン)。シールド 最大HPの20% (3ターン、ダメージを肩代わり)。行動ゲージ+15%。敵全体に85%で暗闇 (2ターン、攻撃時50%でダメージ-75%・追加効果なし)",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 },
      { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 },
      { kind: "SHIELD", shieldRate: 0.2, durationTurns: 3 },
      { kind: "GAUGE", amount: 0.15 },
      { kind: "BLIND", durationTurns: 2, chance: 0.85, applyTo: "ENEMIES" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "SHIELD", shieldRate: 0.2, durationTurns: 3 }, { kind: "GAUGE", amount: 0.15 }, { kind: "BLIND", durationTurns: 2, chance: 0.85, applyTo: "ENEMIES" }] },
      // Lv2 シールド量 20%→23%
      { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "SHIELD", shieldRate: 0.23, durationTurns: 3 }, { kind: "GAUGE", amount: 0.15 }, { kind: "BLIND", durationTurns: 2, chance: 0.85, applyTo: "ENEMIES" }] },
      // Lv3 シールド量 23%→25%
      { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "SHIELD", shieldRate: 0.25, durationTurns: 3 }, { kind: "GAUGE", amount: 0.15 }, { kind: "BLIND", durationTurns: 2, chance: 0.85, applyTo: "ENEMIES" }] },
      // Lv4 行動ゲージ 15%→20%
      { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "SHIELD", shieldRate: 0.25, durationTurns: 3 }, { kind: "GAUGE", amount: 0.2 }, { kind: "BLIND", durationTurns: 2, chance: 0.85, applyTo: "ENEMIES" }] },
      // Lv5 クールタイム -1(5→4ターン) / 強化の持続 3→4ターン / シールドの持続 3→4ターン
      { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 4 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 4 }, { kind: "SHIELD", shieldRate: 0.25, durationTurns: 4 }, { kind: "GAUGE", amount: 0.2 }, { kind: "BLIND", durationTurns: 2, chance: 0.85, applyTo: "ENEMIES" }] },
    ],
  },
  darkSkill3: {
    id: "knight_s3_dark",
    name: "ブラッドエッジ",
    description: "ダメージ倍率 2.10倍。70%でスタン (1ターン)。与えたダメージの35%を自身が回復",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 2.1 },
      { kind: "STUN", durationTurns: 1, chance: 0.7 },
      { kind: "LIFESTEAL", healRate: 0.35 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.1 }, { kind: "STUN", durationTurns: 1, chance: 0.7 }, { kind: "LIFESTEAL", healRate: 0.35 }] },
      // Lv2 ダメージ倍率 2.10倍→2.30倍
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.3 }, { kind: "STUN", durationTurns: 1, chance: 0.7 }, { kind: "LIFESTEAL", healRate: 0.35 }] },
      // Lv3 スタンの発動率 70%→80%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.3 }, { kind: "STUN", durationTurns: 1, chance: 0.8 }, { kind: "LIFESTEAL", healRate: 0.35 }] },
      // Lv4 ダメージ倍率 2.30倍→2.50倍 / 回復量 35%→50%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.5 }, { kind: "STUN", durationTurns: 1, chance: 0.8 }, { kind: "LIFESTEAL", healRate: 0.5 }] },
      // Lv5 クールタイム -1(5→4ターン)
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.5 }, { kind: "STUN", durationTurns: 1, chance: 0.8 }, { kind: "LIFESTEAL", healRate: 0.5 }] },
    ],
  },
};

export const MONSTER_TEMPLATES: MonsterTemplate[] = [SLIME, WOLF, GOLEM, FAIRY, IMP, WISP, TREANT, KNIGHT];

/**
 * ガチャ専用の高レア新規モンスター(星4=SR / 星5=SSR)。GRIFFON/DRAGON・SERAPH/NEMESISとも
 * 全6属性で登場する。MONSTER_TEMPLATESには含めず、ステージの敵構成には影響させない。
 */
const GRIFFON: MonsterTemplate = {
  templateId: "griffon",
  baseName: "グリフォン",
  emoji: "🦅",
  role: "アタッカー",
  baseStats: {
    hp: 1300,
    atk: 190,
    def: 85,
    spd: 115,
    criRate: 0.2,
    criDmg: 1.63,
    resistance: 0.1,
    accuracy: 0.12,
  },
  skill1: {
    id: "griffon_s1",
    name: "ついばみ",
    description: "ダメージ倍率 1.20倍。20%でスタン (1ターン)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.2 },
      { kind: "STUN", durationTurns: 1, chance: 0.2 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "STUN", durationTurns: 1, chance: 0.2 }] },
      // Lv2 ダメージ倍率 1.20倍→1.30倍 / スタンの発動率 20%→30%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "STUN", durationTurns: 1, chance: 0.3 }] },
      // Lv3 ダメージ倍率 1.30倍→1.40倍 / スタンの発動率 30%→40%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "STUN", durationTurns: 1, chance: 0.4 }] },
      // Lv4
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "STUN", durationTurns: 1, chance: 0.4 }] },
      // Lv5
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "STUN", durationTurns: 1, chance: 0.4 }] },
    ],
  },
  skill2Variants: [
    {
      id: "griffon_s2_a",
      name: "きりさく突風",
      description: "ダメージ倍率 1.30倍。30%でスタン (1ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "STUN", durationTurns: 1, chance: 0.3 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "STUN", durationTurns: 1, chance: 0.3 }] },
        // Lv2 ダメージ倍率 1.30倍→1.40倍 / スタンの発動率 30%→40%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "STUN", durationTurns: 1, chance: 0.4 }] },
        // Lv3 ダメージ倍率 1.40倍→1.50倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "STUN", durationTurns: 1, chance: 0.4 }] },
        // Lv4
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "STUN", durationTurns: 1, chance: 0.4 }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "STUN", durationTurns: 1, chance: 0.4 }] },
      ],
    },
    {
      id: "griffon_s2_b",
      name: "はやてづき",
      description: "ダメージ倍率 0.95倍 × 2回(自身の速度が高いほど上昇)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 0.95, hits: 2, scaleBonus: { stat: "spd", bonusAtReference: 0.45 } },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.95, hits: 2, scaleBonus: { stat: "spd", bonusAtReference: 0.45 } }] },
        // Lv2 ダメージ倍率 0.95倍→1.05倍 / 速度比例 45%→55%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.05, hits: 2, scaleBonus: { stat: "spd", bonusAtReference: 0.55 } }] },
        // Lv3 ダメージ倍率 1.05倍→1.10倍 / 速度比例 55%→65%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.1, hits: 2, scaleBonus: { stat: "spd", bonusAtReference: 0.65 } }] },
        // Lv4 ダメージ倍率 1.10倍→1.15倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.15, hits: 2, scaleBonus: { stat: "spd", bonusAtReference: 0.65 } }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.15, hits: 2, scaleBonus: { stat: "spd", bonusAtReference: 0.65 } }] },
      ],
    },
    {
      id: "griffon_s2_c",
      name: "ダイブアタック",
      description: "ダメージ倍率 1.80倍。80%で速度-30% (2ターン)。行動ゲージ-20%",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8 },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.8 }, { kind: "GAUGE", amount: -0.2 }] },
        // Lv2 ダメージ倍率 1.80倍→2.00倍 / 弱体の発動率 80%→90%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.2 }] },
        // Lv3 ダメージ倍率 2.00倍→2.20倍 / 行動ゲージ -20%→-30%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.2 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.3 }] },
        // Lv4
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.2 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.3 }] },
        // Lv5 クールタイム -1(3→2ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 2.2 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3, chance: 0.9 }, { kind: "GAUGE", amount: -0.3 }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "griffon_s3_a",
      name: "嵐の一撃",
      description: "ダメージ倍率 3.20倍(自身の速度が高いほど上昇)。70%でスタン (1ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 3.2, scaleBonus: { stat: "spd", bonusAtReference: 0.6 } },
        { kind: "STUN", durationTurns: 1, chance: 0.7 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.2, scaleBonus: { stat: "spd", bonusAtReference: 0.6 } }, { kind: "STUN", durationTurns: 1, chance: 0.7 }] },
        // Lv2 ダメージ倍率 3.20倍→3.40倍 / 速度比例 60%→75% / スタンの発動率 70%→80%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.4, scaleBonus: { stat: "spd", bonusAtReference: 0.75 } }, { kind: "STUN", durationTurns: 1, chance: 0.8 }] },
        // Lv3 ダメージ倍率 3.40倍→3.70倍 / 速度比例 75%→90%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.7, scaleBonus: { stat: "spd", bonusAtReference: 0.9 } }, { kind: "STUN", durationTurns: 1, chance: 0.8 }] },
        // Lv4
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.7, scaleBonus: { stat: "spd", bonusAtReference: 0.9 } }, { kind: "STUN", durationTurns: 1, chance: 0.8 }] },
        // Lv5 クールタイム -1(5→4ターン)
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 3.7, scaleBonus: { stat: "spd", bonusAtReference: 0.9 } }, { kind: "STUN", durationTurns: 1, chance: 0.8 }] },
      ],
    },
    {
      id: "griffon_s3_b",
      name: "せんぷうげき",
      description: "ダメージ倍率 2.40倍(自身の速度が高いほど上昇)。自身の行動ゲージ+30%",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.4, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } },
        { kind: "GAUGE", amount: 0.3, applyTo: "SELF" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.4, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } }, { kind: "GAUGE", amount: 0.3, applyTo: "SELF" }] },
        // Lv2 ダメージ倍率 2.40倍→2.55倍 / 行動ゲージ 30%→40%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.55, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF" }] },
        // Lv3 ダメージ倍率 2.55倍→2.70倍 / 速度比例 40%→55%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.7, scaleBonus: { stat: "spd", bonusAtReference: 0.55 } }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF" }] },
        // Lv4
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.7, scaleBonus: { stat: "spd", bonusAtReference: 0.55 } }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF" }] },
        // Lv5 クールタイム -1(5→4ターン)
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.7, scaleBonus: { stat: "spd", bonusAtReference: 0.55 } }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF" }] },
      ],
    },
    {
      id: "griffon_s3_c",
      name: "猛禽の加護",
      description: "攻撃力+30% (3ターン)。クリダメ+30% (3ターン)。行動ゲージ+20%",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 },
        { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 },
        { kind: "GAUGE", amount: 0.2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.2 }] },
        // Lv2 行動ゲージ 20%→25%
        { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.25 }] },
        // Lv3 行動ゲージ 25%→30%
        { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.3 }] },
        // Lv4 行動ゲージ 30%→35%
        { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.35 }] },
        // Lv5 クールタイム -1(5→4ターン) / 強化の持続 3→4ターン
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 4 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 4 }, { kind: "GAUGE", amount: 0.35 }] },
      ],
    },
  ],
  lightSkill3: {
    id: "griffon_s3_light",
    name: "テンペストジャッジ",
    description: "ダメージ倍率 2.50倍(自身の速度が高いほど上昇)。60%でスタン (1ターン)。味方全体の攻撃力+30% (3ターン)",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 2.5, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } },
      { kind: "STUN", durationTurns: 1, chance: 0.6 },
      { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.5, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } }, { kind: "STUN", durationTurns: 1, chance: 0.6 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" }] },
      // Lv2 ダメージ倍率 2.50倍→2.65倍 / スタンの発動率 60%→70%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.65, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } }, { kind: "STUN", durationTurns: 1, chance: 0.7 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" }] },
      // Lv3 ダメージ倍率 2.65倍→2.80倍 / 速度比例 40%→55%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.8, scaleBonus: { stat: "spd", bonusAtReference: 0.55 } }, { kind: "STUN", durationTurns: 1, chance: 0.7 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" }] },
      // Lv4 ダメージ倍率 2.80倍→2.85倍
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.85, scaleBonus: { stat: "spd", bonusAtReference: 0.55 } }, { kind: "STUN", durationTurns: 1, chance: 0.7 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" }] },
      // Lv5 クールタイム -1(5→4ターン) / 強化の持続 3→4ターン
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.85, scaleBonus: { stat: "spd", bonusAtReference: 0.55 } }, { kind: "STUN", durationTurns: 1, chance: 0.7 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 4, applyTo: "ALLIES" }] },
    ],
  },
  darkSkill3: {
    id: "griffon_s3_dark",
    name: "シャドウタロン",
    description: "ダメージ倍率 1.90倍 × 3回(自身の速度が高いほど上昇)。70%で防御力-75% (2ターン)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 1.9, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.5 } },
      { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.9, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.5 } }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7 }] },
      // Lv2 ダメージ倍率 1.90倍→2.05倍 / 弱体の発動率 70%→85%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.05, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.5 } }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 }] },
      // Lv3 ダメージ倍率 2.05倍→2.15倍 / 速度比例 50%→60%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.15, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.6 } }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 }] },
      // Lv4 ダメージ倍率 2.15倍→2.25倍
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.25, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.6 } }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 }] },
      // Lv5 クールタイム -1(5→4ターン) / 弱体の持続 2→3ターン
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.25, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.6 } }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.85 }] },
    ],
  },
};

/**
 * ドラゴンの光/闇スキル3。skill3Variants の並びと lightSkill3/darkSkill3 の両方から参照するため、
 * 定義を1か所にまとめてある(詳細は skill3Variants 末尾のコメント)。
 */
const DRAGON_LIGHT_SKILL3: Skill = {
  id: "dragon_s3_shining",
  name: "シャイニングブレス",
  // 比較相手の「破滅の咆哮」は2.0倍にHP補正(0.0003)が乗るので、育てるほど差が開く。
  // 固定倍率をいくら上げても追いつけないため、こちらにも一段厚いHP補正を持たせる
  description: "ダメージ倍率 2.60倍(最大HPの10%を加算)。75%で暗闇 (2ターン、攻撃時50%でダメージ-75%・追加効果なし)。60%で攻撃力-50% (2ターン)",
  target: "ALL_ENEMIES",
  cooldownTurns: 5,
  effects: [
    { kind: "DAMAGE", multiplier: 2.6, hpCoefficient: 0.1 },
    { kind: "BLIND", durationTurns: 2, chance: 0.75 },
    { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.6 },
  ],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.6, hpCoefficient: 0.1 }, { kind: "BLIND", durationTurns: 2, chance: 0.75 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.6 }] },
    // Lv2 ダメージ倍率 2.60倍→2.80倍 / 暗闇の発動率 75%→80% / 弱体の発動率 60%→65%
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.8, hpCoefficient: 0.1 }, { kind: "BLIND", durationTurns: 2, chance: 0.8 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.65 }] },
    // Lv3 ダメージ倍率 2.80倍→2.95倍 / 最大HP比例 10%→11% / 暗闇の発動率 80%→85% / 弱体の発動率 65%→70%
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.95, hpCoefficient: 0.11 }, { kind: "BLIND", durationTurns: 2, chance: 0.85 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 }] },
    // Lv4 ダメージ倍率 2.95倍→3.10倍 / 暗闇の発動率 85%→90% / 弱体の発動率 70%→75%
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.1, hpCoefficient: 0.11 }, { kind: "BLIND", durationTurns: 2, chance: 0.9 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.75 }] },
    // Lv5 クールタイム -1(5→4ターン) / 最大HP比例 11%→12% / 弱体の持続 2→3ターン
    { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 3.1, hpCoefficient: 0.12 }, { kind: "BLIND", durationTurns: 2, chance: 0.9 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 3, chance: 0.75 }] },
  ],
};

const DRAGON_DARK_SKILL3: Skill = {
  id: "dragon_s3_meteor",
  name: "破壊の流星",
  description: "闇の流星を降らせ、敵全体の防御力を無視して攻撃力1.2倍のダメージを与え、与えたダメージの25%を回復する。",
  target: "ALL_ENEMIES",
  cooldownTurns: 5,
  effects: [
    { kind: "DAMAGE", multiplier: 1.2, ignoreDefense: true },
    { kind: "LIFESTEAL", healRate: 0.25 },
  ],
};

const DRAGON: MonsterTemplate = {
  templateId: "dragon",
  baseName: "ドラゴン",
  emoji: "🐉",
  role: "アタッカー",
  baseStats: {
    hp: 1450,
    atk: 230,
    def: 100,
    spd: 120,
    criRate: 0.19,
    criDmg: 1.6,
    resistance: 0.1,
    accuracy: 0.12,
  },
  skill1: {
    id: "dragon_s1",
    name: "つのぶつけ",
    description: "ダメージ倍率 1.30倍。35%で防御力-75% (2ターン)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.3 },
      { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.35 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.35 }] },
      // Lv2 ダメージ倍率 1.30倍→1.40倍 / 弱体の発動率 35%→45%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.45 }] },
      // Lv3 ダメージ倍率 1.40倍→1.50倍 / 弱体の発動率 45%→55%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.55 }] },
      // Lv4
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.55 }] },
      // Lv5 弱体の持続 2→3ターン
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.55 }] },
    ],
  },
  // 6件に揃えることで、属性の並び(火・草・電気・水・光・闇)と1対1で対応する
  skill2Variants: [
    {
      id: "dragon_s2_flame",
      name: "フレイムブレス",
      /*
       * **ネメシスの「冥府の炎」の下位互換だった。**
       * あちらは同じ全体1発で 1.7倍・火傷100%、こちらは 1.5倍・火傷65%。
       * 形が同じで数字だけ小さいと、ドラゴンを選ぶ理由がどこにも無い。
       *
       * 多段(0.7倍×3)へ変える。合計倍率は近いが、**当たり判定が3回ある**ので
       * クリティカル・反撃回数・ヒット数で数える仕掛けへの噛み合い方が変わる。
       * 数字の大小ではなく、別のスキルになる。
       */
      description: "ダメージ倍率 0.70倍 × 3回。50%で火傷 (1ターン、自身のターン終了時に自身の攻撃力分のダメージ)",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 0.7, hits: 3 },
        { kind: "BURN", durationTurns: 1, chance: 0.5 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.7, hits: 3 }, { kind: "BURN", durationTurns: 1, chance: 0.5 }] },
        // Lv2 ダメージ倍率 0.70倍→0.75倍 / 火傷の発動率 50%→65%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.75, hits: 3 }, { kind: "BURN", durationTurns: 1, chance: 0.65 }] },
        // Lv3 ダメージ倍率 0.75倍→0.80倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 3 }, { kind: "BURN", durationTurns: 1, chance: 0.65 }] },
        // Lv4 ダメージ倍率 0.80倍→0.85倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.85, hits: 3 }, { kind: "BURN", durationTurns: 1, chance: 0.65 }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 0.85, hits: 3 }, { kind: "BURN", durationTurns: 1, chance: 0.65 }] },
      ],
    },
    {
      id: "dragon_s2_claw",
      name: "ドラゴンクロー",
      description: "ダメージ倍率 2.50倍。65%で防御力-75% (2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 2.5 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.65 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.5 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.65 }] },
        // Lv2 ダメージ倍率 2.50倍→2.70倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.7 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.65 }] },
        // Lv3 弱体の発動率 65%→80%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.7 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }] },
        // Lv4 ダメージ倍率 2.70倍→3.00倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }] },
        // Lv5 クールタイム -1(3→2ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.8 }] },
      ],
    },
    {
      id: "dragon_s2_spirit",
      name: "りゅうの闘気",
      description: "クリダメ+30% (2ターン)。速度+20% (2ターン)。行動ゲージ+15%。敵全体に70%で防御力-75% (2ターン)",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 },
        { kind: "GAUGE", amount: 0.15 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7, applyTo: "ENEMIES" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.15 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7, applyTo: "ENEMIES" }] },
        // Lv2 行動ゲージ 15%→20% / 弱体の発動率 70%→80%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8, applyTo: "ENEMIES" }] },
        // Lv3 行動ゲージ 20%→25% / 弱体の発動率 80%→90%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.25 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9, applyTo: "ENEMIES" }] },
        // Lv4 行動ゲージ 25%→30%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9, applyTo: "ENEMIES" }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9, applyTo: "ENEMIES" }] },
      ],
    },
    {
      id: "dragon_s2_w_claw",
      name: "ドラゴンクロー",
      description: "ダメージ倍率 2.50倍。65%で防御力-75% (2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 2.5 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.65 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.5 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.65 }] },
        // Lv2 ダメージ倍率 2.50倍→2.70倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.7 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.65 }] },
        // Lv3 弱体の発動率 65%→80%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.7 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }] },
        // Lv4 ダメージ倍率 2.70倍→3.00倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }] },
        // Lv5 クールタイム -1(3→2ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.8 }] },
      ],
    },
    {
      id: "dragon_s2_l_spirit",
      name: "りゅうの闘気",
      description: "クリダメ+30% (2ターン)。速度+20% (2ターン)。行動ゲージ+15%。敵全体に70%で防御力-75% (2ターン)",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 },
        { kind: "GAUGE", amount: 0.15 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7, applyTo: "ENEMIES" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.15 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7, applyTo: "ENEMIES" }] },
        // Lv2 行動ゲージ 15%→20% / 弱体の発動率 70%→80%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8, applyTo: "ENEMIES" }] },
        // Lv3 行動ゲージ 20%→25% / 弱体の発動率 80%→90%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.25 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9, applyTo: "ENEMIES" }] },
        // Lv4 行動ゲージ 25%→30%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9, applyTo: "ENEMIES" }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9, applyTo: "ENEMIES" }] },
      ],
    },
    {
      id: "dragon_s2_d_flame",
      name: "フレイムブレス",
      // 火のドラゴンと同じ。片方だけ直すと、同じ名前で中身が違うことになる
      description: "ダメージ倍率 0.70倍 × 3回。50%で火傷 (1ターン、自身のターン終了時に自身の攻撃力分のダメージ)",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 0.7, hits: 3 },
        { kind: "BURN", durationTurns: 1, chance: 0.5 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.7, hits: 3 }, { kind: "BURN", durationTurns: 1, chance: 0.5 }] },
        // Lv2 ダメージ倍率 0.70倍→0.75倍 / 火傷の発動率 50%→65%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.75, hits: 3 }, { kind: "BURN", durationTurns: 1, chance: 0.65 }] },
        // Lv3 ダメージ倍率 0.75倍→0.80倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 3 }, { kind: "BURN", durationTurns: 1, chance: 0.65 }] },
        // Lv4 ダメージ倍率 0.80倍→0.85倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.85, hits: 3 }, { kind: "BURN", durationTurns: 1, chance: 0.65 }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 0.85, hits: 3 }, { kind: "BURN", durationTurns: 1, chance: 0.65 }] },
      ],
    },
  ],
  // 属性の並び(火・草・電気・水・光・闇)と1対1で対応する。
  // 光は シャイニングブレス、闇は 破壊の流星 という専用スキルになる
  skill3Variants: [
    {
      id: "dragon_s3_roar",
      name: "破滅の咆哮",
      description: "ダメージ倍率 2.00倍(最大HPの14%を加算)",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2, hpCoefficient: 0.14 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2, hpCoefficient: 0.14 }] },
        // Lv2 ダメージ倍率 2.00倍→2.15倍 / 最大HP比例 14%→16%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.15, hpCoefficient: 0.16 }] },
        // Lv3 ダメージ倍率 2.15倍→2.25倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.25, hpCoefficient: 0.16 }] },
        // Lv4 ダメージ倍率 2.25倍→2.40倍 / 最大HP比例 16%→18%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.4, hpCoefficient: 0.18 }] },
        // Lv5 クールタイム -1(5→4ターン)
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.4, hpCoefficient: 0.18 }] },
      ],
    },
    {
      id: "dragon_s3_scale",
      name: "竜神の逆鱗",
      description: "ダメージ倍率 4.00倍。味方全体の攻撃力+30% (2ターン)。自身の行動ゲージ+30%",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 4 },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" },
        { kind: "GAUGE", amount: 0.3, applyTo: "SELF" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.3, applyTo: "SELF" }] },
        // Lv2 ダメージ倍率 4.00倍→4.30倍 / 行動ゲージ 30%→40%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.3 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF" }] },
        // Lv3 ダメージ倍率 4.30倍→4.60倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.6 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF" }] },
        // Lv4
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.6 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF" }] },
        // Lv5 クールタイム -1(5→4ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 4.6 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF" }] },
      ],
    },
    {
      id: "dragon_s3_roar_e",
      name: "破滅の咆哮",
      description: "ダメージ倍率 2.00倍(最大HPの14%を加算)",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2, hpCoefficient: 0.14 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2, hpCoefficient: 0.14 }] },
        // Lv2 ダメージ倍率 2.00倍→2.15倍 / 最大HP比例 14%→16%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.15, hpCoefficient: 0.16 }] },
        // Lv3 ダメージ倍率 2.15倍→2.25倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.25, hpCoefficient: 0.16 }] },
        // Lv4 ダメージ倍率 2.25倍→2.40倍 / 最大HP比例 16%→18%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.4, hpCoefficient: 0.18 }] },
        // Lv5 クールタイム -1(5→4ターン)
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.4, hpCoefficient: 0.18 }] },
      ],
    },
    {
      id: "dragon_s3_blessing",
      name: "古龍の加護",
      description: "攻撃力+30% (3ターン)。防御力+30% (3ターン)。回復 最大HPの20.0%。行動ゲージ+15%",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 },
        { kind: "HEAL", healRate: 0.2 },
        { kind: "GAUGE", amount: 0.15 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "HEAL", healRate: 0.2 }, { kind: "GAUGE", amount: 0.15 }] },
        // Lv2 回復量 20%→25% / 行動ゲージ 15%→20%
        { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "HEAL", healRate: 0.25 }, { kind: "GAUGE", amount: 0.2 }] },
        // Lv3 回復量 25%→30% / 行動ゲージ 20%→25%
        { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "HEAL", healRate: 0.3 }, { kind: "GAUGE", amount: 0.25 }] },
        // Lv4
        { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }, { kind: "HEAL", healRate: 0.3 }, { kind: "GAUGE", amount: 0.25 }] },
        // Lv5 クールタイム -1(5→4ターン) / 強化の持続 3→4ターン
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 4 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 4 }, { kind: "HEAL", healRate: 0.3 }, { kind: "GAUGE", amount: 0.25 }] },
      ],
    },
    // 光/闇はこのあとの lightSkill3 / darkSkill3 が優先されるので、この2件が選ばれることはない。
    // それでも残しているのは、pickSkillVariant が**配列の長さで添字を決める**ため。
    // 6件から減らすと火・草・電気・水のスキル3まで別物に変わってしまう
    DRAGON_LIGHT_SKILL3,
    DRAGON_DARK_SKILL3,
  ],
  lightSkill3: DRAGON_LIGHT_SKILL3,
  darkSkill3: DRAGON_DARK_SKILL3,
};

const SERAPH: MonsterTemplate = {
  templateId: "seraph",
  baseName: "セラフ",
  emoji: "😇",
  role: "バランス型",
  baseStats: {
    hp: 1380,
    atk: 175,
    def: 105,
    spd: 113,
    criRate: 0.15,
    criDmg: 1.5,
    resistance: 0.25,
    accuracy: 0.18,
  },
  skill1: {
    id: "seraph_s1",
    name: "光の一閃",
    description: "ダメージ倍率 1.30倍。与えたダメージの15%を自身が回復",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.3 },
      { kind: "LIFESTEAL", healRate: 0.15 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "LIFESTEAL", healRate: 0.15 }] },
      // Lv2 ダメージ倍率 1.30倍→1.40倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "LIFESTEAL", healRate: 0.15 }] },
      // Lv3 ダメージ倍率 1.40倍→1.50倍 / 回復量 15%→20%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "LIFESTEAL", healRate: 0.2 }] },
      // Lv4 ダメージ倍率 1.50倍→1.60倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.6 }, { kind: "LIFESTEAL", healRate: 0.2 }] },
      // Lv5 ダメージ倍率 1.60倍→1.70倍 / 回復量 20%→25%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "LIFESTEAL", healRate: 0.25 }] },
    ],
  },
  skill2Variants: [
    {
      id: "seraph_s2_a",
      name: "さばきの光",
      description: "ダメージ倍率 1.40倍。70%で暗闇 (1ターン、攻撃時50%でダメージ-75%・追加効果なし)",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.4 },
        { kind: "BLIND", durationTurns: 1, chance: 0.7 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "BLIND", durationTurns: 1, chance: 0.7 }] },
        // Lv2 ダメージ倍率 1.40倍→1.50倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "BLIND", durationTurns: 1, chance: 0.7 }] },
        // Lv3 ダメージ倍率 1.50倍→1.60倍 / 暗闇の発動率 70%→80%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.6 }, { kind: "BLIND", durationTurns: 1, chance: 0.8 }] },
        // Lv4 ダメージ倍率 1.60倍→1.70倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "BLIND", durationTurns: 1, chance: 0.8 }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "BLIND", durationTurns: 1, chance: 0.8 }] },
      ],
    },
    {
      id: "seraph_s2_b",
      name: "いやしの詠唱",
      description: "回復 自身の攻撃力の300%。攻撃力+30% (2ターン)。行動ゲージ+20%",
      target: "SINGLE_ALLY",
      cooldownTurns: 3,
      effects: [
        { kind: "HEAL", scaleStat: "atk", healRate: 3 },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 },
        { kind: "GAUGE", amount: 0.2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 3 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.2 }] },
        // Lv2 回復量 300%→330%
        { cooldownTurns: 3, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 3.3 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.2 }] },
        // Lv3 回復量 330%→360% / 行動ゲージ 20%→25%
        { cooldownTurns: 3, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 3.6 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.25 }] },
        // Lv4 回復量 360%→400% / 行動ゲージ 25%→30%
        { cooldownTurns: 3, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 4 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.3 }] },
        // Lv5 クールタイム -1(3→2ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 2, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 4 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.3 }] },
      ],
    },
    {
      id: "seraph_s2_c",
      name: "封印の光",
      description: "ダメージ倍率 2.00倍。80%で敵の全スキルのクールタイムを1ターン延長。行動ゲージ-20%。80%で強化不可 (2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 2 },
        { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.8 },
        { kind: "GAUGE", amount: -0.2 },
        { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.8, durationTurns: 2, fixedDuration: true },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.8 }, { kind: "GAUGE", amount: -0.2 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.8, durationTurns: 2, fixedDuration: true }] },
        // Lv2 ダメージ倍率 2.00倍→2.20倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.2 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.8 }, { kind: "GAUGE", amount: -0.2 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.8, durationTurns: 2, fixedDuration: true }] },
        // Lv3 ダメージ倍率 2.20倍→2.40倍 / CT延長の発動率 80%→90% / 行動ゲージ -20%→-25% / 発動率 80%→90%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.4 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.9 }, { kind: "GAUGE", amount: -0.25 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.9, durationTurns: 2, fixedDuration: true }] },
        // Lv4 ダメージ倍率 2.40倍→2.60倍 / 行動ゲージ -25%→-30%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.6 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.9 }, { kind: "GAUGE", amount: -0.3 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.9, durationTurns: 2, fixedDuration: true }] },
        // Lv5 クールタイム -1(4→3ターン)
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.6 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.9 }, { kind: "GAUGE", amount: -0.3 }, { kind: "STATUS", status: "BUFF_BLOCK", chance: 0.9, durationTurns: 2, fixedDuration: true }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "seraph_s3_a",
      name: "裁きの雷光",
      description: "ダメージ倍率 1.80倍。80%で防御力-75% (2ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }] },
        // Lv2 ダメージ倍率 1.80倍→2.00倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }] },
        // Lv3 ダメージ倍率 2.00倍→2.20倍 / 弱体の発動率 80%→90%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9 }] },
        // Lv4 ダメージ倍率 2.20倍→2.40倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.4 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9 }] },
        // Lv5 クールタイム -1(5→4ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.4 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.9 }] },
      ],
    },
    {
      id: "seraph_s3_b",
      name: "聖なる守護陣",
      description: "回復 自身の攻撃力の180%。状態異常無効 (2ターン)。防御力+30% (2ターン)",
      target: "ALL_ALLIES",
      cooldownTurns: 6,
      effects: [
        { kind: "HEAL", scaleStat: "atk", healRate: 1.8 },
        { kind: "IMMUNITY", durationTurns: 2 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 6, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 1.8 }, { kind: "IMMUNITY", durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv2 回復量 180%→200%
        { cooldownTurns: 6, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 2 }, { kind: "IMMUNITY", durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv3 回復量 200%→220%
        { cooldownTurns: 6, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 2.2 }, { kind: "IMMUNITY", durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv4 回復量 220%→240%
        { cooldownTurns: 6, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 2.4 }, { kind: "IMMUNITY", durationTurns: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv5 クールタイム -1(6→5ターン) / 免疫の持続 2→3ターン / 強化の持続 2→3ターン
        { cooldownTurns: 5, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 2.4 }, { kind: "IMMUNITY", durationTurns: 3 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }] },
      ],
    },
    {
      id: "seraph_s3_c",
      name: "セラフィムの祝福",
      description: "行動ゲージ+25%。攻撃力+30% (3ターン)。速度+20% (3ターン)",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "GAUGE", amount: 0.25 },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.25 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }] },
        // Lv2 行動ゲージ 25%→30%
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.3 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }] },
        // Lv3
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.3 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }] },
        // Lv4 行動ゲージ 30%→35%
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.35 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }] },
        // Lv5 クールタイム -1(5→4ターン) / 強化の持続 3→4ターン
        { cooldownTurns: 4, effects: [{ kind: "GAUGE", amount: 0.35 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 4 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 4 }] },
      ],
    },
  ],
  lightSkill3: {
    id: "seraph_s3_light",
    name: "エターナルヘイロー",
    description: "回復 自身の攻撃力の200%。デバフを解除。状態異常無効 (3ターン)。継続回復 最大HPの8.0% (4ターン、自身のターン開始時)",
    target: "ALL_ALLIES",
    cooldownTurns: 6,
    effects: [
      { kind: "HEAL", scaleStat: "atk", healRate: 2 },
      { kind: "CLEANSE" },
      { kind: "IMMUNITY", durationTurns: 3 },
      { kind: "REGEN", healRate: 0.08, durationTurns: 4 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 6, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 2 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 3 }, { kind: "REGEN", healRate: 0.08, durationTurns: 4 }] },
      // Lv2 回復量 200%→220% / 回復量 8%→9%
      { cooldownTurns: 6, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 2.2 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 3 }, { kind: "REGEN", healRate: 0.09, durationTurns: 4 }] },
      // Lv3 回復量 220%→240%
      { cooldownTurns: 6, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 2.4 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 3 }, { kind: "REGEN", healRate: 0.09, durationTurns: 4 }] },
      // Lv4 回復量 240%→260% / 回復量 9%→10%
      { cooldownTurns: 6, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 2.6 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 3 }, { kind: "REGEN", healRate: 0.1, durationTurns: 4 }] },
      // Lv5 クールタイム -1(6→5ターン) / 免疫の持続 3→4ターン / 継続回復の持続 4→5ターン
      { cooldownTurns: 5, effects: [{ kind: "HEAL", scaleStat: "atk", healRate: 2.6 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 4 }, { kind: "REGEN", healRate: 0.1, durationTurns: 5 }] },
    ],
  },
  darkSkill3: {
    id: "seraph_s3_dark",
    name: "フォールンウィング",
    description: "ダメージ倍率 2.30倍。85%で暗闇 (2ターン、攻撃時50%でダメージ-75%・追加効果なし)。与えたダメージの35%を自身が回復",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 2.3 },
      { kind: "BLIND", durationTurns: 2, chance: 0.85 },
      { kind: "LIFESTEAL", healRate: 0.35 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.3 }, { kind: "BLIND", durationTurns: 2, chance: 0.85 }, { kind: "LIFESTEAL", healRate: 0.35 }] },
      // Lv2 ダメージ倍率 2.30倍→2.40倍 / 暗闇の発動率 85%→90%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.4 }, { kind: "BLIND", durationTurns: 2, chance: 0.9 }, { kind: "LIFESTEAL", healRate: 0.35 }] },
      // Lv3 ダメージ倍率 2.40倍→2.50倍 / 暗闇の発動率 90%→95% / 回復量 35%→40%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.5 }, { kind: "BLIND", durationTurns: 2, chance: 0.95 }, { kind: "LIFESTEAL", healRate: 0.4 }] },
      // Lv4 ダメージ倍率 2.50倍→2.70倍 / 暗闇の持続 2→3ターン / 暗闇の発動率 95%→100% / 回復量 40%→45%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.7 }, { kind: "BLIND", durationTurns: 3, chance: 1 }, { kind: "LIFESTEAL", healRate: 0.45 }] },
      // Lv5 クールタイム -1(5→4ターン)
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.7 }, { kind: "BLIND", durationTurns: 3, chance: 1 }, { kind: "LIFESTEAL", healRate: 0.45 }] },
    ],
  },
};

const NEMESIS: MonsterTemplate = {
  templateId: "nemesis",
  baseName: "ネメシス",
  emoji: "👹",
  role: "アタッカー",
  baseStats: {
    hp: 1500,
    atk: 250,
    def: 110,
    spd: 125,
    criRate: 0.2,
    criDmg: 1.65,
    resistance: 0.15,
    accuracy: 0.15,
  },
  skill1: {
    id: "nemesis_s1",
    name: "ダークスラッシュ",
    description: "ダメージ倍率 1.50倍",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.5 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.5 }] },
      // Lv2 ダメージ倍率 1.50倍→1.60倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.6 }] },
      // Lv3 ダメージ倍率 1.60倍→1.70倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.7 }] },
      // Lv4 ダメージ倍率 1.70倍→1.80倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.8 }] },
      // Lv5 ダメージ倍率 1.80倍→2.00倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 2 }] },
    ],
  },
  skill2Variants: [
    {
      id: "nemesis_s2_a",
      name: "冥府の炎",
      description: "ダメージ倍率 1.80倍。100%で火傷 (1ターン、自身のターン終了時に自身の攻撃力分のダメージ)",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8 },
        { kind: "BURN", durationTurns: 1, chance: 1 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "BURN", durationTurns: 1, chance: 1 }] },
        // Lv2 ダメージ倍率 1.80倍→1.90倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.9 }, { kind: "BURN", durationTurns: 1, chance: 1 }] },
        // Lv3 ダメージ倍率 1.90倍→2.00倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2 }, { kind: "BURN", durationTurns: 1, chance: 1 }] },
        // Lv4 ダメージ倍率 2.00倍→2.20倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.2 }, { kind: "BURN", durationTurns: 1, chance: 1 }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 2.2 }, { kind: "BURN", durationTurns: 1, chance: 1 }] },
      ],
    },
    {
      id: "nemesis_s2_b",
      name: "デーモンクロー",
      description: "ダメージ倍率 3.00倍。80%で防御力-75% (2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 3 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }] },
        // Lv2 ダメージ倍率 3.00倍→3.20倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3.2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }] },
        // Lv3 ダメージ倍率 3.20倍→3.40倍 / 弱体の発動率 80%→90%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3.4 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9 }] },
        // Lv4 ダメージ倍率 3.40倍→3.60倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3.6 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9 }] },
        // Lv5 クールタイム -1(3→2ターン) / 弱体の持続 2→3ターン
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 3.6 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.9 }] },
      ],
    },
    {
      id: "nemesis_s2_c",
      name: "血のいけにえ",
      description: "ダメージ倍率 1.30倍 × 2回(防御力の90%を加算)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3, hits: 2, defCoefficient: 0.9 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.3, hits: 2, defCoefficient: 0.9 }] },
        // Lv2 ダメージ倍率 1.30倍→1.40倍 / 防御力比例 90%→100%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.4, hits: 2, defCoefficient: 1 }] },
        // Lv3 ダメージ倍率 1.40倍→1.50倍 / 防御力比例 100%→110%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.5, hits: 2, defCoefficient: 1.1 }] },
        // Lv4 ダメージ倍率 1.50倍→1.60倍 / 防御力比例 110%→120%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.6, hits: 2, defCoefficient: 1.2 }] },
        // Lv5 クールタイム -1(3→2ターン)
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.6, hits: 2, defCoefficient: 1.2 }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "nemesis_s3_a",
      name: "終焉の一撃",
      description: "ダメージ倍率 4.20倍(防御力の130%を加算)。75%でスタン (1ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 4.2, defCoefficient: 1.3 },
        { kind: "STUN", durationTurns: 1, chance: 0.75 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.2, defCoefficient: 1.3 }, { kind: "STUN", durationTurns: 1, chance: 0.75 }] },
        // Lv2 ダメージ倍率 4.20倍→4.50倍 / 防御力比例 130%→140% / スタンの発動率 75%→80%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.5, defCoefficient: 1.4 }, { kind: "STUN", durationTurns: 1, chance: 0.8 }] },
        // Lv3 ダメージ倍率 4.50倍→4.80倍 / 防御力比例 140%→150% / スタンの発動率 80%→85%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.8, defCoefficient: 1.5 }, { kind: "STUN", durationTurns: 1, chance: 0.85 }] },
        // Lv4 ダメージ倍率 4.80倍→5.20倍 / 防御力比例 150%→170% / スタンの発動率 85%→90%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 5.2, defCoefficient: 1.7 }, { kind: "STUN", durationTurns: 1, chance: 0.9 }] },
        // Lv5 クールタイム -1(5→4ターン)
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 5.2, defCoefficient: 1.7 }, { kind: "STUN", durationTurns: 1, chance: 0.9 }] },
      ],
    },
    {
      id: "nemesis_s3_b",
      name: "冥王の激震",
      description: "ダメージ倍率 1.30倍 × 2回。行動ゲージを15%吸収",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3, hits: 2 },
        { kind: "GAUGE", amount: 0.15, drain: true },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.3, hits: 2 }, { kind: "GAUGE", amount: 0.15, drain: true }] },
        // Lv2 ダメージ倍率 1.30倍→1.40倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.4, hits: 2 }, { kind: "GAUGE", amount: 0.15, drain: true }] },
        // Lv3 ダメージ倍率 1.40倍→1.50倍 / 行動ゲージ 15%→20%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.5, hits: 2 }, { kind: "GAUGE", amount: 0.2, drain: true }] },
        // Lv4 ダメージ倍率 1.50倍→1.60倍 / 行動ゲージ 20%→25%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.6, hits: 2 }, { kind: "GAUGE", amount: 0.25, drain: true }] },
        // Lv5 クールタイム -1(5→4ターン)
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.6, hits: 2 }, { kind: "GAUGE", amount: 0.25, drain: true }] },
      ],
    },
    {
      id: "nemesis_s3_c",
      name: "加速の号令",
      description: "行動ゲージ+30%。クリ率+20% (2ターン)。クリダメ+30% (2ターン)",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "GAUGE", amount: 0.3 },
        { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 },
        { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "GAUGE", amount: 0.3 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }] },
        // Lv2 行動ゲージ 30%→35%
        { cooldownTurns: 4, effects: [{ kind: "GAUGE", amount: 0.35 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }] },
        // Lv3 行動ゲージ 35%→40%
        { cooldownTurns: 4, effects: [{ kind: "GAUGE", amount: 0.4 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }] },
        // Lv4 行動ゲージ 40%→45%
        { cooldownTurns: 4, effects: [{ kind: "GAUGE", amount: 0.45 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "GAUGE", amount: 0.45 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 }] },
      ],
    },
  ],
  lightSkill3: {
    id: "nemesis_s3_light",
    name: "ラストジャッジメント",
    description: "ダメージ倍率 5.00倍(防御力の150%を加算)。75%でスタン (1ターン)。行動ゲージを40%吸収",
    target: "SINGLE_ENEMY",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 5, defCoefficient: 1.5 },
      { kind: "STUN", durationTurns: 1, chance: 0.75 },
      { kind: "GAUGE", amount: 0.4, drain: true },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 5, defCoefficient: 1.5 }, { kind: "STUN", durationTurns: 1, chance: 0.75 }, { kind: "GAUGE", amount: 0.4, drain: true }] },
      // Lv2 ダメージ倍率 5.00倍→5.30倍 / スタンの発動率 75%→80% / 行動ゲージ 40%→45%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 5.3, defCoefficient: 1.5 }, { kind: "STUN", durationTurns: 1, chance: 0.8 }, { kind: "GAUGE", amount: 0.45, drain: true }] },
      // Lv3 ダメージ倍率 5.30倍→5.60倍 / スタンの発動率 80%→85%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 5.6, defCoefficient: 1.5 }, { kind: "STUN", durationTurns: 1, chance: 0.85 }, { kind: "GAUGE", amount: 0.45, drain: true }] },
      // Lv4 ダメージ倍率 5.60倍→5.90倍 / スタンの発動率 85%→90% / 行動ゲージ 45%→50%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 5.9, defCoefficient: 1.5 }, { kind: "STUN", durationTurns: 1, chance: 0.9 }, { kind: "GAUGE", amount: 0.5, drain: true }] },
      // Lv5 クールタイム -1(5→4ターン)
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 5.9, defCoefficient: 1.5 }, { kind: "STUN", durationTurns: 1, chance: 0.9 }, { kind: "GAUGE", amount: 0.5, drain: true }] },
    ],
  },
  darkSkill3: {
    id: "nemesis_s3_dark",
    name: "エンドオブオール",
    description: "ダメージ倍率 1.80倍 × 2回。行動ゲージを20%吸収。70%で防御力-75% (2ターン)",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 1.8, hits: 2 },
      { kind: "GAUGE", amount: 0.2, drain: true },
      { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.8, hits: 2 }, { kind: "GAUGE", amount: 0.2, drain: true }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7 }] },
      // Lv2 ダメージ倍率 1.80倍→1.95倍 / 行動ゲージ 20%→25% / 弱体の発動率 70%→75%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.95, hits: 2 }, { kind: "GAUGE", amount: 0.25, drain: true }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.75 }] },
      // Lv3 ダメージ倍率 1.95倍→2.05倍 / 弱体の発動率 75%→80%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.05, hits: 2 }, { kind: "GAUGE", amount: 0.25, drain: true }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }] },
      // Lv4 ダメージ倍率 2.05倍→2.15倍 / 弱体の発動率 80%→85%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.15, hits: 2 }, { kind: "GAUGE", amount: 0.25, drain: true }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 }] },
      // Lv5 クールタイム -1(5→4ターン) / 弱体の持続 2→3ターン
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.15, hits: 2 }, { kind: "GAUGE", amount: 0.25, drain: true }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.85 }] },
    ],
  },
};

/**
 * 装備ダンジョン専用のオリジナルボス「古代の魔人」。ガチャには一切出現せず、召喚・図鑑にも含めない
 * 完全にダンジョン専用の存在(ステータスはGRIFFON/DRAGON/SERAPH/NEMESISの平均値を基準にしてある)。
 */
export const ANCIENT_DEMON: MonsterTemplate = {
  templateId: "ancient_demon",
  baseName: "古代の魔人",
  emoji: "😈",
  role: "ボス",
  /*
   * 硬くて痛いだけの置物にしない。
   *
   * サマナーズウォーの巨人ダンジョンを見ると、あの階が難しいのは数字ではなく
   * **特定の戦い方に代償があること**だった(7回殴られると反撃する、
   * 左の結晶がボスの攻撃力を上げ続け、右がこちらの防御力を下げ続ける)。
   *
   * こちらは長らく数字だけで難易度を作っていたので、そこに寄せてある。
   *
   * ただし**戦術そのものを潰さないこと**。毒で削るのも耐久で待つのも
   * ちゃんとした戦い方で、塞ぐべき抜け道ではない。
   * 一度ボスに毒・火傷への耐性を持たせたが、それはその戦術を選んだこと自体への罰であり、
   * 「スキルがモンスターにいろんな場所での役割を与える」という設計と衝突するため取りやめた。
   * 反撃は、どの戦い方であれ手数を掛けたぶん返ってくるもので、特定の型を狙い撃ちにしない。
   */
  bossTraits: {
    counterAfterHits: 7,
    counterMultiplier: 1.4,
  },
  baseStats: {
    hp: 1400,
    atk: 210,
    def: 100,
    spd: 118,
    criRate: 0.28,
    criDmg: 1.76,
    resistance: 0.22,
    accuracy: 0.2,
  },
  skill1: {
    id: "ancient_demon_s1",
    name: "闇の一撃",
    description: "敵単体に攻撃力1.15倍のダメージを与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 1.15 }],
  },
  skill2Variants: [
    {
      id: "ancient_demon_s2",
      name: "古代の呪詛",
      description: "封じられていた呪いを解き放ち、敵全体に攻撃力1.6倍のダメージを与え、45%で攻撃力を50%低下させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.6 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.45 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "ancient_demon_s3",
      name: "終焉の審判",
      description: "太古の力を解き放ち、敵全体に攻撃力2.0倍のダメージを与え、50%で攻撃力を50%低下させる。自身の防御力が高いほど威力が上がる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0, defCoefficient: 0.75 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.5 },
      ],
    },
  ],
};

/**
 * 装備ダンジョン専用のオリジナルお供「古代のクリスタル」。古代の魔人を支援するサポート役で、
 * 自ら攻めるよりも古代の魔人へのバフ・回復を優先する(ステータスは通常モンスター4種の平均値を
 * 基準にしつつ、支援役らしく攻撃力を抑えて防御力・効果抵抗率を高めにしてある)。
 */
export const ANCIENT_CRYSTAL: MonsterTemplate = {
  templateId: "ancient_crystal",
  baseName: "古代のクリスタル",
  emoji: "🔮",
  role: "サポート",
  baseStats: {
    hp: 1200,
    atk: 90,
    def: 95,
    spd: 95,
    criRate: 0.1,
    criDmg: 1.5,
    resistance: 0.25,
    accuracy: 0.15,
  },
  skill1: {
    id: "ancient_crystal_s1",
    name: "光弾",
    description: "敵単体に攻撃力0.9倍のダメージを与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.9 }],
  },
  skill2Variants: [
    {
      id: "ancient_crystal_s2",
      name: "古代の加護",
      description: "味方単体に古代の力を送り込み、4ターンのあいだ攻撃力を30%、クリティカル率を20pt、クリティカルダメージを30%上昇させる。",
      target: "SINGLE_ALLY",
      cooldownTurns: 2,
      /*
       * 以前は**攻撃UPが重ねがけで積み上がる**ことが肝の技だった。
       * 同じ強化を重ねない決まりに揃えたので、積み上げの代わりに
       * **3種類**を一度に配る形へ変えてある。長引くほど重くなる圧は、
       * 1回あたりの厚みに置き換わった。
       */
      effects: [
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 4 },
        { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 4 },
        { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 4 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "ancient_crystal_s3",
      name: "古代の結界",
      description: "自身の防御力に応じて味方全体のHPを回復し、3ターン防御力を上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "HEAL", scaleStat: "def", healRate: 1.2 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 },
      ],
    },
  ],
};

/**
 * 装備ダンジョン専用のオリジナルお供「古代の呪晶」。古代のクリスタルとは対照的に、
 * 支援よりもデバフ・全体攻撃で敵(プレイヤー側)を弱らせることを優先する攻撃寄りのお供
 * (ステータスは古代のクリスタルより攻撃力を高く、防御力・効果抵抗率を低めにしてある)。
 */
export const ANCIENT_CRYSTAL_CURSE: MonsterTemplate = {
  templateId: "ancient_crystal_curse",
  baseName: "古代の呪晶",
  emoji: "💀",
  role: "デバッファー",
  baseStats: {
    hp: 1150,
    atk: 130,
    def: 75,
    spd: 100,
    criRate: 0.12,
    criDmg: 1.5,
    resistance: 0.15,
    accuracy: 0.2,
  },
  skill1: {
    id: "ancient_crystal_curse_s1",
    name: "呪いの光弾",
    description: "敵単体に攻撃力0.9倍のダメージを与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.9 }],
  },
  skill2Variants: [
    {
      id: "ancient_crystal_curse_s2",
      name: "呪縛の波動",
      description: "敵全体に攻撃力0.9倍のダメージを与え、55%で攻撃力を50%低下させ、50%で強化効果を剥がす。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 0.9 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.55 },
        // 巨人ダンジョンの右の結晶にあたる役割。**張り続けたものを剥がし続ける**
        { kind: "STRIP", chance: 0.5 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "ancient_crystal_curse_s3",
      name: "破滅の呪詛",
      description: "敵全体に攻撃力1.8倍のダメージを与え、50%で防御力を75%低下させ、70%で3ターン回復封じを付与する。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.5 },
        // **回復で粘る戦い方への答え。**9・10階にしか現れないので、
        // ここに置けば序盤の階を巻き添えにしない
        { kind: "HEAL_BLOCK", durationTurns: 3, chance: 0.7 },
      ],
    },
  ],
};

/** 魔獣のダンジョン専用ボス。召喚・図鑑には出現しない。 */
export const ANCIENT_BEAST: MonsterTemplate = {
  templateId: "ancient_beast",
  baseName: "古代の魔獣",
  emoji: "🐲",
  role: "ボス",
  baseStats: { hp: 3500, atk: 455, def: 365, spd: 205, criRate: 0.2, criDmg: 1.5, resistance: 0.25, accuracy: 0.25 },
  bossTraits: { extraTurnChance: 0.15 },
  skill1: {
    id: "ancient_beast_s1", name: "裂地爪",
    description: "敵単体に攻撃力2.4倍のダメージを与え、60%で2ターン速度を低下させる。防御低下中の敵を優先する。",
    target: "SINGLE_ENEMY", targetPriority: "DEF_DOWN", cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 2.4 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.6 }],
  },
  skill2Variants: [{
    id: "ancient_beast_s2", name: "獣王連撃",
    description: "敵へランダムに攻撃力1.2倍のダメージを4回与え、各ヒット50%で行動ゲージを15%減少させる。同じ敵にも連続して命中する。",
    target: "SINGLE_ENEMY", cooldownTurns: 3, randomEnemyHits: true,
    effects: [{ kind: "DAMAGE", multiplier: 1.2, hits: 4 }, { kind: "GAUGE", amount: -0.15, chance: 0.5 }],
  }],
  skill3Variants: [{
    id: "ancient_beast_s3", name: "終焉の咆哮",
    description: "敵全体に攻撃力2.5倍のダメージを与え、80%で全強化を剥がして2ターン攻撃力を低下させる。",
    target: "ALL_ENEMIES", cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 2.5 },
      { kind: "STRIP", chance: 0.8, chanceGroup: "ancient_beast_roar" },
      { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.8, chanceGroup: "ancient_beast_roar" },
    ],
  }],
};

/** 魔獣のダンジョン専用の支援型お供。 */
export const ANCIENT_GUARD_BEAST: MonsterTemplate = {
  templateId: "ancient_guard_beast",
  baseName: "古代の護獣",
  emoji: "🦏",
  role: "支援",
  baseStats: { hp: 2000, atk: 155, def: 390, spd: 175, criRate: 0.1, criDmg: 1.5, resistance: 0.3, accuracy: 0.15 },
  bossTraits: { allyThresholdHeal: { hpRatio: 0.35, healPercent: 0.35 } },
  skill1: {
    id: "ancient_guard_beast_s1", name: "守護の角",
    description: "敵単体に攻撃力1.8倍のダメージを与え、味方全体の速度を1ターン上昇させる。",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 1, applyTo: "ALLIES", fixedDuration: true }],
  },
  skill2Variants: [{
    id: "ancient_guard_beast_s2", name: "加護の結界",
    description: "味方全体に各自の最大HP10%のシールドを2ターン張り、1ターン免疫を付与する。",
    target: "ALL_ALLIES", cooldownTurns: 3,
    effects: [{ kind: "SHIELD", shieldRate: 0.1, durationTurns: 2 }, { kind: "IMMUNITY", durationTurns: 1, fixedDuration: true }],
  }],
  skill3Variants: [{
    id: "ancient_guard_beast_s3", name: "生命の祝福",
    description: "味方が攻撃を受けてHP35%以下で生存した時、戦闘中一度だけその味方の最大HP35%を回復する。回復できない時は消費しない。",
    target: "SELF", cooldownTurns: 0, effects: [], automatic: true,
  }],
};

/** 魔獣のダンジョン専用の攻撃型お供。 */
export const ANCIENT_FANG_BEAST: MonsterTemplate = {
  templateId: "ancient_fang_beast",
  baseName: "古代の牙獣",
  emoji: "🐺",
  role: "攻撃",
  baseStats: { hp: 1200, atk: 325, def: 199, spd: 173, criRate: 0.2, criDmg: 1.6, resistance: 0.15, accuracy: 0.25 },
  bossTraits: { defenseIgnoreChance: 0.5, defenseIgnoreRatio: 0.5 },
  skill1: {
    id: "ancient_fang_beast_s1", name: "崩牙波",
    description: "敵全体に攻撃力0.7倍のダメージを与え、それぞれ60%で2ターン防御力を低下させる。",
    target: "ALL_ENEMIES", cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.7 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.6 }],
  },
  skill2Variants: [{
    id: "ancient_fang_beast_s2", name: "狩猟連鎖",
    description: "HP割合が最も低い敵に攻撃力1.2倍の2回攻撃。対象のHPが50%以下ならダメージ25%上昇し、倒すと追加ターンを得る。",
    target: "SINGLE_ENEMY", targetPriority: "LOWEST_HP", cooldownTurns: 3, extraTurnOnKill: true,
    effects: [{ kind: "DAMAGE", multiplier: 1.2, hits: 2, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.25 }] }],
  }],
  skill3Variants: [{
    id: "ancient_fang_beast_s3", name: "崩壊の牙",
    description: "攻撃時50%で、その行動中のすべての攻撃が敵の防御力を50%無視する。",
    target: "SELF", cooldownTurns: 0, effects: [], automatic: true,
  }],
};

/** ガチャの星4(SR)テンプレート: 火水電草側 / 光闇側 */
export const GACHA_SR_COMMON_TEMPLATE = GRIFFON;
export const GACHA_SR_RARE_TEMPLATE = SERAPH;
/** ガチャの星5(SSR)テンプレート: 火水電草側 / 光闇側 */
export const GACHA_SSR_COMMON_TEMPLATE = DRAGON;
export const GACHA_SSR_RARE_TEMPLATE = NEMESIS;

/**
 * このファイルが定義する全テンプレート。検査用。
 * 敵専用・素材専用も含めて、スキルの整合性チェックから漏れる原型を作らない。
 */
export const ALL_MONSTER_TEMPLATES: MonsterTemplate[] = [
  ...MONSTER_TEMPLATES,
  GRIFFON,
  DRAGON,
  SERAPH,
  NEMESIS,
  ANCIENT_DEMON,
  ANCIENT_CRYSTAL,
  ANCIENT_CRYSTAL_CURSE,
  ANCIENT_BEAST,
  ANCIENT_GUARD_BEAST,
  ANCIENT_FANG_BEAST,
  ...NEW_MONSTER_TEMPLATES,
  ...COLLAB_MONSTER_TEMPLATES,
  // 試練の塔100階のクリモアークと分身3種。**召喚にも図鑑にも出さない**
  CRIMOARK,
  CRIMOARK_ATTACK,
  CRIMOARK_SUPPORT,
  CRIMOARK_DEBUFF,
];

/*
 * 召喚の抽選プール。
 *
 * **`MONSTER_TEMPLATES` そのものは増やしていない。** あちらはステージの敵構成・
 * レベル上げダンジョンの階割り・装備ダンジョンのお供・ショップの品揃えの
 * 土台になっていて、要素を1つ足すだけで**既存コンテンツの中身が全部ずれる。**
 * 召喚に出したいだけなら、召喚のプールを別に持つ方が安全。
 */

/** 星3の抽選対象。既存8種 + 今回の3種 */
export const GACHA_STAR3_TEMPLATES: MonsterTemplate[] = [...MONSTER_TEMPLATES, ...NEW_STAR3_TEMPLATES, SCORPION];
/**
 * 星4の抽選対象。既存2種 + 11種のうちの4種 + コラボ2種。
 *
 * **星ごとの排出比率は触っていない。**増えたのは「その星を引いた時の顔ぶれ」だけで、
 * 星4そのものの出やすさは前と同じ。
 */
export const GACHA_STAR4_TEMPLATES: MonsterTemplate[] = [
  GACHA_SR_COMMON_TEMPLATE, GACHA_SR_RARE_TEMPLATE, ...NEW_STAR4_TEMPLATES, HARPY, MOCCHI, SUEZO,
];
/** 星5の抽選対象。既存2種 + 11種のうちの4種 + コラボ2種 */
export const GACHA_STAR5_TEMPLATES: MonsterTemplate[] = [
  GACHA_SSR_COMMON_TEMPLATE, GACHA_SSR_RARE_TEMPLATE, ...NEW_STAR5_TEMPLATES, PHOENIX, JOKER, UNDINE, GUJIRA,
];

export const GACHA_SR_COMMON_DEX = createAllVariants(GRIFFON);
export const GACHA_SSR_COMMON_DEX = createAllVariants(DRAGON);
export const GACHA_SR_RARE_DEX = createAllVariants(SERAPH);
export const GACHA_SSR_RARE_DEX = createAllVariants(NEMESIS);

/**
 * 転生ピッグ: ランクアップ素材専用のモンスター。ガチャやステージには一切出現せず、
 * 装備ダンジョンでのみドロップする。星2または星3・そのレベル上限で入手できるが、
 * ステータスは他のモンスターよりはるかに低く設定されており、戦力にはならない
 * (ランクアップの素材として、育てた手持ちモンスターを犠牲にせずに済むようにするための存在)。
 * 素材専用のため、スキルは属性によらず共通(バリエーションなし)。
 */
export const REINCARNATION_PIG: MonsterTemplate = {
  templateId: "reincarnation_pig",
  baseName: "転生ピッグ",
  emoji: "🐷",
  role: "素材",
  dexNote: "ランクアップ(星を上げる)の素材にするためのモンスターです。星を1つ上げるには、上げたい星と同じ星の仲間を並べる必要があります。育てた仲間を差し出さずに済むよう、その頭数をこのピッグで埋められます。装備ダンジョン・通常ステージ・試練の塔の報酬で手に入り、装備ダンジョンは7階から上で星3が出ます。戦力にはなりません(ステータスは他のモンスターよりはるかに低く、スキルも属性で変わりません)。",
  baseStats: {
    hp: 200,
    atk: 15,
    def: 8,
    spd: 60,
    criRate: 0.02,
    criDmg: 1.2,
    resistance: 0.02,
    accuracy: 0.02,
  },
  skill1: {
    id: "reincarnation_pig_s1",
    name: "ぷいぷい",
    description: "敵単体に攻撃力0.3倍のダメージを与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.3 }],
  },
  skill2Variants: [
    {
      id: "reincarnation_pig_s2",
      name: "つのでつつく",
      description: "敵単体に攻撃力0.4倍のダメージを与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 2,
      effects: [{ kind: "DAMAGE", multiplier: 0.4 }],
    },
  ],
  skill3Variants: [
    {
      id: "reincarnation_pig_s3",
      name: "ぶくぶく",
      description: "敵単体に攻撃力0.5倍のダメージを与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [{ kind: "DAMAGE", multiplier: 0.5 }],
    },
  ],
};

/**
 * 経験ピッグ: モンスター強化(経験値フィード)専用のモンスター。ガチャやステージには一切出現せず、
 * レベル上げダンジョンでのみ入手できる。常にその星のレベル上限で手に入るため、
 * 星が高いほど素材にした時の経験値量が大きくなる(戦力にはならない点は転生ピッグと同じ)。
 * 素材専用のため、スキルは属性によらず共通(バリエーションなし)。
 */
export const EXP_PIG: MonsterTemplate = {
  templateId: "exp_pig",
  baseName: "経験ピッグ",
  emoji: "🐖",
  role: "素材",
  dexNote: "モンスター強化(経験値を与える)の素材にするためのモンスターです。常にその星のレベル上限で手に入るので、星が高いほど渡せる経験値が大きくなります。レベル上げダンジョンで手に入り、上の階ほど星の高いものが出ます。戦力にはなりません(ステータスは他のモンスターよりはるかに低く、スキルも属性で変わりません)。",
  baseStats: {
    hp: 200,
    atk: 15,
    def: 8,
    spd: 60,
    criRate: 0.02,
    criDmg: 1.2,
    resistance: 0.02,
    accuracy: 0.02,
  },
  skill1: {
    id: "exp_pig_s1",
    name: "ちょこっと突進",
    description: "敵単体に攻撃力0.3倍のダメージを与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.3 }],
  },
  skill2Variants: [
    {
      id: "exp_pig_s2",
      name: "はなさき体当たり",
      description: "敵単体に攻撃力0.4倍のダメージを与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 2,
      effects: [{ kind: "DAMAGE", multiplier: 0.4 }],
    },
  ],
  skill3Variants: [
    {
      id: "exp_pig_s3",
      name: "ぶひぶひ",
      description: "敵単体に攻撃力0.5倍のダメージを与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [{ kind: "DAMAGE", multiplier: 0.5 }],
    },
  ],
};

/** どの種族にも使えるスキル育成専用素材。経験値は強化処理側で常に0にする。 */
export const SKILL_PIG: MonsterTemplate = {
  ...EXP_PIG,
  templateId: "skill_pig",
  baseName: "スキルピッグ",
  emoji: "🐽",
  dexNote: "スキルレベルを上げるためのモンスターです。素材にするとスキルレベルだけが上がり、経験値は一切入りません。同じ種族の仲間を素材にしなくてもスキルを伸ばせるよう、どの種族にも使えます。試練の塔の報酬で手に入ります。戦力にはなりません(ステータスは他のモンスターよりはるかに低く、スキルも属性で変わりません)。",
  skill1: { ...EXP_PIG.skill1, id: "skill_pig_s1", name: "おうえん" },
};

/** テンプレート×6属性 = 24体の色違いモンスター図鑑(通常の召喚・ステージ対象) */
export const MONSTER_TEMPLATES_DEX = MONSTER_TEMPLATES.flatMap((template) => createAllVariants(template));

/** 転生ピッグの6属性色違いバリエーション(図鑑には含めるが、通常の召喚・ステージ抽選には出さない) */
export const REINCARNATION_PIG_DEX = createAllVariants(REINCARNATION_PIG);

/** 経験ピッグの6属性色違いバリエーション(図鑑には含めるが、通常の召喚・ステージ抽選には出さない) */
export const EXP_PIG_DEX = createAllVariants(EXP_PIG);
export const SKILL_PIG_DEX = createAllVariants(SKILL_PIG);

/** 古代の魔人・古代のクリスタル・古代の呪晶の6属性色違いバリエーション(装備ダンジョン専用。召喚・図鑑表示には一切出さない) */
export const ANCIENT_DEMON_DEX = createAllVariants(ANCIENT_DEMON);
export const ANCIENT_CRYSTAL_DEX = createAllVariants(ANCIENT_CRYSTAL);
export const ANCIENT_CRYSTAL_CURSE_DEX = createAllVariants(ANCIENT_CRYSTAL_CURSE);
export const ANCIENT_BEAST_DEX = createAllVariants(ANCIENT_BEAST);
export const ANCIENT_GUARD_BEAST_DEX = createAllVariants(ANCIENT_GUARD_BEAST);
export const ANCIENT_FANG_BEAST_DEX = createAllVariants(ANCIENT_FANG_BEAST);

/**
 * 試練の塔100階のクリモアークと分身3種。
 *
 * **`ALL_DISPLAYABLE_MONSTERS_DEX` には入れない。**あちらは図鑑に並ぶ顔ぶれで、
 * 潜在覚醒の候補もあの並び順から生成される。100階のボスを入れると
 * 図鑑に最終ボスが並び、覚醒の候補IDが全部ずれる。
 */
export const CRIMOARK_DEX = createAllVariants(CRIMOARK);
/*
 * 目覚の深域の敵。**属性は闇で揃えてある。**
 *
 * 才能覚醒の素材を集める場所なので、こちらの編成が
 * どんな属性でも同じ難易度で回れる必要がある。属性を階ごとに変えると、
 * 相性の良い1体を置くかどうかで周回の速さが変わってしまう。
 */
export const ARCHEOS_DEX = createAllVariants(ARCHEOS);
export const TALENT_SHARD_ATK_DEX = createAllVariants(TALENT_SHARD_ATK);
export const TALENT_SHARD_DEF_DEX = createAllVariants(TALENT_SHARD_DEF);
export const CRIMOARK_ATTACK_DEX = createAllVariants(CRIMOARK_ATTACK);
export const CRIMOARK_SUPPORT_DEX = createAllVariants(CRIMOARK_SUPPORT);
export const CRIMOARK_DEBUFF_DEX = createAllVariants(CRIMOARK_DEBUFF);

/** ガチャ限定の高レアモンスター(SR/SSR)図鑑。GRIFFON/DRAGON/SERAPH/NEMESISとも全6属性 */
export const GACHA_EXCLUSIVE_DEX = [
  ...GACHA_SR_COMMON_DEX,
  ...GACHA_SSR_COMMON_DEX,
  ...GACHA_SR_RARE_DEX,
  ...GACHA_SSR_RARE_DEX,
];

/** 今回追加した11種の全6属性(66体)。図鑑にも召喚にも通常のモンスターとして出る */
export const NEW_MONSTERS_DEX = NEW_MONSTER_TEMPLATES.flatMap((template) => createAllVariants(template));

/**
 * コラボ4種の全6属性(24体)。通常のモンスターとして育成・装備・召喚ができる。
 *
 * **並びは必ず末尾。**潜在覚醒の候補IDは
 * `ALL_DISPLAYABLE_MONSTERS_DEX` の添字から作られるので、
 * 途中へ差し込むと既に覚醒済みの個体の候補がずれる。
 */
export const COLLAB_MONSTERS_DEX = COLLAB_MONSTER_TEMPLATES.flatMap((template) => createAllVariants(template));

/** 検索用の全モンスター図鑑(通常モンスター + ガチャ限定高レア + 転生ピッグ + 経験ピッグ + 装備ダンジョン専用ボス/お供) */
export const MONSTER_DEX = [
  ...MONSTER_TEMPLATES_DEX,
  ...GACHA_EXCLUSIVE_DEX,
  ...NEW_MONSTERS_DEX,
  ...COLLAB_MONSTERS_DEX,
  ...REINCARNATION_PIG_DEX,
  ...EXP_PIG_DEX,
  ...SKILL_PIG_DEX,
  ...ANCIENT_DEMON_DEX,
  ...ANCIENT_CRYSTAL_DEX,
  ...ANCIENT_CRYSTAL_CURSE_DEX,
  ...ANCIENT_BEAST_DEX,
  ...ANCIENT_GUARD_BEAST_DEX,
  ...ANCIENT_FANG_BEAST_DEX,
];

/**
 * 試練の塔100階でしか出ないクリモアークと分身3種。
 *
 * **`MONSTER_DEX` には入れない。**あちらはアリーナの照合表
 * (`arena_catalog_monsters`)と1件単位で突き合わされていて、
 * あの表は「プレイヤーが正当に持ちうる個体」の許可リスト。
 * 100階のボスは誰も所有できないので、あそこへ並べる意味が無いどころか、
 * 対人戦の検証に**持てないはずの個体**を通す穴を開けることになる。
 *
 * 引き当てだけができれば良いので、探す側(`findMonster` / `findMonsterById`)が
 * ここも見に来る形にしてある。
 */
export const TOWER_BOSS_ONLY_DEX = [
  ...CRIMOARK_DEX,
  ...CRIMOARK_ATTACK_DEX,
  ...CRIMOARK_SUPPORT_DEX,
  ...CRIMOARK_DEBUFF_DEX,
  // 目覚の深域の敵も同じ扱い。所有できないので図鑑にも召喚にも出さない
  ...ARCHEOS_DEX,
  ...TALENT_SHARD_ATK_DEX,
  ...TALENT_SHARD_DEF_DEX,
];

/**
 * 戦力になるモンスターの全体。
 *
 * **潜在覚醒の候補はこの並びから生成される**(`latentAbilities.ts`)。
 * 添字が候補のIDに効くので、**末尾に足す以外の並べ替えをしないこと。**
 * 素材専用のピッグをここへ入れてはいけない——覚醒できない相手に
 * 候補が3つ生えて、図鑑が嘘をつく。
 */
export const ALL_DISPLAYABLE_MONSTERS_DEX = [
  ...MONSTER_TEMPLATES_DEX, ...GACHA_EXCLUSIVE_DEX, ...NEW_MONSTERS_DEX, ...COLLAB_MONSTERS_DEX,
];

/** 素材専用のモンスター。戦力にはならないが、使い道が分からないままなので図鑑には載せる */
export const MATERIAL_PIG_DEX = [...REINCARNATION_PIG_DEX, ...EXP_PIG_DEX, ...SKILL_PIG_DEX];

/**
 * 図鑑の画面に並べるもの。
 *
 * ピッグは長らく図鑑に出していなかった。素材専用で戦力にならないからだが、
 * **手持ちには入るのに図鑑に無い**ので、何のために居るのかを確かめる場所が
 * どこにも無かった(スキルの「ぷいぷい(0.3倍)」を読んでも分からない)。
 * `dexNote` で用途と入手先を書いたうえで載せる。
 *
 * 覚醒候補の生成元(`ALL_DISPLAYABLE_MONSTERS_DEX`)とは分けてある。
 */
export const MONSTER_DEX_ENTRIES = [...ALL_DISPLAYABLE_MONSTERS_DEX, ...MATERIAL_PIG_DEX];

/**
 * 図鑑の「入手先」で使う分け方。
 *
 * `GACHA_EXCLUSIVE_DEX` から引くのではなく**テンプレートを名指しする。**
 * 11種の新モンスターも召喚に出るが、ステージにも出るので「召喚限定」ではない。
 * 集合の作り方を間違えると、画面の札が黙って嘘をつく。
 */
export const GACHA_ONLY_TEMPLATE_IDS: ReadonlySet<string> = new Set(
  [GACHA_SR_COMMON_TEMPLATE, GACHA_SR_RARE_TEMPLATE, GACHA_SSR_COMMON_TEMPLATE, GACHA_SSR_RARE_TEMPLATE]
    .map((template) => template.templateId),
);

export const MATERIAL_TEMPLATE_IDS: ReadonlySet<string> = new Set(
  [REINCARNATION_PIG, EXP_PIG, SKILL_PIG].map((template) => template.templateId),
);

export function findMonster(templateId: string, element: string) {
  return MONSTER_DEX.find((m) => m.templateId === templateId && m.element === element)
    ?? TOWER_BOSS_ONLY_DEX.find((m) => m.templateId === templateId && m.element === element);
}

export function findMonsterById(dexId: string) {
  return MONSTER_DEX.find((m) => m.id === dexId)
    ?? TOWER_BOSS_ONLY_DEX.find((m) => m.id === dexId);
}

/**
 * スキルIDから実体を引く。クリエイト(スキル合成)で移し替えたスキルの復元に使う。
 * 図鑑の全個体を1度だけ走査して索引を作る(毎回探すと合成のたびに数千件を舐める)。
 */
const SKILL_BY_ID = new Map<string, Skill>();
for (const dex of MONSTER_DEX) {
  for (const skill of dex.skills) SKILL_BY_ID.set(skill.id, skill);
}

export function findSkillById(skillId: string) {
  return SKILL_BY_ID.get(skillId);
}

// 移し替えたスキルを戦闘用データへ反映できるようにする。
// core は data を参照できない(層が逆流する)ので、data 側から差し込む
setCreatedSkillResolver(findSkillById);
