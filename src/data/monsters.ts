import { MonsterTemplate, createAllVariants } from "../core/monster.js";

const SLIME: MonsterTemplate = {
  templateId: "slime",
  baseName: "スライム",
  role: "アタッカー",
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
      description: "敵単体に攻撃力1.4倍のダメージを与え、攻撃力を低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.4 },
        { kind: "DEBUFF", stat: "atk", amount: 0.15, durationTurns: 2 },
      ],
    },
    {
      id: "slime_s2_c",
      name: "ねばつく一撃",
      description: "敵単体に攻撃力1.3倍のダメージを与え、素早さを低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "DEBUFF", stat: "spd", amount: 0.2, durationTurns: 2 },
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
      description: "敵単体に攻撃力2.0倍のダメージを与え、防御力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0 },
        { kind: "DEBUFF", stat: "def", amount: 0.25, durationTurns: 2 },
      ],
    },
  ],
};

const WOLF: MonsterTemplate = {
  templateId: "wolf",
  baseName: "ウルフ",
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
      description: "敵単体を2回攻撃(各0.8倍)し、防御力を低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 2,
      effects: [
        { kind: "DAMAGE", multiplier: 0.8, hits: 2 },
        { kind: "DEBUFF", stat: "def", amount: 0.15, durationTurns: 2 },
      ],
    },
    {
      id: "wolf_s2_b",
      name: "いあつ",
      description: "敵単体に攻撃力1.0倍のダメージを与え、攻撃力を低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 2,
      effects: [
        { kind: "DAMAGE", multiplier: 1.0 },
        { kind: "DEBUFF", stat: "atk", amount: 0.2, durationTurns: 2 },
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
      description: "渾身の一撃(2.2倍)を叩き込み、相手をスタンさせる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 2.2 },
        { kind: "STUN", durationTurns: 1 },
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
      name: "ひっさつのキバ",
      description: "敵単体に攻撃力1.8倍のダメージを与え、防御力を大きく低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8 },
        { kind: "DEBUFF", stat: "def", amount: 0.3, durationTurns: 2 },
      ],
    },
  ],
};

const GOLEM: MonsterTemplate = {
  templateId: "golem",
  baseName: "ゴーレム",
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
      description: "敵単体に攻撃力1.3倍のダメージを与え、防御力を低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.3 },
        { kind: "DEBUFF", stat: "def", amount: 0.2, durationTurns: 2 },
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
      effects: [{ kind: "BUFF", stat: "def", amount: 0.4, durationTurns: 3 }],
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
      effects: [{ kind: "BUFF", stat: "atk", amount: 0.35, durationTurns: 3 }],
    },
  ],
};

const FAIRY: MonsterTemplate = {
  templateId: "fairy",
  baseName: "フェアリー",
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
    name: "ちいさな祝福",
    description: "味方単体のHPを最大HPの18%回復する。",
    target: "SINGLE_ALLY",
    cooldownTurns: 0,
    effects: [{ kind: "HEAL", healRate: 0.18 }],
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
      description: "味方全体のHPを最大HPの12%回復し、防御力を上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 3,
      effects: [
        { kind: "HEAL", healRate: 0.12 },
        { kind: "BUFF", stat: "def", amount: 0.15, durationTurns: 2 },
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
      effects: [{ kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 3 }],
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
        { kind: "BUFF", stat: "def", amount: 0.25, durationTurns: 3 },
      ],
    },
  ],
};

export const MONSTER_TEMPLATES: MonsterTemplate[] = [SLIME, WOLF, GOLEM, FAIRY];

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

/** テンプレート×6属性 = 24体の色違いモンスター図鑑(通常の召喚・ステージ対象) */
export const MONSTER_TEMPLATES_DEX = MONSTER_TEMPLATES.flatMap((template) => createAllVariants(template));

/** 転生ピッグの6属性色違いバリエーション(図鑑には含めるが、通常の召喚・ステージ抽選には出さない) */
export const REINCARNATION_PIG_DEX = createAllVariants(REINCARNATION_PIG);

/** 検索用の全モンスター図鑑(通常モンスター + 転生ピッグ) */
export const MONSTER_DEX = [...MONSTER_TEMPLATES_DEX, ...REINCARNATION_PIG_DEX];

export function findMonster(templateId: string, element: string) {
  return MONSTER_DEX.find((m) => m.templateId === templateId && m.element === element);
}

export function findMonsterById(dexId: string) {
  return MONSTER_DEX.find((m) => m.id === dexId);
}
