import { MonsterTemplate } from "../core/monster.js";
import { Skill } from "../core/skill.js";

/**
 * 目覚の深域に出る敵。**才能神獣アルケオスと、その2つの晶。**
 *
 * ## この場所が問うていること
 *
 * 装備ダンジョンは「装備が揃っているか」、塔は「持ち越せるか」を問う。
 * ここが問うのは**同じ手を繰り返せるか**で、そのために2つの仕掛けがある:
 *
 *   1. **ヒット数の反撃** — 手数を掛けたぶんだけ全体攻撃が返る
 *   2. **才能適応** — 同じ相手から連続で受けると、その相手からの
 *      ダメージが段階的に効かなくなる。**別の味方が殴ると1段階戻る**
 *
 * 2つ目が要になっている。1体の高火力に全部を任せる編成は、
 * 殴るほど自分の火力が痩せていく。**手を分散させる**か、
 * 適応が乗り切る前に落とし切るか——どちらを選ぶかがこの場所の問いになる。
 *
 * ## 晶を先に倒すか、本体へ集中するか
 *
 * 晶は倒すたびに本体を強くする(攻を倒すと防御無視、護を倒すと硬くなる)。
 * **消せば消すほど本体が手強くなる**ので、放っておく選択肢が常にある。
 * 装備ダンジョンの古代の魔人と同じ考え方で、
 * 取り巻きを「先に消しておく置物」で終わらせないための仕掛け。
 *
 * ## 図鑑には載せない
 *
 * 誰も所有できない敵なので、召喚にも図鑑にも出さない
 * (`monsters.ts` の `DEPTH_BOSS_ONLY_DEX` から引ける形にしてある)。
 */

export const ARCHEOS_TEMPLATE_ID = "archeos";
export const TALENT_SHARD_ATK_TEMPLATE_ID = "talent_shard_atk";
export const TALENT_SHARD_DEF_TEMPLATE_ID = "talent_shard_def";

/* ==========================================================================
 * アルケオスのスキル
 * ========================================================================== */

const ARCHEOS_S1: Skill = {
  id: "archeos_s1",
  name: "才閃",
  description: "敵単体に攻撃力1.4倍のダメージを与え、40%で防御力を50%低下させる(1ターン)。",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [
    { kind: "DAMAGE", multiplier: 1.4 },
    { kind: "DEBUFF", stat: "def", amount: 0.50, durationTurns: 1, chance: 0.40, fixedDuration: true },
  ],
};

/**
 * S2。**反撃でもこれを撃つ。**
 *
 * 単発を返すのではなく全体技を撃ち返すので、手数を掛けた側が
 * まとめて代償を払う。ゲージ減少が付いているのは、
 * 反撃が「痛いだけ」で終わらず**手番の取り合いに効く**ようにするため。
 */
const ARCHEOS_S2: Skill = {
  id: "archeos_s2",
  name: "才崩の波",
  description: "敵全体に攻撃力1.1倍のダメージを与え、行動ゲージを20%減少させる。",
  target: "ALL_ENEMIES",
  cooldownTurns: 3,
  effects: [
    { kind: "DAMAGE", multiplier: 1.1 },
    { kind: "GAUGE", amount: -0.20 },
  ],
};

const ARCHEOS_S3: Skill = {
  id: "archeos_s3",
  name: "断才",
  description: "攻撃前に対象の強化効果を1個解除し、敵単体に攻撃力2.8倍のダメージを与える。"
    + "対象に弱体効果があれば最終ダメージ+30%。",
  target: "SINGLE_ENEMY",
  cooldownTurns: 4,
  effects: [
    // **解除が先。**免疫や無敵を剥がしてから本命を通す
    { kind: "STRIP", count: 1, chance: 1 },
    {
      kind: "DAMAGE", multiplier: 2.8,
      conditionalBonus: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.30 }],
    },
  ],
};

export const ARCHEOS_SKILLS: [Skill, Skill, Skill] = [ARCHEOS_S1, ARCHEOS_S2, ARCHEOS_S3];

/* ==========================================================================
 * 才能晶のスキル
 *
 * **どちらも本体を助ける役。**自分で削り切る力は持たせない。
 * 晶が主役になると「晶から倒す」以外の答えが消える。
 * ========================================================================== */

const SHARD_ATK_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "talent_shard_atk_s1", name: "才鋭",
    description: "敵単体に攻撃力1.1倍のダメージを与える。",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 1.1 }],
  },
  {
    id: "talent_shard_atk_s2", name: "増幅の光",
    description: "味方全体の攻撃力を30%上昇させる(2ターン)。",
    target: "ALL_ALLIES", cooldownTurns: 3,
    effects: [{ kind: "BUFF", stat: "atk", amount: 0.30, durationTurns: 2 }],
  },
  {
    id: "talent_shard_atk_s3", name: "才穿",
    description: "敵単体に攻撃力1.6倍のダメージを与え、防御力を50%低下させる(2ターン)。",
    target: "SINGLE_ENEMY", cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 1.6 },
      { kind: "DEBUFF", stat: "def", amount: 0.50, durationTurns: 2, chance: 1 },
    ],
  },
];

const SHARD_DEF_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "talent_shard_def_s1", name: "才盾",
    description: "敵単体に攻撃力0.9倍のダメージを与える。",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.9 }],
  },
  {
    id: "talent_shard_def_s2", name: "護りの結",
    description: "味方全体に最大HPの12%のシールドを張る(2ターン)。",
    target: "ALL_ALLIES", cooldownTurns: 3,
    effects: [{ kind: "SHIELD", shieldRate: 0.12, durationTurns: 2 }],
  },
  {
    id: "talent_shard_def_s3", name: "才癒",
    description: "味方全体のHPを15%回復し、防御力を30%上昇させる(2ターン)。",
    target: "ALL_ALLIES", cooldownTurns: 4,
    effects: [
      { kind: "HEAL", healRate: 0.15 },
      { kind: "BUFF", stat: "def", amount: 0.30, durationTurns: 2 },
    ],
  },
];

/* ==========================================================================
 * 図鑑の原型
 *
 * 実際に戦う時の値は階のデータ(`fixedStats`)が決めるので、
 * ここの `baseStats` は「その場に何も無い」を避けるための土台でしかない。
 * ========================================================================== */

function templateOf(
  templateId: string, baseName: string, emoji: string, role: string, skills: [Skill, Skill, Skill],
): MonsterTemplate {
  return {
    templateId,
    baseName,
    emoji,
    role,
    baseStats: { hp: 1800, atk: 250, def: 130, spd: 118, criRate: 0.25, criDmg: 1.7, resistance: 0.35, accuracy: 0.35 },
    skill1: skills[0],
    skill2Variants: [skills[1]],
    skill3Variants: [skills[2]],
    dexNote: "目覚の深域にのみ現れる。召喚では手に入らない。",
  };
}

export const ARCHEOS: MonsterTemplate = templateOf(
  ARCHEOS_TEMPLATE_ID, "才能神獣 アルケオス", "🦌", "ボス", ARCHEOS_SKILLS,
);
export const TALENT_SHARD_ATK: MonsterTemplate = templateOf(
  TALENT_SHARD_ATK_TEMPLATE_ID, "才能晶・攻", "🔺", "アタッカー", SHARD_ATK_SKILLS,
);
export const TALENT_SHARD_DEF: MonsterTemplate = templateOf(
  TALENT_SHARD_DEF_TEMPLATE_ID, "才能晶・護", "🛡", "サポート", SHARD_DEF_SKILLS,
);
