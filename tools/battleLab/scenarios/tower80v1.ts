import type { AllySpec, EnemySpec, FocusOrder, Scenario } from "../types.js";
import type { Skill } from "../../../src/core/skill.js";

const skill = (id: string, name: string, target: Skill["target"], cooldownTurns: number, effects: Skill["effects"]): Skill => ({
  id, name, description: name, target, cooldownTurns, effects,
});

export const TOWER80_STRIP_BLOCK_PARTY: AllySpec[] = [
  { label: "アビスリーパー[草]", templateId: "abyssreaper", element: "GRASS", preset: "MAX_DEBUFFER" },
  { label: "アビスリーパー[電気]", templateId: "abyssreaper", element: "ELECTRIC", preset: "MAX_DEBUFFER" },
  { label: "バジリスク[光]", templateId: "basilisk", element: "LIGHT", preset: "MAX_DEBUFFER" },
  { label: "ウィスプ[水]", templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  { label: "クロノス[電気]", templateId: "chronos", element: "ELECTRIC", preset: "MAX_SPEED" },
];

const bossSkills: [Skill, Skill, Skill] = [
  skill("tower80_boss_s1", "聖竜の牙", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 1.0 },
    { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.5 },
  ]),
  skill("tower80_boss_s2", "浄化の竜爪", "SINGLE_ENEMY", 3, [
    { kind: "DAMAGE", multiplier: 1.8 },
    { kind: "STRIP", count: 2 },
    { kind: "GAUGE", amount: 0.2, applyTo: "SELF" },
  ]),
  skill("tower80_boss_s3", "聖域の咆哮", "ALL_ENEMIES", 5, [
    { kind: "DAMAGE", multiplier: 1.15 },
    { kind: "CLEANSE", count: 1, applyTo: "ALLIES" },
  ]),
];

const guardSkills: [Skill, Skill, Skill] = [
  skill("tower80_guard_s1", "護光弾", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 0.9 },
    { kind: "DEBUFF", stat: "spd", amount: 0.2, durationTurns: 2, chance: 0.5 },
  ]),
  skill("tower80_guard_s2", "聖域展開", "ALL_ALLIES", 4, [
    { kind: "IMMUNITY", durationTurns: 2 },
    { kind: "CLEANSE", count: 1 },
  ]),
  skill("tower80_guard_s3", "守護反応", "ALL_ALLIES", 5, [
    { kind: "BUFF", stat: "def", amount: 0.4, durationTurns: 2 },
    { kind: "GAUGE", amount: 0.3, applyTo: "LOWEST_HP_ALLY" },
  ]),
];

const inspireSkills: [Skill, Skill, Skill] = [
  skill("tower80_inspire_s1", "鼓動弾", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 0.85 },
    { kind: "GAUGE", amount: 0.1, applyTo: "SELF" },
  ]),
  skill("tower80_inspire_s2", "戦意共鳴", "ALL_ALLIES", 4, [
    { kind: "BUFF", stat: "atk", amount: 0.4, durationTurns: 2 },
    { kind: "BUFF", stat: "spd", amount: 0.3, durationTurns: 2 },
  ]),
  skill("tower80_inspire_s3", "加速共鳴", "ALL_ALLIES", 5, [
    { kind: "GAUGE", amount: 0.2 },
    { kind: "COOLDOWN_REDUCE", turns: 1 },
  ]),
];

const breakerSkills: [Skill, Skill, Skill] = [
  skill("tower80_breaker_s1", "裂光爪", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 1.1 },
  ]),
  skill("tower80_breaker_s2", "聖牙連撃", "SINGLE_ENEMY", 3, [
    { kind: "DAMAGE", multiplier: 0.55, hits: 3 },
    { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.5 },
  ]),
  skill("tower80_breaker_s3", "破邪突進", "SINGLE_ENEMY", 4, [
    { kind: "DAMAGE", multiplier: 2.4, conditionalBonus: [{ when: "TARGET_HAS_BUFF", bonus: 0.25 }] },
  ]),
];

const curseSkills: [Skill, Skill, Skill] = [
  skill("tower80_curse_s1", "呪爪", "SINGLE_ENEMY", 0, [
    { kind: "DAMAGE", multiplier: 0.9 },
    { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.7 },
  ]),
  skill("tower80_curse_s2", "衰弱の咆哮", "ALL_ENEMIES", 3, [
    { kind: "DAMAGE", multiplier: 0.65 },
    { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.7 },
    { kind: "DEBUFF", stat: "spd", amount: 0.3, durationTurns: 2, chance: 0.7 },
  ]),
  skill("tower80_curse_s3", "呪縛領域", "ALL_ENEMIES", 5, [
    { kind: "DAMAGE", multiplier: 0.8 },
    { kind: "HEAL_BLOCK", healMultiplier: 0, durationTurns: 2, chance: 0.8 },
    { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.6 },
    { kind: "GAUGE", amount: -0.2 },
  ]),
];

export const TOWER80_ENEMIES_V1: EnemySpec[] = [
  { label: "古代聖竜", templateId: "dragon", element: "LIGHT", star: 6, level: 60, stats: { hp: 200_000, atk: 9_500, def: 3_800, spd: 185 }, skills: bossSkills, victoryTarget: true },
  { label: "古代の護晶", templateId: "ancient_crystal", element: "WATER", star: 6, level: 60, stats: { hp: 100_000, atk: 7_500, def: 3_000, spd: 180 }, skills: guardSkills },
  { label: "古代の鼓舞晶", templateId: "ancient_crystal", element: "GRASS", star: 6, level: 60, stats: { hp: 120_000, atk: 6_900, def: 4_000, spd: 172 }, skills: inspireSkills },
  { label: "古代の破邪獣", templateId: "ancient_fang_beast", element: "FIRE", star: 6, level: 60, stats: { hp: 80_000, atk: 9_800, def: 2_400, spd: 190 }, skills: breakerSkills },
  { label: "古代の呪獣", templateId: "ancient_beast", element: "DARK", star: 6, level: 60, stats: { hp: 110_000, atk: 8_500, def: 2_900, spd: 165 }, skills: curseSkills },
];

export const TOWER80_FOCUS: FocusOrder[] = [
  { name: "破邪獣→護晶→ボス", order: ["古代の破邪獣", "古代の護晶", "古代聖竜"] },
  { name: "護晶→破邪獣→ボス", order: ["古代の護晶", "古代の破邪獣", "古代聖竜"] },
  { name: "鼓舞晶→護晶→破邪獣→ボス", order: ["古代の鼓舞晶", "古代の護晶", "古代の破邪獣", "古代聖竜"] },
  { name: "呪獣→護晶→破邪獣→ボス", order: ["古代の呪獣", "古代の護晶", "古代の破邪獣", "古代聖竜"] },
  { name: "ボス集中", order: ["古代聖竜"] },
];

export const TOWER80_V1: Scenario = {
  id: "tower-80-v1",
  title: "試練の塔80階 免疫5体編成 第1回",
  note: "ドラゴン基礎ボス+お供4体。剥がし+強化阻害編成で免疫攻略が成立するか測る。",
  allies: TOWER80_STRIP_BLOCK_PARTY,
  enemies: TOWER80_ENEMIES_V1,
  focusPatterns: TOWER80_FOCUS,
  maxTurns: 300,
};
