import { BossTraits } from "../core/monster.js";
import { Skill } from "../core/skill.js";
import { DungeonEnemy } from "./equipmentDungeon.js";
import { ANCIENT_CRYSTAL, ANCIENT_CRYSTAL_CURSE, ANCIENT_DEMON } from "./monsters.js";

/**
 * 試練の塔 60階「豪魔人」。
 *
 * ## どういう階か
 *
 * 豪魔人1体と、性質の違う取り巻き2体。
 *
 *   ・**古代の魔晶** — 味方を強化し、こちらの強化を1個ずつ剥がす
 *   ・**古代の呪晶** — 攻撃力・防御力を削り、全体へ回復不能をまく
 *
 * 豪魔人は5発受けるたびに、その場で「断魔の一閃」を撃ち返す。
 * だから手数で押す戦い方には代償があり、それでも**倒す順**を選べる余地は残っている。
 *
 * ## 取り巻きを倒すと本体が伸びる
 *
 * 呪晶を倒せば豪魔人の速度が、魔晶を倒せば攻撃力が上がる。
 * これは「取り巻きを先に消しておく」を無料の下準備にしないための仕掛けで、
 * **消せば消すほど本体が重くなる**。逆に本体だけを狙う線も残してある
 * (勝利条件は豪魔人の撃破だけ。取り巻きを倒すことは必須ではない)。
 *
 * ## 数字の出どころ
 *
 * ここに並んでいる実数は、**Battle Lab で1000戦ずつ実測して決めた値**であって
 * 机上の見積もりではない(`tools/battleLab/scenarios/tower60v2.ts`)。
 * ★6 Lv60 + 現実的に強い★6装備(TYPICAL)の5体編成で、
 *
 *   ・豪魔人集中          85.7%
 *   ・既存AIまかせ        68.3%
 *   ・魔晶→呪晶→豪魔人   67.9%
 *   ・呪晶→魔晶→豪魔人   54.2%
 *
 * 触る時は `npx tsx tools/battleLab/index.ts --scenario tower-60-v2` で測ってから。
 *
 * ## 何をしないか
 *
 * HP300,000・反撃はスキル2・回復封じ(半減)だった一つ前の形は、
 * **1000戦して敗北0**だった。負けているのではなく300手で削りきれない引き分けばかりで、
 * 支え役は敵の攻撃力を+1000しても生存率100%のまま。
 * だからHPを半分にして「削りきれる長さ」にし、圧を一撃と回復不能へ移している。
 *
 * 回復不能は耐久という戦術を**封じる札ではない**。2ターンで切れ、抵抗もできる。
 * 「回復が間に合うか」を勝負にするためのもので、継続ダメージや耐久そのものへ
 * 罰を与えるものではない(`docs/design-concept.md` / `tests/continuousDamage.test.ts`)。
 */

/** 豪魔人の3つ。スキル3の倍率3.5倍が、反撃で撃ち返される一撃そのもの */
const GOMAJIN_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "tower60_gomajin_s1",
    name: "豪魔の一撃",
    description: "敵単体に攻撃力1.3倍のダメージを与え、20%で1ターンスタンさせる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.3 },
      { kind: "STUN", durationTurns: 1, chance: 0.2 },
    ],
  },
  {
    id: "tower60_gomajin_s2",
    name: "豪魔の渦",
    description: "敵全体に攻撃力1.2倍のダメージを与え、各対象の行動ゲージを25%吸収する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 3,
    effects: [
      { kind: "DAMAGE", multiplier: 1.2 },
      // **吸収**。減らした分をそのまま自分のゲージへ移す
      { kind: "GAUGE", amount: 0.25, drain: true },
    ],
  },
  {
    id: "tower60_gomajin_s3",
    name: "断魔の一閃",
    description: "敵単体に攻撃力3.5倍のダメージを与え、50%で1ターンスタンさせる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 3.5 },
      { kind: "STUN", durationTurns: 1, chance: 0.5 },
    ],
  },
];

/** 古代の魔晶。**強化を積み、こちらの強化を1個ずつ剥がす** */
const MASHOU_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "tower60_mashou_s1",
    name: "晶片の刃",
    description: "敵単体に攻撃力1.0倍のダメージを与え、50%で強化効果を1個解除する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.0 },
      // **全部ではなく1個**。全解除にすると、こちらの支えが丸ごと無意味になる
      { kind: "STRIP", chance: 0.5, count: 1 },
    ],
  },
  {
    id: "tower60_mashou_s2",
    name: "魔晶の加護",
    description: "味方全体の攻撃力を2ターン上昇させる。",
    target: "ALL_ALLIES",
    cooldownTurns: 3,
    effects: [{ kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 2 }],
  },
  {
    id: "tower60_mashou_s3",
    name: "崩晶の波",
    description: "敵全体に攻撃力0.8倍のダメージを与え、それぞれの強化効果を1個解除する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 0.8 },
      { kind: "STRIP", count: 1 },
    ],
  },
];

/** 古代の呪晶。**スキル3が回復不能。**支え役が落ちない一番の理由へ直接触る札 */
const JUSHOU_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "tower60_jushou_s1",
    name: "呪詛の爪",
    description: "敵単体に攻撃力0.9倍のダメージを与え、50%で2ターン攻撃力を低下させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.9 },
      { kind: "DEBUFF", stat: "atk", amount: 0.3, durationTurns: 2, chance: 0.5 },
    ],
  },
  {
    id: "tower60_jushou_s2",
    name: "呪晶の波動",
    description: "敵全体に攻撃力0.8倍のダメージを与え、70%で2ターン防御力を大きく低下させる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 3,
    effects: [
      { kind: "DAMAGE", multiplier: 0.8 },
      { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.7 },
    ],
  },
  {
    id: "tower60_jushou_s3",
    name: "呪縛の帳",
    description: "敵全体に、75%で2ターン回復不能を付与する。ダメージは与えない。",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      /*
       * **回復量を減らすのではなく、止める。**
       * 半減では「回復が間に合うか」の勝負にならず、ただ時間が伸びるだけだった
       * (前の形でクロノスは受けた量より多く回復していた)。
       */
      { kind: "HEAL_BLOCK", healMultiplier: 0, durationTurns: 2, chance: 0.75 },
    ],
  },
];

/**
 * 豪魔人の特性。
 *
 * `counterSkillIndex` は**スキル3をそのまま撃つ**印。エンジン側の既存機構を使うので、
 * 撃ってもクールタイム・手番・行動ゲージは一切動かない。
 * 多段は1ヒットごとに1数え、毒や火傷のような継続ダメージは数えない。
 */
const GOMAJIN_TRAITS: BossTraits = {
  counterAfterHits: 5,
  counterSkillIndex: 2,
};

/** 60階の豪魔人が持つ実効HP。ここを触る時は必ず Battle Lab で測り直すこと */
export const TOWER60_BOSS_HP = 150_000;
export const TOWER60_BOSS_ATK = 7_200;
export const TOWER60_BOSS_DEF = 3_800;
export const TOWER60_BOSS_SPD = 165;

/** 呪晶を倒した時、豪魔人へ足す速度 */
export const TOWER60_JUSHOU_DEATH_SPD = 50;
/** 魔晶を倒した時、豪魔人へ足す攻撃力 */
export const TOWER60_MASHOU_DEATH_ATK = 1_600;

/**
 * 60階の顔ぶれ。
 *
 * `star` / `level` は `fixedStats` があるので実効値には効かないが、
 * 型が要求するので帯の上限(★6 Lv60)を入れてある。
 */
export const TOWER60_ENEMIES: DungeonEnemy[] = [
  {
    templateId: ANCIENT_DEMON.templateId,
    element: "DARK",
    star: 6,
    level: 60,
    isBoss: true,
    // **勝利条件は豪魔人の撃破だけ。**取り巻きを先に倒すことは必須ではない
    victoryTarget: true,
    primaryTarget: true,
    displayName: "古代の豪魔人",
    fixedStats: {
      hp: TOWER60_BOSS_HP,
      atk: TOWER60_BOSS_ATK,
      def: TOWER60_BOSS_DEF,
      spd: TOWER60_BOSS_SPD,
      criRate: 0.2,
      criDmg: 1.6,
      accuracy: 0.3,
      resistance: 0.4,
    },
    skills: GOMAJIN_SKILLS,
    bossTraits: GOMAJIN_TRAITS,
  },
  {
    templateId: ANCIENT_CRYSTAL.templateId,
    element: "LIGHT",
    star: 6,
    level: 60,
    victoryTarget: false,
    displayName: "古代の魔晶",
    fixedStats: {
      hp: 120_000,
      atk: 3_800,
      def: 2_600,
      spd: 175,
      criRate: 0.15,
      criDmg: 1.5,
      accuracy: 0.3,
      resistance: 0.3,
    },
    skills: MASHOU_SKILLS,
    // 倒すと本体の攻撃力が伸びる。**エンジン側の既存機構をそのまま使う**
    bossTraits: { empowerBossOnDeath: { atk: TOWER60_MASHOU_DEATH_ATK } },
  },
  {
    templateId: ANCIENT_CRYSTAL_CURSE.templateId,
    element: "DARK",
    star: 6,
    level: 60,
    victoryTarget: false,
    displayName: "古代の呪晶",
    fixedStats: {
      hp: 112_500,
      atk: 3_500,
      def: 2_400,
      spd: 170,
      criRate: 0.15,
      criDmg: 1.5,
      accuracy: 0.4,
      resistance: 0.3,
    },
    skills: JUSHOU_SKILLS,
    bossTraits: { empowerBossOnDeath: { spd: TOWER60_JUSHOU_DEATH_SPD } },
  },
];
