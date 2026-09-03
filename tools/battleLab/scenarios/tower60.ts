/**
 * 試練の塔 60階(調整中)。
 *
 * ## これは本編ではない
 *
 * `src/data/trialTower.ts` の60階には**一切触れていない。** ここに書いてあるのは
 * 「こういう階にしたらどうなるか」を測るための仮の盤面で、本編へ入れるのは
 * この道具で測ってからの別作業(依頼主の指定)。
 *
 * ## 何を確かめたい階か
 *
 * 豪魔人は**手数で押す戦い方に代償を作る**。6発殴られるたびに全体技を撃ち返すので、
 * 多段や連打で押し切ろうとするほど返しが増える。取り巻きは
 *
 *   ・魔晶: 味方を強化し、こちらの強化を1個ずつ剥がす
 *   ・呪晶: こちらの攻撃と防御を削る
 *
 * という役割で、**どちらから倒すかで戦いの形が変わる**ことを狙っている。
 * 「強い数字を置いた置物」にしないための階。
 */
import type { Skill } from "../../../src/core/skill.js";
import type { Scenario } from "../types.js";

/** 標準のATK_UP。**本編で使っている量をそのまま使う**(ここで別の数字を置かない) */
const STANDARD_ATK_UP = 0.3;

const GOMAJIN_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "lab_gomajin_s1",
    name: "豪魔の一撃",
    description: "単体へ強烈な一撃。20%で1ターンスタン。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.3 },
      { kind: "STUN", durationTurns: 1, chance: 0.2 },
    ],
  },
  {
    id: "lab_gomajin_s2",
    name: "豪魔の渦",
    description: "敵全体を攻撃し、各対象の行動ゲージを25%吸収する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 3,
    effects: [
      { kind: "DAMAGE", multiplier: 1.2 },
      /*
       * **吸収**。減らした分をそのまま自分のゲージへ移す。
       * 既存の `drain` をそのまま使っているので、ゲージの上限も
       * 移し方も本編と同じ処理が回る。
       */
      { kind: "GAUGE", amount: 0.25, drain: true },
    ],
  },
  {
    id: "lab_gomajin_s3",
    name: "断魔の一閃",
    description: "単体へ渾身の一撃。50%で1ターンスタン。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 2.5 },
      { kind: "STUN", durationTurns: 1, chance: 0.5 },
    ],
  },
];

const MASHOU_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "lab_mashou_s1",
    name: "晶片の刃",
    description: "単体を攻撃し、50%で有利な効果を1個解除する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.0 },
      // **全部ではなく1個**。全解除にすると、こちらの支えが丸ごと無意味になる
      { kind: "STRIP", chance: 0.5, count: 1 },
    ],
  },
  {
    id: "lab_mashou_s2",
    name: "魔晶の加護",
    description: "味方全体の攻撃力を2ターン上げる。",
    target: "ALL_ALLIES",
    cooldownTurns: 3,
    effects: [{ kind: "BUFF", stat: "atk", amount: STANDARD_ATK_UP, durationTurns: 2 }],
  },
  {
    id: "lab_mashou_s3",
    name: "崩晶の波",
    description: "敵全体を攻撃し、それぞれの有利な効果を1個解除する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 0.8 },
      { kind: "STRIP", count: 1 },
    ],
  },
];

const JUSHOU_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "lab_jushou_s1",
    name: "呪詛の爪",
    description: "単体を攻撃し、50%で2ターン攻撃力を下げる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.9 },
      { kind: "DEBUFF", stat: "atk", amount: 0.3, durationTurns: 2, chance: 0.5 },
    ],
  },
  {
    id: "lab_jushou_s2",
    name: "呪晶の波動",
    description: "敵全体を攻撃し、70%で2ターン防御力を50%下げる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 3,
    effects: [
      { kind: "DAMAGE", multiplier: 0.8 },
      { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.7 },
    ],
  },
  {
    id: "lab_jushou_s3",
    name: "二重呪詛",
    description: "敵全体へ、攻撃力低下と防御力低下をそれぞれ60%で2ターン付与する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DEBUFF", stat: "atk", amount: 0.3, durationTurns: 2, chance: 0.6 },
      { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.6 },
    ],
  },
];

export const TOWER60: Scenario = {
  id: "tower-60",
  title: "試練の塔 60階(調整中)",
  note: "豪魔人+魔晶+呪晶。手数に代償を作る反撃と、強化解除・防御低下の噛み合いを見る",
  maxTurns: 300,
  expect: { minWinRate: 0.6, maxWinRate: 0.85 },
  allies: [
    { label: "ドラゴン[火]", templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
    { label: "ウィスプ[水]", templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
    { label: "クロノス[電気]", templateId: "chronos", element: "ELECTRIC", preset: "MAX_SPEED" },
    { label: "アビスリーパー[闇]", templateId: "abyssreaper", element: "DARK", preset: "MAX_DEBUFFER" },
    { label: "ヴァルキリア[火]", templateId: "valkyria", element: "FIRE", preset: "MAX_TANK" },
  ],
  enemies: [
    {
      label: "古代の豪魔人",
      templateId: "ancient_demon",
      element: "DARK",
      stats: { hp: 300_000, atk: 6_200, def: 3_800, spd: 165, criRate: 0.2, criDmg: 1.6, accuracy: 0.3, resistance: 0.4 },
      skills: GOMAJIN_SKILLS,
      bossTraits: {
        /*
         * 「豪魔の反撃」。合計6回ダメージを受けるたびに、その場でスキル2を撃つ。
         *
         *   ・多段は**1ヒットごとに1**数える(エンジンが1発ずつ数えている)
         *   ・毒・火傷などの継続ダメージは数えない(攻撃の当たりだけを数える口)
         *   ・撃ってもスキル2のクールタイムは動かない
         *   ・反撃で与えたダメージからは次の反撃が立ち上がらない
         */
        counterAfterHits: 6,
        counterSkillIndex: 1,
      },
      victoryTarget: true,
    },
    {
      label: "古代の魔晶",
      templateId: "ancient_crystal",
      element: "LIGHT",
      stats: { hp: 120_000, atk: 3_800, def: 2_600, spd: 175, criRate: 0.15, criDmg: 1.5, accuracy: 0.3, resistance: 0.3 },
      skills: MASHOU_SKILLS,
    },
    {
      label: "古代の呪晶",
      templateId: "ancient_crystal_curse",
      element: "DARK",
      stats: { hp: 112_500, atk: 3_500, def: 2_400, spd: 170, criRate: 0.15, criDmg: 1.5, accuracy: 0.4, resistance: 0.3 },
      skills: JUSHOU_SKILLS,
    },
  ],
  /*
   * 狙う順。**1つ目が既定。**
   *
   * 「どれから倒すか」で戦いの形が変わることを狙った階なので、
   * 順番を切り替えて比べられないと、その狙いが効いているか確かめようがない。
   */
  focusPatterns: [
    { name: "呪晶→魔晶→豪魔人", order: ["古代の呪晶", "古代の魔晶", "古代の豪魔人"] },
    { name: "魔晶→呪晶→豪魔人", order: ["古代の魔晶", "古代の呪晶", "古代の豪魔人"] },
    { name: "豪魔人集中", order: ["古代の豪魔人"] },
    { name: "既存AIまかせ", order: [] },
  ],
};
