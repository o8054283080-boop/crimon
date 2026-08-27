import { MonsterTemplate, createAllVariants } from "../core/monster.js";
import { Skill } from "../core/skill.js";
import { setCreatedSkillResolver } from "../core/monsterInstance.js";

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
      description: "属性の力を込めて敵単体に攻撃力1.7倍のダメージを与え、50%で2ターン攻撃力を低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.7 },
        { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.5 },
      ],
    },
    {
      id: "slime_s2_b",
      name: "どくづき",
      description: "敵単体に攻撃力1.3倍のダメージを与え、60%で2ターン毒(1スタック)を付与する。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.6 },
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
      cooldownTurns: 4,
      effects: [{ kind: "DAMAGE", multiplier: 1.3 }],
    },
    {
      id: "slime_s3_b",
      name: "毒噴射",
      description: "毒液を撒き散らし、敵全体に攻撃力1.1倍のダメージを2回与え、70%で2ターン毒(1スタック)を付与する。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.1, hits: 2 },
        { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.7 },
      ],
    },
    {
      id: "slime_s3_c",
      name: "スラフラッシュ",
      description: "眩い粘液を弾けさせ、敵全体に攻撃力1.2倍のダメージを与え、55%で2ターン暗闇を付与する。",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2 },
        { kind: "BLIND", durationTurns: 2, chance: 0.55 },
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
    description: "聖なる粘液を弾けさせ、敵全体に攻撃力1.5倍のダメージを与え、70%で2ターン暗闇を付与し、与えたダメージの20%を回復する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 1.5 },
      { kind: "BLIND", durationTurns: 2, chance: 0.7 },
      // 全体技なので、HEALではなくLIFESTEALで組む。
      // HEALをそのまま置くと対象(=敵)を回復してしまう。当たった数に比例させたいのでLIFESTEALを使う
      { kind: "LIFESTEAL", healRate: 0.2 },
    ],
  },
  darkSkill3: {
    id: "slime_s3_dark",
    name: "アビススラッジ",
    description: "深淵の粘液で敵全体に攻撃力1.3倍のダメージを2回与え、80%で3ターン毒(1スタック)を付与する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 1.3, hits: 2 },
      { kind: "POISON", damageRatePerStack: 0.06, durationTurns: 3, chance: 0.8 },
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
    criRate: 0.25,
    criDmg: 1.6,
    resistance: 0.1,
    accuracy: 0.15,
  },
  skill1: {
    id: "wolf_s1",
    name: "かみつく",
    description: "敵単体に攻撃力0.8倍のダメージを与える。自身の速度が高いほど威力が上がる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.8, scaleBonus: { stat: "spd", bonusAtReference: 0.3 } }],
  },
  skill2Variants: [
    {
      id: "wolf_s2_a",
      name: "ふいうちの牙",
      description: "急所を的確に突き、敵単体の防御力を無視して攻撃力0.45倍のダメージを2回与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 2,
      effects: [{ kind: "DAMAGE", multiplier: 0.45, hits: 2, ignoreDefense: true }],
    },
    {
      id: "wolf_s2_b",
      name: "いあつ",
      description: "威圧の咆哮で敵全体を怯ませ、70%で1ターン攻撃力を大きく低下させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [{ kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 1, chance: 0.7 }],
    },
    {
      id: "wolf_s2_c",
      name: "するどいツメ",
      description: "敵単体に攻撃力1.65倍のダメージを与え、1ターン毒(1スタック)を付与する。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.65 },
        { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 1 },
      ],
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
      name: "ウルフスラッシュ",
      description: "敵単体に攻撃力0.7倍のダメージを3回与え、1撃ごとに防御力を25%低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.7, hits: 3 },
        // 3回斬るので、防御低下も1撃につき1つずつ、計3つ重ねてかける
        { kind: "DEBUFF", stat: "def", amount: 0.25, durationTurns: 2 },
        { kind: "DEBUFF", stat: "def", amount: 0.25, durationTurns: 2 },
        { kind: "DEBUFF", stat: "def", amount: 0.25, durationTurns: 2 },
      ],
    },
    {
      id: "wolf_s3_c",
      name: "はやての号令",
      description: "味方全体の行動ゲージを20%進め、速度を2ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "GAUGE", amount: 0.2 },
        { kind: "BUFF", stat: "spd", amount: 0.3, durationTurns: 2 },
      ],
    },
  ],
  lightSkill3: {
    id: "wolf_s3_light",
    name: "ホーリーファング",
    description: "光を纏った牙で敵単体に攻撃力3.6倍のダメージを与え、行動ゲージを30%奪う。自身の速度が高いほど威力が上がる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 3.6, scaleBonus: { stat: "spd", bonusAtReference: 1.2 } },
      // 吸収にしないと、敵を狙う技なので相手のゲージを進めてしまう
      { kind: "GAUGE", amount: 0.3, drain: true },
    ],
  },
  darkSkill3: {
    id: "wolf_s3_dark",
    name: "シャドウレンド",
    description: "影から敵単体に攻撃力1.5倍のダメージを3回与え、与えたダメージの30%を回復する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 1.5, hits: 3 },
      { kind: "LIFESTEAL", healRate: 0.3 },
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
    criRate: 0.05,
    criDmg: 1.5,
    resistance: 0.35,
    accuracy: 0.1,
  },
  skill1: {
    id: "golem_s1",
    name: "たいあたり",
    description: "敵単体に攻撃力0.7倍のダメージを与える。自身の防御力が高いほど威力が上がる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.7, defCoefficient: 0.5 }],
  },
  skill2Variants: [
    {
      id: "golem_s2_a",
      name: "岩石落とし",
      description: "巨岩を降らせ敵全体に攻撃力0.9倍のダメージを与える。自身の防御力が高いほど威力が上がる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 0.9, defCoefficient: 0.75 }],
    },
    {
      id: "golem_s2_b",
      name: "たいあたりラッシュ",
      description: "敵全体に攻撃力0.45倍のダメージを3回与える。自身の防御力が高いほど威力が上がる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 0.45, hits: 3, defCoefficient: 0.5 }],
    },
    {
      id: "golem_s2_c",
      name: "いわくだき",
      description: "敵単体に攻撃力1.3倍のダメージを与え、60%で1ターン防御力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 1, chance: 0.6 },
      ],
    },
  ],
  skill3Variants: [
    // 火のゴーレムが溶岩落としを覚えるよう、この並びを先頭に置いている
    {
      id: "golem_s3_b",
      name: "溶岩落とし",
      description: "溶岩を噴き上げ、敵全体に攻撃力1.2倍のダメージを与え、1ターン火傷させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2 },
        { kind: "BURN", durationTurns: 1, chance: 1 },
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
      description: "味方全体の攻撃力と防御力を2ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 2 },
        { kind: "BUFF", stat: "def", amount: 0.3, durationTurns: 2 },
      ],
    },
  ],
  lightSkill3: {
    id: "golem_s3_light",
    name: "オーロラウォール",
    description: "味方全体に最大HPの40%のシールドを3ターン張り、防御力を3ターン大きく上昇させ、3ターンのあいだ毎ターン8%ずつ回復させ、デバフを解除する。",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      // 攻撃を持たないぶん、量で釣り合わせないと通常のスキル3(溶岩落とし)に届かない
      { kind: "SHIELD", shieldRate: 0.4, durationTurns: 3 },
      { kind: "BUFF", stat: "def", amount: 0.8, durationTurns: 3 },
      { kind: "REGEN", healRate: 0.08, durationTurns: 3 },
      { kind: "CLEANSE" },
    ],
  },
  darkSkill3: {
    id: "golem_s3_dark",
    name: "オブシディアンクラッシュ",
    description: "敵全体に攻撃力1.6倍のダメージを与え、70%で2ターン防御力を大きく低下させる。自身の防御力が高いほど威力が上がる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 1.6, defCoefficient: 1.0 },
      { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.7 },
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
    criRate: 0.1,
    criDmg: 1.5,
    resistance: 0.2,
    accuracy: 0.2,
  },
  skill1: {
    id: "fairy_s1",
    name: "ちいさな一撃",
    description: "敵単体に攻撃力0.7倍のダメージを与え、自身の最大HPの2%を回復する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.7 },
      { kind: "HEAL", healRate: 0.02, applyTo: "SELF" },
    ],
  },
  skill2Variants: [
    {
      id: "fairy_s2_a",
      name: "いやしのかぜ",
      description: "味方全体のHPを最大HPの22%回復する。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [{ kind: "HEAL", healRate: 0.22 }],
    },
    {
      id: "fairy_s2_b",
      name: "せいすいのしずく",
      description: "味方単体のHPを最大HPの32%回復し、デバフを解除する。",
      target: "SINGLE_ALLY",
      cooldownTurns: 3,
      effects: [
        { kind: "HEAL", healRate: 0.32 },
        { kind: "CLEANSE" },
      ],
    },
    {
      id: "fairy_s2_c",
      name: "せいめいの葉",
      description: "味方全体のHPを最大HPの10%回復し、3ターンの間、毎ターン開始時に最大HPの6%回復する継続回復を付与する。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "HEAL", healRate: 0.1 },
        { kind: "REGEN", healRate: 0.06, durationTurns: 3 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "fairy_s3_a",
      name: "せいれいの加護",
      description: "味方全体の攻撃力を2ターン上昇させ、デバフを解除する。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 2 },
        { kind: "CLEANSE" },
      ],
    },
    {
      id: "fairy_s3_b",
      name: "だいちのめぐみ",
      description: "味方全体のHPを最大HPの35%回復する。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [{ kind: "HEAL", healRate: 0.35 }],
    },
    {
      id: "fairy_s3_c",
      name: "れいこんのもり",
      description: "味方全体のHPを最大HPの15%回復し、防御力を上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "HEAL", healRate: 0.15 },
        { kind: "BUFF", stat: "def", amount: 0.3, durationTurns: 2 },
      ],
    },
  ],
  lightSkill3: {
    id: "fairy_s3_light",
    name: "セラフィックブレス",
    description: "味方全体のHPを最大HPの40%回復し、3ターンのあいだ毎ターン10%ずつ回復させ、デバフを解除して2ターン状態異常を無効にする。",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "HEAL", healRate: 0.4 },
      // 通常の「だいちのめぐみ」が35%回復。40%では差が5ポイントしかなく、
      // 実測でも通常と区別がつかなかったので、継続回復で厚みを付ける
      { kind: "REGEN", healRate: 0.1, durationTurns: 3 },
      { kind: "CLEANSE" },
      { kind: "IMMUNITY", durationTurns: 2 },
    ],
  },
  darkSkill3: {
    id: "fairy_s3_dark",
    name: "ナイトメアミスト",
    description: "夢の霧で味方全体のHPを最大HPの30%回復し、素早さを3ターン上昇させ、行動ゲージを35%進める。",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "HEAL", healRate: 0.3 },
      { kind: "BUFF", stat: "spd", amount: 0.35, durationTurns: 3 },
      { kind: "GAUGE", amount: 0.35 },
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
    criRate: 0.12,
    criDmg: 1.5,
    resistance: 0.15,
    accuracy: 0.35,
  },
  skill1: {
    id: "imp_s1",
    name: "ひっかき",
    description: "敵単体に攻撃力0.9倍のダメージを与え、30%で1ターン攻撃力を低下させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.9 },
      { kind: "DEBUFF", stat: "atk", amount: 0.25, durationTurns: 1, chance: 0.3 },
    ],
  },
  skill2Variants: [
    {
      id: "imp_s2_a",
      name: "のろいのつめ",
      description: "敵単体に攻撃力1.3倍のダメージを与え、70%で2ターン防御力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "DEBUFF", stat: "def", amount: 0.45, durationTurns: 2, chance: 0.7 },
      ],
    },
    {
      id: "imp_s2_b",
      name: "めつぶし",
      description: "敵単体に攻撃力1.2倍のダメージを与え、65%で2ターン暗闇を付与する。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2 },
        { kind: "BLIND", durationTurns: 2, chance: 0.65 },
      ],
    },
    {
      id: "imp_s2_c",
      name: "あしばらい",
      description: "敵単体に攻撃力1.2倍のダメージを与え、行動ゲージを15%奪い、70%で2ターン素早さを低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2 },
        { kind: "GAUGE", amount: -0.15, drain: true },
        { kind: "DEBUFF", stat: "spd", amount: 0.25, durationTurns: 2, chance: 0.7 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "imp_s3_a",
      name: "あくいのばらまき",
      description: "敵全体に攻撃力1.1倍のダメージを与え、55%で2ターン攻撃力を大きく低下させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.1 },
        { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.55 },
      ],
    },
    {
      id: "imp_s3_b",
      name: "ふういんのわらい",
      description: "敵全体に攻撃力1.1倍のダメージを与え、60%で全員のスキルのクールタイムを1ターン延長する。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        // CT5でクールタイム延長1ターンだけでは、妨害役の目安にも届いていなかった
        { kind: "DAMAGE", multiplier: 1.1 },
        { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.6 },
      ],
    },
    {
      id: "imp_s3_c",
      name: "どくのきり",
      description: "敵全体に攻撃力0.7倍のダメージを2回与え、65%で3ターン毒(1スタック)を付与する。",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.7, hits: 2 },
        { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 3, chance: 0.65 },
      ],
    },
  ],
  lightSkill3: {
    id: "imp_s3_light",
    name: "ジャッジメントヘイズ",
    description: "敵全体に攻撃力1.4倍のダメージを与え、70%で2ターン攻撃力を大きく低下させ、60%で2ターン暗闇を付与する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 1.4 },
      { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.7 },
      { kind: "BLIND", durationTurns: 2, chance: 0.6 },
    ],
  },
  darkSkill3: {
    id: "imp_s3_dark",
    name: "サイレントカース",
    description: "敵全体に攻撃力2.0倍のダメージを与え、70%で全員のスキルのクールタイムを1ターン延長し、85%で4ターン毒(1スタック)を付与する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      // 延長を2ターン100%から1ターン70%へ落としたぶん、火力と毒で釣り合わせる
      // (実測で通常のスキル3を0.17下回っていた)
      { kind: "DAMAGE", multiplier: 2.0 },
      // 2ターン延長は、当たった相手が2巡ぶん何もできなくなる。1ターンでも十分に重い
      { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.7 },
      { kind: "POISON", damageRatePerStack: 0.08, durationTurns: 4, chance: 0.85 },
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
    criRate: 0.08,
    criDmg: 1.5,
    resistance: 0.3,
    accuracy: 0.15,
  },
  skill1: {
    id: "wisp_s1",
    name: "ほのかなともしび",
    description: "敵単体に攻撃力0.7倍のダメージを与え、味方全体の防御力を1ターン上昇させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.7 },
      { kind: "BUFF", stat: "def", amount: 0.15, durationTurns: 1, applyTo: "ALLIES" },
    ],
  },
  skill2Variants: [
    {
      id: "wisp_s2_a",
      name: "まもりのりんこう",
      description: "味方全体のデバフを解除し、最大HPの15%のシールドを3ターン張る。",
      target: "ALL_ALLIES",
      // シールドと状態異常無効が同時に乗ると、受けを一枚で成立させてしまい強すぎた。
      // 無効を解除に置き換え、「先回りして防ぐ」のではなく「掛かった後に立て直す」役に寄せている
      cooldownTurns: 5,
      effects: [
        { kind: "SHIELD", shieldRate: 0.15, durationTurns: 3 },
        { kind: "CLEANSE" },
      ],
    },
    {
      id: "wisp_s2_b",
      name: "かそくのりんこう",
      description: "味方全体の素早さを2ターン上昇させ、行動ゲージを15%進める。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "spd", amount: 0.3, durationTurns: 2 },
        { kind: "GAUGE", amount: 0.15 },
      ],
    },
    {
      id: "wisp_s2_c",
      name: "いやしのりんこう",
      description: "味方全体のHPを最大HPの15%回復し、2ターンのあいだ毎ターン7%ずつ回復させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "HEAL", healRate: 0.15 },
        { kind: "REGEN", healRate: 0.07, durationTurns: 2 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "wisp_s3_a",
      name: "ほしくずのわ",
      description: "味方全体の攻撃力とクリティカル率を2ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "BUFF", stat: "atk", amount: 0.5, durationTurns: 2 },
        { kind: "BUFF", stat: "criRate", amount: 0.2, durationTurns: 2 },
      ],
    },
    {
      id: "wisp_s3_b",
      name: "じょうかのひかり",
      description: "味方全体のHPを最大HPの20%回復し、2ターン状態異常を無効にする。",
      target: "ALL_ALLIES",
      // 解除・回復・無効の3つが1つに乗っていて、これ1枚で崩れなくなっていた。
      // 解除は「まもりのりんこう」の役目に移し、こちらは回復と無効に絞る
      cooldownTurns: 6,
      effects: [
        { kind: "HEAL", healRate: 0.2 },
        { kind: "IMMUNITY", durationTurns: 2 },
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
        { kind: "BUFF", stat: "spd", amount: 0.25, durationTurns: 2 },
      ],
    },
  ],
  lightSkill3: {
    id: "wisp_s3_light",
    name: "ラディアントブレッシング",
    description: "味方全体の攻撃力とクリティカル率を3ターン上昇させ、行動ゲージを25%進める。",
    target: "ALL_ALLIES",
    cooldownTurns: 6,
    effects: [
      { kind: "BUFF", stat: "atk", amount: 0.5, durationTurns: 3 },
      { kind: "BUFF", stat: "criRate", amount: 0.25, durationTurns: 3 },
      { kind: "GAUGE", amount: 0.25 },
    ],
  },
  darkSkill3: {
    id: "wisp_s3_dark",
    name: "ヴォイドシフト",
    description: "味方全体の行動ゲージを35%進め、素早さを3ターン上昇させ、最大HPの15%のシールドを3ターン張る。",
    target: "ALL_ALLIES",
    cooldownTurns: 6,
    effects: [
      { kind: "GAUGE", amount: 0.35 },
      { kind: "BUFF", stat: "spd", amount: 0.3, durationTurns: 3 },
      { kind: "SHIELD", shieldRate: 0.15, durationTurns: 3 },
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
    criRate: 0.05,
    criDmg: 1.5,
    resistance: 0.4,
    accuracy: 0.1,
  },
  skill1: {
    id: "treant_s1",
    name: "えだのひとふり",
    description: "敵単体に攻撃力0.6倍のダメージを与える。自身の最大HPが高いほど威力が上がる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.6, hpCoefficient: 0.03 }],
  },
  skill2Variants: [
    {
      id: "treant_s2_a",
      name: "からみつくねっこ",
      description: "敵単体に攻撃力0.8倍のダメージを与え、55%で1ターン行動不能にする。自身の最大HPが高いほど威力が上がる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.8, hpCoefficient: 0.04 },
        { kind: "STUN", durationTurns: 1, chance: 0.55 },
      ],
    },
    {
      id: "treant_s2_b",
      name: "ねづよいかまえ",
      description: "自身の防御力を3ターン上昇させ、最大HPの15%のシールドを3ターン張る。",
      target: "SELF",
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "def", amount: 0.5, durationTurns: 3 },
        { kind: "SHIELD", shieldRate: 0.15, durationTurns: 3 },
      ],
    },
    {
      id: "treant_s2_c",
      name: "ようぶんきゅうしゅう",
      description: "敵単体に攻撃力0.9倍のダメージを与え、与えたダメージの40%を回復する。自身の最大HPが高いほど威力が上がる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 0.9, hpCoefficient: 0.04 },
        { kind: "LIFESTEAL", healRate: 0.4 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "treant_s3_a",
      name: "もりのゆりかご",
      description: "味方全体のHPを最大HPの12%回復し、3ターンのあいだ毎ターン8%ずつ回復させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "HEAL", healRate: 0.12 },
        { kind: "REGEN", healRate: 0.08, durationTurns: 3 },
      ],
    },
    {
      id: "treant_s3_b",
      name: "たいじゅのいかり",
      description: "敵全体に攻撃力0.8倍のダメージを与え、60%で2ターン素早さを低下させる。自身の最大HPが高いほど威力が上がる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 0.8, hpCoefficient: 0.04 },
        { kind: "DEBUFF", stat: "spd", amount: 0.25, durationTurns: 2, chance: 0.6 },
      ],
    },
    {
      id: "treant_s3_c",
      name: "だいちのとりで",
      description: "味方全体に最大HPの20%のシールドを3ターン張り、2ターン状態異常を無効にする。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "SHIELD", shieldRate: 0.2, durationTurns: 3 },
        { kind: "IMMUNITY", durationTurns: 2 },
      ],
    },
  ],
  lightSkill3: {
    id: "treant_s3_light",
    name: "ワールドツリー",
    description: "味方全体のHPを最大HPの20%回復し、4ターンのあいだ毎ターン10%ずつ回復させ、デバフを解除する。",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "HEAL", healRate: 0.2 },
      { kind: "REGEN", healRate: 0.1, durationTurns: 4 },
      { kind: "CLEANSE" },
    ],
  },
  darkSkill3: {
    id: "treant_s3_dark",
    name: "ソウルルート",
    description:
      "根を伸ばして敵全体に攻撃力2.0倍のダメージを与え、吸い上げた力で味方全体のHPを最大HPの15%回復し、防御力を3ターン上昇させる。与えたダメージの40%を自身が回復し、60%で2ターン素早さを低下させる。自身の最大HPが高いほど威力が上がる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 2.0, hpCoefficient: 0.05 },
      { kind: "LIFESTEAL", healRate: 0.4 },
      { kind: "DEBUFF", stat: "spd", amount: 0.25, durationTurns: 2, chance: 0.6 },
      // トレントは味方を保たせる種族。火力だけを積んでも、通常のスキル3(もりのゆりかご)を
      // 外したぶんの穴が埋まらず、実測では30戦中29敗になっていた。
      // **役割を捨てさせないこと。**吸った分を味方へ回す形にして、闇でも支え役として成立させる
      { kind: "HEAL", healRate: 0.15, applyTo: "ALLIES" },
      { kind: "BUFF", stat: "def", amount: 0.5, durationTurns: 3, applyTo: "ALLIES" },
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
    criRate: 0.15,
    criDmg: 1.55,
    resistance: 0.2,
    accuracy: 0.15,
  },
  skill1: {
    id: "knight_s1",
    name: "なぎはらい",
    description: "敵単体に攻撃力1.0倍のダメージを与える。自身の防御力が高いほど威力が上がる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 1.0, defCoefficient: 0.5 }],
  },
  skill2Variants: [
    {
      id: "knight_s2_a",
      name: "かぶとわり",
      description: "敵単体に攻撃力1.5倍のダメージを与え、65%で2ターン防御力を低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5 },
        { kind: "DEBUFF", stat: "def", amount: 0.35, durationTurns: 2, chance: 0.65 },
      ],
    },
    {
      id: "knight_s2_b",
      name: "たてうけ",
      description: "味方全体のデバフを解除し、自身の防御力を3ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "CLEANSE" },
        { kind: "BUFF", stat: "def", amount: 0.5, durationTurns: 3, applyTo: "SELF" },
      ],
    },
    {
      id: "knight_s2_c",
      name: "れんげき",
      description: "敵単体に攻撃力0.7倍のダメージを3回与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 0.7, hits: 3 }],
    },
  ],
  skill3Variants: [
    {
      id: "knight_s3_a",
      name: "しんげきのごうれい",
      description: "味方全体の攻撃力を2ターン上昇させ、敵単体に攻撃力1.8倍のダメージを与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8 },
        { kind: "BUFF", stat: "atk", amount: 0.4, durationTurns: 2, applyTo: "ALLIES" },
      ],
    },
    {
      id: "knight_s3_b",
      name: "じゅうじざん",
      description: "敵全体に攻撃力1.2倍のダメージを与え、50%で1ターン行動不能にする。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2 },
        { kind: "STUN", durationTurns: 1, chance: 0.5 },
      ],
    },
    {
      id: "knight_s3_c",
      name: "きしのちかい",
      description: "味方全体に最大HPの12%のシールドを3ターン張り、防御力とクリティカル率を2ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "SHIELD", shieldRate: 0.12, durationTurns: 3 },
        { kind: "BUFF", stat: "def", amount: 0.3, durationTurns: 2 },
        { kind: "BUFF", stat: "criRate", amount: 0.15, durationTurns: 2 },
      ],
    },
  ],
  lightSkill3: {
    id: "knight_s3_light",
    name: "セイクリッドオーダー",
    description: "味方全体の攻撃力と防御力を3ターン上昇させ、最大HPの15%のシールドを3ターン張る。",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "BUFF", stat: "atk", amount: 0.45, durationTurns: 3 },
      { kind: "BUFF", stat: "def", amount: 0.4, durationTurns: 3 },
      { kind: "SHIELD", shieldRate: 0.15, durationTurns: 3 },
    ],
  },
  darkSkill3: {
    id: "knight_s3_dark",
    name: "ブラッドエッジ",
    description: "敵全体に攻撃力1.8倍のダメージを与え、65%で1ターン行動不能にし、与えたダメージの25%を回復する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 1.8 },
      { kind: "STUN", durationTurns: 1, chance: 0.65 },
      { kind: "LIFESTEAL", healRate: 0.25 },
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
      description: "鋭い風の刃で敵単体に攻撃力2.0倍のダメージを与え、30%で1ターンスタンさせる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0 },
        { kind: "STUN", durationTurns: 1, chance: 0.3 },
      ],
    },
    {
      id: "griffon_s2_b",
      name: "はやてづき",
      description: "敵単体に攻撃力0.95倍のダメージを2回与える。自身の素早さが高いほど威力が上がる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 0.95, hits: 2, scaleBonus: { stat: "spd", bonusAtReference: 0.35 } }],
    },
    {
      id: "griffon_s2_c",
      name: "ダイブアタック",
      description: "急降下して敵単体に攻撃力1.6倍のダメージを与え、70%で2ターン速度を25%低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.6 },
        { kind: "DEBUFF", stat: "spd", amount: 0.25, durationTurns: 2, chance: 0.7 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "griffon_s3_a",
      name: "嵐の一撃",
      description: "渾身の一撃(2.8倍)を叩き込み、55%で相手をスタンさせる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.8 },
        { kind: "STUN", durationTurns: 1, chance: 0.55 },
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
      description: "味方全体の攻撃力とクリティカルダメージを3ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 3 },
        { kind: "BUFF", stat: "criDmg", amount: 0.3, durationTurns: 3 },
      ],
    },
  ],
  lightSkill3: {
    id: "griffon_s3_light",
    name: "テンペストジャッジ",
    description: "光の暴風で敵全体に攻撃力2.4倍のダメージを与え、50%で1ターン行動不能にし、味方全体の攻撃力を3ターン上昇させる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 2.4 },
      { kind: "STUN", durationTurns: 1, chance: 0.5 },
      { kind: "BUFF", stat: "atk", amount: 0.35, durationTurns: 3, applyTo: "ALLIES" },
    ],
  },
  darkSkill3: {
    id: "griffon_s3_dark",
    name: "シャドウタロン",
    description: "影の鉤爪で敵単体に攻撃力1.9倍のダメージを3回与え、70%で2ターン防御力を大きく低下させる。自身の速度が高いほど威力が上がる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 1.9, hits: 3, scaleBonus: { stat: "spd", bonusAtReference: 0.5 } },
      { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.7 },
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
  description: "聖なる光の息を吐き、敵全体に攻撃力2.6倍のダメージを与え、75%で2ターン暗闇、60%で2ターン攻撃力低下を付与する。自身の最大HPが高いほど威力が上がる。",
  target: "ALL_ENEMIES",
  cooldownTurns: 5,
  effects: [
    // 比較相手の「破滅の咆哮」は2.0倍にHP補正(0.0003)が乗るので、育てるほど差が開く。
    // 固定倍率をいくら上げても追いつけないため、こちらにも一段厚いHP補正を持たせる
    { kind: "DAMAGE", multiplier: 2.6, hpCoefficient: 0.05 },
    { kind: "BLIND", durationTurns: 2, chance: 0.75 },
    { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.6 },
  ],
};

const DRAGON_DARK_SKILL3: Skill = {
  id: "dragon_s3_meteor",
  name: "破壊の流星",
  description: "闇の流星を降らせ、敵全体の防御力を無視して攻撃力2.0倍のダメージを与え、与えたダメージの25%を回復する。",
  target: "ALL_ENEMIES",
  cooldownTurns: 5,
  effects: [
    // 防御無視は硬い相手にこそ効くが、1.5倍では他の候補(破滅の咆哮2.0倍+HP補正)に見劣りしていた
    { kind: "DAMAGE", multiplier: 2.0, ignoreDefense: true },
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
  // 6件に揃えることで、属性の並び(火・草・電気・水・光・闇)と1対1で対応する
  skill2Variants: [
    {
      id: "dragon_s2_flame",
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
      id: "dragon_s2_claw",
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
      id: "dragon_s2_spirit",
      name: "りゅうの闘気",
      description: "味方全体のクリティカルダメージと速度を2ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "criDmg", amount: 0.3, durationTurns: 2 },
        { kind: "BUFF", stat: "spd", amount: 0.3, durationTurns: 2 },
      ],
    },
    {
      id: "dragon_s2_w_claw",
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
      id: "dragon_s2_l_spirit",
      name: "りゅうの闘気",
      description: "味方全体のクリティカルダメージと速度を2ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "BUFF", stat: "criDmg", amount: 0.3, durationTurns: 2 },
        { kind: "BUFF", stat: "spd", amount: 0.3, durationTurns: 2 },
      ],
    },
    {
      id: "dragon_s2_d_flame",
      name: "フレイムブレス",
      description: "灼熱の息を吐き、敵全体に攻撃力1.5倍のダメージを与え、65%で1ターン火傷させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5 },
        { kind: "BURN", durationTurns: 1, chance: 0.65 },
      ],
    },
  ],
  // 属性の並び(火・草・電気・水・光・闇)と1対1で対応する。
  // 光は シャイニングブレス、闇は 破壊の流星 という専用スキルになる
  skill3Variants: [
    {
      id: "dragon_s3_roar",
      name: "破滅の咆哮",
      description: "敵全体に攻撃力2.0倍のダメージを与える。自身の最大HPが高いほどダメージが上昇する。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [{ kind: "DAMAGE", multiplier: 2.0, hpCoefficient: 0.05 }],
    },
    {
      id: "dragon_s3_scale",
      name: "竜神の逆鱗",
      description: "渾身の一撃(3.6倍)を叩き込み、味方全体の攻撃力を2ターン上昇させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 3.6 },
        { kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 2, applyTo: "ALLIES" },
      ],
    },
    {
      id: "dragon_s3_roar_e",
      name: "破滅の咆哮",
      description: "敵全体に攻撃力2.0倍のダメージを与える。自身の最大HPが高いほどダメージが上昇する。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [{ kind: "DAMAGE", multiplier: 2.0, hpCoefficient: 0.05 }],
    },
    {
      id: "dragon_s3_blessing",
      name: "古龍の加護",
      description: "味方全体の攻撃力・防御力を3ターン上昇させ、自身の防御力の150%のHPを回復する。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 3 },
        { kind: "BUFF", stat: "def", amount: 0.3, durationTurns: 3 },
        { kind: "HEAL", scaleStat: "def", healRate: 1.5 },
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
      description: "敵単体に攻撃力2.3倍のダメージを与え、85%で1ターン暗闇を付与する。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 2.3 },
        { kind: "BLIND", durationTurns: 1, chance: 0.85 },
      ],
    },
    {
      id: "seraph_s2_b",
      name: "いやしの詠唱",
      description: "自身の攻撃力に応じて味方単体のHPを回復し、2ターン攻撃力を上昇させる。",
      target: "SINGLE_ALLY",
      cooldownTurns: 3,
      effects: [
        { kind: "HEAL", scaleStat: "atk", healRate: 1.6 },
        { kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 2 },
      ],
    },
    {
      id: "seraph_s2_c",
      name: "封印の光",
      description: "敵単体に攻撃力1.8倍のダメージを与え、70%でスキルのクールタイムを1ターン延長する。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8 },
        { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.7 },
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
      description: "自身の防御力に応じて味方全体のHPを回復し、2ターンの間状態異常を無効にする加護を与える。",
      target: "ALL_ALLIES",
      cooldownTurns: 6,
      effects: [
        { kind: "HEAL", scaleStat: "def", healRate: 2.0 },
        { kind: "IMMUNITY", durationTurns: 2 },
      ],
    },
    {
      id: "seraph_s3_c",
      name: "セラフィムの祝福",
      description: "味方全体の行動ゲージを20%進め、攻撃力と速度を3ターン上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 5,
      effects: [
        { kind: "GAUGE", amount: 0.2 },
        { kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 3 },
        { kind: "BUFF", stat: "spd", amount: 0.25, durationTurns: 3 },
      ],
    },
  ],
  lightSkill3: {
    id: "seraph_s3_light",
    name: "エターナルヘイロー",
    description:
      "消えない光輪を掲げ、自身の防御力の220%ぶん味方全体のHPを回復し、デバフを解除して3ターン状態異常を無効にし、4ターンのあいだ毎ターン8%ずつ回復させる。",
    target: "ALL_ALLIES",
    cooldownTurns: 6,
    effects: [
      { kind: "HEAL", scaleStat: "def", healRate: 2.2 },
      { kind: "CLEANSE" },
      { kind: "IMMUNITY", durationTurns: 3 },
      { kind: "REGEN", healRate: 0.08, durationTurns: 4 },
    ],
  },
  darkSkill3: {
    id: "seraph_s3_dark",
    name: "フォールンウィング",
    description: "堕ちた翼で敵全体に攻撃力2.1倍のダメージを与え、80%で2ターン暗闇を付与し、与えたダメージの30%を回復する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 2.1 },
      { kind: "BLIND", durationTurns: 2, chance: 0.8 },
      { kind: "LIFESTEAL", healRate: 0.3 },
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
      description: "暗黒の炎で敵全体に攻撃力1.7倍のダメージを与え、1ターン火傷させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.7 },
        { kind: "BURN", durationTurns: 1, chance: 1 },
      ],
    },
    {
      id: "nemesis_s2_b",
      name: "デーモンクロー",
      description: "敵単体に攻撃力2.7倍のダメージを与え、75%で防御力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 2.7 },
        { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.75 },
      ],
    },
    {
      id: "nemesis_s2_c",
      name: "血のいけにえ",
      description: "敵単体に攻撃力1.2倍のダメージを2回与える。自身の防御力が高いほど威力が上がる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 1.2, hits: 2, defCoefficient: 0.5 }],
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
        { kind: "DAMAGE", multiplier: 3.9, defCoefficient: 0.75 },
        { kind: "STUN", durationTurns: 1, chance: 0.7 },
      ],
    },
    {
      id: "nemesis_s3_b",
      name: "冥王の激震",
      description: "敵全体に攻撃力1.15倍のダメージを2回与え、行動ゲージを10%吸収する。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.15, hits: 2 },
        { kind: "GAUGE", amount: 0.1, drain: true },
      ],
    },
    {
      id: "nemesis_s3_c",
      name: "加速の号令",
      description: "味方全体の行動ゲージを30%進め、2ターンクリティカル率を30%上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [
        { kind: "GAUGE", amount: 0.3 },
        { kind: "BUFF", stat: "criRate", amount: 0.3, durationTurns: 2 },
      ],
    },
  ],
  lightSkill3: {
    id: "nemesis_s3_light",
    name: "ラストジャッジメント",
    description:
      "裁きの一撃(5.0倍)を叩き込み、75%で相手をスタンさせ、行動ゲージを40%奪う。自身の防御力が高いほど威力が上がる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 5.0, defCoefficient: 1.0 },
      { kind: "STUN", durationTurns: 1, chance: 0.75 },
      { kind: "GAUGE", amount: 0.4, drain: true },
    ],
  },
  darkSkill3: {
    id: "nemesis_s3_dark",
    name: "エンドオブオール",
    description: "終焉の波動で敵全体に攻撃力1.8倍のダメージを2回与え、行動ゲージを20%吸収し、70%で2ターン防御力を大きく低下させる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 1.8, hits: 2 },
      { kind: "GAUGE", amount: 0.2, drain: true },
      { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.7 },
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
      description: "封じられていた呪いを解き放ち、敵全体に攻撃力1.6倍のダメージを与え、45%で攻撃力を大きく低下させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.6 },
        { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.45 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "ancient_demon_s3",
      name: "終焉の審判",
      description: "太古の力を解き放ち、敵全体に攻撃力2.0倍のダメージを与え、50%で攻撃力を大きく低下させる。自身の防御力が高いほど威力が上がる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0, defCoefficient: 0.75 },
        { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.5 },
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
      description: "味方単体に古代の力を送り込み、4ターン攻撃力を上昇させる。重ねがけで積み上がる。",
      target: "SINGLE_ALLY",
      cooldownTurns: 2,
      // **積み上がることが肝。**バフは同じ能力値でも重ねた数だけ足し合わされるので、
      // 長引くほど魔人の一撃が重くなる。耐久で待つ戦い方に「待てば待つほど不利」を作る
      effects: [{ kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 4 }],
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
        { kind: "BUFF", stat: "def", amount: 0.3, durationTurns: 3 },
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
      description: "敵全体に攻撃力0.9倍のダメージを与え、55%で攻撃力を大きく低下させ、50%で強化効果を剥がす。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 0.9 },
        { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.55 },
        // 巨人ダンジョンの右の結晶にあたる役割。**張り続けたものを剥がし続ける**
        { kind: "STRIP", chance: 0.5 },
      ],
    },
  ],
  skill3Variants: [
    {
      id: "ancient_crystal_curse_s3",
      name: "破滅の呪詛",
      description: "敵全体に攻撃力1.8倍のダメージを与え、50%で防御力を大きく低下させ、70%で3ターン回復封じを付与する。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8 },
        { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.5 },
        // **回復で粘る戦い方への答え。**9・10階にしか現れないので、
        // ここに置けば序盤の階を巻き添えにしない
        { kind: "HEAL_BLOCK", healMultiplier: 0.4, durationTurns: 3, chance: 0.7 },
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

/** 古代の魔人・古代のクリスタル・古代の呪晶の6属性色違いバリエーション(装備ダンジョン専用。召喚・図鑑表示には一切出さない) */
export const ANCIENT_DEMON_DEX = createAllVariants(ANCIENT_DEMON);
export const ANCIENT_CRYSTAL_DEX = createAllVariants(ANCIENT_CRYSTAL);
export const ANCIENT_CRYSTAL_CURSE_DEX = createAllVariants(ANCIENT_CRYSTAL_CURSE);

/** ガチャ限定の高レアモンスター(SR/SSR)図鑑。GRIFFON/DRAGON/SERAPH/NEMESISとも全6属性 */
export const GACHA_EXCLUSIVE_DEX = [
  ...GACHA_SR_COMMON_DEX,
  ...GACHA_SSR_COMMON_DEX,
  ...GACHA_SR_RARE_DEX,
  ...GACHA_SSR_RARE_DEX,
];

/** 検索用の全モンスター図鑑(通常モンスター + ガチャ限定高レア + 転生ピッグ + 経験ピッグ + 装備ダンジョン専用ボス/お供) */
export const MONSTER_DEX = [
  ...MONSTER_TEMPLATES_DEX,
  ...GACHA_EXCLUSIVE_DEX,
  ...REINCARNATION_PIG_DEX,
  ...EXP_PIG_DEX,
  ...ANCIENT_DEMON_DEX,
  ...ANCIENT_CRYSTAL_DEX,
  ...ANCIENT_CRYSTAL_CURSE_DEX,
];

/** モンスター図鑑UI表示用(転生ピッグは素材専用のため除外) */
export const ALL_DISPLAYABLE_MONSTERS_DEX = [...MONSTER_TEMPLATES_DEX, ...GACHA_EXCLUSIVE_DEX];

export function findMonster(templateId: string, element: string) {
  return MONSTER_DEX.find((m) => m.templateId === templateId && m.element === element);
}

export function findMonsterById(dexId: string) {
  return MONSTER_DEX.find((m) => m.id === dexId);
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
