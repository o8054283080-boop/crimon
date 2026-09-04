import { Skill } from "../core/skill.js";
import { DungeonEnemy } from "./equipmentDungeon.js";
import { ANCIENT_CRYSTAL, ANCIENT_CRYSTAL_CURSE, BEHEMOTH } from "./monsters.js";

/**
 * 試練の塔70階「始祖ベヒモス」。
 * Battle Lab V7（各編成1000戦×5攻略順、合計15,000戦）で確定した本編用データ。
 *
 * ボス固有の再生・HP帯強化・始祖の咆哮、脈動晶の「命脈断ち」は
 * 3スキル枠とは別の階固有ギミックなので BattleEngine の70階処理で解決する。
 */

export const TOWER70_BOSS_HP = 170_000;
export const TOWER70_BOSS_ATK = 8_000;
export const TOWER70_BOSS_DEF = 4_000;
export const TOWER70_BOSS_SPD = 168;

export const TOWER70_BOSS_REGEN = 0.03;
export const TOWER70_LIFE_REGEN_BONUS = 0.04;
export const TOWER70_ROAR_THRESHOLDS = [0.75, 0.5, 0.25] as const;
export const TOWER70_ROAR_MULTIPLIER = 1.5;
export const TOWER70_ROAR_HP_COEFFICIENT = 0.05;
export const TOWER70_ROAR_GAUGE_DOWN = 0.5;
export const TOWER70_ROAR_DEF_DOWN = 0.5;
export const TOWER70_ROAR_DEF_DOWN_TURNS = 3;
export const TOWER70_PULSE_CRUSH_RATIO = 0.5;

export const TOWER70_BOSS_TEMPLATE_ID = BEHEMOTH.templateId;
export const TOWER70_LIFE_TEMPLATE_ID = ANCIENT_CRYSTAL.templateId;
export const TOWER70_PULSE_TEMPLATE_ID = ANCIENT_CRYSTAL_CURSE.templateId;

const BEHEMOTH_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "tower70_behemoth_s1",
    name: "巨獣の一撃",
    description: "敵単体に攻撃力0.55倍＋自身の最大HP3%分のダメージを与え、50%で2ターン挑発する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.55, hpCoefficient: 0.03 },
      { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.5 },
    ],
  },
  {
    id: "tower70_behemoth_s2",
    name: "大地踏み",
    description: "敵全体に攻撃力0.8倍＋自身の最大HP4%分のダメージを与え、70%で2ターン攻撃力を50%低下させる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 3,
    effects: [
      { kind: "DAMAGE", multiplier: 0.8, hpCoefficient: 0.04 },
      { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.7 },
    ],
  },
  {
    id: "tower70_behemoth_s3",
    name: "天地崩壊",
    description: "敵全体に攻撃力1.2倍＋自身の最大HP5%分のダメージを与え、80%で2ターン防御力を50%低下。使用時に自身の弱体効果を全解除し、HP50%以上なら敵全体の行動ゲージを20%減少させる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 1.2, hpCoefficient: 0.05 },
      { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.8 },
    ],
  },
];

const LIFE_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "tower70_life_s1",
    name: "生命晶の光",
    description: "敵単体に攻撃力0.7倍のダメージを与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.7 }],
  },
  {
    id: "tower70_life_s2",
    name: "生命の律動",
    description: "味方全体の弱体効果をすべて解除する。回復は行わない。",
    target: "ALL_ALLIES",
    cooldownTurns: 3,
    effects: [{ kind: "CLEANSE" }],
  },
  {
    id: "tower70_life_s3",
    name: "生命晶の波",
    description: "敵全体に攻撃力0.6倍のダメージを与える。",
    target: "ALL_ENEMIES",
    cooldownTurns: 4,
    effects: [{ kind: "DAMAGE", multiplier: 0.6 }],
  },
];

const PULSE_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "tower70_pulse_s1",
    name: "脈動晶の打撃",
    description: "敵単体に攻撃力0.7倍のダメージを与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.7 }],
  },
  {
    id: "tower70_pulse_s2",
    name: "命脈断ち",
    description: "現在HPの実数が高い生存敵3体の現在HPを、それぞれ半分にする（最低1）。防御・会心・命中・抵抗の影響を受けない。",
    target: "SELF",
    cooldownTurns: 5,
    effects: [],
  },
  {
    id: "tower70_pulse_s3",
    name: "脈動崩し",
    description: "敵全体に攻撃力0.5倍のダメージを与え、50%で行動ゲージを15%減少させる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 0.5 },
      { kind: "GAUGE", amount: -0.15, chance: 0.5 },
    ],
  },
];

export const TOWER70_ENEMIES: DungeonEnemy[] = [
  {
    templateId: TOWER70_BOSS_TEMPLATE_ID,
    element: "DARK",
    star: 6,
    level: 60,
    isBoss: true,
    victoryTarget: true,
    primaryTarget: true,
    displayName: "始祖ベヒモス",
    fixedStats: {
      hp: TOWER70_BOSS_HP,
      atk: TOWER70_BOSS_ATK,
      def: TOWER70_BOSS_DEF,
      spd: TOWER70_BOSS_SPD,
      criRate: 0.2,
      criDmg: 1.6,
      accuracy: 0.4,
      resistance: 0.4,
    },
    skills: BEHEMOTH_SKILLS,
  },
  {
    templateId: TOWER70_LIFE_TEMPLATE_ID,
    element: "LIGHT",
    star: 6,
    level: 60,
    victoryTarget: false,
    displayName: "古代の生命晶",
    fixedStats: {
      hp: 130_000,
      atk: 1_900,
      def: 3_800,
      spd: 230,
      criRate: 0.15,
      criDmg: 1.5,
      accuracy: 0.3,
      resistance: 0.4,
    },
    skills: LIFE_SKILLS,
  },
  {
    templateId: TOWER70_PULSE_TEMPLATE_ID,
    element: "DARK",
    star: 6,
    level: 60,
    victoryTarget: false,
    displayName: "古代の脈動晶",
    fixedStats: {
      hp: 140_000,
      atk: 2_100,
      def: 4_200,
      spd: 230,
      criRate: 0.15,
      criDmg: 1.5,
      accuracy: 0.4,
      resistance: 0.4,
    },
    skills: PULSE_SKILLS,
  },
];
