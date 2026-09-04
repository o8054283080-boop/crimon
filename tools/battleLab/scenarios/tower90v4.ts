import type { EnemySpec, Scenario } from "../types.js";
import type { Skill } from "../../../src/core/skill.js";
import { tower90ProbeV4 } from "../tower90/probeV4.js";
import {
  TOWER90_RUSH_FOCUS,
  TOWER90_RUSH_PARTY,
  TOWER90_SAFE_FOCUS,
  TOWER90_SAFE_PARTY,
} from "./tower90v1.js";
import { TOWER90_ENEMIES_V3 } from "./tower90v3.js";

const skill = (id: string, name: string, target: Skill["target"], cooldownTurns: number, effects: Skill["effects"]): Skill => ({
  id, name, description: name, target, cooldownTurns, effects,
});

const bossSkillsV4: [Skill, Skill, Skill] = [
  skill("tower90_v4_boss_s1", "断罪の刃", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 1.20 },
    { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.70 },
    { kind: "GAUGE", amount: -0.15 },
  ]),
  skill("tower90_v4_boss_s2", "狂刃連斬", "SINGLE_ENEMY", 3, [
    { kind: "DAMAGE", multiplier: 0.70, hits: 3, conditionalBonus: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.35 }] },
    { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 1.0 },
  ]),
  skill("tower90_v4_boss_s3", "絶・終焉の波動", "ALL_ENEMIES", 5, [
    { kind: "DAMAGE", multiplier: 1.35 },
    // 効果順を固定: ダメージ → 全バフ解除 → ゲージ50%減少 → 防御低下3T
    { kind: "STRIP", chance: 1.0 },
    { kind: "GAUGE", amount: -0.50 },
    { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 3, chance: 1.0, fixedDuration: true },
  ]),
];

const fractureSkillsV4: [Skill, Skill, Skill] = [
  skill("tower90_v4_fracture_s1", "裂傷弾", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 0.9 },
    { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.75 },
  ]),
  skill("tower90_v4_fracture_s2", "破砕波", "ALL_ENEMIES", 3, [
    { kind: "DAMAGE", multiplier: 0.6 },
    { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.85 },
  ]),
  skill("tower90_v4_fracture_s3", "脆弱刻印", "SINGLE_ENEMY", 5, [
    { kind: "MITIGATE", amount: -0.40, durationTurns: 2 },
    { kind: "GAUGE", amount: -0.40 },
  ]),
];

const warDrumSkillsV4: [Skill, Skill, Skill] = [
  skill("tower90_v4_drum_s1", "鼓舞弾", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 0.85 },
    { kind: "GAUGE", amount: 0.1, applyTo: "SELF" },
  ]),
  skill("tower90_v4_drum_s2", "狂戦の鼓動", "ALL_ALLIES", 4, [
    { kind: "BUFF", stat: "atk", amount: 0.50, durationTurns: 2 },
    { kind: "BUFF", stat: "spd", amount: 0.40, durationTurns: 2 },
  ]),
  skill("tower90_v4_drum_s3", "血戦共鳴", "ALL_ALLIES", 5, [
    { kind: "GAUGE", amount: 0.30 },
    { kind: "COOLDOWN_REDUCE", turns: 1 },
  ]),
];

/**
 * 90階V4。
 * V3の耐久値は維持し、裂晶・戦鼓晶・ボス技を強化。
 * 全敵 ACC65% / RES50%。戦鼓晶SPD205。
 * お供死亡ごとのクリ率+10% / クリダメ+20%は probeV4 で本編の実効ステータス口へ加算する。
 */
export const TOWER90_ENEMIES_V4: EnemySpec[] = TOWER90_ENEMIES_V3.map((enemy, index) => {
  const stats = { ...enemy.stats, accuracy: 0.65, resistance: 0.50 };
  if (index === 0) return { ...enemy, stats, skills: bossSkillsV4 };
  if (index === 1) return { ...enemy, stats, skills: fractureSkillsV4 };
  if (index === 2) return { ...enemy, stats: { ...stats, spd: 205 }, skills: warDrumSkillsV4 };
  return { ...enemy, stats };
});

const base = {
  enemies: TOWER90_ENEMIES_V4,
  maxTurns: 300,
  hook: tower90ProbeV4,
};

export const TOWER90_SAFE_V4: Scenario = {
  id: "tower-90-v4-safe",
  title: "試練の塔90階 狂化 V4 安全処理型",
  note: "V3耐久のまま裂晶・戦鼓晶・ボス技を強化し、全敵ACC65/RES50、お供死亡でボスCRI+10%/CDMG+20%。目標25〜35%。本編未接続。",
  allies: TOWER90_SAFE_PARTY,
  focusPatterns: TOWER90_SAFE_FOCUS,
  ...base,
};

export const TOWER90_RUSH_V4: Scenario = {
  id: "tower-90-v4-rush",
  title: "試練の塔90階 狂化 V4 ボス速攻型",
  note: "V3耐久のまま裂晶・戦鼓晶・ボス技を強化し、全敵ACC65/RES50、お供死亡でボスCRI+10%/CDMG+20%。ボス集中目標15〜20%。本編未接続。",
  allies: TOWER90_RUSH_PARTY,
  focusPatterns: TOWER90_RUSH_FOCUS,
  ...base,
};
