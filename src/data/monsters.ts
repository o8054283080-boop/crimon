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
  skills: [
    {
      id: "slime_s1",
      name: "たたく",
      description: "敵単体に攻撃力1.0倍のダメージを与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 1.0 }],
    },
    {
      id: "slime_s2",
      name: "エレメンタルバースト",
      description: "属性の力を込めて敵単体に攻撃力1.7倍のダメージを与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 1.7 }],
    },
    {
      id: "slime_s3",
      name: "げんかいとっぱ",
      description: "限界を超えた力で敵全体に攻撃力1.3倍のダメージを与える。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [{ kind: "DAMAGE", multiplier: 1.3 }],
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
  skills: [
    {
      id: "wolf_s1",
      name: "かみつく",
      description: "敵単体に攻撃力1.0倍のダメージを与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 1.0 }],
    },
    {
      id: "wolf_s2",
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
      id: "wolf_s3",
      name: "全力の一撃",
      description: "渾身の一撃(2.2倍)を叩き込み、相手をスタンさせる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 2.2 },
        { kind: "STUN", durationTurns: 1 },
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
  skills: [
    {
      id: "golem_s1",
      name: "たいあたり",
      description: "敵単体に攻撃力0.8倍のダメージを与える。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 0.8 }],
    },
    {
      id: "golem_s2",
      name: "がんせきふる",
      description: "巨岩を降らせ敵全体に攻撃力0.9倍のダメージを与える。",
      target: "ALL_ENEMIES",
      cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 0.9 }],
    },
    {
      id: "golem_s3",
      name: "てっぺき",
      description: "味方全体の防御力を大きく上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [{ kind: "BUFF", stat: "def", amount: 0.4, durationTurns: 3 }],
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
  skills: [
    {
      id: "fairy_s1",
      name: "ちいさな祝福",
      description: "味方単体のHPを最大HPの18%回復する。",
      target: "SINGLE_ALLY",
      cooldownTurns: 0,
      effects: [{ kind: "HEAL", healRate: 0.18 }],
    },
    {
      id: "fairy_s2",
      name: "いやしのかぜ",
      description: "味方全体のHPを最大HPの22%回復する。",
      target: "ALL_ALLIES",
      cooldownTurns: 3,
      effects: [{ kind: "HEAL", healRate: 0.22 }],
    },
    {
      id: "fairy_s3",
      name: "せいれいの加護",
      description: "味方全体の攻撃力を大きく上昇させる。",
      target: "ALL_ALLIES",
      cooldownTurns: 4,
      effects: [{ kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 3 }],
    },
  ],
};

export const MONSTER_TEMPLATES: MonsterTemplate[] = [SLIME, WOLF, GOLEM, FAIRY];

/** テンプレート×6属性 = 24体の色違いモンスター図鑑 */
export const MONSTER_DEX = MONSTER_TEMPLATES.flatMap((template) => createAllVariants(template));

export function findMonster(templateId: string, element: string) {
  return MONSTER_DEX.find((m) => m.templateId === templateId && m.element === element);
}
