import type { EnemySpec, Scenario } from "../types.js";
import type { Skill } from "../../../src/core/skill.js";
import { tower90ProbeV6 } from "../tower90/probeV6.js";
import {
  TOWER90_RUSH_FOCUS,
  TOWER90_RUSH_PARTY,
  TOWER90_SAFE_FOCUS,
  TOWER90_SAFE_PARTY,
} from "./tower90v1.js";
import { TOWER90_ENEMIES_V5 } from "./tower90v5.js";

const skill = (id: string, name: string, target: Skill["target"], cooldownTurns: number, effects: Skill["effects"]): Skill => ({
  id, name, description: name, target, cooldownTurns, effects,
});

const fangSkillsV6: [Skill, Skill, Skill] = [
  skill("tower90_v6_fang_s1", "狂牙", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 1.1, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.2 }] },
  ]),
  skill("tower90_v6_fang_s2", "血裂連撃", "SINGLE_ENEMY", 3, [
    { kind: "DAMAGE", multiplier: 0.8, hits: 2 },
    { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.4 },
  ]),
  skill("tower90_v6_fang_s3", "処刑突撃", "SINGLE_ENEMY", 4, [
    { kind: "DAMAGE", multiplier: 2.6, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.4 }] },
    { kind: "GAUGE", amount: 0.5, applyTo: "SELF", requires: "KILLED_TARGET" },
  ]),
];

/**
 * 90階V6。
 * - ボスHP 400,000→350,000
 * - 狂牙獣 ATK 8,500→9,500 / SPD190→205 / S3を2.6倍・HP50%以下+40%へ強化
 * - ボスHP40%以上の与ダメをV5比90%へ抑え、40%以下はV5の狂化火力を維持
 */
export const TOWER90_ENEMIES_V6: EnemySpec[] = TOWER90_ENEMIES_V5.map((enemy, index) => {
  if (index === 0) {
    return { ...enemy, stats: { ...enemy.stats, hp: 350_000 } };
  }
  if (index === 3) {
    return {
      ...enemy,
      stats: { ...enemy.stats, atk: 9_500, spd: 205 },
      skills: fangSkillsV6,
    };
  }
  return { ...enemy };
});

const base = {
  enemies: TOWER90_ENEMIES_V6,
  maxTurns: 300,
  hook: tower90ProbeV6,
};

export const TOWER90_SAFE_V6: Scenario = {
  id: "tower-90-v6-safe",
  title: "試練の塔90階 狂化 V6 安全処理型",
  note: "V5からボスHP-5万、狂牙獣強化。ボスHP40%以上は与ダメ90%、40%以下はV5火力。目標25〜35%。本編未接続。",
  allies: TOWER90_SAFE_PARTY,
  focusPatterns: TOWER90_SAFE_FOCUS,
  ...base,
};

export const TOWER90_RUSH_V6: Scenario = {
  id: "tower-90-v6-rush",
  title: "試練の塔90階 狂化 V6 ボス速攻型",
  note: "V5からボスHP-5万、狂牙獣強化。ボスHP40%以上は与ダメ90%、40%以下はV5火力。ボス集中目標15〜20%。本編未接続。",
  allies: TOWER90_RUSH_PARTY,
  focusPatterns: TOWER90_RUSH_FOCUS,
  ...base,
};
