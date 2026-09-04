import type { AllySpec, EnemySpec, FocusOrder, Scenario } from "../types.js";
import type { Skill } from "../../../src/core/skill.js";
import { tower90Probe } from "../tower90/probe.js";

const skill = (id: string, name: string, target: Skill["target"], cooldownTurns: number, effects: Skill["effects"]): Skill => ({
  id, name, description: name, target, cooldownTurns, effects,
});

export const TOWER90_SAFE_PARTY: AllySpec[] = [
  { label: "フェンリル[電気]", templateId: "fenrir", element: "ELECTRIC", preset: "MAX_ATTACKER" },
  { label: "マッシュルン[草]", templateId: "mushroon", element: "GRASS", preset: "MAX_DEBUFFER" },
  { label: "バジリスク[光]", templateId: "basilisk", element: "LIGHT", preset: "MAX_DEBUFFER" },
  { label: "ウィスプ[水]", templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { label: "クロノス[電気]", templateId: "chronos", element: "ELECTRIC", preset: "MAX_SPEED" },
];

export const TOWER90_RUSH_PARTY: AllySpec[] = [
  { label: "フェンリル[電気]", templateId: "fenrir", element: "ELECTRIC", preset: "MAX_ATTACKER" },
  { label: "ドラゴン[闇]", templateId: "dragon", element: "DARK", preset: "MAX_ATTACKER" },
  { label: "マッシュルン[草]", templateId: "mushroon", element: "GRASS", preset: "MAX_DEBUFFER" },
  { label: "ウィスプ[水]", templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { label: "クロノス[電気]", templateId: "chronos", element: "ELECTRIC", preset: "MAX_SPEED" },
];

const bossSkills: [Skill, Skill, Skill] = [
  skill("tower90_boss_s1", "断罪の刃", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 1.05 },
    { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.5 },
  ]),
  skill("tower90_boss_s2", "狂刃連斬", "SINGLE_ENEMY", 3, [
    { kind: "DAMAGE", multiplier: 0.55, hits: 3, conditionalBonus: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.2 }] },
    { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.7 },
  ]),
  skill("tower90_boss_s3", "終焉の波動", "ALL_ENEMIES", 5, [
    { kind: "DAMAGE", multiplier: 1.15 },
    { kind: "GAUGE", amount: -0.2 },
    { kind: "DEBUFF", stat: "spd", amount: 0.3, durationTurns: 2, chance: 0.6 },
  ]),
];

const fractureSkills: [Skill, Skill, Skill] = [
  skill("tower90_fracture_s1", "裂傷弾", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 0.9 },
    { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.6 },
  ]),
  skill("tower90_fracture_s2", "破砕波", "ALL_ENEMIES", 3, [
    { kind: "DAMAGE", multiplier: 0.6 },
    { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.7 },
  ]),
  skill("tower90_fracture_s3", "脆弱刻印", "SINGLE_ENEMY", 5, [
    { kind: "MITIGATE", amount: -0.25, durationTurns: 2 },
    { kind: "GAUGE", amount: -0.3 },
  ]),
];

const warDrumSkills: [Skill, Skill, Skill] = [
  skill("tower90_drum_s1", "鼓舞弾", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 0.85 },
    { kind: "GAUGE", amount: 0.1, applyTo: "SELF" },
  ]),
  skill("tower90_drum_s2", "狂戦の鼓動", "ALL_ALLIES", 4, [
    { kind: "BUFF", stat: "atk", amount: 0.4, durationTurns: 2 },
    { kind: "BUFF", stat: "spd", amount: 0.3, durationTurns: 2 },
  ]),
  skill("tower90_drum_s3", "血戦共鳴", "ALL_ALLIES", 5, [
    { kind: "GAUGE", amount: 0.2 },
    { kind: "COOLDOWN_REDUCE", turns: 1 },
  ]),
];

const fangSkills: [Skill, Skill, Skill] = [
  skill("tower90_fang_s1", "狂牙", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 1.1, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.2 }] },
  ]),
  skill("tower90_fang_s2", "血裂連撃", "SINGLE_ENEMY", 3, [
    { kind: "DAMAGE", multiplier: 0.8, hits: 2 },
    { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.4 },
  ]),
  skill("tower90_fang_s3", "処刑突撃", "SINGLE_ENEMY", 4, [
    { kind: "DAMAGE", multiplier: 2.3, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.3 }] },
    { kind: "GAUGE", amount: 0.5, applyTo: "SELF", requires: "KILLED_TARGET" },
  ]),
];

const bindSkills: [Skill, Skill, Skill] = [
  skill("tower90_bind_s1", "遅滞弾", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 0.8 },
    { kind: "GAUGE", amount: -0.15 },
  ]),
  skill("tower90_bind_s2", "停滞領域", "ALL_ENEMIES", 3, [
    { kind: "DAMAGE", multiplier: 0.55 },
    { kind: "GAUGE", amount: -0.2 },
    { kind: "DEBUFF", stat: "spd", amount: 0.3, durationTurns: 2, chance: 0.6 },
  ]),
  skill("tower90_bind_s3", "行動封鎖", "ALL_ENEMIES", 5, [
    { kind: "GAUGE", amount: -0.3 },
    { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.5, fixedDuration: true },
  ]),
];

export const TOWER90_ENEMIES_V1: EnemySpec[] = [
  { label: "古代ネメシス", templateId: "nemesis", element: "DARK", star: 6, level: 60, stats: { hp: 230_000, atk: 9_000, def: 3_500, spd: 180 }, skills: bossSkills, victoryTarget: true },
  { label: "古代の裂晶", templateId: "ancient_crystal", element: "FIRE", star: 6, level: 60, stats: { hp: 110_000, atk: 7_000, def: 3_200, spd: 175 }, skills: fractureSkills },
  { label: "古代の戦鼓晶", templateId: "ancient_crystal", element: "ELECTRIC", star: 6, level: 60, stats: { hp: 100_000, atk: 7_500, def: 3_000, spd: 185 }, skills: warDrumSkills },
  { label: "古代の狂牙獣", templateId: "ancient_fang_beast", element: "FIRE", star: 6, level: 60, stats: { hp: 90_000, atk: 8_500, def: 2_600, spd: 190 }, skills: fangSkills },
  { label: "古代の縛晶", templateId: "ancient_crystal", element: "WATER", star: 6, level: 60, stats: { hp: 120_000, atk: 6_500, def: 3_800, spd: 165 }, skills: bindSkills },
];

export const TOWER90_SAFE_FOCUS: FocusOrder[] = [
  { name: "安全: 狂牙獣→戦鼓晶→ボス", order: ["古代の狂牙獣", "古代の戦鼓晶", "古代ネメシス"] },
  { name: "安全: 戦鼓晶→狂牙獣→ボス", order: ["古代の戦鼓晶", "古代の狂牙獣", "古代ネメシス"] },
  { name: "安全: 狂牙獣→ボス", order: ["古代の狂牙獣", "古代ネメシス"] },
];

export const TOWER90_RUSH_FOCUS: FocusOrder[] = [
  { name: "速攻: ボス集中", order: ["古代ネメシス"] },
  { name: "速攻: 裂晶→ボス", order: ["古代の裂晶", "古代ネメシス"] },
  { name: "速攻: 戦鼓晶→ボス", order: ["古代の戦鼓晶", "古代ネメシス"] },
];

const base = {
  enemies: TOWER90_ENEMIES_V1,
  maxTurns: 300,
  hook: tower90Probe,
  expect: { minWinRate: 0.1, maxWinRate: 0.4 },
};

export const TOWER90_SAFE_V1: Scenario = {
  id: "tower-90-v1-safe",
  title: "試練の塔90階 狂化 V1 安全処理型",
  note: "狂牙獣・戦鼓晶を処理してから狂化した古代ネメシスを倒す。目標勝率は最適手順で約30%。本編90階には未接続。",
  allies: TOWER90_SAFE_PARTY,
  focusPatterns: TOWER90_SAFE_FOCUS,
  ...base,
};

export const TOWER90_RUSH_V1: Scenario = {
  id: "tower-90-v1-rush",
  title: "試練の塔90階 狂化 V1 ボス速攻型",
  note: "お供死亡狂化を避け、古代ネメシスを直接押し切る。目標勝率15〜20%。本編90階には未接続。",
  allies: TOWER90_RUSH_PARTY,
  focusPatterns: TOWER90_RUSH_FOCUS,
  ...base,
};
