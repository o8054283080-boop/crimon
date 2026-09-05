import type { Skill } from "../core/skill.js";
import type { DungeonEnemy } from "./equipmentDungeon.js";

/** Battle Lab V3を本編へ移植。検証後の未採用提案は含めない。 */
export const TOWER80_RULES = {
  immunityTurns: 2, immuneAtkBonus: 2_000, strippedDamageTaken: 0.25,
  enragedMultiplier: 1.5, enrageHpRatio: 0.5,
  immunityThresholds: [0.7, 0.4] as const, escortKillDamageBonus: 0.05,
} as const;

export const TOWER80_PASSIVES = [
  { name: "聖竜の免疫", description: "戦闘開始時とHPが70%・40%以下になった時に各1回、味方全体に2ターン免疫を付与する。強化阻害中の味方には付与できない。免疫中は自身の攻撃力が上がり、免疫がない間は受けるダメージが25%増える。" },
  { name: "聖竜の激昂", description: "HPが50%未満の間、攻撃スキルの威力が50%上がる。" },
  { name: "聖域の綻び", description: "お供を1体倒されるごとに、受けるダメージが5%増える（最大20%）。免疫がない間の増加量に加算される。" },
];
const descriptions: Record<string, string> = {
  "tower80_boss_s1": "敵単体にダメージを与え、50%で2ターン攻撃力を50%低下させる。",
  "tower80_boss_s2": "敵単体にダメージを与え、強化効果を2個解除し、自身の行動ゲージを20%増加させる。",
  "tower80_boss_s3": "敵全体にダメージを与え、味方全体の弱体効果を1個解除し、2ターン免疫を付与する。",
  "tower80_guard_s1": "敵単体にダメージを与え、50%で2ターン速度を20%低下させる。",
  "tower80_guard_s2": "味方全体に2ターン免疫を付与し、弱体効果を1個解除する。",
  "tower80_guard_s3": "味方全体の防御力を2ターン40%上昇させ、HPが最も低い味方の行動ゲージを30%増加させる。",
  "tower80_inspire_s1": "敵単体にダメージを与え、自身の行動ゲージを10%増加させる。",
  "tower80_inspire_s2_LIGHT": "味方全体の攻撃力を2ターン32%、速度を2ターン22%上昇させる。",
  "tower80_inspire_s3_LIGHT": "味方全体の行動ゲージを16%増加させ、スキルの待ち時間を1ターン短縮する。",
  "tower80_breaker_s1": "敵単体にダメージを与える。",
  "tower80_breaker_s2": "敵単体を3回攻撃し、50%で2ターン防御力を50%低下させる。",
  "tower80_breaker_s3": "敵単体にダメージを与える。対象が強化効果を受けている場合、ダメージが25%増加する。",
  "tower80_curse_s1": "敵単体にダメージを与え、70%で2ターン攻撃力を50%低下させる。",
  "tower80_curse_s2": "敵全体にダメージを与え、それぞれ70%で2ターン防御力を50%、速度を30%低下させる。",
  "tower80_curse_s3": "敵全体にダメージを与え、80%で2ターン回復不能、60%で2ターン攻撃力50%低下を付与し、行動ゲージを20%減少させる。"
};
const skill = (id: string, name: string, target: Skill["target"], cooldownTurns: number, effects: Skill["effects"]): Skill => ({
  id, name, description: descriptions[id], target, cooldownTurns, effects,
});

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
  skill("tower80_inspire_s2_LIGHT", "戦意共鳴", "ALL_ALLIES", 4, [
    { kind: "BUFF", stat: "atk", amount: 0.32, durationTurns: 2 },
    { kind: "BUFF", stat: "spd", amount: 0.22, durationTurns: 2 },
  ]),
  skill("tower80_inspire_s3_LIGHT", "加速共鳴", "ALL_ALLIES", 5, [
    { kind: "GAUGE", amount: 0.16 },
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

export const TOWER80_ENEMIES: DungeonEnemy[] = [
  { displayName: "古代聖竜", templateId: "dragon", element: "LIGHT", star: 6, level: 60, fixedStats: { hp: 200_000, atk: 9_500, def: 3_800, spd: 185 }, skills: bossSkills, isBoss: true, victoryTarget: true },
  { displayName: "古代の護晶", templateId: "ancient_crystal", element: "WATER", star: 6, level: 60, fixedStats: { hp: 100_000, atk: 6_000, def: 3_000, spd: 170 }, skills: guardSkills },
  { displayName: "古代の鼓舞晶", templateId: "ancient_crystal", element: "GRASS", star: 6, level: 60, fixedStats: { hp: 120_000, atk: 5_500, def: 4_000, spd: 162 }, skills: inspireSkills },
  { displayName: "古代の破邪獣", templateId: "ancient_fang_beast", element: "FIRE", star: 6, level: 60, fixedStats: { hp: 80_000, atk: 8_500, def: 2_400, spd: 180 }, skills: breakerSkills },
  { displayName: "古代の呪獣", templateId: "ancient_beast", element: "DARK", star: 6, level: 60, fixedStats: { hp: 110_000, atk: 6_500, def: 2_900, spd: 155 }, skills: curseSkills },
];
