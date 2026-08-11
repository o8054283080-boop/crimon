import { MonsterTemplate, createAllVariants } from "../core/monster.js";

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
    criRate: 0.15,
    criDmg: 1.5,
    resistance: 0.15,
    accuracy: 0.1,
  },
  skill1: {
    id: "slime_s1",
    name: "たたく",
    description: "敵単体に攻撃力1.0倍のダメージを与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 1.0 }],
  },
  skill2Variants: [
    {
      id: "slime_s2_a",
      name: "エレメンタルバースト",
      description: "属性の力を込めて敵単体に攻撃力1.7倍のダメージを与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 1.7 }],
    },
    {
      id: "slime_s2_b",
      name: "どくづき",
      description: "敵単体に攻撃力1.4倍のダメージを与え、65%で攻撃力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.4 },
        { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.65 },
      ],
    },
    {
      id: "slime_s2_c",
      name: "ねばつく一撃",
      description: "敵単体に攻撃力1.3倍のダメージを与え、70%で素早さを低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "DEBUFF", stat: "spd", amount: 0.2, durationTurns: 2, chance: 0.7 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "slime_s3_a",
      name: "げんかいとっぱ",
      description: "限界を超えた力で敵全体に攻撃力1.3倍のダメージを与える。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [{ kind: "DAMAGE", multiplier: 1.3 }],
    },
    {
      id: "slime_s3_b",
      name: "スプラッシュウェイブ",
      description: "敵全体に攻撃力1.1倍のダメージを2回与える。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [{ kind: "DAMAGE", multiplier: 1.1, hits: 2 }],
    },
    {
      id: "slime_s3_c",
      name: "しんかい一撃",
      description: "敵単体に攻撃力2.0倍のダメージを与え、55%で防御力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0 },
        { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.55 },
      ],
    },
  ],
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
    criRate: 0.25,
    criDmg: 1.6,
    resistance: 0.1,
    accuracy: 0.15,
  },
  skill1: {
    id: "wolf_s1",
    name: "かみつく",
    description: "敵単体に攻撃力1.0倍のダメージを与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 1.0 }],
  },
  skill2Variants: [
    {
      id: "wolf_s2_a",
      name: "れんぞく斬り",
      description: "敵単体を2回攻撃(各0.8倍)し、60%で防御力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 2,
      effects: [
        { kind: "DAMAGE", multiplier: 0.8, hits: 2 },
        { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.6 },
      ],
    },
    {
      id: "wolf_s2_b",
      name: "いあつ",
      description: "敵単体に攻撃力1.0倍のダメージを与え、60%で攻撃力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 2,
      effects: [
        { kind: "DAMAGE", multiplier: 1.0 },
        { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.6 },
      ],
    },
    {
      id: "wolf_s2_c",
      name: "するどいツメ",
      description: "敵単体に攻撃力1.5倍のダメージを与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 2,
      effects: [{ kind: "DAMAGE", multiplier: 1.5 }],
    },
  ],
  skill3Variants: [
    {
      id: "wolf_s3_a",
      name: "全力の一撃",
      description: "渾身の一撃(2.2倍)を叩き込み、30%で相手をスタンさせる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 2.2 },
        { kind: "STUN", durationTurns: 1, chance: 0.3 },
      ],
    },
    {
      id: "wolf_s3_b",
      name: "れんげきづめ",
      description: "敵単体に攻撃力1.0倍のダメージを3回与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [{ kind: "DAMAGE", multiplier: 1.0, hits: 3 }],
    },
    {
      id: "wolf_s3_c",
      name: "はやての号令",
      description: "味方全体の行動ゲージを20%進め、防御力を2ターン大きく上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "GAUGE", amount: 0.2 },
        { kind: "BUFF", stat: "def", amount: 0.5, durationTurns: 2 },
      ],
    },
  ],
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
    criRate: 0.05,
    criDmg: 1.5,
    resistance: 0.35,
    accuracy: 0.1,
  },
  skill1: {
    id: "golem_s1",
    name: "たいあたり",
    description: "敵単体に攻撃力0.8倍のダメージを与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.8 }],
  },
  skill2Variants: [
    {
      id: "golem_s2_a",
      name: "がんせきふる",
      description: "巨岩を降らせ敵全体に攻撃力0.9倍のダメージを与える。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 0.9 }],
    },
    {
      id: "golem_s2_b",
      name: "たいあたりラッシュ",
      description: "敵全体に攻撃力0.6倍のダメージを2回与える。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 0.6, hits: 2 }],
    },
    {
      id: "golem_s2_c",
      name: "いわくだき",
      description: "敵単体に攻撃力1.3倍のダメージを与え、60%で防御力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.6 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "golem_s3_a",
      name: "てっぺき",
      description: "味方全体の防御力を大きく上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [{ kind: "BUFF", stat: "def", amount: 0.5, durationTurns: 3 }],
    },
    {
      id: "golem_s3_b",
      name: "ようがん噴出",
      description: "敵全体に攻撃力1.2倍のダメージを与える。",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [{ kind: "DAMAGE", multiplier: 1.2 }],
    },
    {
      id: "golem_s3_c",
      name: "きょじんのふんぬ",
      description: "味方全体の攻撃力を大きく上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [{ kind: "BUFF", stat: "atk", amount: 0.5, durationTurns: 3 }],
    },
  ],
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
    criRate: 0.1,
    criDmg: 1.5,
    resistance: 0.2,
    accuracy: 0.2,
  },
  skill1: {
    id: "fairy_s1",
    name: "ちいさな一撃",
    description: "敵単体に攻撃力1.2倍のダメージを与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 1.2 }],
  },
  skill2Variants: [
    {
      id: "fairy_s2_a",
      name: "いやしのかぜ",
      description: "味方全体のHPを最大HPの22%回復する。",
      target: "ALL_ALLIES",
      cooldownTurns: 3,
      effects: [{ kind: "HEAL", healRate: 0.22 }],
    },
    {
      id: "fairy_s2_b",
      name: "せいすいのしずく",
      description: "味方単体のHPを最大HPの32%回復する。",
      target: "SINGLE_ALLY",
      cooldownTurns: 3,
      effects: [{ kind: "HEAL", healRate: 0.32 }],
    },
    {
      id: "fairy_s2_c",
      name: "まもりの祈り",
      description: "味方全体のHPを最大HPの12%回復し、防御力を大きく上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 3,
      effects: [
        { kind: "HEAL", healRate: 0.12 },
        { kind: "BUFF", stat: "def", amount: 0.5, durationTurns: 1 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "fairy_s3_a",
      name: "せいれいの加護",
      description: "味方全体の攻撃力を大きく上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [{ kind: "BUFF", stat: "atk", amount: 0.5, durationTurns: 3 }],
    },
    {
      id: "fairy_s3_b",
      name: "だいちのめぐみ",
      description: "味方全体のHPを最大HPの35%回復する。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [{ kind: "HEAL", healRate: 0.35 }],
    },
    {
      id: "fairy_s3_c",
      name: "れいこんのもり",
      description: "味方全体のHPを最大HPの15%回復し、防御力を大きく上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "HEAL", healRate: 0.15 },
        { kind: "BUFF", stat: "def", amount: 0.5, durationTurns: 2 },
      ],
    },
  ],
};

export const MONSTER_TEMPLATES: MonsterTemplate[] = [SLIME, WOLF, GOLEM, FAIRY];

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
    criRate: 0.28,
    criDmg: 1.7,
    resistance: 0.15,
    accuracy: 0.15,
  },
  skill1: {
    id: "griffon_s1",
    name: "ついばみ",
    description: "敵単体に攻撃力1.1倍のダメージを与え、15%で1ターンスタンさせる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.1 },
      { kind: "STUN", durationTurns: 1, chance: 0.15 },
    ],
  },
  skill2Variants: [
    {
      id: "griffon_s2_a",
      name: "きりさく突風",
      description: "鋭い風の刃で敵単体に攻撃力2.0倍のダメージを与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 2.0 }],
    },
    {
      id: "griffon_s2_b",
      name: "はやてづき",
      description: "敵単体に攻撃力0.95倍のダメージを2回与える。自身の素早さが高いほど威力が上がる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 0.95, hits: 2, scaleBonus: { stat: "spd", ratePerPoint: 0.003 } }],
    },
    {
      id: "griffon_s2_c",
      name: "ダイブアタック",
      description: "急降下して敵単体に攻撃力1.7倍のダメージを与え、55%で防御力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.7 },
        { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.55 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "griffon_s3_a",
      name: "嵐の一撃",
      description: "渾身の一撃(2.8倍)を叩き込み、30%で相手をスタンさせる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.8 },
        { kind: "STUN", durationTurns: 1, chance: 0.3 },
      ],
    },
    {
      id: "griffon_s3_b",
      name: "せんぷうげき",
      description: "旋風を巻き起こし敵全体に攻撃力2.2倍のダメージを与える。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [{ kind: "DAMAGE", multiplier: 2.2 }],
    },
    {
      id: "griffon_s3_c",
      name: "猛禽の加護",
      description: "味方全体の攻撃力を大きく上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [{ kind: "BUFF", stat: "atk", amount: 0.5, durationTurns: 3 }],
    },
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
    criRate: 0.3,
    criDmg: 1.8,
    resistance: 0.2,
    accuracy: 0.18,
  },
  skill1: {
    id: "dragon_s1",
    name: "つのぶつけ",
    description: "敵単体に攻撃力1.2倍のダメージを与え、25%で防御力を大きく低下させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.2 },
      { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.25 },
    ],
  },
  skill2Variants: [
    {
      id: "dragon_s2_a",
      name: "フレイムブレス",
      description: "灼熱の息を吐き、敵全体に攻撃力1.5倍のダメージを与え、65%で1ターン火傷させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5 },
        { kind: "BURN", durationTurns: 1, chance: 0.65 },
      ],
    },
    {
      id: "dragon_s2_b",
      name: "ドラゴンクロー",
      description: "敵単体に攻撃力2.4倍のダメージを与え、55%で防御力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 2.4 },
        { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.55 },
      ],
    },
    {
      id: "dragon_s2_c",
      name: "しっぽなぎ払い",
      description: "敵全体に攻撃力0.9倍のダメージを2回与える。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 0.9, hits: 2 }],
    },
  ],
  skill3Variants: [
    {
      id: "dragon_s3_a",
      name: "破滅の咆哮",
      description: "敵全体に攻撃力2.0倍のダメージを与える。自身の最大HPが高いほどダメージが上昇する。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [{ kind: "DAMAGE", multiplier: 2.0, scaleBonus: { stat: "hp", ratePerPoint: 0.0003 } }],
    },
    {
      id: "dragon_s3_b",
      name: "竜神の逆鱗",
      description: "渾身の一撃(3.6倍)を叩き込み、30%で相手をスタンさせる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 3.6 },
        { kind: "STUN", durationTurns: 1, chance: 0.3 },
      ],
    },
    {
      id: "dragon_s3_c",
      name: "古龍の加護",
      description: "味方全体の攻撃力・防御力を3ターン大きく上昇させ、自身の防御力の150%のHPを回復する。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "BUFF", stat: "atk", amount: 0.5, durationTurns: 3 },
        { kind: "BUFF", stat: "def", amount: 0.5, durationTurns: 3 },
        { kind: "HEAL", scaleStat: "def", healRate: 1.5 },
      ],
    },
  ],
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
    criRate: 0.24,
    criDmg: 1.65,
    resistance: 0.3,
    accuracy: 0.25,
  },
  skill1: {
    id: "seraph_s1",
    name: "光の一閃",
    description: "敵単体に攻撃力1.15倍のダメージを与え、与えたダメージの10%を自身が回復する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.15 },
      { kind: "LIFESTEAL", healRate: 0.1 },
    ],
  },
  skill2Variants: [
    {
      id: "seraph_s2_a",
      name: "さばきの光",
      description: "敵単体に攻撃力2.3倍のダメージを与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 2.3 }],
    },
    {
      id: "seraph_s2_b",
      name: "いやしの詠唱",
      description: "自身の攻撃力に応じて味方単体のHPを回復し、2ターン攻撃力を大きく上昇させる。",
      target: "SINGLE_ALLY",
      cooldownTurns: 3,
      effects: [
        { kind: "HEAL", scaleStat: "atk", healRate: 1.6 },
        { kind: "BUFF", stat: "atk", amount: 0.5, durationTurns: 2 },
      ],
    },
    {
      id: "seraph_s2_c",
      name: "封印の光",
      description: "敵単体に攻撃力1.6倍のダメージを与え、60%で攻撃力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.6 },
        { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.6 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "seraph_s3_a",
      name: "裁きの雷光",
      description: "天より雷光を降らせ、敵全体に攻撃力1.6倍のダメージを与え、70%で1ターン防御力を大きく低下させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.6 },
        { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 1, chance: 0.7 },
      ],
    },
    {
      id: "seraph_s3_b",
      name: "聖なる守護陣",
      description: "自身の防御力に応じて味方全体のHPを回復し、防御力を上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "HEAL", scaleStat: "def", healRate: 2.0 },
        { kind: "BUFF", stat: "def", amount: 0.5, durationTurns: 3 },
      ],
    },
    {
      id: "seraph_s3_c",
      name: "セラフィムの祝福",
      description: "味方全体の攻撃力を大きく上昇させ、3ターン速度も上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "BUFF", stat: "atk", amount: 0.5, durationTurns: 3 },
        { kind: "BUFF", stat: "spd", amount: 0.25, durationTurns: 3 },
      ],
    },
  ],
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
    criRate: 0.32,
    criDmg: 1.9,
    resistance: 0.25,
    accuracy: 0.2,
  },
  skill1: {
    id: "nemesis_s1",
    name: "ダークスラッシュ",
    description: "敵単体に攻撃力1.3倍のダメージを与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 1.3 }],
  },
  skill2Variants: [
    {
      id: "nemesis_s2_a",
      name: "冥府の炎",
      description: "暗黒の炎で敵全体に攻撃力1.7倍のダメージを与える。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 1.7 }],
    },
    {
      id: "nemesis_s2_b",
      name: "デーモンクロー",
      description: "敵単体に攻撃力2.7倍のダメージを与え、50%で防御力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 2.7 },
        { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.5 },
      ],
    },
    {
      id: "nemesis_s2_c",
      name: "血のいけにえ",
      description: "敵単体に攻撃力1.2倍のダメージを2回与える。自身の防御力が高いほど威力が上がる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 1.2, hits: 2, scaleBonus: { stat: "def", ratePerPoint: 0.003 } }],
    },
  ],
  skill3Variants: [
    {
      id: "nemesis_s3_a",
      name: "終焉の一撃",
      description: "渾身の一撃(3.9倍)を叩き込み、70%で相手をスタンさせる。自身の防御力が高いほど威力が上がる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 3.9, scaleBonus: { stat: "def", ratePerPoint: 0.003 } },
        { kind: "STUN", durationTurns: 1, chance: 0.7 },
      ],
    },
    {
      id: "nemesis_s3_b",
      name: "冥王の激震",
      description: "敵全体に攻撃力2.0倍のダメージを与え、40%で攻撃力を大きく低下させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0 },
        { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.4 },
      ],
    },
    {
      id: "nemesis_s3_c",
      name: "加速の号令",
      description: "味方全体の行動ゲージを30%進め、スピードを2ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "GAUGE", amount: 0.3 },
        { kind: "BUFF", stat: "spd", amount: 0.25, durationTurns: 2 },
      ],
    },
  ],
};

/** ガチャの星4(SR)テンプレート: 火水電草側 / 光闇側 */
export const GACHA_SR_COMMON_TEMPLATE = GRIFFON;
export const GACHA_SR_RARE_TEMPLATE = SERAPH;
/** ガチャの星5(SSR)テンプレート: 火水電草側 / 光闇側 */
export const GACHA_SSR_COMMON_TEMPLATE = DRAGON;
export const GACHA_SSR_RARE_TEMPLATE = NEMESIS;

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

/** テンプレート×6属性 = 24体の色違いモンスター図鑑(通常の召喚・ステージ対象) */
export const MONSTER_TEMPLATES_DEX = MONSTER_TEMPLATES.flatMap((template) => createAllVariants(template));

/** 転生ピッグの6属性色違いバリエーション(図鑑には含めるが、通常の召喚・ステージ抽選には出さない) */
export const REINCARNATION_PIG_DEX = createAllVariants(REINCARNATION_PIG);

/** 経験ピッグの6属性色違いバリエーション(図鑑には含めるが、通常の召喚・ステージ抽選には出さない) */
export const EXP_PIG_DEX = createAllVariants(EXP_PIG);

/** ガチャ限定の高レアモンスター(SR/SSR)図鑑。GRIFFON/DRAGON/SERAPH/NEMESISとも全6属性 */
export const GACHA_EXCLUSIVE_DEX = [
  ...GACHA_SR_COMMON_DEX,
  ...GACHA_SSR_COMMON_DEX,
  ...GACHA_SR_RARE_DEX,
  ...GACHA_SSR_RARE_DEX,
];

/** 検索用の全モンスター図鑑(通常モンスター + ガチャ限定高レア + 転生ピッグ + 経験ピッグ) */
export const MONSTER_DEX = [...MONSTER_TEMPLATES_DEX, ...GACHA_EXCLUSIVE_DEX, ...REINCARNATION_PIG_DEX, ...EXP_PIG_DEX];

/** モンスター図鑑UI表示用(転生ピッグは素材専用のため除外) */
export const ALL_DISPLAYABLE_MONSTERS_DEX = [...MONSTER_TEMPLATES_DEX, ...GACHA_EXCLUSIVE_DEX];

export function findMonster(templateId: string, element: string) {
  return MONSTER_DEX.find((m) => m.templateId === templateId && m.element === element);
}

export function findMonsterById(dexId: string) {
  return MONSTER_DEX.find((m) => m.id === dexId);
}
