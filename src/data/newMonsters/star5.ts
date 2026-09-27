import { MonsterTemplate } from "../../core/monster.js";
import { ATK_DOWN, DEF_DOWN, POISON_RATE, passive } from "./shared.js";
import { described } from "../collabMonsters/shared.js";

/*
 * 星5の4種。
 *
 * 星5は**戦い方そのものを変える**層。数字を積み増すのではなく、
 * 「強化を奪う」「倒すたびに動く」「クールタイムを操る」「HPが減るほど硬くなる」と、
 * 盤面の決まりごとを1つずつ書き換える形にしてある。
 *
 * ただし星3が要らなくなる作りにはしない(docs/design-concept.md)。
 * どれも**噛み合う相手がいて初めて回る**ようにしてある。
 */

/**
 * アビスリーパー。**相手の支えを剥がして、自分の力に変える。**
 *
 * 敵専用の古代の呪晶しか持っていなかった「強化解除」と「回復阻害」を、
 * プレイヤー側へ渡す1体。試練の塔の「癒やしの階」「守りの階」に
 * 答えが無かった穴を、ここで埋める。
 */
export const ABYSSREAPER: MonsterTemplate = {
  templateId: "abyssreaper",
  baseName: "アビスリーパー",
  role: "デバッファー",
  emoji: "🌑",
  gachaStar: 5,
  baseStats: { hp: 1280, atk: 145, def: 78, spd: 112, criRate: 0.18, criDmg: 1.6, resistance: 0.16, accuracy: 0.28 },
  skill1: {
    id: "abyssreaper_s1",
    name: "魂刈り",
    description: "敵単体に攻撃力1.0倍のダメージを与え、60%で有利な効果を1個剥がす。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.0 },
      { kind: "STRIP", chance: 0.6, count: 1 },
    ],
  },
  skill2Variants: [
    {
      id: "abyssreaper_s2_a",
      name: "魂の略奪",
      description: "敵単体に攻撃力1.5倍のダメージを与え、有利な効果を最大2個剥がす。剥がした効果1個につき自身の行動ゲージが15%進む。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5 },
        { kind: "STRIP", count: 2, selfGaugePerRemoved: 0.15 },
      ],
    },
    {
      id: "abyssreaper_s2_b",
      name: "死神の鎖",
      description: "鎖で縛り、有利な効果を1個剥がしてから敵単体に攻撃力1.4倍のダメージを与える。80%で2ターン防御力を75%低下させ、行動ゲージを40%減少させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "STRIP", count: 1 },
        { kind: "DAMAGE", multiplier: 1.4 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.4 },
      ],
    },
    {
      id: "abyssreaper_s2_c",
      name: "冥府の契約",
      description: "敵単体の有利な効果を1個奪って自身に付与し、対象の行動ゲージを30%減少させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "STEAL_BUFF", count: 1 },
        { kind: "GAUGE", amount: -0.3 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "abyssreaper_s3_a",
      name: "魂喰らいの宴",
      description: "ダメージ倍率 1.30倍。80%で有利な効果を3個解除(解除できた相手1体につき自身の行動ゲージ+10%)",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "STRIP", chance: 0.8, count: 3, selfGaugePerTarget: 0.1 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "STRIP", chance: 0.8, count: 3, selfGaugePerTarget: 0.1 }] },
        // Lv2 ダメージ倍率 1.30倍→1.40倍 / 強化解除の発動率 80%→90%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "STRIP", chance: 0.9, count: 3, selfGaugePerTarget: 0.1 }] },
        // Lv3 ダメージ倍率 1.40倍→1.50倍 / 解除できた相手1体ごとの自身の行動ゲージ 10%→15%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "STRIP", chance: 0.9, count: 3, selfGaugePerTarget: 0.15 }] },
        // Lv4 ダメージ倍率 1.50倍→1.60倍 / 強化解除の発動率 90%→100%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.6 }, { kind: "STRIP", chance: 1, count: 3, selfGaugePerTarget: 0.15 }] },
        // Lv5 クールタイム -1(5→4ターン) / 解除できた相手1体ごとの自身の行動ゲージ 15%→20%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.6 }, { kind: "STRIP", chance: 1, count: 3, selfGaugePerTarget: 0.2 }] },
      ],
    },
    {
      id: "abyssreaper_s3_b",
      name: "死の宣告",
      description: "ダメージ倍率 2.30倍 対象の強化効果1個につき最終ダメージ+15%(最大+100%)。有利な効果(シールド・無効・能力上昇)を解除",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.3, buffCountBonus: { perBuff: 0.15, maxBonus: 1 } },
        { kind: "STRIP" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.3, buffCountBonus: { perBuff: 0.15, maxBonus: 1 } }, { kind: "STRIP" }] },
        // Lv2 ダメージ倍率 2.30倍→2.60倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.6, buffCountBonus: { perBuff: 0.15, maxBonus: 1 } }, { kind: "STRIP" }] },
        // Lv3 ダメージ倍率 2.60倍→2.90倍 / 強化1個あたりの最終ダメージ 15%→20%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.9, buffCountBonus: { perBuff: 0.2, maxBonus: 1 } }, { kind: "STRIP" }] },
        // Lv4 ダメージ倍率 2.90倍→3.20倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.2, buffCountBonus: { perBuff: 0.2, maxBonus: 1 } }, { kind: "STRIP" }] },
        // Lv5 クールタイム -1(5→4ターン) / ダメージ倍率 3.20倍→3.50倍 / 強化1個あたりの最終ダメージ 20%→25%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 3.5, buffCountBonus: { perBuff: 0.25, maxBonus: 1 } }, { kind: "STRIP" }] },
      ],
    },
    {
      id: "abyssreaper_s3_c",
      name: "死神の収穫",
      description: "パッシブ。攻撃スキル使用時、50%で対象に1ターンの強化阻害と回復阻害。成功時、自身のHPを最大HPの10%回復し行動ゲージ+15%(多段技は対象に当たった回数だけ判定)",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: {
        trigger: "SELF_ATTACK_SKILL",
        levels: [
          { kind: "REAPER_HARVEST", chance: 0.5, heal: 0.1, gauge: 0.15 },
          { kind: "REAPER_HARVEST", chance: 0.6, heal: 0.1, gauge: 0.2 },
          { kind: "REAPER_HARVEST", chance: 0.7, heal: 0.15, gauge: 0.2 },
          { kind: "REAPER_HARVEST", chance: 0.8, heal: 0.15, gauge: 0.25 },
          { kind: "REAPER_HARVEST", chance: 1, heal: 0.2, gauge: 0.3 },
        ],
      },
    },
  ],
  lightSkill3: {
    id: "abyssreaper_s3_light",
    name: "聖魂転生",
    description: "魂が巡り、敵全体にそれぞれ65%で有利な効果をすべて剥がす。味方全体の行動ゲージを25%進め、自身に3ターンの復活を得る。",
    target: "ALL_ENEMIES",
    cooldownTurns: 6,
    effects: [
      { kind: "STRIP", chance: 0.65 },
      { kind: "GAUGE", amount: 0.25, applyTo: "ALLIES" },
      { kind: "STATUS", status: "REVIVE", durationTurns: 3, applyTo: "SELF" },
    ],
  },
  darkSkill3: {
    id: "abyssreaper_s3_dark",
    name: "アビス・ドミネーション",
    description: "敵単体の有利な効果を最大3個奪ってから攻撃力2.2倍のダメージを与える。奪った1個につき最終ダメージが15%上昇する(最大45%)。行動ゲージを50%減少させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 6,
    effects: [
      { kind: "STEAL_BUFF", count: 3 },
      { kind: "DAMAGE", multiplier: 2.2, stolenBuffBonus: { perBuff: 0.15, maxBonus: 0.45 } },
      { kind: "GAUGE", amount: -0.5 },
    ],
  },
  skillAssignment: {
    FIRE: { skill2: 0, skill3: 1 },
    GRASS: { skill2: 2, skill3: 2 },
    ELECTRIC: { skill2: 1, skill3: 0 },
    WATER: { skill2: 0, skill3: 2 },
    LIGHT: { skill2: 2 },
    DARK: { skill2: 1 },
  },
};

/**
 * フェンリル。**倒せば、また動ける。**
 *
 * 追加ターンに回数制限が無いので、削り役が揃っているほど伸びる。
 * 単体では2連撃を刻むだけの狼だが、**編成が噛み合った時だけ手番が連なる。**
 * 協力攻撃は味方のスキル1をそのまま呼ぶので、誰と組むかで中身が変わる。
 */
export const FENRIR: MonsterTemplate = {
  templateId: "fenrir",
  baseName: "フェンリル",
  role: "アタッカー",
  emoji: "🐺",
  gachaStar: 5,
  baseStats: { hp: 1180, atk: 165, def: 68, spd: 116, criRate: 0.2, criDmg: 1.65, resistance: 0.1, accuracy: 0.14 },
  skill1: {
    id: "fenrir_s1",
    name: "狩狼牙",
    description: "ダメージ倍率 0.65倍。40%で防御力-75% (2ターン)。ダメージ倍率 0.65倍。40%で防御力-75% (2ターン)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.65 },
      { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.4 },
      { kind: "DAMAGE", multiplier: 0.65 },
      { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.4 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.65 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.4 }, { kind: "DAMAGE", multiplier: 0.65 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.4 }] },
      // Lv2 ダメージ倍率 0.65倍→0.70倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.7 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.4 }, { kind: "DAMAGE", multiplier: 0.7 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.4 }] },
      // Lv3 ダメージ倍率 0.70倍→0.75倍 / 弱体の発動率 40%→50%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.75 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.5 }, { kind: "DAMAGE", multiplier: 0.75 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.5 }] },
      // Lv4 ダメージ倍率 0.75倍→0.80倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.8 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.5 }, { kind: "DAMAGE", multiplier: 0.8 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.5 }] },
      // Lv5 ダメージ倍率 0.80倍→0.85倍 / 弱体の持続 2→3ターン / 弱体の発動率 50%→60%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.85 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.6 }, { kind: "DAMAGE", multiplier: 0.85 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 0.6 }] },
    ],
  },
  skill2Variants: [
    {
      id: "fenrir_s2_a",
      name: "裂牙連撃",
      description: "ダメージ倍率 0.70倍 × 2回。ダメージ倍率 0.80倍(防御力無視)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.7, hits: 2 },
        { kind: "DAMAGE", multiplier: 0.8, ignoreDefense: true },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.7, hits: 2 }, { kind: "DAMAGE", multiplier: 0.8, ignoreDefense: true }] },
        // Lv2 ダメージ倍率 0.70倍→0.75倍 / ダメージ倍率 0.80倍→0.90倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.75, hits: 2 }, { kind: "DAMAGE", multiplier: 0.9, ignoreDefense: true }] },
        // Lv3 ダメージ倍率 0.75倍→0.80倍 / ダメージ倍率 0.90倍→1.00倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 2 }, { kind: "DAMAGE", multiplier: 1, ignoreDefense: true }] },
        // Lv4 ダメージ倍率 0.80倍→0.90倍 / ダメージ倍率 1.00倍→1.10倍
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 2 }, { kind: "DAMAGE", multiplier: 1.1, ignoreDefense: true }] },
        // Lv5 クールタイム -1(4→3ターン) / ダメージ倍率 1.10倍→1.20倍
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 2 }, { kind: "DAMAGE", multiplier: 1.2, ignoreDefense: true }] },
      ],
    },
    /*
     * 狩猟本能。**Lv2・3で協力攻撃のダメージ、Lv4・5でクールタイム。**
     *
     * 元は Lv5 のCT-1しか伸びず、Lv2〜4が「変化なし」だった(依頼主の指摘)。
     * CT短縮は重いので大体Lv5に置く決まりだが、この技は殴る量が味方のスキル1に
     * 縛られていて素の強さが控えめなので、依頼主の指定で Lv4・Lv5 の2段に置く。
     */
    described({
      id: "fenrir_s2_b",
      name: "狩猟本能",
      description: "",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "COOP_ATTACK", allies: 2, allyCooldownReduce: 1, damageMultiplier: 1 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "COOP_ATTACK", allies: 2, allyCooldownReduce: 1, damageMultiplier: 1 }] },
        // Lv2 協力攻撃のダメージ 1.00倍→1.10倍
        { cooldownTurns: 5, effects: [{ kind: "COOP_ATTACK", allies: 2, allyCooldownReduce: 1, damageMultiplier: 1.1 }] },
        // Lv3 協力攻撃のダメージ 1.10倍→1.20倍
        { cooldownTurns: 5, effects: [{ kind: "COOP_ATTACK", allies: 2, allyCooldownReduce: 1, damageMultiplier: 1.2 }] },
        // Lv4 クールタイム -1(5→4ターン) / 協力攻撃のダメージ 1.20倍→1.30倍
        { cooldownTurns: 4, effects: [{ kind: "COOP_ATTACK", allies: 2, allyCooldownReduce: 1, damageMultiplier: 1.3 }] },
        // Lv5 クールタイム -1(4→3ターン) / 協力攻撃のダメージ 1.30倍→1.40倍
        { cooldownTurns: 3, effects: [{ kind: "COOP_ATTACK", allies: 2, allyCooldownReduce: 1, damageMultiplier: 1.4 }] },
      ],
    }, "【対象】敵単体。フェンリル自身が先頭でスキル1を使い、続いて攻撃力の高い味方2体が加わる。フェンリル自身のクールタイムは短縮されない"),
    {
      id: "fenrir_s2_c",
      name: "喉笛裂き",
      description: "ダメージ倍率 1.50倍。80%で防御力-75% (2ターン)。対象のHPが50%以下なら自身の行動ゲージ+50%",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: 0.5, applyTo: "SELF", requires: "TARGET_HP_BELOW_50" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }, { kind: "GAUGE", amount: 0.5, applyTo: "SELF", requires: "TARGET_HP_BELOW_50" }] },
        // Lv2 ダメージ倍率 1.50倍→1.70倍 / 弱体の発動率 80%→90% / 行動ゲージ 50%→55%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: 0.55, applyTo: "SELF", requires: "TARGET_HP_BELOW_50" }] },
        // Lv3 ダメージ倍率 1.70倍→1.90倍 / 行動ゲージ 55%→60%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.9 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: 0.6, applyTo: "SELF", requires: "TARGET_HP_BELOW_50" }] },
        // Lv4 ダメージ倍率 1.90倍→2.10倍 / 弱体の発動率 90%→100% / 行動ゲージ 60%→70%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 2.1 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 1 }, { kind: "GAUGE", amount: 0.7, applyTo: "SELF", requires: "TARGET_HP_BELOW_50" }] },
        // Lv5 クールタイム -1(4→3ターン) / ダメージ倍率 2.10倍→2.30倍 / 弱体の持続 2→3ターン / 行動ゲージ 70%→80%
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 2.3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 1 }, { kind: "GAUGE", amount: 0.8, applyTo: "SELF", requires: "TARGET_HP_BELOW_50" }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "fenrir_s3_a",
      name: "月下連牙",
      description: "ダメージ倍率 0.65倍 × 4回 対象HP50%以下で最終ダメージ+20% 各ヒットのクリティカルで自身の行動ゲージ+10%",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 0.65, hits: 4, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.2 }], gaugeOnCritPerHit: 0.1 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.65, hits: 4, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.2 }], gaugeOnCritPerHit: 0.1 }] },
        // Lv2 ダメージ倍率 0.65倍→0.70倍
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.7, hits: 4, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.2 }], gaugeOnCritPerHit: 0.1 }] },
        // Lv3 ダメージ倍率 0.70倍→0.75倍 / 対象HP50%以下の最終ダメージ 20%→25%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.75, hits: 4, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.25 }], gaugeOnCritPerHit: 0.1 }] },
        // Lv4 ダメージ倍率 0.75倍→0.80倍 / 会心1回ごとの行動ゲージ 10%→15%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 4, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.25 }], gaugeOnCritPerHit: 0.15 }] },
        // Lv5 クールタイム -1(5→4ターン) / ダメージ倍率 0.80倍→0.85倍 / 対象HP50%以下の最終ダメージ 25%→30%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 0.85, hits: 4, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }], gaugeOnCritPerHit: 0.15 }] },
      ],
    },
    {
      id: "fenrir_s3_b",
      name: "血の追跡",
      description: "ダメージ倍率 3.00倍。80%で治癒阻害 (2ターン、回復を受けられない)。80%で毒2スタック (1スタックにつき最大HPの5%、最大5スタック、2ターン)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 3 },
        { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.8 },
        { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.8, stacks: 2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.8 }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.8, stacks: 2 }] },
        // Lv2 ダメージ倍率 3.00倍→3.30倍 / 治癒阻害の発動率 80%→90% / 毒1スタック 5%→5.5% / 毒の発動率 80%→90%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.3 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.9 }, { kind: "POISON", damageRatePerStack: 0.055, durationTurns: 2, chance: 0.9, stacks: 2 }] },
        // Lv3 ダメージ倍率 3.30倍→3.60倍 / 毒1スタック 5.5%→6%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.6 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.9 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 2, chance: 0.9, stacks: 2 }] },
        // Lv4 ダメージ倍率 3.60倍→4.00倍 / 治癒阻害の発動率 90%→100% / 毒の発動率 90%→100%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4 }, { kind: "HEAL_BLOCK", durationTurns: 2, chance: 1 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 2, chance: 1, stacks: 2 }] },
        // Lv5 クールタイム -1(5→4ターン) / 治癒阻害の持続 2→3ターン / 毒の持続 2→3ターン
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 4 }, { kind: "HEAL_BLOCK", durationTurns: 3, chance: 1 }, { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 3, chance: 1, stacks: 2 }] },
      ],
    },
    {
      id: "fenrir_s3_c",
      name: "群狼の本能",
      /*
       * クリダメは 20%から最大50%(依頼主の指定)。元は 4%〜10% で、
       * 追加ターンの条件(倒すこと)を満たす力が足りなかった。
       * スキル1の再使用は全段50%で固定し、レベルで伸びるのはクリダメだけにする
       */
      description: "パッシブ。クリダメ+20%。敵を倒すと追加ターンを得る。スキル1を使った後、50%でもう一度スキル1を使う",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: {
        trigger: "SELF_KILL",
        levels: [
          { kind: "PACK_INSTINCT", critDmg: 0.2, repeatS1Chance: 0.5 },
          { kind: "PACK_INSTINCT", critDmg: 0.3, repeatS1Chance: 0.5 },
          { kind: "PACK_INSTINCT", critDmg: 0.4, repeatS1Chance: 0.5 },
          { kind: "PACK_INSTINCT", critDmg: 0.5, repeatS1Chance: 0.5 },
          { kind: "PACK_INSTINCT", critDmg: 0.6, repeatS1Chance: 0.6 },
        ],
      },
    },
  ],
  lightSkill3: {
    id: "fenrir_s3_light",
    name: "白狼の咆哮",
    description: "ダメージ倍率 1.50倍。70%でスタン (1ターン)。70%で敵の全スキルのクールタイムを1ターン延長。行動ゲージ-20%",
    target: "ALL_ENEMIES",
    cooldownTurns: 6,
    effects: [
      { kind: "DAMAGE", multiplier: 1.5 },
      { kind: "STUN", durationTurns: 1, chance: 0.7 },
      { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.7 },
      { kind: "GAUGE", amount: -0.2 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "STUN", durationTurns: 1, chance: 0.7 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.7 }, { kind: "GAUGE", amount: -0.2 }] },
      // Lv2 ダメージ倍率 1.50倍→1.70倍 / スタンの発動率 70%→80% / CT延長の発動率 70%→75%
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "STUN", durationTurns: 1, chance: 0.8 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.75 }, { kind: "GAUGE", amount: -0.2 }] },
      // Lv3 ダメージ倍率 1.70倍→1.90倍 / CT延長の発動率 75%→80% / 行動ゲージ -20%→-25%
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.9 }, { kind: "STUN", durationTurns: 1, chance: 0.8 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.8 }, { kind: "GAUGE", amount: -0.25 }] },
      // Lv4 ダメージ倍率 1.90倍→2.10倍 / スタンの発動率 80%→90% / CT延長の発動率 80%→85% / 行動ゲージ -25%→-30%
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 2.1 }, { kind: "STUN", durationTurns: 1, chance: 0.9 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.85 }, { kind: "GAUGE", amount: -0.3 }] },
      // Lv5 クールタイム -1(6→5ターン) / スタンの発動率 90%→100% / CT延長の発動率 85%→100% / 行動ゲージ -30%→-35%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 2.1 }, { kind: "STUN", durationTurns: 1, chance: 1 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 1 }, { kind: "GAUGE", amount: -0.35 }] },
    ],
  },
  darkSkill3: {
    id: "fenrir_s3_dark",
    name: "終焉の牙",
    description: "ダメージ倍率 0.75倍 × 5回 対象HP30%以下で最終ダメージ+30% 対象HP50%以下で防御力40%無視。相手を倒したら自身の行動ゲージ+100%",
    target: "SINGLE_ENEMY",
    cooldownTurns: 6,
    effects: [
      { kind: "DAMAGE", multiplier: 0.75, hits: 5, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.4 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.3 }] },
      { kind: "GAUGE", amount: 1, applyTo: "SELF", requires: "KILLED_TARGET" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 0.75, hits: 5, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.4 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.3 }] }, { kind: "GAUGE", amount: 1, applyTo: "SELF", requires: "KILLED_TARGET" }] },
      // Lv2 ダメージ倍率 0.75倍→0.80倍 / 対象HP50%以下の防御無視 40%→50%
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 0.8, hits: 5, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.5 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.3 }] }, { kind: "GAUGE", amount: 1.1, applyTo: "SELF", requires: "KILLED_TARGET" }] },
      // Lv3 ダメージ倍率 0.80倍→0.85倍 / 対象HP50%以下の防御無視 50%→60% / 対象HP30%以下の最終ダメージ 30%→40%
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 0.85, hits: 5, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.6 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.4 }] }, { kind: "GAUGE", amount: 1.15, applyTo: "SELF", requires: "KILLED_TARGET" }] },
      // Lv4 ダメージ倍率 0.85倍→0.90倍 / 対象HP50%以下の防御無視 60%→70%
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 5, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.7 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.4 }] }, { kind: "GAUGE", amount: 1.2, applyTo: "SELF", requires: "KILLED_TARGET" }] },
      // Lv5 クールタイム -1(6→5ターン) / ダメージ倍率 0.90倍→1.00倍 / 対象HP50%以下の防御無視 70%→80% / 対象HP30%以下の最終ダメージ 40%→50%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1, hits: 5, targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.8 }], targetHpBonus: [{ hpRatio: 0.3, bonus: 0.5 }] }, { kind: "GAUGE", amount: 1.2, applyTo: "SELF", requires: "KILLED_TARGET" }] },
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
 * クロノス。**手番の順番そのものを設計する。**
 *
 * ゲージとクールタイムの両方を動かせる唯一の1体。
 * 味方の必殺技を早く回し、相手の必殺技を遠ざける。
 * 闇の「時の管理者」だけはパッシブで、常時効果と引き換えに1枠を差し出す。
 */
export const CHRONOS: MonsterTemplate = {
  templateId: "chronos",
  baseName: "クロノス",
  role: "サポート",
  emoji: "⏳",
  gachaStar: 5,
  baseStats: { hp: 1260, atk: 92, def: 84, spd: 118, criRate: 0.15, criDmg: 1.5, resistance: 0.22, accuracy: 0.26 },
  skill1: {
    id: "chronos_s1",
    name: "時針の一撃",
    description: "ダメージ倍率 0.90倍。行動ゲージ-20%",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.9 },
      { kind: "GAUGE", amount: -0.2 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.9 }, { kind: "GAUGE", amount: -0.2 }] },
      // Lv2 ダメージ倍率 0.90倍→1.00倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1 }, { kind: "GAUGE", amount: -0.2 }] },
      // Lv3 ダメージ倍率 1.00倍→1.10倍 / 行動ゲージ -20%→-25%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "GAUGE", amount: -0.25 }] },
      // Lv4 ダメージ倍率 1.10倍→1.20倍
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "GAUGE", amount: -0.25 }] },
      // Lv5 ダメージ倍率 1.20倍→1.30倍 / 行動ゲージ -25%→-30%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "GAUGE", amount: -0.3 }] },
    ],
  },
  skill2Variants: [
    {
      id: "chronos_s2_a",
      name: "時間加速",
      description: "行動ゲージ+50%。全スキルのクールタイムを1ターン短縮",
      target: "SINGLE_ALLY",
      cooldownTurns: 5,
      effects: [
        { kind: "GAUGE", amount: 0.5 },
        { kind: "COOLDOWN_REDUCE", turns: 1 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.5 }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
        // Lv2 行動ゲージ 50%→60%
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.6 }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
        // Lv3 行動ゲージ 60%→70%
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.7 }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
        // Lv4 行動ゲージ 70%→80%
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.8 }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
        // Lv5 クールタイム -1(5→4ターン) / 行動ゲージ 80%→100%
        { cooldownTurns: 4, effects: [{ kind: "GAUGE", amount: 1 }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
      ],
    },
    {
      id: "chronos_s2_b",
      name: "時間停止",
      description: "ダメージ倍率 1.10倍。80%でスタン (1ターン)。行動ゲージ-50%",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.1 },
        { kind: "STUN", durationTurns: 1, chance: 0.8 },
        { kind: "GAUGE", amount: -0.5 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "STUN", durationTurns: 1, chance: 0.8 }, { kind: "GAUGE", amount: -0.5 }] },
        // Lv2 ダメージ倍率 1.10倍→1.20倍 / スタンの発動率 80%→90% / 行動ゲージ -50%→-60%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "STUN", durationTurns: 1, chance: 0.9 }, { kind: "GAUGE", amount: -0.6 }] },
        // Lv3 ダメージ倍率 1.20倍→1.30倍 / 行動ゲージ -60%→-70%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "STUN", durationTurns: 1, chance: 0.9 }, { kind: "GAUGE", amount: -0.7 }] },
        // Lv4 ダメージ倍率 1.30倍→1.40倍 / スタンの発動率 90%→100% / 行動ゲージ -70%→-80%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "STUN", durationTurns: 1, chance: 1 }, { kind: "GAUGE", amount: -0.8 }] },
        // Lv5 クールタイム -1(5→4ターン) / ダメージ倍率 1.40倍→1.50倍 / 行動ゲージ -80%→-100%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "STUN", durationTurns: 1, chance: 1 }, { kind: "GAUGE", amount: -1 }] },
      ],
    },
    {
      id: "chronos_s2_c",
      name: "時の逆流",
      description: "回復 最大HPの30.0%。デバフを解除。全スキルのクールタイムを1ターン短縮",
      target: "SINGLE_ALLY",
      cooldownTurns: 5,
      effects: [
        { kind: "HEAL", healRate: 0.3 },
        { kind: "CLEANSE" },
        { kind: "COOLDOWN_REDUCE", turns: 1 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.3 }, { kind: "CLEANSE" }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
        // Lv2 回復量 30%→35%
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.35 }, { kind: "CLEANSE" }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
        // Lv3 回復量 35%→40%
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.4 }, { kind: "CLEANSE" }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
        // Lv4 回復量 40%→45%
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.45 }, { kind: "CLEANSE" }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
        // Lv5 クールタイム -1(5→4ターン) / 回復量 45%→50% / ターン数 1→2ターン
        { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.5 }, { kind: "CLEANSE" }, { kind: "COOLDOWN_REDUCE", turns: 2 }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "chronos_s3_a",
      name: "クロノブースト",
      description: "行動ゲージ+30%。全スキルのクールタイムを1ターン短縮",
      target: "ALL_ALLIES",
      cooldownTurns: 6,
      effects: [
        { kind: "GAUGE", amount: 0.3 },
        { kind: "COOLDOWN_REDUCE", turns: 1 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.3 }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
        // Lv2 行動ゲージ 30%→35%
        { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.35 }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
        // Lv3 行動ゲージ 35%→40%
        { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.4 }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
        // Lv4 行動ゲージ 40%→45%
        { cooldownTurns: 6, effects: [{ kind: "GAUGE", amount: 0.45 }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
        // Lv5 クールタイム -1(6→5ターン) / 行動ゲージ 45%→50%
        { cooldownTurns: 5, effects: [{ kind: "GAUGE", amount: 0.5 }, { kind: "COOLDOWN_REDUCE", turns: 1 }] },
      ],
    },
    {
      id: "chronos_s3_b",
      name: "時空崩壊",
      description: "ダメージ倍率 1.10倍。70%で行動ゲージ-100%。20%でスタン (1ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 1.1 },
        { kind: "GAUGE", amount: -1, chance: 0.7 },
        { kind: "STUN", durationTurns: 1, chance: 0.2 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "GAUGE", amount: -1, chance: 0.7 }, { kind: "STUN", durationTurns: 1, chance: 0.2 }] },
        // Lv2 ダメージ倍率 1.10倍→1.20倍 / 行動ゲージの発動率 70%→80% / スタンの発動率 20%→25%
        { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "GAUGE", amount: -1.1, chance: 0.8 }, { kind: "STUN", durationTurns: 1, chance: 0.25 }] },
        // Lv3 ダメージ倍率 1.20倍→1.30倍 / 行動ゲージの発動率 80%→85%
        { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "GAUGE", amount: -1.15, chance: 0.85 }, { kind: "STUN", durationTurns: 1, chance: 0.25 }] },
        // Lv4 ダメージ倍率 1.30倍→1.40倍 / 行動ゲージの発動率 85%→90% / スタンの発動率 25%→30%
        { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "GAUGE", amount: -1.2, chance: 0.9 }, { kind: "STUN", durationTurns: 1, chance: 0.3 }] },
        // Lv5 クールタイム -1(6→5ターン) / ダメージ倍率 1.40倍→1.50倍 / 行動ゲージの発動率 90%→100%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "GAUGE", amount: -1.2, chance: 1 }, { kind: "STUN", durationTurns: 1, chance: 0.3 }] },
      ],
    },
    {
      id: "chronos_s3_c",
      name: "終焉時計",
      description: "ダメージ倍率 1.30倍。80%で敵の全スキルのクールタイムを1ターン延長。行動ゲージ-50%。対象の行動ゲージが20%以下なら100%でスタン (1ターン)",
      target: "ALL_ENEMIES",
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.8 },
        { kind: "GAUGE", amount: -0.5 },
        { kind: "STUN", durationTurns: 1, chance: 1, requires: "TARGET_GAUGE_BELOW_20" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.3 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.8 }, { kind: "GAUGE", amount: -0.5 }, { kind: "STUN", durationTurns: 1, chance: 1, requires: "TARGET_GAUGE_BELOW_20" }] },
        // Lv2 ダメージ倍率 1.30倍→1.40倍 / CT延長の発動率 80%→90% / 行動ゲージ -50%→-55%
        { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.4 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.9 }, { kind: "GAUGE", amount: -0.55 }, { kind: "STUN", durationTurns: 1, chance: 1, requires: "TARGET_GAUGE_BELOW_20" }] },
        // Lv3 ダメージ倍率 1.40倍→1.50倍 / 行動ゲージ -55%→-60%
        { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.9 }, { kind: "GAUGE", amount: -0.6 }, { kind: "STUN", durationTurns: 1, chance: 1, requires: "TARGET_GAUGE_BELOW_20" }] },
        // Lv4 ダメージ倍率 1.50倍→1.60倍 / CT延長の発動率 90%→100% / 行動ゲージ -60%→-65%
        { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.6 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 1 }, { kind: "GAUGE", amount: -0.65 }, { kind: "STUN", durationTurns: 1, chance: 1, requires: "TARGET_GAUGE_BELOW_20" }] },
        // Lv5 クールタイム -1(6→5ターン) / 行動ゲージ -65%→-70%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.6 }, { kind: "COOLDOWN_EXTEND", turns: 1, chance: 1 }, { kind: "GAUGE", amount: -0.7 }, { kind: "STUN", durationTurns: 1, chance: 1, requires: "TARGET_GAUGE_BELOW_20" }] },
      ],
    },
  ],
  lightSkill3: {
    id: "chronos_s3_light",
    name: "永久機関",
    description: "行動ゲージ+30%。全スキルのクールタイムを2ターン短縮。無敵 (1ターン)",
    target: "ALL_ALLIES",
    cooldownTurns: 8,
    effects: [
      { kind: "GAUGE", amount: 0.3 },
      { kind: "COOLDOWN_REDUCE", turns: 2 },
      { kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true, applyTo: "LOWEST_HP_ALLY" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 8, effects: [{ kind: "GAUGE", amount: 0.3 }, { kind: "COOLDOWN_REDUCE", turns: 2 }, { kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true, applyTo: "LOWEST_HP_ALLY" }] },
      // Lv2 行動ゲージ 30%→35%
      { cooldownTurns: 8, effects: [{ kind: "GAUGE", amount: 0.35 }, { kind: "COOLDOWN_REDUCE", turns: 2 }, { kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true, applyTo: "LOWEST_HP_ALLY" }] },
      // Lv3 行動ゲージ 35%→40%
      { cooldownTurns: 8, effects: [{ kind: "GAUGE", amount: 0.4 }, { kind: "COOLDOWN_REDUCE", turns: 2 }, { kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true, applyTo: "LOWEST_HP_ALLY" }] },
      // Lv4 行動ゲージ 40%→45%
      { cooldownTurns: 8, effects: [{ kind: "GAUGE", amount: 0.45 }, { kind: "COOLDOWN_REDUCE", turns: 2 }, { kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true, applyTo: "LOWEST_HP_ALLY" }] },
      // Lv5 クールタイム -1(8→7ターン) / 行動ゲージ 45%→50%
      { cooldownTurns: 7, effects: [{ kind: "GAUGE", amount: 0.5 }, { kind: "COOLDOWN_REDUCE", turns: 2 }, { kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true, applyTo: "LOWEST_HP_ALLY" }] },
    ],
  },
  darkSkill3: {
    id: "chronos_s3_dark",
    name: "時の管理者",
    description: "パッシブ。味方が行動するたび自身の行動ゲージ+10%。自身の攻撃スキルに行動ゲージ10%吸収と20%のスタンが乗る(1スキルにつき1回)",
    target: "SELF",
    cooldownTurns: 0,
    effects: [],
    passive: {
      trigger: "ALLY_ACTED",
      levels: [
        { kind: "TIME_KEEPER", allyGauge: 0.1, drain: 0.1, stunChance: 0.2 },
        { kind: "TIME_KEEPER", allyGauge: 0.1, drain: 0.15, stunChance: 0.25 },
        { kind: "TIME_KEEPER", allyGauge: 0.15, drain: 0.15, stunChance: 0.3 },
        { kind: "TIME_KEEPER", allyGauge: 0.15, drain: 0.2, stunChance: 0.35 },
        { kind: "TIME_KEEPER", allyGauge: 0.2, drain: 0.2, stunChance: 0.4 },
      ],
    },
  },
};

/**
 * ベヒモス。**追い詰められるほど硬く、重くなる。**
 *
 * HPでダメージを出すタンク。パッシブ「古代巨獣」は
 * **HPが減るほど被ダメージが減り、HP比例ダメージが増える。**
 * 削られた状態が不利ではなくなるので、耐久編成の芯になる。
 */
export const BEHEMOTH: MonsterTemplate = {
  templateId: "behemoth",
  baseName: "ベヒモス",
  role: "タンク",
  emoji: "🦣",
  gachaStar: 5,
  baseStats: { hp: 1850, atk: 105, def: 92, spd: 88, criRate: 0.15, criDmg: 1.5, resistance: 0.24, accuracy: 0.16 },
  skill1: {
    id: "behemoth_s1",
    name: "巨獣の一撃",
    description: "ダメージ倍率 0.55倍(最大HPの8%を加算)。50%で挑発 (2ターン)",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.55, hpCoefficient: 0.08 },
      { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.5 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.55, hpCoefficient: 0.08 }, { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.5 }] },
      // Lv2 ダメージ倍率 0.55倍→0.60倍 / 発動率 50%→55%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.6, hpCoefficient: 0.08 }, { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.55 }] },
      // Lv3 ダメージ倍率 0.60倍→0.65倍 / 最大HP比例 8%→9% / 発動率 55%→60%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.65, hpCoefficient: 0.09 }, { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.6 }] },
      // Lv4 ダメージ倍率 0.65倍→0.70倍 / 発動率 60%→65%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.7, hpCoefficient: 0.09 }, { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.65 }] },
      // Lv5 ダメージ倍率 0.70倍→0.75倍 / 最大HP比例 9%→10% / 持続 2→3ターン / 発動率 65%→70%
      { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.75, hpCoefficient: 0.1 }, { kind: "STATUS", status: "TAUNT", durationTurns: 3, chance: 0.7 }] },
    ],
  },
  skill2Variants: [
    {
      id: "behemoth_s2_a",
      name: "大地踏み",
      description: "ダメージ倍率 0.80倍(最大HPの12%を加算)。70%で攻撃力-50% (2ターン)。行動ゲージ-30%",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 0.8, hpCoefficient: 0.12 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.7, durationTurns: 2 },
        { kind: "GAUGE", amount: -0.3 },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.8, hpCoefficient: 0.12 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.7, durationTurns: 2 }, { kind: "GAUGE", amount: -0.3 }] },
        // Lv2 ダメージ倍率 0.80倍→0.85倍 / 最大HP比例 12%→13% / 弱体の発動率 70%→75% / 行動ゲージ -30%→-35%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.85, hpCoefficient: 0.13 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.75, durationTurns: 2 }, { kind: "GAUGE", amount: -0.35 }] },
        // Lv3 ダメージ倍率 0.85倍→0.90倍 / 弱体の発動率 75%→80%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.9, hpCoefficient: 0.13 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.8, durationTurns: 2 }, { kind: "GAUGE", amount: -0.35 }] },
        // Lv4 ダメージ倍率 0.90倍→0.95倍 / 最大HP比例 13%→14% / 弱体の発動率 80%→85% / 行動ゲージ -35%→-40%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 0.95, hpCoefficient: 0.14 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.85, durationTurns: 2 }, { kind: "GAUGE", amount: -0.4 }] },
        // Lv5 クールタイム -1(5→4ターン) / ダメージ倍率 0.95倍→1.00倍 / 最大HP比例 14%→15% / 弱体の発動率 85%→90% / 弱体の持続 2→3ターン
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1, hpCoefficient: 0.15 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, chance: 0.9, durationTurns: 3 }, { kind: "GAUGE", amount: -0.4 }] },
      ],
    },
    {
      id: "behemoth_s2_b",
      name: "巨体の圧力",
      description: "ダメージ倍率 1.30倍(最大HPの20%を加算)。行動ゲージ-40% (対象のHP割合が自身より高いならさらに20%)",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3, hpCoefficient: 0.2 },
        { kind: "GAUGE", amount: -0.4, conditionalExtra: { when: "TARGET_HP_ABOVE_SELF", amount: -0.2 } },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.3, hpCoefficient: 0.2 }, { kind: "GAUGE", amount: -0.4, conditionalExtra: { when: "TARGET_HP_ABOVE_SELF", amount: -0.2 } }] },
        // Lv2 ダメージ倍率 1.30倍→1.40倍 / 最大HP比例 20%→21% / 行動ゲージ -40%→-45%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.4, hpCoefficient: 0.21 }, { kind: "GAUGE", amount: -0.45, conditionalExtra: { when: "TARGET_HP_ABOVE_SELF", amount: -0.2 } }] },
        // Lv3 ダメージ倍率 1.40倍→1.50倍 / 最大HP比例 21%→22%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.5, hpCoefficient: 0.22 }, { kind: "GAUGE", amount: -0.45, conditionalExtra: { when: "TARGET_HP_ABOVE_SELF", amount: -0.2 } }] },
        // Lv4 ダメージ倍率 1.50倍→1.60倍 / 最大HP比例 22%→23% / 行動ゲージ -45%→-50%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.6, hpCoefficient: 0.23 }, { kind: "GAUGE", amount: -0.5, conditionalExtra: { when: "TARGET_HP_ABOVE_SELF", amount: -0.2 } }] },
        // Lv5 クールタイム -1(5→4ターン) / ダメージ倍率 1.60倍→1.70倍 / 最大HP比例 23%→25%
        { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.7, hpCoefficient: 0.25 }, { kind: "GAUGE", amount: -0.5, conditionalExtra: { when: "TARGET_HP_ABOVE_SELF", amount: -0.2 } }] },
      ],
    },
    {
      id: "behemoth_s2_c",
      name: "巨獣の守り",
      description: "シールド 自身の最大HPの15% (2ターン、ダメージを肩代わり)。自身に反射 (2ターン)",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "SHIELD", shieldRate: 0.15, durationTurns: 2, fromSourceHp: true },
        { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.15, durationTurns: 2, fromSourceHp: true }, { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" }] },
        // Lv2 シールド量 15%→16%
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.16, durationTurns: 2, fromSourceHp: true }, { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" }] },
        // Lv3 シールド量 16%→17%
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.17, durationTurns: 2, fromSourceHp: true }, { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" }] },
        // Lv4 シールド量 17%→18%
        { cooldownTurns: 5, effects: [{ kind: "SHIELD", shieldRate: 0.18, durationTurns: 2, fromSourceHp: true }, { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" }] },
        // Lv5 クールタイム -1(5→4ターン) / シールド量 18%→20% / シールドの持続 2→3ターン / 持続 2→3ターン
        { cooldownTurns: 4, effects: [{ kind: "SHIELD", shieldRate: 0.2, durationTurns: 3, fromSourceHp: true }, { kind: "STATUS", status: "REFLECT", durationTurns: 3, applyTo: "SELF" }] },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "behemoth_s3_a",
      name: "天地崩壊",
      description: "ダメージ倍率 1.20倍(最大HPの15%を加算)。80%で防御力-75% (2ターン)。自身のHPが50%以上なら行動ゲージ-20%",
      target: "ALL_ENEMIES",
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2, hpCoefficient: 0.15 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.2, requires: "SELF_HP_ABOVE_50" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.2, hpCoefficient: 0.15 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 }, { kind: "GAUGE", amount: -0.2, requires: "SELF_HP_ABOVE_50" }] },
        // Lv2 ダメージ倍率 1.20倍→1.30倍 / 最大HP比例 15%→16% / 弱体の発動率 80%→85% / 行動ゲージ -20%→-25%
        { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.3, hpCoefficient: 0.16 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 }, { kind: "GAUGE", amount: -0.25, requires: "SELF_HP_ABOVE_50" }] },
        // Lv3 ダメージ倍率 1.30倍→1.35倍 / 弱体の発動率 85%→90%
        { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.35, hpCoefficient: 0.16 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.25, requires: "SELF_HP_ABOVE_50" }] },
        // Lv4 ダメージ倍率 1.35倍→1.45倍 / 最大HP比例 16%→17% / 弱体の発動率 90%→95%
        { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.45, hpCoefficient: 0.17 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.95 }, { kind: "GAUGE", amount: -0.25, requires: "SELF_HP_ABOVE_50" }] },
        // Lv5 クールタイム -1(6→5ターン) / ダメージ倍率 1.45倍→1.50倍 / 最大HP比例 17%→18% / 弱体の持続 2→3ターン / 弱体の発動率 95%→100% / 行動ゲージ -25%→-30%
        { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.5, hpCoefficient: 0.18 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 3, chance: 1 }, { kind: "GAUGE", amount: -0.3, requires: "SELF_HP_ABOVE_50" }] },
      ],
    },
    {
      id: "behemoth_s3_b",
      name: "不落の巨体",
      description: "自身を回復 最大HPの35.0%。自身のデバフを解除。自身の受けるダメージ-25% (2ターン)(挑発状態の敵からはさらに15%軽減)",
      target: "SELF",
      cooldownTurns: 6,
      effects: [
        { kind: "HEAL", healRate: 0.35, applyTo: "SELF" },
        { kind: "CLEANSE", applyTo: "SELF" },
        { kind: "MITIGATE", amount: 0.25, durationTurns: 2, vsTauntedExtra: 0.15, applyTo: "SELF" },
      ],
      levelOverrides: [
        // Lv1
        { cooldownTurns: 6, effects: [{ kind: "HEAL", healRate: 0.35, applyTo: "SELF" }, { kind: "CLEANSE", applyTo: "SELF" }, { kind: "MITIGATE", amount: 0.25, durationTurns: 2, vsTauntedExtra: 0.15, applyTo: "SELF" }] },
        // Lv2 回復量 35%→38%
        { cooldownTurns: 6, effects: [{ kind: "HEAL", healRate: 0.38, applyTo: "SELF" }, { kind: "CLEANSE", applyTo: "SELF" }, { kind: "MITIGATE", amount: 0.25, durationTurns: 2, vsTauntedExtra: 0.15, applyTo: "SELF" }] },
        // Lv3 回復量 38%→40%
        { cooldownTurns: 6, effects: [{ kind: "HEAL", healRate: 0.4, applyTo: "SELF" }, { kind: "CLEANSE", applyTo: "SELF" }, { kind: "MITIGATE", amount: 0.25, durationTurns: 2, vsTauntedExtra: 0.15, applyTo: "SELF" }] },
        // Lv4 回復量 40%→42%
        { cooldownTurns: 6, effects: [{ kind: "HEAL", healRate: 0.42, applyTo: "SELF" }, { kind: "CLEANSE", applyTo: "SELF" }, { kind: "MITIGATE", amount: 0.25, durationTurns: 2, vsTauntedExtra: 0.15, applyTo: "SELF" }] },
        // Lv5 クールタイム -1(6→5ターン) / 回復量 42%→45% / 被ダメージ軽減の持続 2→3ターン
        { cooldownTurns: 5, effects: [{ kind: "HEAL", healRate: 0.45, applyTo: "SELF" }, { kind: "CLEANSE", applyTo: "SELF" }, { kind: "MITIGATE", amount: 0.25, durationTurns: 3, vsTauntedExtra: 0.15, applyTo: "SELF" }] },
      ],
    },
    {
      id: "behemoth_s3_c",
      name: "古代巨獣",
      description: "パッシブ。HPが減るほど受けるダメージが減り、最大HP比例のダメージが増える。段階は重複しない。",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: passive("ALWAYS", [
        { kind: "ANCIENT_BEHEMOTH", tiers: [
          { hpRatio: 0.7, damageTaken: 0.04, hpDamageUp: 0.04 },
          { hpRatio: 0.4, damageTaken: 0.08, hpDamageUp: 0.08 },
          { hpRatio: 0.2, damageTaken: 0.12, hpDamageUp: 0.12 },
        ] },
        { kind: "ANCIENT_BEHEMOTH", tiers: [
          { hpRatio: 0.7, damageTaken: 0.05, hpDamageUp: 0.05 },
          { hpRatio: 0.4, damageTaken: 0.10, hpDamageUp: 0.10 },
          { hpRatio: 0.2, damageTaken: 0.15, hpDamageUp: 0.15 },
        ] },
        { kind: "ANCIENT_BEHEMOTH", tiers: [
          { hpRatio: 0.7, damageTaken: 0.07, hpDamageUp: 0.07 },
          { hpRatio: 0.4, damageTaken: 0.14, hpDamageUp: 0.14 },
          { hpRatio: 0.2, damageTaken: 0.21, hpDamageUp: 0.21 },
        ] },
        { kind: "ANCIENT_BEHEMOTH", tiers: [
          { hpRatio: 0.7, damageTaken: 0.085, hpDamageUp: 0.085 },
          { hpRatio: 0.4, damageTaken: 0.17, hpDamageUp: 0.17 },
          { hpRatio: 0.2, damageTaken: 0.255, hpDamageUp: 0.255 },
        ] },
        { kind: "ANCIENT_BEHEMOTH", tiers: [
          { hpRatio: 0.7, damageTaken: 0.10, hpDamageUp: 0.10 },
          { hpRatio: 0.4, damageTaken: 0.20, hpDamageUp: 0.20 },
          { hpRatio: 0.2, damageTaken: 0.30, hpDamageUp: 0.30 },
        ] },
      ]),
    },
  ],
  lightSkill3: {
    id: "behemoth_s3_light",
    name: "神獣の城壁",
    description: "シールド 自身の最大HPの25% (2ターン、ダメージを肩代わり)。デバフを1個解除。我慢 (1ターン)",
    target: "ALL_ALLIES",
    cooldownTurns: 7,
    effects: [
      { kind: "SHIELD", shieldRate: 0.25, durationTurns: 2, fromSourceHp: true },
      { kind: "CLEANSE", count: 1 },
      { kind: "STATUS", status: "ENDURE", durationTurns: 1 },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 7, effects: [{ kind: "SHIELD", shieldRate: 0.25, durationTurns: 2, fromSourceHp: true }, { kind: "CLEANSE", count: 1 }, { kind: "STATUS", status: "ENDURE", durationTurns: 1 }] },
      // Lv2 シールド量 25%→27%
      { cooldownTurns: 7, effects: [{ kind: "SHIELD", shieldRate: 0.27, durationTurns: 2, fromSourceHp: true }, { kind: "CLEANSE", count: 1 }, { kind: "STATUS", status: "ENDURE", durationTurns: 1 }] },
      // Lv3 シールド量 27%→28%
      { cooldownTurns: 7, effects: [{ kind: "SHIELD", shieldRate: 0.28, durationTurns: 2, fromSourceHp: true }, { kind: "CLEANSE", count: 1 }, { kind: "STATUS", status: "ENDURE", durationTurns: 1 }] },
      // Lv4 シールド量 28%→30%
      { cooldownTurns: 7, effects: [{ kind: "SHIELD", shieldRate: 0.3, durationTurns: 2, fromSourceHp: true }, { kind: "CLEANSE", count: 1 }, { kind: "STATUS", status: "ENDURE", durationTurns: 1 }] },
      // Lv5 クールタイム -1(7→6ターン) / シールド量 30%→32% / シールドの持続 2→3ターン / 持続 1→2ターン
      { cooldownTurns: 6, effects: [{ kind: "SHIELD", shieldRate: 0.32, durationTurns: 3, fromSourceHp: true }, { kind: "CLEANSE", count: 1 }, { kind: "STATUS", status: "ENDURE", durationTurns: 2 }] },
    ],
  },
  darkSkill3: {
    id: "behemoth_s3_dark",
    name: "滅界の咆哮",
    description: "ダメージ倍率 1.20倍(最大HPの15%を加算)。80%で挑発 (2ターン)。行動ゲージ-30%。自身に反射 (2ターン)",
    target: "ALL_ENEMIES",
    cooldownTurns: 6,
    effects: [
      { kind: "DAMAGE", multiplier: 1.2, hpCoefficient: 0.15 },
      { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.8 },
      { kind: "GAUGE", amount: -0.3 },
      { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" },
    ],
    levelOverrides: [
      // Lv1
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.2, hpCoefficient: 0.15 }, { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.8 }, { kind: "GAUGE", amount: -0.3 }, { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" }] },
      // Lv2 ダメージ倍率 1.20倍→1.30倍 / 最大HP比例 15%→16% / 発動率 80%→85% / 行動ゲージ -30%→-35%
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.3, hpCoefficient: 0.16 }, { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.85 }, { kind: "GAUGE", amount: -0.35 }, { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" }] },
      // Lv3 ダメージ倍率 1.30倍→1.35倍 / 発動率 85%→90%
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.35, hpCoefficient: 0.16 }, { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.9 }, { kind: "GAUGE", amount: -0.35 }, { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" }] },
      // Lv4 ダメージ倍率 1.35倍→1.45倍 / 最大HP比例 16%→17% / 発動率 90%→95% / 行動ゲージ -35%→-40%
      { cooldownTurns: 6, effects: [{ kind: "DAMAGE", multiplier: 1.45, hpCoefficient: 0.17 }, { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.95 }, { kind: "GAUGE", amount: -0.4 }, { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" }] },
      // Lv5 クールタイム -1(6→5ターン) / ダメージ倍率 1.45倍→1.50倍 / 最大HP比例 17%→18% / 持続 2→3ターン / 発動率 95%→100%
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 1.5, hpCoefficient: 0.18 }, { kind: "STATUS", status: "TAUNT", durationTurns: 3, chance: 1 }, { kind: "GAUGE", amount: -0.4 }, { kind: "STATUS", status: "REFLECT", durationTurns: 3, applyTo: "SELF" }] },
    ],
  },
  skillAssignment: {
    FIRE: { skill2: 1, skill3: 0 },
    GRASS: { skill2: 2, skill3: 2 },
    ELECTRIC: { skill2: 1, skill3: 1 },
    WATER: { skill2: 0, skill3: 2 },
    LIGHT: { skill2: 2 },
    DARK: { skill2: 0 },
  },
};

/** 星5の追加4種 */
export const NEW_STAR5_TEMPLATES: MonsterTemplate[] = [ABYSSREAPER, FENRIR, CHRONOS, BEHEMOTH];
