import { MonsterTemplate } from "../../core/monster.js";
import {
  ATK_DOWN, ATK_UP, CRI_DMG_UP, CRI_RATE_UP, DEF_DOWN, DEF_UP, POISON_RATE, SPD_DOWN, SPD_UP, passive,
} from "./shared.js";

/*
 * 星4の4種。
 *
 * 星4は**編成に軸を1本通す**層。星3の3種が「役割を1つこなす」のに対し、
 * こちらは「その1体がいるから成立する戦い方」を1つずつ持たせてある。
 */

/**
 * バジリスク。**相手の手番そのものを奪う。**
 *
 * 速度低下と行動ゲージ操作に寄せてある。倒すのではなく
 * **相手が動く回数を減らす**ことで勝ちに近づける役。
 * 速度を落とした相手が動くたびに自分が早くなる、という循環を持つ。
 */
export const BASILISK: MonsterTemplate = {
  templateId: "basilisk",
  baseName: "バジリスク",
  role: "デバッファー",
  emoji: "🐍",
  gachaStar: 4,
  baseStats: { hp: 1280, atk: 120, def: 86, spd: 108, criRate: 0.16, criDmg: 1.55, resistance: 0.16, accuracy: 0.25 },
  skill1: {
    id: "basilisk_s1",
    name: "蛇眼の一撃",
    description: "敵単体に攻撃力0.95倍のダメージを与え、60%で2ターン速度を低下させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.95 },
      { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.6 },
    ],
  },
  skill2Variants: [
    {
      id: "basilisk_s2_a",
      name: "毒牙",
      description: "敵単体に攻撃力1.4倍のダメージを与え、80%で3ターン毒(1スタック)を付与し、行動ゲージを30%減少させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.4 },
        { kind: "POISON", damageRatePerStack: POISON_RATE, durationTurns: 3, chance: 0.8 },
        { kind: "GAUGE", amount: -0.3 },
      ],
    },
    {
      id: "basilisk_s2_b",
      name: "石化の眼差し",
      description: "敵単体に攻撃力1.2倍のダメージを与え、75%で1ターンスタンさせる。スタンが失敗した場合は代わりに行動ゲージを40%減少させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2 },
        { kind: "STUN", durationTurns: 1, chance: 0.75 },
        { kind: "GAUGE", amount: -0.4, requires: "STUN_FAILED" },
      ],
    },
    {
      id: "basilisk_s2_c",
      name: "締め付け",
      description: "敵単体に攻撃力1.3倍のダメージを与え、80%で2ターン防御力を75%低下させる。対象が速度低下状態なら行動ゲージをさらに25%減少させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.25, requires: "TARGET_SPD_DOWN" },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "basilisk_s3_a",
      name: "蛇王の威圧",
      description: "威圧の眼光で敵全体に攻撃力1.0倍のダメージを与え、75%で2ターン速度を低下させ、行動ゲージを20%減少させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.0 },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.75 },
        { kind: "GAUGE", amount: -0.2 },
      ],
    },
    {
      id: "basilisk_s3_b",
      name: "死の凝視",
      description: "敵単体に攻撃力1.8倍のダメージを与え、行動ゲージを50%減少させる。対象が速度低下状態なら80%で1ターンスタンさせる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8 },
        { kind: "GAUGE", amount: -0.5 },
        { kind: "STUN", durationTurns: 1, chance: 0.8, requires: "TARGET_SPD_DOWN" },
      ],
    },
    {
      id: "basilisk_s3_c",
      name: "蛇王の支配",
      description: "パッシブ。速度低下状態の敵が行動するたび、自身の行動ゲージが進む。",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: passive("ENEMY_ACTED", [
        { kind: "GAUGE_ON_SLOWED_ENEMY_ACT", gauge: 0.05 },
        { kind: "GAUGE_ON_SLOWED_ENEMY_ACT", gauge: 0.06 },
        { kind: "GAUGE_ON_SLOWED_ENEMY_ACT", gauge: 0.07 },
        { kind: "GAUGE_ON_SLOWED_ENEMY_ACT", gauge: 0.08 },
        { kind: "GAUGE_ON_SLOWED_ENEMY_ACT", gauge: 0.10 },
      ]),
    },
  ],
  lightSkill3: {
    id: "basilisk_s3_light",
    name: "神眼の裁き",
    description: "有利な効果を3個解除。行動ゲージ-30%。80%で速度-30% (2ターン)。100%で治癒阻害 (2ターン、回復を受けられない)",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "STRIP", count: 3 },
      { kind: "GAUGE", amount: -0.3 },
      { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.8 },
      { kind: "HEAL_BLOCK", durationTurns: 2, chance: 1, fixedDuration: true },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "STRIP", count: 3 }, { kind: "GAUGE", amount: -0.3 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.8 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 1, fixedDuration: true }] },
      // Lv2 行動ゲージ -30%→-40% / 弱体の発動率 80%→85%
      { cooldownTurns: 5, effects: [{ kind: "STRIP", count: 3 }, { kind: "GAUGE", amount: -0.4 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.85 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 1, fixedDuration: true }] },
      // Lv3 行動ゲージ -40%→-50% / 弱体の発動率 85%→90%
      { cooldownTurns: 5, effects: [{ kind: "STRIP", count: 3 }, { kind: "GAUGE", amount: -0.5 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 1, fixedDuration: true }] },
      // Lv4 行動ゲージ -50%→-60% / 弱体の発動率 90%→100%
      { cooldownTurns: 5, effects: [{ kind: "STRIP", count: 3 }, { kind: "GAUGE", amount: -0.6 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 1 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 1, fixedDuration: true }] },
      // Lv5 クールタイム -1(5→4ターン) / 弱体の持続 2→3ターン
      { cooldownTurns: 4, effects: [{ kind: "STRIP", count: 3 }, { kind: "GAUGE", amount: -0.6 }, { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3, chance: 1 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 1, fixedDuration: true }] },
    ],
  },
  darkSkill3: {
    id: "basilisk_s3_dark",
    name: "深淵の魔眼",
    description: "ダメージ倍率 0.60倍 × 3回。各ヒットごとに: 50%で行動ゲージ-30%、25%でスタン (1ターン)",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 0.6, hits: 3, perHitEffects: [{ kind: "GAUGE", amount: -0.3, chance: 0.5 }, { kind: "STUN", durationTurns: 1, chance: 0.25 }] },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.6, hits: 3, perHitEffects: [{ kind: "GAUGE", amount: -0.3, chance: 0.5 }, { kind: "STUN", durationTurns: 1, chance: 0.25 }] }] },
      // Lv2 ダメージ倍率 0.60倍→0.70倍 / 行動ゲージ -30%→-50%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.7, hits: 3, perHitEffects: [{ kind: "GAUGE", amount: -0.3, chance: 0.5 }, { kind: "STUN", durationTurns: 1, chance: 0.25 }] }] },
      // Lv3 行動ゲージ -50%→-60% / スタンの発動率 25%→30%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.7, hits: 3, perHitEffects: [{ kind: "GAUGE", amount: -0.3, chance: 0.6 }, { kind: "STUN", durationTurns: 1, chance: 0.3 }] }] },
      // Lv4 ダメージ倍率 0.70倍→0.80倍 / スタンの発動率 30%→35%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 3, perHitEffects: [{ kind: "GAUGE", amount: -0.3, chance: 0.6 }, { kind: "STUN", durationTurns: 1, chance: 0.35 }] }] },
      // Lv5 クールタイム -1(5→4ターン) / 行動ゲージ -60%→-70% / スタンの発動率 35%→40%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 3, perHitEffects: [{ kind: "GAUGE", amount: -0.3, chance: 0.7 }, { kind: "STUN", durationTurns: 1, chance: 0.4 }] }] },
    ],
  },
  skillAssignment: {
    FIRE: { skill2: 0, skill3: 0 },
    GRASS: { skill2: 2, skill3: 2 },
    ELECTRIC: { skill2: 1, skill3: 1 },
    WATER: { skill2: 0, skill3: 2 },
    LIGHT: { skill2: 2 },
    DARK: { skill2: 1 },
  },
};

/**
 * ミミック。**殴られることで仕事が進むタンク。**
 *
 * HPでダメージを出し、与えたぶんだけ自分が回復する。
 * ターゲット集中で敵の単体攻撃を引き受け、受けるほど手番が早く回る。
 * **前に出る理由がある**タンクにしてある。
 */
export const MIMIC: MonsterTemplate = {
  templateId: "mimic",
  baseName: "ミミック",
  role: "タンク",
  emoji: "🧰",
  gachaStar: 4,
  baseStats: { hp: 1650, atk: 105, def: 88, spd: 92, criRate: 0.15, criDmg: 1.5, resistance: 0.22, accuracy: 0.14 },
  skill1: {
    id: "mimic_s1",
    name: "噛みつく宝箱",
    description: "敵単体に攻撃力0.7倍のダメージを与える(最大HP×0.06を加算)。与えたダメージの20%を自身が回復する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.7, hpCoefficient: 0.06 },
      { kind: "LIFESTEAL", healRate: 0.2 },
    ],
  },
  skill2Variants: [
    {
      id: "mimic_s2_a",
      name: "がぶ飲み",
      description: "ダメージ倍率 1.80倍(最大HPの10%を加算)。与えたダメージの40%を自身が回復",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8, hpCoefficient: 0.1 },
        { kind: "LIFESTEAL", healRate: 0.4, selfLowHpExtra: { hpRatio: 0.5, extra: 0.2 } },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.8, hpCoefficient: 0.1 }, { kind: "LIFESTEAL", healRate: 0.4, selfLowHpExtra: { hpRatio: 0.5, extra: 0.2 } }] },
        // Lv2 ダメージ倍率 1.80倍→1.95倍 / 最大HP比例 10%→11% / 回復量 40%→45%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.95, hpCoefficient: 0.11 }, { kind: "LIFESTEAL", healRate: 0.45, selfLowHpExtra: { hpRatio: 0.5, extra: 0.2 } }] },
        // Lv3 ダメージ倍率 1.95倍→2.05倍 / 最大HP比例 11%→12%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.05, hpCoefficient: 0.12 }, { kind: "LIFESTEAL", healRate: 0.45, selfLowHpExtra: { hpRatio: 0.5, extra: 0.2 } }] },
        // Lv4 ダメージ倍率 2.05倍→2.15倍 / 最大HP比例 12%→14% / 回復量 45%→50%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.15, hpCoefficient: 0.14 }, { kind: "LIFESTEAL", healRate: 0.5, selfLowHpExtra: { hpRatio: 0.5, extra: 0.2 } }] },
        // Lv5 クールタイム -1(4→3ターン) / 最大HP比例 14%→15%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.15, hpCoefficient: 0.15 }, { kind: "LIFESTEAL", healRate: 0.5, selfLowHpExtra: { hpRatio: 0.5, extra: 0.2 } }] },
      ],
    },
    {
      id: "mimic_s2_b",
      name: "呪われた財宝",
      description: "呪いの財宝を押し付け、敵単体に攻撃力1.0倍のダメージを与える(最大HP×0.08を加算)。80%で2ターン回復封じを付与し、行動ゲージを25%減少させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.0, hpCoefficient: 0.08 },
        { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.25 },
      ],
    },
    {
      id: "mimic_s2_c",
      name: "誘い込む宝箱",
      description: "自身にターゲット集中 (1ターン)。自身の受けるダメージ-20% (1ターン)。1ターン、攻撃を受けるたび行動ゲージ+10%",
      target: "SELF",
      cooldownTurns: 5,
      effects: [
        { kind: "STATUS", status: "FOCUS", durationTurns: 1, applyTo: "SELF" },
        { kind: "MITIGATE", amount: 0.2, durationTurns: 1, applyTo: "SELF" },
        { kind: "GAUGE_ON_HIT", amount: 0.1, durationTurns: 1, applyTo: "SELF" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "STATUS", status: "FOCUS", durationTurns: 1, applyTo: "SELF" }, { kind: "MITIGATE", amount: 0.2, durationTurns: 1, applyTo: "SELF" }, { kind: "GAUGE_ON_HIT", amount: 0.1, durationTurns: 1, applyTo: "SELF" }] },
        // Lv2 被ダメージ軽減 20%→25%
        { cooldownTurns: 5, effects: [{ kind: "STATUS", status: "FOCUS", durationTurns: 1, applyTo: "SELF" }, { kind: "MITIGATE", amount: 0.25, durationTurns: 1, applyTo: "SELF" }, { kind: "GAUGE_ON_HIT", amount: 0.1, durationTurns: 1, applyTo: "SELF" }] },
        // Lv3 行動ゲージ 10%→15%
        { cooldownTurns: 5, effects: [{ kind: "STATUS", status: "FOCUS", durationTurns: 1, applyTo: "SELF" }, { kind: "MITIGATE", amount: 0.25, durationTurns: 1, applyTo: "SELF" }, { kind: "GAUGE_ON_HIT", amount: 0.15, durationTurns: 1, applyTo: "SELF" }] },
        // Lv4 被ダメージ軽減 25%→30%
        { cooldownTurns: 5, effects: [{ kind: "STATUS", status: "FOCUS", durationTurns: 1, applyTo: "SELF" }, { kind: "MITIGATE", amount: 0.3, durationTurns: 1, applyTo: "SELF" }, { kind: "GAUGE_ON_HIT", amount: 0.15, durationTurns: 1, applyTo: "SELF" }] },
        // Lv5 クールタイム -1(5→4ターン) / 持続 1→2ターン / 被ダメージ軽減の持続 1→2ターン / 行動ゲージ 15%→20%
        { cooldownTurns: 4, effects: [{ kind: "STATUS", status: "FOCUS", durationTurns: 2, applyTo: "SELF" }, { kind: "MITIGATE", amount: 0.3, durationTurns: 2, applyTo: "SELF" }, { kind: "GAUGE_ON_HIT", amount: 0.2, durationTurns: 2, applyTo: "SELF" }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "mimic_s3_a",
      name: "貪欲な反撃",
      description: "2ターンのあいだ、攻撃を受けるたび攻撃者へ攻撃力0.60倍の反撃を返す(最大HP×0.04を加算)。使用時に自身のHPを最大HPの5%回復する。",
      target: "SELF",
      cooldownTurns: 5,
      effects: [
        { kind: "COUNTER_STANCE", durationTurns: 2, multiplier: 0.6, hpCoefficient: 0.04 },
        { kind: "HEAL", healRate: 0.05, applyTo: "SELF" },
      ],
    },
    {
      id: "mimic_s3_b",
      name: "食らいつく",
      description: "ダメージ倍率 1.60倍(最大HPの13%を加算) 自身が失ったHPが多いほど最終ダメージ上昇(最大+50%)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.6, hpCoefficient: 0.13, missingHpBonus: { perLostRatio: 0.4, maxBonus: 0.5 } },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.6, hpCoefficient: 0.13, missingHpBonus: { perLostRatio: 0.4, maxBonus: 0.5 } }] },
        // Lv2 ダメージ倍率 1.60倍→1.90倍 / 最大HP比例 13%→16%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.9, hpCoefficient: 0.16, missingHpBonus: { perLostRatio: 0.4, maxBonus: 0.5 } }] },
        // Lv3 ダメージ倍率 1.90倍→2.20倍 / 最大HP比例 16%→19%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.2, hpCoefficient: 0.19, missingHpBonus: { perLostRatio: 0.4, maxBonus: 0.6 } }] },
        // Lv4 ダメージ倍率 2.20倍→2.60倍 / 最大HP比例 19%→22%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.6, hpCoefficient: 0.22, missingHpBonus: { perLostRatio: 0.4, maxBonus: 0.6 } }] },
        // Lv5 クールタイム -2(5→3ターン) / ダメージ倍率 2.60倍→3.00倍 / 最大HP比例 22%→25%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 3, hpCoefficient: 0.25, missingHpBonus: { perLostRatio: 0.4, maxBonus: 0.7 } }] },
      ],
    },
    {
      id: "mimic_s3_c",
      name: "偽りの財宝",
      description: "パッシブ。攻撃を受けた時、自身のHPを最大HPの5%回復し、70%で攻撃者の攻撃力-50%(2ターン)。攻撃者へ自身の最大HPの5%のダメージを返す(防御を無視)。敵1行動につき1回",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: {
        trigger: "SELF_HIT",
        levels: [
          { kind: "FALSE_TREASURE", heal: 0.05, chance: 0.7, atkDown: 0.5, duration: 2, counterHpRatio: 0.05 },
          { kind: "FALSE_TREASURE", heal: 0.06, chance: 0.75, atkDown: 0.5, duration: 2, counterHpRatio: 0.06 },
          { kind: "FALSE_TREASURE", heal: 0.07, chance: 0.8, atkDown: 0.5, duration: 2, counterHpRatio: 0.07 },
          { kind: "FALSE_TREASURE", heal: 0.08, chance: 0.9, atkDown: 0.5, duration: 2, counterHpRatio: 0.08 },
          { kind: "FALSE_TREASURE", heal: 0.1, chance: 1, atkDown: 0.5, duration: 2, counterHpRatio: 0.1 },
        ],
      },
    },
  ],
  lightSkill3: {
    id: "mimic_s3_light",
    name: "聖なる宝箱",
    description: "無敵 (1ターン)。敵全体に60%で治癒阻害 (2ターン、回復を受けられない)",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true },
      { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.6, applyTo: "ENEMIES" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.6, applyTo: "ENEMIES" }] },
      // Lv2 治癒阻害の発動率 60%→70%
      { cooldownTurns: 5, effects: [{ kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.7, applyTo: "ENEMIES" }] },
      // Lv3 治癒阻害の発動率 70%→80%
      { cooldownTurns: 5, effects: [{ kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.8, applyTo: "ENEMIES" }] },
      // Lv4 治癒阻害の発動率 80%→90%
      { cooldownTurns: 5, effects: [{ kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.9, applyTo: "ENEMIES" }] },
      // Lv5 クールタイム -1(5→4ターン) / 治癒阻害の発動率 90%→100%
      { cooldownTurns: 4, effects: [{ kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 1, applyTo: "ENEMIES" }] },
    ],
  },
  darkSkill3: {
    id: "mimic_s3_dark",
    name: "強欲の魔箱",
    description: "ダメージ倍率 1.80倍(最大HPの12%を加算) 対象が弱体状態なら最終ダメージ+25% 自身が失ったHPが多いほど最終ダメージ上昇(最大+30%)。行動ゲージを30%吸収",
    target: "SINGLE_ENEMY",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 1.8, hpCoefficient: 0.12, conditionalBonus: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.25 }], missingHpBonus: { perLostRatio: 0.3, maxBonus: 0.3 } },
      { kind: "GAUGE", amount: 0.3, drain: true },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.8, hpCoefficient: 0.12, conditionalBonus: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.25 }], missingHpBonus: { perLostRatio: 0.3, maxBonus: 0.3 } }, { kind: "GAUGE", amount: 0.3, drain: true }] },
      // Lv2 ダメージ倍率 1.80倍→2.10倍 / 最大HP比例 12%→14%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.1, hpCoefficient: 0.14, conditionalBonus: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.25 }], missingHpBonus: { perLostRatio: 0.35, maxBonus: 0.35 } }, { kind: "GAUGE", amount: 0.3, drain: true }] },
      // Lv3 ダメージ倍率 2.10倍→2.50倍 / 最大HP比例 14%→16% / 行動ゲージ 30%→40%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.5, hpCoefficient: 0.16, conditionalBonus: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.25 }], missingHpBonus: { perLostRatio: 0.4, maxBonus: 0.4 } }, { kind: "GAUGE", amount: 0.4, drain: true }] },
      // Lv4 ダメージ倍率 2.50倍→2.90倍 / 最大HP比例 16%→18%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.9, hpCoefficient: 0.18, conditionalBonus: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.25 }], missingHpBonus: { perLostRatio: 0.45, maxBonus: 0.45 } }, { kind: "GAUGE", amount: 0.4, drain: true }] },
      // Lv5 クールタイム -1(5→4ターン) / ダメージ倍率 2.90倍→3.30倍 / 最大HP比例 18%→20% / 行動ゲージ 40%→50%
      { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 3.3, hpCoefficient: 0.2, conditionalBonus: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.25 }], missingHpBonus: { perLostRatio: 0.5, maxBonus: 0.5 } }, { kind: "GAUGE", amount: 0.5, drain: true }] },
    ],
  },
  skillAssignment: {
    FIRE: { skill2: 1, skill3: 1 },
    GRASS: { skill2: 0, skill3: 2 },
    ELECTRIC: { skill2: 2, skill3: 0 },
    WATER: { skill2: 0, skill3: 0 },
    LIGHT: { skill2: 2 },
    DARK: { skill2: 1 },
  },
};

/**
 * ヴァルキリア。**倒れそうな味方を、倒れる前に拾う。**
 *
 * 既存のフェアリーが「減った分を戻す」ヒーラーなのに対し、
 * こちらは**行動順そのものを支援する**サポーター。
 * パッシブの「戦乙女の誓い」は、致命の一撃に対する最後の保険になる。
 */
export const VALKYRIA: MonsterTemplate = {
  templateId: "valkyria",
  baseName: "ヴァルキリア",
  role: "サポート",
  emoji: "🕊️",
  gachaStar: 4,
  baseStats: { hp: 1320, atk: 100, def: 92, spd: 106, criRate: 0.15, criDmg: 1.5, resistance: 0.24, accuracy: 0.16 },
  skill1: {
    id: "valkyria_s1",
    name: "聖槍の一撃",
    description: "ダメージ倍率 1.00倍。行動ゲージ+10%",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1 },
      { kind: "GAUGE", amount: 0.1, applyTo: "LOWEST_HP_ALLY" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1 }, { kind: "GAUGE", amount: 0.1, applyTo: "LOWEST_HP_ALLY" }] },
      // Lv2 ダメージ倍率 1.00倍→1.10倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "GAUGE", amount: 0.1, applyTo: "LOWEST_HP_ALLY" }] },
      // Lv3 行動ゲージ 10%→15%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "GAUGE", amount: 0.15, applyTo: "LOWEST_HP_ALLY" }] },
      // Lv4 ダメージ倍率 1.10倍→1.20倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "GAUGE", amount: 0.15, applyTo: "LOWEST_HP_ALLY" }] },
      // Lv5 行動ゲージ 15%→20%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "GAUGE", amount: 0.2, applyTo: "LOWEST_HP_ALLY" }] },
    ],
  },
  skill2Variants: [
    {
      id: "valkyria_s2_a",
      name: "守護の翼",
      description: "回復 最大HPの30.0%。デバフを1個解除。防御力+30% (2ターン)",
      target: "SINGLE_ALLY",
      cooldownTurns: 4,
      effects: [
        { kind: "HEAL", healRate: 0.3 },
        { kind: "CLEANSE", count: 1 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.3 }, { kind: "CLEANSE", count: 1 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv2 回復量 30%→35%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.35 }, { kind: "CLEANSE", count: 1 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv3
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.35 }, { kind: "CLEANSE", count: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv4 回復量 35%→40%
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.4 }, { kind: "CLEANSE", count: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv5 クールタイム -1(4→3ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "HEAL", healRate: 0.4 }, { kind: "CLEANSE", count: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }] },
      ],
    },
    {
      id: "valkyria_s2_b",
      name: "戦乙女の号令",
      description: "行動ゲージ+20%。攻撃力+30% (2ターン)",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "GAUGE", amount: 0.2 },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.2 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }] },
        // Lv2 行動ゲージ 20%→25%
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.25 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }] },
        // Lv3
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.25 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }] },
        // Lv4 行動ゲージ 25%→30%
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.3 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }] },
        // Lv5 クールタイム -1(5→4ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 4, effects: [{ kind: "GAUGE", amount: 0.3 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }] },
      ],
    },
    {
      id: "valkyria_s2_c",
      name: "不屈の祝福",
      description: "我慢 (1ターン)。攻撃力+30% (2ターン)。継続回復 最大HPの5.0% (2ターン、自身のターン開始時)",
      target: "SINGLE_ALLY",
      cooldownTurns: 3,
      effects: [
        { kind: "STATUS", status: "ENDURE", durationTurns: 1 },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 },
        { kind: "REGEN", healRate: 0.05, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 3, effects: [{ kind: "STATUS", status: "ENDURE", durationTurns: 1 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "REGEN", healRate: 0.05, durationTurns: 2 }] },
        // Lv2
        { cooldownTurns: 3, effects: [{ kind: "STATUS", status: "ENDURE", durationTurns: 1 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "REGEN", healRate: 0.05, durationTurns: 2 }] },
        // Lv3
        { cooldownTurns: 3, effects: [{ kind: "STATUS", status: "ENDURE", durationTurns: 1 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "REGEN", healRate: 0.05, durationTurns: 2 }] },
        // Lv4
        { cooldownTurns: 3, effects: [{ kind: "STATUS", status: "ENDURE", durationTurns: 1 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "REGEN", healRate: 0.05, durationTurns: 2 }] },
        // Lv5 持続 1→2ターン
        { cooldownTurns: 3, effects: [{ kind: "STATUS", status: "ENDURE", durationTurns: 2 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }, { kind: "REGEN", healRate: 0.05, durationTurns: 2 }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "valkyria_s3_a",
      name: "天翼の加護",
      description: "回復 最大HPの25.0%。デバフを1個解除。防御力+30% (2ターン)",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "HEAL", healRate: 0.25 },
        { kind: "CLEANSE", count: 1 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.25 }, { kind: "CLEANSE", count: 1 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv2 回復量 25%→30%
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.3 }, { kind: "CLEANSE", count: 1 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv3
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.3 }, { kind: "CLEANSE", count: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv4 回復量 30%→35%
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.35 }, { kind: "CLEANSE", count: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 }] },
        // Lv5 クールタイム -1(5→4ターン) / 回復量 35%→40% / 強化の持続 2→3ターン
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.4 }, { kind: "CLEANSE", count: 2 }, { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 }] },
      ],
    },
    {
      id: "valkyria_s3_b",
      name: "勝利への進軍",
      description: "行動ゲージ+30% (HP50%以下ならさらに15%)。速度+20% (2ターン)。攻撃力+30% (2ターン)",
      target: "ALL_ALLIES",
      cooldownTurns: 6,
      effects: [
        { kind: "GAUGE", amount: 0.3, lowHpExtra: { hpRatio: 0.5, amount: 0.15 } },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.3, lowHpExtra: { hpRatio: 0.5, amount: 0.15 } }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }] },
        // Lv2 行動ゲージ 30%→35%
        { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.35, lowHpExtra: { hpRatio: 0.5, amount: 0.2 } }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }] },
        // Lv3
        { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.35, lowHpExtra: { hpRatio: 0.5, amount: 0.25 } }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }] },
        // Lv4 行動ゲージ 35%→40%
        { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.4, lowHpExtra: { hpRatio: 0.5, amount: 0.25 } }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }] },
        // Lv5 クールタイム -1(6→5ターン) / 強化の持続 2→3ターン
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.4, lowHpExtra: { hpRatio: 0.5, amount: 0.25 } }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3 }] },
      ],
    },
    {
      id: "valkyria_s3_c",
      name: "戦乙女の誓い",
      description: "パッシブ。味方のHPが30%以下になった時、その味方に1ターン無敵と自身の最大HPの25%回復(内部クールタイム5ターン)",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: {
        trigger: "ALLY_HP_THRESHOLD",
        levels: [
          { kind: "VALKYRIE_OATH", hpRatio: 0.3, heal: 0.25, internalCooldown: 5 },
          { kind: "VALKYRIE_OATH", hpRatio: 0.3, heal: 0.3, internalCooldown: 5 },
          { kind: "VALKYRIE_OATH", hpRatio: 0.3, heal: 0.35, internalCooldown: 5 },
          { kind: "VALKYRIE_OATH", hpRatio: 0.3, heal: 0.4, internalCooldown: 5 },
          { kind: "VALKYRIE_OATH", hpRatio: 0.3, heal: 0.45, internalCooldown: 4 },
        ],
      },
    },
  ],
  lightSkill3: {
    id: "valkyria_s3_light",
    name: "神聖なる翼",
    description: "回復 最大HPの30.0%。デバフを解除。我慢 (1ターン)",
    target: "ALL_ALLIES",
    cooldownTurns: 6,
    effects: [
      { kind: "HEAL", healRate: 0.3 },
      { kind: "CLEANSE" },
      { kind: "STATUS", status: "ENDURE", durationTurns: 1 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 6, effects: [{ kind: "HEAL", healRate: 0.3 }, { kind: "CLEANSE" }, { kind: "STATUS", status: "ENDURE", durationTurns: 1 }] },
      // Lv2 回復量 30%→35%
      { cooldownTurns: 6, effects: [{ kind: "HEAL", healRate: 0.35 }, { kind: "CLEANSE" }, { kind: "STATUS", status: "ENDURE", durationTurns: 1 }] },
      // Lv3 回復量 35%→40%
      { cooldownTurns: 6, effects: [{ kind: "HEAL", healRate: 0.4 }, { kind: "CLEANSE" }, { kind: "STATUS", status: "ENDURE", durationTurns: 1 }] },
      // Lv4 回復量 40%→45%
      { cooldownTurns: 6, effects: [{ kind: "HEAL", healRate: 0.45 }, { kind: "CLEANSE" }, { kind: "STATUS", status: "ENDURE", durationTurns: 1 }] },
      // Lv5 クールタイム -1(6→5ターン) / 回復量 45%→50% / 持続 1→2ターン
      { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.5 }, { kind: "CLEANSE" }, { kind: "STATUS", status: "ENDURE", durationTurns: 2 }] },
    ],
  },
  darkSkill3: {
    id: "valkyria_s3_dark",
    name: "黒翼の戦歌",
    description: "行動ゲージ+30% (HP50%以下ならさらに15%)。クリ率+20% (2ターン)。クリダメ+30% (2ターン)",
    target: "ALL_ALLIES",
    cooldownTurns: 6,
    effects: [
      { kind: "GAUGE", amount: 0.3, lowHpExtra: { hpRatio: 0.5, amount: 0.15 } },
      { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 },
      { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.3, lowHpExtra: { hpRatio: 0.5, amount: 0.15 } }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }] },
      // Lv2 行動ゲージ 30%→35%
      { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.35, lowHpExtra: { hpRatio: 0.5, amount: 0.15 } }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }] },
      // Lv3 行動ゲージ 35%→40%
      { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.4, lowHpExtra: { hpRatio: 0.5, amount: 0.2 } }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }] },
      // Lv4 行動ゲージ 40%→45%
      { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.45, lowHpExtra: { hpRatio: 0.5, amount: 0.2 } }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 }] },
      // Lv5 クールタイム -1(6→5ターン) / 行動ゲージ 45%→50% / 強化の持続 2→3ターン
      { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.5, lowHpExtra: { hpRatio: 0.5, amount: 0.25 } }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 3 }] },
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
 * サンダービースト。**速さがそのまま火力になる。**
 *
 * 既存のウルフも速度比例を持つが、あちらは単発。こちらは
 * **多段とクリティカルで行動ゲージを稼ぎ、続けて動く**方向。
 * 光の「雷の本能」だけはパッシブで、スキル枠を1つ常時効果に差し出す。
 */
export const THUNDERBEAST: MonsterTemplate = {
  templateId: "thunderbeast",
  baseName: "サンダービースト",
  role: "アタッカー",
  emoji: "⚡",
  gachaStar: 4,
  baseStats: { hp: 1120, atk: 150, def: 64, spd: 120, criRate: 0.2, criDmg: 1.6, resistance: 0.1, accuracy: 0.14 },
  skill1: {
    id: "thunderbeast_s1",
    name: "雷牙",
    description: "ダメージ倍率 0.90倍(自身の速度が高いほど上昇)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.9, scaleBonus: { stat: "spd", bonusAtReference: 0.35 } },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.9, scaleBonus: { stat: "spd", bonusAtReference: 0.35 } }] },
      // Lv2 ダメージ倍率 0.90倍→1.00倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1, scaleBonus: { stat: "spd", bonusAtReference: 0.35 } }] },
      // Lv3
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } }] },
      // Lv4 ダメージ倍率 1.00倍→1.10倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } }] },
      // Lv5
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1, scaleBonus: { stat: "spd", bonusAtReference: 0.45 } }] },
    ],
  },
  skill2Variants: [
    {
      id: "thunderbeast_s2_a",
      name: "雷光突進",
      description: "ダメージ倍率 1.50倍(自身の速度が高いほど上昇)。自身の行動ゲージ+25%",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } },
        { kind: "GAUGE", amount: 0.25, applyTo: "SELF" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } }, { kind: "GAUGE", amount: 0.25, applyTo: "SELF" }] },
        // Lv2 ダメージ倍率 1.50倍→1.60倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.6, scaleBonus: { stat: "spd", bonusAtReference: 0.45 } }, { kind: "GAUGE", amount: 0.25, applyTo: "SELF" }] },
        // Lv3 ダメージ倍率 1.60倍→1.70倍 / 行動ゲージ 25%→30%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.7, scaleBonus: { stat: "spd", bonusAtReference: 0.5 } }, { kind: "GAUGE", amount: 0.3, applyTo: "SELF" }] },
        // Lv4 ダメージ倍率 1.70倍→1.80倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.8, scaleBonus: { stat: "spd", bonusAtReference: 0.55 } }, { kind: "GAUGE", amount: 0.3, applyTo: "SELF" }] },
        // Lv5 クールタイム -1(4→3ターン) / 行動ゲージ 30%→35%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.8, scaleBonus: { stat: "spd", bonusAtReference: 0.6 } }, { kind: "GAUGE", amount: 0.35, applyTo: "SELF" }] },
      ],
    },
    {
      id: "thunderbeast_s2_b",
      name: "連雷",
      description: "ダメージ倍率 0.65倍 × 2回(自身の速度が高いほど上昇)。1回以上クリティカルしたら自身の行動ゲージ+25%",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.65, hits: 2, scaleBonus: { stat: "spd", bonusAtReference: 0.15 } },
        { kind: "GAUGE", amount: 0.25, applyTo: "SELF", requires: "ANY_CRIT" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.65, hits: 2, scaleBonus: { stat: "spd", bonusAtReference: 0.15 } }, { kind: "GAUGE", amount: 0.25, applyTo: "SELF", requires: "ANY_CRIT" }] },
        // Lv2 ダメージ倍率 0.65倍→0.70倍 / 行動ゲージ 25%→30%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.7, hits: 2, scaleBonus: { stat: "spd", bonusAtReference: 0.2 } }, { kind: "GAUGE", amount: 0.3, applyTo: "SELF", requires: "ANY_CRIT" }] },
        // Lv3 ダメージ倍率 0.70倍→0.75倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.75, hits: 2, scaleBonus: { stat: "spd", bonusAtReference: 0.2 } }, { kind: "GAUGE", amount: 0.3, applyTo: "SELF", requires: "ANY_CRIT" }] },
        // Lv4 ダメージ倍率 0.75倍→0.80倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 2, scaleBonus: { stat: "spd", bonusAtReference: 0.25 } }, { kind: "GAUGE", amount: 0.3, applyTo: "SELF", requires: "ANY_CRIT" }] },
        // Lv5 クールタイム -1(4→3ターン) / 行動ゲージ 30%→35%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 2, scaleBonus: { stat: "spd", bonusAtReference: 0.3 } }, { kind: "GAUGE", amount: 0.35, applyTo: "SELF", requires: "ANY_CRIT" }] },
      ],
    },
    {
      id: "thunderbeast_s2_c",
      name: "雷鳴の爪",
      description: "ダメージ倍率 1.40倍(自身の速度が高いほど上昇)。80%で防御力-75% (2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.4, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.4, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }] },
        // Lv2 ダメージ倍率 1.40倍→1.50倍 / 弱体の発動率 80%→90%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5, scaleBonus: { stat: "spd", bonusAtReference: 0.45 } }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9 }] },
        // Lv3 ダメージ倍率 1.50倍→1.60倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.6, scaleBonus: { stat: "spd", bonusAtReference: 0.5 } }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9 }] },
        // Lv4 ダメージ倍率 1.60倍→1.70倍 / 弱体の発動率 90%→100%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.7, scaleBonus: { stat: "spd", bonusAtReference: 0.55 } }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 1 }] },
        // Lv5 クールタイム -1(4→3ターン) / ダメージ倍率 1.70倍→1.80倍 / 弱体の持続 2→3ターン
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.8, scaleBonus: { stat: "spd", bonusAtReference: 0.6 } }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 1 }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "thunderbeast_s3_a",
      name: "迅雷乱舞",
      description: "ダメージ倍率 0.75倍 × 3回(自身の速度が高いほど上昇)。2回以上クリティカルしたら自身の行動ゲージ+40%",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 0.75, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.45 } },
        { kind: "GAUGE", amount: 0.4, applyTo: "SELF", requires: "CRITS_AT_LEAST_2" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.75, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.45 } }, { kind: "GAUGE", amount: 0.4, applyTo: "SELF", requires: "CRITS_AT_LEAST_2" }] },
        // Lv2 ダメージ倍率 0.75倍→0.80倍 / 行動ゲージ 40%→45%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.5 } }, { kind: "GAUGE", amount: 0.45, applyTo: "SELF", requires: "CRITS_AT_LEAST_2" }] },
        // Lv3 ダメージ倍率 0.80倍→0.85倍 / 行動ゲージ 45%→50%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.85, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.55 } }, { kind: "GAUGE", amount: 0.5, applyTo: "SELF", requires: "CRITS_AT_LEAST_2" }] },
        // Lv4 ダメージ倍率 0.85倍→0.90倍 / 行動ゲージ 50%→55%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.6 } }, { kind: "GAUGE", amount: 0.55, applyTo: "SELF", requires: "CRITS_AT_LEAST_2" }] },
        // Lv5 クールタイム -2(5→3ターン) / 行動ゲージ 55%→60%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.65 } }, { kind: "GAUGE", amount: 0.6, applyTo: "SELF", requires: "CRITS_AT_LEAST_2" }] },
      ],
    },
    {
      id: "thunderbeast_s3_b",
      name: "天雷の号令",
      description: "行動ゲージ+20%。速度+20% (2ターン)。クリ率+20% (2ターン)。自身の行動ゲージ+25%",
      target: "ALL_ALLIES",
      cooldownTurns: 6,
      effects: [
        { kind: "GAUGE", amount: 0.2 },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 },
        { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 },
        { kind: "GAUGE", amount: 0.25, applyTo: "SELF" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.2 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.25, applyTo: "SELF" }] },
        // Lv2 行動ゲージ 20%→25%
        { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.25 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.25, applyTo: "SELF" }] },
        // Lv3 行動ゲージ 25%→30%
        { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.25 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.3, applyTo: "SELF" }] },
        // Lv4 行動ゲージ 25%→30%
        { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.3 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 }, { kind: "GAUGE", amount: 0.3, applyTo: "SELF" }] },
        // Lv5 クールタイム -1(6→5ターン) / 強化の持続 2→3ターン / 行動ゲージ 30%→35%
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.3 }, { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3 }, { kind: "GAUGE", amount: 0.35, applyTo: "SELF" }] },
      ],
    },
    {
      id: "thunderbeast_s3_c",
      name: "雷獣覚醒",
      description: "自身の速度+20% (3ターン)。自身のクリ率+20% (3ターン)。自身の攻撃力+30% (3ターン)。継続回復 最大HPの5.0% (3ターン、自身のターン開始時)。使用後、即時に追加ターンを獲得",
      target: "SELF",
      cooldownTurns: 5,
      effects: [
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3, applyTo: "SELF" },
        { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3, applyTo: "SELF" },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "SELF" },
        { kind: "REGEN", healRate: 0.05, durationTurns: 3, applyTo: "SELF" },
      ],
      extraTurn: true,
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "REGEN", healRate: 0.05, durationTurns: 3, applyTo: "SELF" }] },
        // Lv2 回復量 5%→7%
        { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "REGEN", healRate: 0.07, durationTurns: 3, applyTo: "SELF" }] },
        // Lv3 回復量 7%→10%
        { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "REGEN", healRate: 0.1, durationTurns: 3, applyTo: "SELF" }] },
        // Lv4 回復量 10%→12%
        { cooldownTurns: 5, effects: [{ kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "SELF" }, { kind: "REGEN", healRate: 0.12, durationTurns: 3, applyTo: "SELF" }] },
        // Lv5 クールタイム -1(5→4ターン) / 強化の持続 3→4ターン / 継続回復の持続 3→4ターン / 回復量 12%→15%
        { cooldownTurns: 4, effects: [{ kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 4, applyTo: "SELF" }, { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 4, applyTo: "SELF" }, { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 4, applyTo: "SELF" }, { kind: "REGEN", healRate: 0.15, durationTurns: 4, applyTo: "SELF" }] },
      ],
    },
  ],
  lightSkill3: {
    id: "thunderbeast_s3_light",
    name: "雷の本能",
    description: "パッシブ。クリダメ+25%・速度+20。攻撃スキルのクリティカル時、対象の行動ゲージを15%吸収(1スキルにつき1回)",
    target: "SELF",
    cooldownTurns: 0,
    effects: [],
    passive: {
      trigger: "SELF_ATTACK_SKILL",
      levels: [
        { kind: "THUNDER_INSTINCT", critDmg: 0.25, spd: 20, drain: 0.15 },
        { kind: "THUNDER_INSTINCT", critDmg: 0.3, spd: 25, drain: 0.15 },
        { kind: "THUNDER_INSTINCT", critDmg: 0.35, spd: 30, drain: 0.2 },
        { kind: "THUNDER_INSTINCT", critDmg: 0.4, spd: 35, drain: 0.2 },
        { kind: "THUNDER_INSTINCT", critDmg: 0.45, spd: 40, drain: 0.25 },
      ],
    },
  },
  darkSkill3: {
    id: "thunderbeast_s3_dark",
    name: "黒雷連獄",
    description: "ダメージ倍率 0.75倍 × 4回(自身の速度が高いほど上昇)。3回以上クリティカルしたらダメージ倍率 0.80倍(自身の速度が高いほど上昇)(防御力50%無視)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 6,
    effects: [
      { kind: "DAMAGE", multiplier: 0.75, hits: 4, scaleBonus: { stat: "spd", bonusAtReference: 0.45 } },
      { kind: "DAMAGE", multiplier: 0.8, scaleBonus: { stat: "spd", bonusAtReference: 0.45 }, ignoreDefenseRatio: 0.5, requires: "CRITS_AT_LEAST_3" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 0.75, hits: 4, scaleBonus: { stat: "spd", bonusAtReference: 0.45 } }, { kind: "DAMAGE", multiplier: 0.8, scaleBonus: { stat: "spd", bonusAtReference: 0.45 }, ignoreDefenseRatio: 0.5, requires: "CRITS_AT_LEAST_3" }] },
      // Lv2 ダメージ倍率 0.75倍→0.80倍 / ダメージ倍率 0.80倍→0.90倍
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 4, scaleBonus: { stat: "spd", bonusAtReference: 0.5 } }, { kind: "DAMAGE", multiplier: 0.9, scaleBonus: { stat: "spd", bonusAtReference: 0.5 }, ignoreDefenseRatio: 0.5, requires: "CRITS_AT_LEAST_3" }] },
      // Lv3 ダメージ倍率 0.80倍→0.85倍 / ダメージ倍率 0.90倍→1.00倍
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 0.85, hits: 4, scaleBonus: { stat: "spd", bonusAtReference: 0.55 } }, { kind: "DAMAGE", multiplier: 1, scaleBonus: { stat: "spd", bonusAtReference: 0.55 }, ignoreDefenseRatio: 0.6, requires: "CRITS_AT_LEAST_3" }] },
      // Lv4 ダメージ倍率 0.85倍→0.90倍 / ダメージ倍率 1.00倍→1.10倍
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 4, scaleBonus: { stat: "spd", bonusAtReference: 0.6 } }, { kind: "DAMAGE", multiplier: 1.1, scaleBonus: { stat: "spd", bonusAtReference: 0.6 }, ignoreDefenseRatio: 0.7, requires: "CRITS_AT_LEAST_3" }] },
      // Lv5 クールタイム -1(6→5ターン) / ダメージ倍率 1.10倍→1.20倍
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 4, scaleBonus: { stat: "spd", bonusAtReference: 0.65 } }, { kind: "DAMAGE", multiplier: 1.2, scaleBonus: { stat: "spd", bonusAtReference: 0.65 }, ignoreDefenseRatio: 0.8, requires: "CRITS_AT_LEAST_3" }] },
    ],
  },
};

/** 星4の追加4種 */
export const NEW_STAR4_TEMPLATES: MonsterTemplate[] = [BASILISK, MIMIC, VALKYRIA, THUNDERBEAST];
