/**
 * **実際の戦闘で使われるスキルの Lv1〜5 を集める。**
 *
 * スキルの数値は3か所で決まる。
 *
 *   1. 定義ファイル(`src/data/monsters.ts` / `newMonsters/*` / `collabMonsters/*`)
 *   2. 実体化の直前の差し替え(`applySeptemberSkillBalance` / `applyLegacySkillBalance`)
 *   3. レベル補正(`computeLeveledSkill`。`levelOverrides` があればそれ、無ければ一律成長)
 *
 * 定義ファイルだけを見ると、2 で書き換わったスキルの数字を読み違える
 * (クロノスの時空崩壊は star5.ts と実際の性能が違っていた)。
 * ここは**図鑑と戦闘と同じ経路**(`createMonsterVariant` → `computeLeveledSkill`)を
 * そのまま通すので、出てくる数字がゲーム内の数字そのものになる。
 *
 * 才能覚醒・潜在能力・スキル継承は個体ごとの上乗せなので含めない
 * (素の種族としての Lv1〜5 を出す)。
 */
import { ELEMENTS, ELEMENT_JA, type Element } from "../../src/core/element.js";
import { createMonsterVariant, type MonsterTemplate } from "../../src/core/monster.js";
import { MAX_SKILL_LEVEL, computeLeveledSkill, describeSkillLines, type Skill } from "../../src/core/skill.js";
import { passiveAtLevel } from "../../src/core/passive.js";
import {
  ALL_MONSTER_TEMPLATES, GACHA_STAR3_TEMPLATES, GACHA_STAR4_TEMPLATES, GACHA_STAR5_TEMPLATES,
} from "../../src/data/monsters.js";
import { NEW_MONSTER_TEMPLATES } from "../../src/data/newMonsters/index.js";
import { COLLAB_MONSTER_TEMPLATES } from "../../src/data/collabMonsters/index.js";

/** プレイヤーが持てる32種。**並びはゲーム内の図鑑の順**(並べ替えると差分が読めなくなる) */
export const PLAYABLE_TEMPLATE_IDS: readonly string[] = [
  "slime", "wolf", "golem", "fairy", "imp", "wisp", "treant", "knight",
  "griffon", "dragon", "seraph", "nemesis",
  "scorpion", "harpy", "phoenix", "joker",
  "mushroon", "shellturtle", "kobold", "basilisk", "mimic", "valkyria", "thunderbeast",
  "abyssreaper", "fenrir", "chronos", "behemoth", "crim",
  "gujira", "mocchi", "suezo", "undine",
];

export type SkillSlot = "S1" | "S2" | "S3";
export type GrowthKind = "passive" | "levelOverrides" | "generic";

const TARGET_JA: Record<Skill["target"], string> = {
  SINGLE_ENEMY: "敵単体", ALL_ENEMIES: "敵全体", SINGLE_ALLY: "味方単体", ALL_ALLIES: "味方全体", SELF: "自身",
};

/** 1つのレベルの実効値。**数字の照合はこちらを見る**(`lines` は人が読むためのもの) */
export interface LevelEntry {
  level: number;
  target: Skill["target"];
  cooldownTurns: number;
  /** 画面の「Lv別の行」と同じ文 */
  lines: string[];
  /** 実際に解決される効果(レベル補正後) */
  effects: Skill["effects"];
  /** パッシブならそのレベルの値 */
  passive?: unknown;
  /** 効果以外で戦闘に効く性質(追加ターンなど)。無いものは省く */
  flags: Record<string, unknown>;
}

export interface SkillReport {
  templateId: string;
  monsterName: string;
  rarity: string;
  slot: SkillSlot;
  skillId: string;
  skillName: string;
  /** このスキルを持つ属性 */
  elements: Element[];
  /** 光/闇専用のスキル3か */
  uniqueLightDark: "LIGHT" | "DARK" | null;
  growth: GrowthKind;
  /** `maxLevelOverride` で Lv5 だけ差し替わるか(一律成長のときだけ意味がある) */
  maxLevelOverride: boolean;
  /**
   * **実体化の直前に差し替えられたか。**true なら、定義ファイルの数字はゲーム内の数字ではない。
   * `sourceLevels` に差し替え前の Lv1〜5 が入る
   */
  runtimeOverride: boolean;
  levels: LevelEntry[];
  /** 差し替えがあった時だけ。定義ファイルに書いてあるままの Lv1〜5 */
  sourceLevels?: LevelEntry[];
}

export interface MonsterReport {
  templateId: string;
  name: string;
  rarity: string;
  elements: Element[];
  skills: SkillReport[];
}

/** 戦闘に効く、効果の外にある性質 */
const FLAG_KEYS = [
  "extraTurn", "extraTurnOnKill", "resetCooldownOnKill", "gaugeIfThreeEnemies", "targetPriority",
  "alwaysCrit", "splash", "automatic",
] as const;

function levelEntry(skill: Skill, level: number): LevelEntry {
  const leveled = computeLeveledSkill(skill, level);
  const flags: Record<string, unknown> = {};
  for (const key of FLAG_KEYS) {
    const value = (leveled as unknown as Record<string, unknown>)[key];
    if (value !== undefined && value !== false) flags[key] = value;
  }
  return {
    level,
    target: leveled.target,
    cooldownTurns: leveled.cooldownTurns,
    lines: describeSkillLines(leveled),
    effects: leveled.effects,
    passive: leveled.passive ? passiveAtLevel(leveled.passive, level) : undefined,
    flags,
  };
}

function levels(skill: Skill): LevelEntry[] {
  return Array.from({ length: MAX_SKILL_LEVEL }, (_, i) => levelEntry(skill, i + 1));
}

function growthOf(skill: Skill): GrowthKind {
  if (skill.passive) return "passive";
  if (skill.levelOverrides) return "levelOverrides";
  return "generic";
}

/** 説明文だけの違いは差し替えに数えない(数字が変わったかどうかだけを見る) */
function withoutText(skill: Skill): string {
  const { description: _d, ...rest } = skill;
  return JSON.stringify(rest);
}

function rarityOf(template: MonsterTemplate): string {
  if (GACHA_STAR5_TEMPLATES.includes(template)) return "★5";
  if (GACHA_STAR4_TEMPLATES.includes(template)) return "★4";
  if (GACHA_STAR3_TEMPLATES.includes(template)) return "★3";
  return "配布";
}

/** 定義ファイルに書いてある、そのIDのスキル(差し替え前) */
function sourceSkill(template: MonsterTemplate, id: string): Skill | undefined {
  return [
    template.skill1, ...template.skill2Variants, ...template.skill3Variants,
    template.lightSkill3, template.darkSkill3,
  ].find((skill) => skill?.id === id);
}

export function playableTemplates(): MonsterTemplate[] {
  return PLAYABLE_TEMPLATE_IDS.map((id) => {
    const template = ALL_MONSTER_TEMPLATES.find((t) => t.templateId === id);
    if (!template) throw new Error(`種族が見つからない: ${id}`);
    return template;
  });
}

export function collectMonster(template: MonsterTemplate): MonsterReport {
  const elements = template.elements ?? [...ELEMENTS];
  const variants = elements.map((element) => createMonsterVariant(template, element));
  const bySkill = new Map<string, SkillReport>();
  variants.forEach((variant) => {
    variant.skills.forEach((skill, index) => {
      const existing = bySkill.get(skill.id);
      if (existing) {
        existing.elements.push(variant.element);
        return;
      }
      const source = sourceSkill(template, skill.id);
      const runtimeOverride = source !== undefined && withoutText(source) !== withoutText(skill);
      const unique = skill === undefined ? null
        : skill.id === template.lightSkill3?.id ? "LIGHT"
        : skill.id === template.darkSkill3?.id ? "DARK"
        : null;
      bySkill.set(skill.id, {
        templateId: template.templateId,
        monsterName: template.baseName,
        rarity: rarityOf(template),
        slot: (["S1", "S2", "S3"] as const)[index],
        skillId: skill.id,
        skillName: skill.name,
        elements: [variant.element],
        uniqueLightDark: unique,
        growth: growthOf(skill),
        maxLevelOverride: skill.maxLevelOverride !== undefined,
        runtimeOverride,
        levels: levels(skill),
        sourceLevels: runtimeOverride && source ? levels(source) : undefined,
      });
    });
  });
  const skills = [...bySkill.values()].sort((a, b) => a.slot.localeCompare(b.slot));
  return { templateId: template.templateId, name: template.baseName, rarity: rarityOf(template), elements, skills };
}

export function collectAll(): MonsterReport[] {
  return playableTemplates().map(collectMonster);
}

/* ============================================================ 表示 */

function levelRow(entry: LevelEntry): string {
  const ct = entry.cooldownTurns > 0 ? `CT${entry.cooldownTurns}` : "CTなし";
  const flags = Object.entries(entry.flags).map(([k, v]) => (v === true ? k : `${k}=${JSON.stringify(v)}`));
  const body = [...entry.lines, ...flags].join(" / ").replace(/\|/g, "\\|");
  return `| Lv${entry.level} | ${body} | ${ct} |`;
}

const GROWTH_JA: Record<GrowthKind, string> = {
  passive: "パッシブ(Lv1〜5を個別に記述)",
  levelOverrides: "専用成長(levelOverrides)",
  generic: "一律成長(computeLeveledSkill)",
};

export function skillMarkdown(skill: SkillReport): string {
  const where = skill.elements.map((e) => ELEMENT_JA[e]).join("・");
  const unique = skill.uniqueLightDark ? `(${ELEMENT_JA[skill.uniqueLightDark]}専用S3)` : "";
  const out = [
    `#### ${skill.slot} ${skill.skillName}${unique}`,
    "",
    `- skill ID: \`${skill.skillId}\` / 属性: ${where} / 対象: ${TARGET_JA[skill.levels[0].target]}`,
    `- 成長: ${GROWTH_JA[skill.growth]}${skill.maxLevelOverride ? " + Lv5差し替え(maxLevelOverride)" : ""}`,
    `- 実行時の差し替え(legacyOverride): ${skill.runtimeOverride ? "**あり**(定義ファイルの数字とは違う)" : "なし"}`,
    "",
    "| Lv | 実効値 | CT |",
    "|---|---|---|",
    ...skill.levels.map(levelRow),
  ];
  if (skill.sourceLevels) {
    out.push("", "<details><summary>差し替え前(定義ファイルのまま)</summary>", "", "| Lv | 定義ファイル | CT |", "|---|---|---|",
      ...skill.sourceLevels.map(levelRow), "", "</details>");
  }
  return out.join("\n");
}

export function monsterMarkdown(monster: MonsterReport): string {
  const where = monster.elements.map((e) => ELEMENT_JA[e]).join("・");
  return [
    `### ${monster.name}(\`${monster.templateId}\` / ${monster.rarity} / ${where})`,
    "",
    ...monster.skills.map((skill) => `${skillMarkdown(skill)}\n`),
  ].join("\n");
}

export function reportMarkdown(monsters: MonsterReport[]): string {
  const overrides = monsters.flatMap((m) => m.skills.filter((s) => s.runtimeOverride));
  return [
    "# 実効スキル一覧(自動生成)",
    "",
    "**このファイルは手で直さない。**`npm run skills:report` で作り直す。",
    "定義ファイル → 実体化の直前の差し替え → レベル補正 を通した、**ゲーム内の数字そのもの**。",
    "才能覚醒・潜在能力・スキル継承は個体ごとの上乗せなので含めていない。",
    "",
    `- 種族: ${monsters.length} / スキル: ${monsters.reduce((n, m) => n + m.skills.length, 0)}`,
    `- 実行時に差し替えられているスキル: ${overrides.length}(${overrides.map((s) => `\`${s.skillId}\``).join(", ")})`,
    "",
    "## 目次",
    "",
    ...monsters.map((m) => `- ${m.name}(\`${m.templateId}\`)`),
    "",
    "## 種族ごと",
    "",
    ...monsters.map(monsterMarkdown),
  ].join("\n");
}

/** JSON。**1スキル1ブロック**で並べ、差分が読める形にする */
export function reportJson(monsters: MonsterReport[]): string {
  return `${JSON.stringify(monsters, null, 1)}\n`;
}

/** CSV。1行 = 1スキル × 1レベル。表計算で並べて見る用 */
export function reportCsv(monsters: MonsterReport[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [["templateId", "monster", "rarity", "slot", "skillId", "skillName", "elements", "unique", "growth",
    "runtimeOverride", "level", "target", "cooldown", "effects"].join(",")];
  for (const monster of monsters) {
    for (const skill of monster.skills) {
      for (const entry of skill.levels) {
        rows.push([
          skill.templateId, skill.monsterName, skill.rarity, skill.slot, skill.skillId, skill.skillName,
          skill.elements.join("|"), skill.uniqueLightDark ?? "", skill.growth, String(skill.runtimeOverride),
          String(entry.level), entry.target, String(entry.cooldownTurns),
          [...entry.lines, ...Object.entries(entry.flags).map(([k, v]) => `${k}=${JSON.stringify(v)}`)].join(" / "),
        ].map((v) => escape(v)).join(","));
      }
    }
  }
  return `${rows.join("\n")}\n`;
}
