/**
 * 試練の塔80階「古代聖竜」第2回。**本編には1行も入っていない。**
 *
 * V1はお供の火力と手数が強すぎて、免疫を剥がす以前に押し切られていた
 * (最良でも勝率15.8%、それも「ボス集中」という雑な線)。
 * V2はボスを据え置き、お供4体のATKを下げ、SPDを各10落として測り直す。
 *
 * ## ボス固有の仕掛けはスキル定義では表せない
 *
 * 開始時の全体免疫、免疫中のATK+2000、免疫が剥がれている間の被ダメ+25%、
 * HP50%未満での全攻撃×1.5、HP70%/40%初到達での免疫再展開——どれも
 * 本編に機構が無い。`tower80/probe.ts` が手番の境目で受け持つ。
 *
 * S3「聖域の咆哮」の「味方全体へ免疫2ターン」も同じ。本編の `IMMUNITY` 効果は
 * `applyTo` を持たず、`ALL_ENEMIES` のスキルから味方側へは配れない
 * (護晶S2は `ALL_ALLIES` なので定義のまま表せている)。
 */
import type { AllySpec, EnemySpec, FocusOrder, Scenario } from "../types.js";
import type { Skill } from "../../../src/core/skill.js";
import { tower80Probe, type Tower80ProbeOptions } from "../tower80/probe.js";

const skill = (id: string, name: string, target: Skill["target"], cooldownTurns: number, effects: Skill["effects"]): Skill => ({
  id, name, description: name, target, cooldownTurns, effects,
});

export const TOWER80_STRIP_BLOCK_PARTY_V2: AllySpec[] = [
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
  /*
   * 「味方全体に免疫2ターン」は**ここに書けない。**
   * `IMMUNITY` は `applyTo` を持たず、`ALL_ENEMIES` のスキルからは
   * 敵(=こちら)にしか乗らない。`probe.ts` がこの使用を合図に配る
   */
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

export const TOWER80_ENEMIES_V2: EnemySpec[] = [
  { label: "古代聖竜", templateId: "dragon", element: "LIGHT", star: 6, level: 60, stats: { hp: 200_000, atk: 9_500, def: 3_800, spd: 185 }, skills: bossSkills, victoryTarget: true },
  { label: "古代の護晶", templateId: "ancient_crystal", element: "WATER", star: 6, level: 60, stats: { hp: 100_000, atk: 6_000, def: 3_000, spd: 170 }, skills: guardSkills },
  { label: "古代の鼓舞晶", templateId: "ancient_crystal", element: "GRASS", star: 6, level: 60, stats: { hp: 120_000, atk: 5_500, def: 4_000, spd: 162 }, skills: inspireSkills },
  { label: "古代の破邪獣", templateId: "ancient_fang_beast", element: "FIRE", star: 6, level: 60, stats: { hp: 80_000, atk: 8_500, def: 2_400, spd: 180 }, skills: breakerSkills },
  { label: "古代の呪獣", templateId: "ancient_beast", element: "DARK", star: 6, level: 60, stats: { hp: 110_000, atk: 6_500, def: 2_900, spd: 155 }, skills: curseSkills },
];

export const TOWER80_FOCUS_V2: FocusOrder[] = [
  { name: "破邪獣→護晶→ボス", order: ["古代の破邪獣", "古代の護晶", "古代聖竜"] },
  { name: "護晶→破邪獣→ボス", order: ["古代の護晶", "古代の破邪獣", "古代聖竜"] },
  { name: "鼓舞晶→護晶→破邪獣→ボス", order: ["古代の鼓舞晶", "古代の護晶", "古代の破邪獣", "古代聖竜"] },
  { name: "呪獣→護晶→破邪獣→ボス", order: ["古代の呪獣", "古代の護晶", "古代の破邪獣", "古代聖竜"] },
  { name: "ボス集中", order: ["古代聖竜"] },
];

/**
 * 切り分け用の変種を作る。**既定は依頼どおりの仕様そのまま。**
 *
 * 「V2でも極端に強すぎる/弱すぎる場合は、どの要素が原因かを数値で分析する」
 * ための道具。1つずつ外して測らないと、原因が読めない
 * (V1→V2でお供のATKとSPDを同時に動かしたので、
 *  どちらがどれだけ効いたのかは結局分かっていない)。
 */
export interface Tower80Variant extends Tower80ProbeOptions {
  /** お供4体のATKに足す値(負で弱くなる) */
  escortAtkDelta?: number;
  /** お供4体のSPDに足す値 */
  escortSpdDelta?: number;
  /** お供4体のHPに掛ける倍率 */
  escortHpFactor?: number;
  /** 鼓舞晶S2のATK/SPDバフを外す */
  noInspireBuff?: boolean;
  /** 鼓舞晶S3のゲージ加速とCT短縮を外す */
  noInspireGauge?: boolean;
  /** 呪獣S2/S3の全体デバフを外す(ダメージは残す) */
  noCurseDebuff?: boolean;
  /** 護晶S2の免疫供給を外す */
  noGuardImmunity?: boolean;
}

const stripEffects = (skills: [Skill, Skill, Skill], drop: (effect: Skill["effects"][number]) => boolean): [Skill, Skill, Skill] =>
  skills.map((entry) => ({ ...entry, effects: entry.effects.filter((effect) => !drop(effect)) })) as [Skill, Skill, Skill];

export function tower80EnemiesV2(variant: Tower80Variant = {}): EnemySpec[] {
  const atk = variant.escortAtkDelta ?? 0;
  const spd = variant.escortSpdDelta ?? 0;
  const hp = variant.escortHpFactor ?? 1;
  return TOWER80_ENEMIES_V2.map((enemy, index) => {
    // ボス(index 0)には手を入れない。お供だけを振る
    if (index === 0) return { ...enemy };
    const stats = enemy.stats!;
    let skills = enemy.skills as [Skill, Skill, Skill];
    if (variant.noInspireBuff && enemy.label === "古代の鼓舞晶") skills = stripEffects(skills, (e) => e.kind === "BUFF");
    if (variant.noInspireGauge && enemy.label === "古代の鼓舞晶") {
      skills = stripEffects(skills, (e) => (e.kind === "GAUGE" && e.amount > 0) || e.kind === "COOLDOWN_REDUCE");
    }
    if (variant.noCurseDebuff && enemy.label === "古代の呪獣") skills = stripEffects(skills, (e) => e.kind === "DEBUFF");
    if (variant.noGuardImmunity && enemy.label === "古代の護晶") skills = stripEffects(skills, (e) => e.kind === "IMMUNITY");
    return {
      ...enemy,
      skills,
      stats: { ...stats, atk: Math.max(1, stats.atk! + atk), spd: Math.max(1, stats.spd! + spd), hp: Math.round(stats.hp! * hp) },
    };
  });
}

export function buildTower80V2(variant: Tower80Variant = {}): Scenario {
  return {
    id: "tower-80-v2",
    title: "試練の塔80階 免疫5体編成 第2回",
    note: "V1からボスは据え置き。お供4体のATKを6000/5500/8500/6500へ下げ、SPDを各10低下。剥がし+強化阻害編成で再測定する。",
    allies: TOWER80_STRIP_BLOCK_PARTY_V2,
    enemies: tower80EnemiesV2(variant),
    focusPatterns: TOWER80_FOCUS_V2,
    maxTurns: 300,
    hook: (context) => tower80Probe(context, variant),
  };
}

export const TOWER80_V2: Scenario = buildTower80V2();
