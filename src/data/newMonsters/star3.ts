import { MonsterTemplate } from "../../core/monster.js";
import {
  ATK_DOWN, DEF_DOWN, DEF_UP, HEAL_BLOCK_HALF, POISON_RATE, SPD_DOWN, SPD_UP, passive,
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
    description: "敵単体に攻撃力0.9倍のダメージを与え、50%で2ターン毒(1スタック)を付与する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.9 },
      { kind: "POISON", damageRatePerStack: POISON_RATE, durationTurns: 2, chance: 0.5 },
    ],
  },
  skill2Variants: [
    {
      id: "mushroon_s2_a",
      name: "毒胞子の雨",
      description: "敵全体に攻撃力0.75倍のダメージを与え、60%で2ターン毒(1スタック)を付与する。",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.75 },
        { kind: "POISON", damageRatePerStack: POISON_RATE, durationTurns: 2, chance: 0.6 },
      ],
    },
    {
      id: "mushroon_s2_b",
      name: "衰弱胞子",
      description: "敵単体に攻撃力1.2倍のダメージを与え、75%で2ターン攻撃力を50%低下させ、75%で2ターン回復封じを付与する。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.75 },
        { kind: "HEAL_BLOCK", healMultiplier: HEAL_BLOCK_HALF, durationTurns: 2, chance: 0.75 },
      ],
    },
    {
      id: "mushroon_s2_c",
      name: "しびれ胞子",
      description: "敵単体に攻撃力1.1倍のダメージを与え、80%で2ターン速度を低下させ、行動ゲージを30%減少させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.1 },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.3 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "mushroon_s3_a",
      name: "毒床",
      description: "足元から胞子が噴き出し、敵全体に攻撃力0.9倍のダメージを与え、70%で3ターン毒(1スタック)を付与する。すでに毒状態の敵にはさらに1スタック重ねる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 0.9 },
        { kind: "POISON", damageRatePerStack: POISON_RATE, durationTurns: 3, chance: 0.7, extraStacksIfPoisoned: 1 },
      ],
    },
    {
      id: "mushroon_s3_b",
      name: "腐敗の胞子",
      description: "敵全体に攻撃力1.0倍のダメージを与え、70%で2ターン防御力を50%低下させる。弱体効果が付いている敵は行動ゲージが20%減少する。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.0 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.7 },
        { kind: "GAUGE", amount: -0.2, requires: "TARGET_HAS_DEBUFF" },
      ],
    },
    {
      id: "mushroon_s3_c",
      name: "菌糸支配",
      description: "パッシブ。敵が毒によるダメージを受けるたび、自身の行動ゲージが進む(敵1ターンにつき1回)。",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: passive("ENEMY_POISON_DAMAGE", [
        { kind: "GAUGE_ON_ENEMY_POISON", gauge: 0.05 },
        { kind: "GAUGE_ON_ENEMY_POISON", gauge: 0.06 },
        { kind: "GAUGE_ON_ENEMY_POISON", gauge: 0.07 },
        { kind: "GAUGE_ON_ENEMY_POISON", gauge: 0.08 },
        { kind: "GAUGE_ON_ENEMY_POISON", gauge: 0.10 },
      ]),
    },
  ],
  lightSkill3: {
    id: "mushroon_s3_light",
    name: "聖樹の胞子",
    description: "聖なる胞子が舞い、味方全体の弱体効果を1個解除し、味方全体のHPを最大HPの20%回復する。さらに敵全体に80%で2ターン攻撃力を50%低下させる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "CLEANSE", count: 1, applyTo: "ALLIES" },
      { kind: "HEAL", healRate: 0.2, applyTo: "ALLIES" },
      { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.8 },
    ],
  },
  darkSkill3: {
    id: "mushroon_s3_dark",
    name: "終末胞子",
    description: "敵全体に攻撃力1.15倍のダメージを与える。対象の弱体効果1個につき最終ダメージが6%上昇する(最大30%)。80%で2ターン毒(1スタック)を付与する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 1.15, debuffDamageBonus: { perDebuff: 0.06, maxBonus: 0.3 } },
      { kind: "POISON", damageRatePerStack: POISON_RATE, durationTurns: 2, chance: 0.8 },
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
    description: "甲羅ごと体当たりし、敵単体に攻撃力0.6倍のダメージを与える(自身の防御力が高いほど上昇)。50%で2ターン攻撃力を50%低下させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.6, defCoefficient: 0.5 },
      { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.5 },
    ],
  },
  skill2Variants: [
    {
      id: "shellturtle_s2_a",
      name: "かばう",
      description: "味方1体を2ターン保護し、その味方が受けるダメージの50%を自身が肩代わりする。自身の防御力を2ターン上昇させる。",
      target: "SINGLE_ALLY",
      cooldownTurns: 4,
      effects: [
        { kind: "PROTECT", share: 0.5, durationTurns: 2 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2, applyTo: "SELF" },
      ],
    },
    {
      id: "shellturtle_s2_b",
      name: "シェルバッシュ",
      description: "敵単体に攻撃力0.9倍のダメージを与える(自身の防御力が高いほど上昇)。80%で2ターン挑発し、行動ゲージを25%減少させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.9, defCoefficient: 0.75 },
        { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.25 },
      ],
    },
    {
      id: "shellturtle_s2_c",
      name: "甲羅再生",
      description: "甲羅に籠って自身のHPを最大HPの25%回復し、弱体効果を1個解除する。さらに2ターンのあいだ毎ターン最大HPの7%を継続回復する。",
      target: "SELF",
      cooldownTurns: 5,
      effects: [
        { kind: "HEAL", healRate: 0.25, applyTo: "SELF" },
        { kind: "CLEANSE", count: 1, applyTo: "SELF" },
        { kind: "REGEN", healRate: 0.07, durationTurns: 2, applyTo: "SELF" },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "shellturtle_s3_a",
      name: "守護陣",
      description: "味方全体が2ターンのあいだ受けるダメージを15%軽減する。自身の防御力を2ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "MITIGATE", amount: 0.15, durationTurns: 2 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2, applyTo: "SELF" },
      ],
    },
    {
      id: "shellturtle_s3_b",
      name: "大地震",
      description: "大地を揺らし、敵全体に攻撃力1.0倍のダメージを与える(自身の防御力が高いほど上昇)。70%で2ターン攻撃力を50%低下させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.0, defCoefficient: 0.75 },
        { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 },
      ],
    },
    {
      id: "shellturtle_s3_c",
      name: "最後の砦",
      description: "パッシブ。自身のHPが50%以下の間、防御力が上がり、受けるダメージが減る。",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: passive("ALWAYS", [
        { kind: "LAST_STAND", hpRatio: 0.5, defUp: 0.15, damageTaken: 0.08 },
        { kind: "LAST_STAND", hpRatio: 0.5, defUp: 0.18, damageTaken: 0.09 },
        { kind: "LAST_STAND", hpRatio: 0.5, defUp: 0.21, damageTaken: 0.10 },
        { kind: "LAST_STAND", hpRatio: 0.5, defUp: 0.25, damageTaken: 0.12 },
        { kind: "LAST_STAND", hpRatio: 0.5, defUp: 0.30, damageTaken: 0.15 },
      ]),
    },
  ],
  lightSkill3: {
    id: "shellturtle_s3_light",
    name: "聖なる大甲羅",
    description: "光る甲羅を掲げ、味方全体の弱体効果を1個解除し、防御力を2ターン上昇させる。さらに味方全体が受けるダメージを2ターン20%軽減する。",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "CLEANSE", count: 1 },
      { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
      { kind: "MITIGATE", amount: 0.2, durationTurns: 2 },
    ],
  },
  darkSkill3: {
    id: "shellturtle_s3_dark",
    name: "アビスシェル",
    description: "深淵の甲羅で押し潰し、敵単体に攻撃力1.6倍のダメージを与える(自身の防御力が高いほど上昇)。80%で2ターン防御力を50%低下させ、自身に2ターン反射を得る。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 1.6, defCoefficient: 1.0 },
      { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.8 },
      { kind: "STATUS", status: "REFLECT", durationTurns: 2, applyTo: "SELF" },
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
    description: "敵単体に攻撃力1.0倍のダメージを与える。対象のHPが50%以下なら最終ダメージが20%上昇する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.0, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.2 }] },
    ],
  },
  skill2Variants: [
    {
      id: "kobold_s2_a",
      name: "急所突き",
      description: "急所を狙い、敵単体に攻撃力1.9倍のダメージを与える。この攻撃は相手の防御力を25%無視する。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [{ kind: "DAMAGE", multiplier: 1.9, ignoreDefenseRatio: 0.25 }],
    },
    {
      id: "kobold_s2_b",
      name: "追い討ち",
      description: "敵単体に攻撃力1.35倍のダメージを与える。対象のHPが50%以下なら最終ダメージが33%上昇する。自身の行動ゲージを20%進める。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.35, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.33 }] },
        { kind: "GAUGE", amount: 0.2, applyTo: "SELF" },
      ],
    },
    {
      id: "kobold_s2_c",
      name: "足狩り",
      description: "足を狙い、敵単体に攻撃力1.25倍のダメージを与える。80%で2ターン速度を低下させ、行動ゲージを35%減少させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.25 },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.8 },
        { kind: "GAUGE", amount: -0.35 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "kobold_s3_a",
      name: "処刑の一撃",
      description: "敵単体に攻撃力2.3倍のダメージを与える。対象のHPが30%以下なら最終ダメージが40%上昇する。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [{ kind: "DAMAGE", multiplier: 2.3, targetHpBonus: [{ hpRatio: 0.3, bonus: 0.4 }] }],
    },
    {
      id: "kobold_s3_b",
      name: "狩りの連鎖",
      description: "敵単体に攻撃力1.8倍のダメージを与える。この攻撃で相手を倒したとき、自身の行動ゲージが50%進み、スキル2のクールタイムが1ターン短縮される。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8 },
        { kind: "GAUGE", amount: 0.5, applyTo: "SELF", requires: "KILLED_TARGET" },
        { kind: "COOLDOWN_REDUCE", turns: 1, applyTo: "SELF", slot: 1, requires: "KILLED_TARGET" },
      ],
    },
    {
      id: "kobold_s3_c",
      name: "獲物の匂い",
      description: "パッシブ。HPが50%以下の敵へ与える最終ダメージが上昇する。",
      target: "SELF",
      cooldownTurns: 0,
      effects: [],
      passive: passive("ALWAYS", [
        { kind: "SCENT_OF_PREY", hpRatio: 0.5, damageUp: 0.08 },
        { kind: "SCENT_OF_PREY", hpRatio: 0.5, damageUp: 0.10 },
        { kind: "SCENT_OF_PREY", hpRatio: 0.5, damageUp: 0.12 },
        { kind: "SCENT_OF_PREY", hpRatio: 0.5, damageUp: 0.15 },
        { kind: "SCENT_OF_PREY", hpRatio: 0.5, damageUp: 0.20 },
      ]),
    },
  ],
  lightSkill3: {
    id: "kobold_s3_light",
    name: "神速の号令",
    description: "号令を上げ、味方全体の行動ゲージを25%進め、速度を2ターン上昇させる。自身の行動ゲージはさらに20%進む。",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "GAUGE", amount: 0.25 },
      { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2, applyTo: "ALLIES" },
      { kind: "GAUGE", amount: 0.2, applyTo: "SELF" },
    ],
  },
  darkSkill3: {
    id: "kobold_s3_dark",
    name: "暗殺",
    description: "影から急所を突き、敵単体に攻撃力2.0倍のダメージを与える。対象のHPが50%以下なら防御力を50%無視し、30%以下ならさらに最終ダメージが25%上昇する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 5,
    effects: [
      {
        kind: "DAMAGE",
        multiplier: 2.0,
        targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 0.5 }],
        targetHpBonus: [{ hpRatio: 0.3, bonus: 0.25 }],
      },
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
