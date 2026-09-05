import { MonsterTemplate } from "../../core/monster.js";
import {
  ATK_DOWN, ATK_UP, CRI_DMG_UP, CRI_RATE_UP, DEF_DOWN, DEF_UP, HEAL_BLOCK_HALF, POISON_RATE, SPD_DOWN, SPD_UP, passive,
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
      description: "敵単体に攻撃力1.3倍のダメージを与え、80%で2ターン防御力を50%低下させる。対象が速度低下状態なら行動ゲージをさらに25%減少させる。",
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
    description: "裁きの眼光が走り、敵全体の有利な効果を1個剥がし、行動ゲージを25%減少させ、80%で2ターン速度を低下させる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "STRIP", count: 1 },
      { kind: "GAUGE", amount: -0.25 },
      { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.8 },
    ],
  },
  darkSkill3: {
    id: "basilisk_s3_dark",
    name: "深淵の魔眼",
    description: "深淵を映す魔眼で敵単体に攻撃力2.0倍のダメージを与え、行動ゲージを70%減少させる。対象の弱体効果が3個以上なら1ターンスタンさせる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 6,
    effects: [
      { kind: "DAMAGE", multiplier: 2.0 },
      { kind: "GAUGE", amount: -0.7 },
      { kind: "STUN", durationTurns: 1, requires: "TARGET_DEBUFF_AT_LEAST_3" },
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
    description: "敵単体に攻撃力0.7倍のダメージを与える(最大HP×0.03を加算)。与えたダメージの20%を自身が回復する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.7, hpCoefficient: 0.03 },
      { kind: "LIFESTEAL", healRate: 0.2 },
    ],
  },
  skill2Variants: [
    {
      id: "mimic_s2_a",
      name: "がぶ飲み",
      description: "喰らいついて敵単体に攻撃力1.0倍のダメージを与える(最大HP×0.04を加算)。与えたダメージの40%を自身が回復し、自身のHPが50%以下ならさらに20%ぶん多く回復する。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.0, hpCoefficient: 0.04 },
        { kind: "LIFESTEAL", healRate: 0.4, selfLowHpExtra: { hpRatio: 0.5, extra: 0.2 } },
      ],
    },
    {
      id: "mimic_s2_b",
      name: "呪われた財宝",
      description: "呪いの財宝を押し付け、敵単体に攻撃力1.0倍のダメージを与える(最大HP×0.04を加算)。80%で2ターン回復封じを付与し、行動ゲージを25%減少させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.0, hpCoefficient: 0.04 },
        { kind: "HEAL_BLOCK", healMultiplier: HEAL_BLOCK_HALF, durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.25 },
      ],
    },
    {
      id: "mimic_s2_c",
      name: "誘い込む宝箱",
      description: "宝物のふりをして、1ターンのあいだ敵の単体攻撃の対象を自身に固定する。そのあいだ受けるダメージを15%軽減し、攻撃を受けるたび自身の行動ゲージが8%進む。",
      target: "SELF",
      cooldownTurns: 5,
      effects: [
        { kind: "STATUS", status: "FOCUS", durationTurns: 1, applyTo: "SELF" },
        { kind: "MITIGATE", amount: 0.15, durationTurns: 1, applyTo: "SELF" },
        { kind: "GAUGE_ON_HIT", amount: 0.08, durationTurns: 1, applyTo: "SELF" },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "mimic_s3_a",
      name: "貪欲な反撃",
      description: "2ターンのあいだ、攻撃を受けるたび攻撃者へ攻撃力0.60倍の反撃を返す(最大HP×0.02を加算)。使用時に自身のHPを最大HPの5%回復する。",
      target: "SELF",
      cooldownTurns: 5,
      effects: [
        { kind: "COUNTER_STANCE", durationTurns: 2, multiplier: 0.6, hpCoefficient: 0.02 },
        { kind: "HEAL", healRate: 0.05, applyTo: "SELF" },
      ],
    },
    {
      id: "mimic_s3_b",
      name: "食らいつく",
      description: "全身で食らいつき、敵単体に攻撃力1.4倍のダメージを与える(最大HP×0.05を加算)。自身が失ったHPの割合が高いほど最終ダメージが上昇する(最大40%)。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.4, hpCoefficient: 0.05, missingHpBonus: { perLostRatio: 0.4, maxBonus: 0.4 } },
      ],
    },
    {
      id: "mimic_s3_c",
      name: "偽りの財宝",
      description: "パッシブ。攻撃を受けた時に自身のHPを回復し、同時に60%で攻撃者の攻撃力を2ターン50%低下させる(敵1行動につき1回)。",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: passive("SELF_HIT", [
        { kind: "FALSE_TREASURE", heal: 0.04, chance: 0.6, atkDown: ATK_DOWN, duration: 2 },
        { kind: "FALSE_TREASURE", heal: 0.05, chance: 0.6, atkDown: ATK_DOWN, duration: 2 },
        { kind: "FALSE_TREASURE", heal: 0.06, chance: 0.6, atkDown: ATK_DOWN, duration: 2 },
        { kind: "FALSE_TREASURE", heal: 0.07, chance: 0.6, atkDown: ATK_DOWN, duration: 2 },
        { kind: "FALSE_TREASURE", heal: 0.10, chance: 0.6, atkDown: ATK_DOWN, duration: 2 },
      ]),
    },
  ],
  lightSkill3: {
    id: "mimic_s3_light",
    name: "聖なる宝箱",
    description: "聖なる光が箱から溢れ、味方全体に1ターン無敵を与える。この無敵はスキルレベルが最大でも1ターンのまま延びない。",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true },
    ],
  },
  darkSkill3: {
    id: "mimic_s3_dark",
    name: "強欲の魔箱",
    description: "強欲が形を成し、敵単体に攻撃力1.6倍のダメージを与える(最大HP×0.05を加算)。対象が弱体状態なら最終ダメージが25%上昇し、与えたダメージの50%を自身が回復する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 1.6, hpCoefficient: 0.05, conditionalBonus: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.25 }] },
      { kind: "LIFESTEAL", healRate: 0.5 },
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
    description: "敵単体に攻撃力0.9倍のダメージを与え、HP割合が最も低い味方の行動ゲージを8%進める。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.9 },
      { kind: "GAUGE", amount: 0.08, applyTo: "LOWEST_HP_ALLY" },
    ],
  },
  skill2Variants: [
    {
      id: "valkyria_s2_a",
      name: "守護の翼",
      description: "味方1体のHPを最大HPの25%回復し、弱体効果を1個解除して防御力を2ターン上昇させる。",
      target: "SINGLE_ALLY",
      cooldownTurns: 4,
      effects: [
        { kind: "HEAL", healRate: 0.25 },
        { kind: "CLEANSE", count: 1 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
      ],
    },
    {
      id: "valkyria_s2_b",
      name: "戦乙女の号令",
      description: "号令を上げ、味方全体の行動ゲージを20%進め、攻撃力を2ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "GAUGE", amount: 0.2 },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 },
      ],
    },
    {
      id: "valkyria_s2_c",
      name: "不屈の祝福",
      description: "味方1体に1ターンの我慢を与え、HPを最大HPの20%回復する。",
      target: "SINGLE_ALLY",
      cooldownTurns: 5,
      effects: [
        { kind: "STATUS", status: "ENDURE", durationTurns: 1 },
        { kind: "HEAL", healRate: 0.2 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "valkyria_s3_a",
      name: "天翼の加護",
      description: "翼を広げ、味方全体のHPを最大HPの20%回復し、弱体効果を1個解除して防御力を2ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "HEAL", healRate: 0.2 },
        { kind: "CLEANSE", count: 1 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
      ],
    },
    {
      id: "valkyria_s3_b",
      name: "勝利への進軍",
      description: "味方全体の行動ゲージを25%進め、速度を2ターン上昇させる。HPが50%以下の味方は行動ゲージがさらに10%進む。",
      target: "ALL_ALLIES",
      cooldownTurns: 6,
      effects: [
        { kind: "GAUGE", amount: 0.25, lowHpExtra: { hpRatio: 0.5, amount: 0.1 } },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 },
      ],
    },
    {
      id: "valkyria_s3_c",
      name: "戦乙女の誓い",
      description: "パッシブ。味方のHPが30%以下になった時、その味方に1ターン無敵を与え、自身の最大HPを基準に回復する(内部クールタイムあり)。無敵はスキルレベルが最大でも1ターンのまま。",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: passive("ALLY_HP_THRESHOLD", [
        { kind: "VALKYRIE_OATH", hpRatio: 0.3, heal: 0.20, internalCooldown: 5 },
        { kind: "VALKYRIE_OATH", hpRatio: 0.3, heal: 0.22, internalCooldown: 5 },
        { kind: "VALKYRIE_OATH", hpRatio: 0.3, heal: 0.25, internalCooldown: 5 },
        { kind: "VALKYRIE_OATH", hpRatio: 0.3, heal: 0.27, internalCooldown: 5 },
        { kind: "VALKYRIE_OATH", hpRatio: 0.3, heal: 0.30, internalCooldown: 4 },
      ]),
    },
  ],
  lightSkill3: {
    id: "valkyria_s3_light",
    name: "神聖なる翼",
    description: "神々しい翼が味方を包み、味方全体のHPを最大HPの25%回復し、弱体効果をすべて解除して1ターンの我慢を与える。",
    target: "ALL_ALLIES",
    cooldownTurns: 6,
    effects: [
      { kind: "HEAL", healRate: 0.25 },
      { kind: "CLEANSE" },
      { kind: "STATUS", status: "ENDURE", durationTurns: 1 },
    ],
  },
  darkSkill3: {
    id: "valkyria_s3_dark",
    name: "黒翼の戦歌",
    description: "黒い戦歌が響き、味方全体の行動ゲージを30%進め、クリ率とクリダメを2ターン上昇させる。HPが50%以下の味方は行動ゲージがさらに15%進む。",
    target: "ALL_ALLIES",
    cooldownTurns: 6,
    effects: [
      { kind: "GAUGE", amount: 0.3, lowHpExtra: { hpRatio: 0.5, amount: 0.15 } },
      { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 },
      { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 2 },
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
    description: "敵単体に攻撃力0.8倍のダメージを与える(自身の速度が高いほど上昇)。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.8, scaleBonus: { stat: "spd", bonusAtReference: 0.3 } }],
  },
  skill2Variants: [
    {
      id: "thunderbeast_s2_a",
      name: "雷光突進",
      description: "敵単体に攻撃力1.4倍のダメージを与える(自身の速度が高いほど上昇)。自身の行動ゲージを20%進める。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.4, scaleBonus: { stat: "spd", bonusAtReference: 0.35 } },
        { kind: "GAUGE", amount: 0.2, applyTo: "SELF" },
      ],
    },
    {
      id: "thunderbeast_s2_b",
      name: "連雷",
      description: "敵全体に攻撃力0.55倍のダメージを2回与える。一度でもクリティカルすれば自身の行動ゲージが25%進む。",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.55, hits: 2 },
        { kind: "GAUGE", amount: 0.25, applyTo: "SELF", requires: "ANY_CRIT" },
      ],
    },
    {
      id: "thunderbeast_s2_c",
      name: "雷鳴の爪",
      description: "敵単体に攻撃力1.25倍のダメージを与える(自身の速度が高いほど上昇)。80%で2ターン防御力を50%低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.25, scaleBonus: { stat: "spd", bonusAtReference: 0.35 } },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "thunderbeast_s3_a",
      name: "迅雷乱舞",
      description: "敵単体に攻撃力0.65倍のダメージを3回与える(自身の速度が高いほど上昇)。3撃のうち2撃以上がクリティカルなら自身の行動ゲージが40%進む。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 0.65, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } },
        { kind: "GAUGE", amount: 0.4, applyTo: "SELF", requires: "CRITS_AT_LEAST_2" },
      ],
    },
    {
      id: "thunderbeast_s3_b",
      name: "天雷の号令",
      description: "天から雷を呼び、味方全体の行動ゲージを20%進め、速度とクリ率を2ターン上昇させる。自身の行動ゲージはさらに20%進む。",
      target: "ALL_ALLIES",
      cooldownTurns: 6,
      effects: [
        { kind: "GAUGE", amount: 0.2 },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 },
        { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2 },
        { kind: "GAUGE", amount: 0.2, applyTo: "SELF" },
      ],
    },
    {
      id: "thunderbeast_s3_c",
      name: "雷獣覚醒",
      description: "雷を纏い、自身の速度とクリ率を3ターン上昇させる。発動と同時に自身の行動ゲージが40%進む。",
      target: "SELF",
      cooldownTurns: 5,
      effects: [
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3, applyTo: "SELF" },
        { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3, applyTo: "SELF" },
        { kind: "GAUGE", amount: 0.4, applyTo: "SELF" },
      ],
    },
  ],
  lightSkill3: {
    id: "thunderbeast_s3_light",
    name: "雷の本能",
    description: "パッシブ。クリダメと速度が常に上がり、攻撃スキルでクリティカルが出た時に対象の行動ゲージを吸収する(多段でも1スキルにつき1回)。",
    target: "SELF",
    cooldownTurns: 0,
    effects: [],
    passive: passive("SELF_ATTACK_SKILL", [
      { kind: "THUNDER_INSTINCT", critDmg: 0.22, spd: 17, drain: 0.11 },
      { kind: "THUNDER_INSTINCT", critDmg: 0.24, spd: 19, drain: 0.12 },
      { kind: "THUNDER_INSTINCT", critDmg: 0.26, spd: 21, drain: 0.13 },
      { kind: "THUNDER_INSTINCT", critDmg: 0.28, spd: 23, drain: 0.14 },
      { kind: "THUNDER_INSTINCT", critDmg: 0.30, spd: 25, drain: 0.15 },
    ]),
  },
  darkSkill3: {
    id: "thunderbeast_s3_dark",
    name: "黒雷連獄",
    description: "黒い雷が檻となり、敵単体に攻撃力0.7倍のダメージを4回与える(自身の速度が高いほど上昇)。クリティカルが3撃以上なら、防御力を50%無視する追撃を放つ。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 6,
    effects: [
      { kind: "DAMAGE", multiplier: 0.7, hits: 4, scaleBonus: { stat: "spd", bonusAtReference: 0.4 } },
      { kind: "DAMAGE", multiplier: 0.7, scaleBonus: { stat: "spd", bonusAtReference: 0.4 }, ignoreDefenseRatio: 0.5, requires: "CRITS_AT_LEAST_3" },
    ],
  },
};

/** 星4の追加4種 */
export const NEW_STAR4_TEMPLATES: MonsterTemplate[] = [BASILISK, MIMIC, VALKYRIA, THUNDERBEAST];
