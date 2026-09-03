import { MonsterTemplate } from "../../core/monster.js";
import { ATK_DOWN, DEF_DOWN, HEAL_BLOCK_HALF, POISON_RATE, passive } from "./shared.js";

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
      description: "鎖で縛り、有利な効果を1個剥がしてから敵単体に攻撃力1.4倍のダメージを与える。80%で2ターン防御力を50%低下させ、行動ゲージを40%減少させる。",
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
      description: "敵全体に攻撃力1.15倍のダメージを与え、それぞれ75%で有利な効果を1個剥がす。成功した敵1体につき自身の行動ゲージが10%進む。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.15 },
        { kind: "STRIP", chance: 0.75, count: 1, selfGaugePerRemoved: 0.1 },
      ],
    },
    {
      id: "abyssreaper_s3_b",
      name: "死の宣告",
      description: "敵単体に攻撃力2.0倍のダメージを与える。対象の弱体効果1個につき最終ダメージが8%上昇する(最大40%)。対象に残っている有利な効果はすべて剥がす。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0, debuffDamageBonus: { perDebuff: 0.08, maxBonus: 0.4 } },
        { kind: "STRIP" },
      ],
    },
    {
      id: "abyssreaper_s3_c",
      name: "死神の収穫",
      description: "パッシブ。攻撃スキルを使うたび、対象に1ターンの強化不可と回復阻害を試みる。どちらかが成功すると自身のHPが回復し、行動ゲージが進む(多段でも1スキルにつき1回)。",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: passive("SELF_ATTACK_SKILL", [
        { kind: "REAPER_HARVEST", chance: 0.40, heal: 0.06, gauge: 0.12 },
        { kind: "REAPER_HARVEST", chance: 0.45, heal: 0.07, gauge: 0.14 },
        { kind: "REAPER_HARVEST", chance: 0.50, heal: 0.08, gauge: 0.16 },
        { kind: "REAPER_HARVEST", chance: 0.55, heal: 0.09, gauge: 0.18 },
        { kind: "REAPER_HARVEST", chance: 0.60, heal: 0.10, gauge: 0.20 },
      ]),
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
    description: "敵単体へ攻撃力0.55倍のダメージを与える牙を二度立てる。それぞれの攻撃ごとに35%で2ターン防御力を50%低下させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.55 },
      { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.35 },
      { kind: "DAMAGE", multiplier: 0.55 },
      { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.35 },
    ],
  },
  skill2Variants: [
    {
      id: "fenrir_s2_a",
      name: "裂牙連撃",
      description: "敵単体へ攻撃力0.6倍のダメージを二度浴びせたのち、防御力を完全に無視する3撃目を放つ。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.6, hits: 2 },
        { kind: "DAMAGE", multiplier: 0.6, ignoreDefense: true },
      ],
    },
    {
      id: "fenrir_s2_b",
      name: "狩猟本能",
      description: "遠吠えで味方2体を呼び、指定した敵へ全員がスキル1で協力攻撃を行う。参加した味方はクールタイムが1ターン短縮される(フェンリル自身は短縮されない)。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "COOP_ATTACK", allies: 2, allyCooldownReduce: 1 },
      ],
    },
    {
      id: "fenrir_s2_c",
      name: "喉笛裂き",
      description: "喉笛を狙い、敵単体に攻撃力1.35倍のダメージを与える。80%で2ターン防御力を50%低下させる。対象のHPが50%以下なら自身の行動ゲージが50%進む。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.35 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: 0.5, applyTo: "SELF", requires: "TARGET_HP_BELOW_50" },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "fenrir_s3_a",
      name: "月下連牙",
      description: "月光の下、敵単体に攻撃力0.55倍のダメージを4回与える。対象のHPが50%以下なら各ヒットの最終ダメージが15%上昇し、クリティカルが出るたび自身の行動ゲージが8%進む。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        {
          kind: "DAMAGE",
          multiplier: 0.55,
          hits: 4,
          targetHpBonus: [{ hpRatio: 0.5, bonus: 0.15 }],
          gaugeOnCritPerHit: 0.08,
        },
      ],
    },
    {
      id: "fenrir_s3_b",
      name: "血の追跡",
      description: "血の匂いを追い、敵単体に攻撃力2.8倍のダメージを与える。80%で2ターン回復封じを付与し、80%で2ターン毒(2スタック)を付与する。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.8 },
        { kind: "HEAL_BLOCK", healMultiplier: HEAL_BLOCK_HALF, durationTurns: 2, chance: 0.8 },
        { kind: "POISON", damageRatePerStack: POISON_RATE, durationTurns: 2, chance: 0.8, stacks: 2 },
      ],
    },
    {
      id: "fenrir_s3_c",
      name: "群狼の本能",
      description: "パッシブ。クリダメが常に上がり、敵を倒すたびに追加ターンを得る(回数の制限はない)。",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: passive("SELF_KILL", [
        { kind: "PACK_INSTINCT", critDmg: 0.04 },
        { kind: "PACK_INSTINCT", critDmg: 0.05 },
        { kind: "PACK_INSTINCT", critDmg: 0.06 },
        { kind: "PACK_INSTINCT", critDmg: 0.08 },
        { kind: "PACK_INSTINCT", critDmg: 0.10 },
      ]),
    },
  ],
  lightSkill3: {
    id: "fenrir_s3_light",
    name: "白狼の咆哮",
    description: "白い咆哮が響き、敵全体に攻撃力1.4倍のダメージを与える。70%で1ターンスタンさせ、70%で全スキルのクールタイムを1ターン延長し、行動ゲージを15%減少させる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 6,
    effects: [
      { kind: "DAMAGE", multiplier: 1.4 },
      { kind: "STUN", durationTurns: 1, chance: 0.7 },
      { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.7 },
      { kind: "GAUGE", amount: -0.15 },
    ],
  },
  darkSkill3: {
    id: "fenrir_s3_dark",
    name: "終焉の牙",
    description: "終焉の牙が敵単体へ攻撃力0.65倍のダメージを5回与える。対象のHPが50%以下なら防御力を30%無視し、30%以下ならさらに最終ダメージが25%上昇する。この攻撃で相手を倒すと自身の行動ゲージが100%まで進む。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 6,
    effects: [
      {
        kind: "DAMAGE",
        multiplier: 0.65,
        hits: 5,
        targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.3 }],
        targetHpBonus: [{ hpRatio: 0.3, bonus: 0.25 }],
      },
      { kind: "GAUGE", amount: 1.0, applyTo: "SELF", requires: "KILLED_TARGET" },
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
    description: "敵単体に攻撃力0.8倍のダメージを与え、行動ゲージを15%減少させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.8 },
      { kind: "GAUGE", amount: -0.15 },
    ],
  },
  skill2Variants: [
    {
      id: "chronos_s2_a",
      name: "時間加速",
      description: "味方1体の時を速め、行動ゲージを50%進め、その味方の全スキルのクールタイムを1ターン短縮する。",
      target: "SINGLE_ALLY",
      cooldownTurns: 5,
      effects: [
        { kind: "GAUGE", amount: 0.5 },
        { kind: "COOLDOWN_REDUCE", turns: 1 },
      ],
    },
    {
      id: "chronos_s2_b",
      name: "時間停止",
      description: "時を止め、敵単体に攻撃力1.0倍のダメージを与える。80%で1ターンスタンさせ、行動ゲージを50%減少させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.0 },
        { kind: "STUN", durationTurns: 1, chance: 0.8 },
        { kind: "GAUGE", amount: -0.5 },
      ],
    },
    {
      id: "chronos_s2_c",
      name: "時の逆流",
      description: "時を巻き戻し、味方1体のHPを最大HPの25%回復し、弱体効果をすべて解除して全スキルのクールタイムを1ターン短縮する。",
      target: "SINGLE_ALLY",
      cooldownTurns: 5,
      effects: [
        { kind: "HEAL", healRate: 0.25 },
        { kind: "CLEANSE" },
        { kind: "COOLDOWN_REDUCE", turns: 1 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "chronos_s3_a",
      name: "クロノブースト",
      description: "味方全体の行動ゲージを25%進め、全スキルのクールタイムを1ターン短縮する。",
      target: "ALL_ALLIES",
      cooldownTurns: 6,
      effects: [
        { kind: "GAUGE", amount: 0.25 },
        { kind: "COOLDOWN_REDUCE", turns: 1 },
      ],
    },
    {
      id: "chronos_s3_b",
      name: "時空崩壊",
      description: "時空が軋み、敵全体に攻撃力1.0倍のダメージを与える。70%で全スキルのクールタイムを1ターン延長し、行動ゲージを20%減少させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 1.0 },
        { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.7 },
        { kind: "GAUGE", amount: -0.2 },
      ],
    },
    {
      id: "chronos_s3_c",
      name: "終焉時計",
      description: "終わりの針が回り、敵全体に攻撃力1.2倍のダメージを与える。80%で全スキルのクールタイムを1ターン延長し、行動ゲージを50%減少させる。その処理のあと、行動ゲージが20%以下になっている敵を100%で1ターンスタンさせる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2 },
        { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.8 },
        { kind: "GAUGE", amount: -0.5 },
        { kind: "STUN", durationTurns: 1, chance: 1, requires: "TARGET_GAUGE_BELOW_20" },
      ],
    },
  ],
  lightSkill3: {
    id: "chronos_s3_light",
    name: "永久機関",
    description: "止まらぬ歯車が回り、味方全体の行動ゲージを30%進め、全スキルのクールタイムを2ターン短縮する。HP割合が最も低い味方に1ターン無敵を与える。この無敵はスキルレベルが最大でも1ターンのまま。",
    target: "ALL_ALLIES",
    cooldownTurns: 8,
    effects: [
      { kind: "GAUGE", amount: 0.3 },
      { kind: "COOLDOWN_REDUCE", turns: 2 },
      { kind: "STATUS", status: "INVINCIBLE", durationTurns: 1, fixedDuration: true, applyTo: "LOWEST_HP_ALLY" },
    ],
  },
  darkSkill3: {
    id: "chronos_s3_dark",
    name: "時の管理者",
    description: "パッシブ。味方が行動するたび自身の行動ゲージが進み、自身の攻撃スキルに行動ゲージ吸収とスタンが加わる(多段でも1スキルにつき1回)。",
    target: "SELF",
    cooldownTurns: 0,
    effects: [],
    passive: passive("ALLY_ACTED", [
      { kind: "TIME_KEEPER", allyGauge: 0.06, drain: 0.06, stunChance: 0.20 },
      { kind: "TIME_KEEPER", allyGauge: 0.07, drain: 0.07, stunChance: 0.22 },
      { kind: "TIME_KEEPER", allyGauge: 0.08, drain: 0.08, stunChance: 0.25 },
      { kind: "TIME_KEEPER", allyGauge: 0.09, drain: 0.09, stunChance: 0.27 },
      { kind: "TIME_KEEPER", allyGauge: 0.10, drain: 0.10, stunChance: 0.30 },
    ]),
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
    description: "敵単体に攻撃力0.55倍のダメージを与える(最大HP×0.03を加算)。50%で2ターン挑発する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.55, hpCoefficient: 0.03 },
      { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.5 },
    ],
  },
  skill2Variants: [
    {
      id: "behemoth_s2_a",
      name: "大地踏み",
      description: "大地を踏み鳴らし、敵全体に攻撃力0.8倍のダメージを与える(最大HP×0.04を加算)。70%で2ターン攻撃力を50%低下させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 0.8, hpCoefficient: 0.04 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 },
      ],
    },
    {
      id: "behemoth_s2_b",
      name: "巨体の圧力",
      description: "巨体で圧し掛かり、敵単体に攻撃力1.3倍のダメージを与える(最大HP×0.05を加算)。行動ゲージを40%減少させ、対象のHP割合が自身より高ければさらに20%減少させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3, hpCoefficient: 0.05 },
        { kind: "GAUGE", amount: -0.4, conditionalExtra: { when: "TARGET_HP_ABOVE_SELF", amount: -0.2 } },
      ],
    },
    {
      id: "behemoth_s2_c",
      name: "巨獣の守り",
      description: "味方全体に自身の最大HPの15%ぶんのシールドを2ターン張り、自身に2ターン反射を得る。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "SHIELD", shieldRate: 0.15, durationTurns: 2, fromSourceHp: true },
        { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "behemoth_s3_a",
      name: "天地崩壊",
      description: "天地が崩れ、敵全体に攻撃力1.2倍のダメージを与える(最大HP×0.05を加算)。80%で2ターン防御力を50%低下させる。自身のHPが50%以上なら敵全体の行動ゲージをさらに20%減少させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2, hpCoefficient: 0.05 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.2, requires: "SELF_HP_ABOVE_50" },
      ],
    },
    {
      id: "behemoth_s3_b",
      name: "不落の巨体",
      description: "自身のHPを最大HPの35%回復し、弱体効果をすべて解除する。2ターンのあいだ受けるダメージを25%軽減し、挑発状態の敵から受けるダメージはさらに15%軽減する。",
      target: "SELF",
      cooldownTurns: 6,
      effects: [
        { kind: "HEAL", healRate: 0.35, applyTo: "SELF" },
        { kind: "CLEANSE", applyTo: "SELF" },
        { kind: "MITIGATE", amount: 0.25, durationTurns: 2, vsTauntedExtra: 0.15, applyTo: "SELF" },
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
    description: "神獣の壁が立ち上がり、味方全体に自身の最大HPの25%ぶんのシールドを2ターン張る。弱体効果を1個解除し、1ターンの我慢を与える。",
    target: "ALL_ALLIES",
    cooldownTurns: 7,
    effects: [
      { kind: "SHIELD", shieldRate: 0.25, durationTurns: 2, fromSourceHp: true },
      { kind: "CLEANSE", count: 1 },
      { kind: "STATUS", status: "ENDURE", durationTurns: 1 },
    ],
  },
  darkSkill3: {
    id: "behemoth_s3_dark",
    name: "滅界の咆哮",
    description: "世界を砕く咆哮が響き、敵全体に攻撃力1.2倍のダメージを与える(最大HP×0.05を加算)。80%で2ターン挑発し、行動ゲージを30%減少させる。自身に2ターン反射を得る。",
    target: "ALL_ENEMIES",
    cooldownTurns: 6,
    effects: [
      { kind: "DAMAGE", multiplier: 1.2, hpCoefficient: 0.05 },
      { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.8 },
      { kind: "GAUGE", amount: -0.3 },
      { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" },
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
