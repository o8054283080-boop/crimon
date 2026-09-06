import type { Skill } from "../../../src/core/skill.js";
import type { Scenario, ScenarioHook } from "../types.js";
import { TOWER60 } from "./tower60.js";

const BOSS_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "lab_talent10_boss_s1",
    name: "才能穿ち",
    description: "敵単体に攻撃力1.4倍のダメージ。40%で1ターン防御力を下げる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.4 },
      { kind: "DEBUFF", stat: "def", amount: 0.3, durationTurns: 1, chance: 0.4 },
    ],
  },
  {
    id: "lab_talent10_boss_s2",
    name: "才能奔流",
    description: "敵全体に攻撃力1.1倍のダメージを与え、行動ゲージを20%吸収する。",
    target: "ALL_ENEMIES",
    cooldownTurns: 3,
    effects: [
      { kind: "DAMAGE", multiplier: 1.1 },
      { kind: "GAUGE", amount: 0.2, drain: true },
    ],
  },
  {
    id: "lab_talent10_boss_s3",
    name: "覚醒崩し",
    description: "敵単体の強化を1個解除して攻撃力2.8倍。弱化中なら最終ダメージ+30%。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 4,
    effects: [
      { kind: "STRIP", count: 1 },
      { kind: "DAMAGE", multiplier: 2.8, conditionalBonus: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.3 }] },
    ],
  },
];

const ATTACK_CRYSTAL_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "lab_talent10_attack_s1",
    name: "破才の欠片",
    description: "敵単体を攻撃し、50%で強化を1個解除する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.9 },
      { kind: "STRIP", count: 1, chance: 0.5 },
    ],
  },
  {
    id: "lab_talent10_attack_s2",
    name: "攻才励起",
    description: "味方全体の攻撃力を2ターン30%上げる。",
    target: "ALL_ALLIES",
    cooldownTurns: 3,
    effects: [{ kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 2 }],
  },
  {
    id: "lab_talent10_attack_s3",
    name: "迅才励起",
    description: "味方全体の速度を2ターン25%上げる。",
    target: "ALL_ALLIES",
    cooldownTurns: 4,
    effects: [{ kind: "BUFF", stat: "spd", amount: 0.25, durationTurns: 2 }],
  },
];

const GUARD_CRYSTAL_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "lab_talent10_guard_s1",
    name: "護才の欠片",
    description: "敵単体に攻撃力0.8倍のダメージ。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.8 }],
  },
  {
    id: "lab_talent10_guard_s2",
    name: "再生の才",
    description: "味方全体を最大HPの8%回復する。",
    target: "ALL_ALLIES",
    cooldownTurns: 3,
    effects: [{ kind: "HEAL", healRate: 0.08 }],
  },
  {
    id: "lab_talent10_guard_s3",
    name: "才能障壁",
    description: "自身の最大HPの8%ぶんのシールドを味方全体へ2ターン張る。",
    target: "ALL_ALLIES",
    cooldownTurns: 4,
    effects: [{ kind: "SHIELD", shieldRate: 0.08, durationTurns: 2, fromSourceHp: true }],
  },
];

/**
 * 本案の「才能適応」と護晶撃破後の15%軽減を、Battle Labが既に許している
 * mitigateAmount/mitigateTurnsだけで再現する。ダメージ式そのものは本編エンジンのまま。
 *
 * 攻晶撃破後の「防御20%無視」だけは実行時に traits を差し替える口が無いため、
 * 初回測定では近い圧として boss ATK +1000 で代理する。
 */
const talentHook: ScenarioHook = ({ unitOf, aliveOf }) => {
  const boss = unitOf("E1");
  const adapt = new Map<string, number>();
  let guardAwakened = false;
  let guardWasAlive = true;
  let playerTurnHpBefore = boss?.currentHp ?? 0;
  let currentPlayer = "";

  const applyMitigation = (unitId: string): void => {
    if (!boss) return;
    const base = guardAwakened ? 0.15 : 0;
    const personal = unitId.startsWith("P") ? (adapt.get(unitId) ?? 0) * 0.05 : 0;
    boss.mitigateAmount = Math.min(0.35, base + personal);
    boss.mitigateTurns = 999;
  };

  return {
    beforeTurn(unitId) {
      currentPlayer = unitId.startsWith("P") ? unitId : "";
      playerTurnHpBefore = boss?.currentHp ?? 0;
      applyMitigation(unitId);
    },
    afterTurn(unitId) {
      if (!boss) return;

      if (currentPlayer && unitId === currentPlayer && boss.currentHp < playerTurnHpBefore) {
        adapt.set(currentPlayer, Math.min(4, (adapt.get(currentPlayer) ?? 0) + 1));
        for (const key of adapt.keys()) {
          if (key !== currentPlayer) adapt.set(key, Math.max(0, (adapt.get(key) ?? 0) - 1));
        }
      }

      const guardAlive = aliveOf("E3");
      if (guardWasAlive && !guardAlive && !guardAwakened) {
        guardAwakened = true;
        boss.flatStatBonus.spd = (boss.flatStatBonus.spd ?? 0) + 10;
      }
      guardWasAlive = guardAlive;
      applyMitigation("");
    },
    finish() {
      return {
        guardAwakened: guardAwakened ? 1 : 0,
        maxAdaptStacks: Math.max(0, ...adapt.values()),
      };
    },
  };
};

export const TALENT_TEMPLE_10_MEASURE: Scenario = {
  id: "talent-temple-10-measure",
  title: "才能の神殿10F 仮測定",
  note: "塔60F基準の5体編成で、周回向けのギミック型10Fを測る",
  maxTurns: 300,
  expect: { minWinRate: 0.6, maxWinRate: 0.7 },
  allies: TOWER60.allies,
  enemies: [
    {
      label: "才能神獣 アルケオス",
      templateId: "ancient_beast",
      element: "LIGHT",
      stats: {
        hp: 230_000,
        atk: 8_000,
        def: 4_000,
        spd: 185,
        criRate: 0.2,
        criDmg: 1.6,
        accuracy: 0.35,
        resistance: 0.45,
      },
      skills: BOSS_SKILLS,
      victoryTarget: true,
      // 塔60Fの3.5倍単体反撃より穏やかに、6ヒットごとにS2を返す。
      bossTraits: { counterAfterHits: 6, counterSkillIndex: 1 },
    },
    {
      label: "才能晶・攻",
      templateId: "ancient_crystal",
      element: "FIRE",
      stats: {
        hp: 100_000,
        atk: 3_200,
        def: 2_400,
        spd: 178,
        criRate: 0.15,
        criDmg: 1.5,
        accuracy: 0.35,
        resistance: 0.3,
      },
      skills: ATTACK_CRYSTAL_SKILLS,
      // 「防御20%無視」の初回代理。さらに両晶撃破で速度+20になるよう半分の+10を持たせる。
      bossTraits: { empowerBossOnDeath: { atk: 1_000, spd: 10 } },
    },
    {
      label: "才能晶・護",
      templateId: "ancient_crystal_curse",
      element: "WATER",
      stats: {
        hp: 110_000,
        atk: 2_800,
        def: 3_000,
        spd: 165,
        criRate: 0.15,
        criDmg: 1.5,
        accuracy: 0.25,
        resistance: 0.4,
      },
      skills: GUARD_CRYSTAL_SKILLS,
    },
  ],
  focusPatterns: [
    { name: "アルケオス集中", order: ["才能神獣 アルケオス"] },
    { name: "攻→護→アルケオス", order: ["才能晶・攻", "才能晶・護", "才能神獣 アルケオス"] },
    { name: "護→攻→アルケオス", order: ["才能晶・護", "才能晶・攻", "才能神獣 アルケオス"] },
    { name: "既存AIまかせ", order: [] },
  ],
  hook: talentHook,
};
