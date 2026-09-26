/**
 * **決まった Lv1〜5 を、定義ファイルの `levelOverrides` へ書き込む。**
 *
 *   npx tsx tools/skillsReport/tuning/emit.ts          # 書き換える
 *   npx tsx tools/skillsReport/tuning/emit.ts --dry    # 書き換えずに、何を書くかだけ出す
 *
 * 値は `resolve.ts` が変更前の実効値(`tests/fixtures/skills-before-2026-10.json`)と
 * 指定(`spec.ts`)から決める。ここはそれを**ソースの形に直すだけ**で、数字は決めない。
 *
 * 書き換えるのは指定のあるスキルの定義1つずつ(オブジェクトリテラル / `described()` /
 * `fourSpecies.ts` の `skill()`)。id・name・その他の性質は元の書き方のまま残し、
 * 次の欄だけを作り直す: description / target / cooldownTurns / effects / levelOverrides
 * (パッシブは passive)。`maxLevelOverride` は5段を書いた時点で要らないので消す。
 *
 * 実行時の差し替え(`applyLegacySkillBalance` / `applySeptemberSkillBalance`)は、
 * 定義へ書き込んだスキルの分だけ `case` を手で消した。**消さないと差し替えが上書きする**
 * (`tests/skillTuning.test.ts` が、実効値と指定値の一致で見張っている)。
 *
 * 一度きりの道具。今後のスキル調整は定義ファイルの `levelOverrides` を直接直せばよい
 * (`docs/SKILL_BALANCE_GUIDE.md`)。
 */
import ts from "typescript";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { ELEMENTS } from "../../../src/core/element.js";
import { createMonsterVariant } from "../../../src/core/monster.js";
import {
  computeLeveledSkill, describeSkillGrowth, describeSkillLines, skillDescriptionNote,
  type Skill, type SkillEffect,
} from "../../../src/core/skill.js";
import type { MonsterReport } from "../collect.js";
import { playableTemplates } from "../collect.js";
import { SPEC } from "./spec.js";
import { findSkill, resolveSkill, type ResolvedSkill } from "./resolve.js";

const DRY = process.argv.includes("--dry");

const TARGET_JA: Record<Skill["target"], string> = {
  SINGLE_ENEMY: "敵単体", ALL_ENEMIES: "敵全体", SINGLE_ALLY: "味方単体", ALL_ALLIES: "味方全体", SELF: "自身",
};

/* ============================================================ 期待する最終形 */

/** 今のゲーム内のスキル(差し替え後、Lv補正前) */
function realizedSkills(): Map<string, Skill> {
  const out = new Map<string, Skill>();
  for (const template of playableTemplates()) {
    for (const element of template.elements ?? ELEMENTS) {
      for (const skill of createMonsterVariant(template, element).skills) out.set(skill.id, skill);
    }
  }
  return out;
}

export interface Emitted {
  resolved: ResolvedSkill;
  skill: Skill;
  /** 説明文のうち、生成文の後ろへ足す一言 */
  note: string;
}

export function finalSkills(): Emitted[] {
  const before = JSON.parse(readFileSync("tests/fixtures/skills-before-2026-10.json", "utf8")) as MonsterReport[];
  const realized = realizedSkills();
  const out: Emitted[] = [];
  for (const spec of SPEC) {
    if (spec.keep || spec.pending) continue;
    const resolved = resolveSkill(spec, findSkill(before, spec.id));
    const current = realized.get(spec.id);
    if (!current) throw new Error(`今のゲームに無いスキル: ${spec.id}`);
    const { maxLevelOverride: _m, levelOverrides: _l, ...rest } = current;
    let skill: Skill;
    if (resolved.passiveLevels) {
      skill = {
        ...rest,
        passive: { ...current.passive!, levels: resolved.passiveLevels as unknown as NonNullable<Skill["passive"]>["levels"] },
      };
    } else {
      skill = {
        ...rest,
        ...resolved.flags,
        target: resolved.target,
        cooldownTurns: resolved.levels[0].cooldownTurns,
        effects: resolved.levels[0].effects,
        levelOverrides: resolved.levels,
      };
    }
    /*
     * 説明文の後ろの一言。**対象だけを書いた一言は付けない**——図鑑はすぐ下に
     * 「対象：敵単体 / …」の行を出すので、「【対象】敵単体」が二重に並ぶ。
     * 元から人が書き足していた一言(クリム・コラボ・fourSpecies)はそのまま残す。
     */
    const kept = skillDescriptionNote(current);
    const targetOnly = Object.values(TARGET_JA).map((t) => `【対象】${t}`);
    const note = kept !== null && kept !== "" && !targetOnly.includes(kept) ? kept : "";
    const lines = describeSkillLines(skill).join("。");
    skill.description = resolved.passiveLevels ? `パッシブ。${lines}` : note ? `${lines}。${note}` : lines;
    // 書いたままが起きるか(レベル補正を通した結果が、決めた値と一致するか)
    if (!resolved.passiveLevels) {
      resolved.levels.forEach((level, i) => {
        const got = computeLeveledSkill(skill, i + 1);
        if (JSON.stringify(got.effects) !== JSON.stringify(level.effects) || got.cooldownTurns !== level.cooldownTurns) {
          throw new Error(`${spec.id} Lv${i + 1}: 書いた値とレベル補正の結果が一致しない`);
        }
      });
    }
    out.push({ resolved, skill, note });
  }
  return out;
}

/* ============================================================ ソースの形へ */

const CONSTANTS: Record<string, Record<string, string>> = {
  BUFF: { atk: "ATK_UP", def: "DEF_UP", spd: "SPD_UP", criRate: "CRI_RATE_UP", criDmg: "CRI_DMG_UP" },
  DEBUFF: { atk: "ATK_DOWN", def: "DEF_DOWN", spd: "SPD_DOWN" },
};
const CONSTANT_VALUES: Record<string, number> = {
  ATK_UP: 0.3, DEF_UP: 0.3, SPD_UP: 0.2, CRI_RATE_UP: 0.2, CRI_DMG_UP: 0.3, ATK_DOWN: 0.5, DEF_DOWN: 0.75, SPD_DOWN: 0.3,
};

function num(value: number): string {
  // 二進小数の誤差だけを落とす(0.30000000000000004 → 0.3)。値そのものは変えない
  const clean = Number(value.toPrecision(12));
  return String(clean);
}

function key(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function literal(value: unknown, used: Set<string>, parentKind?: string, parentStat?: string, keyName?: string): string {
  if (value === null || value === undefined) return "undefined";
  if (typeof value === "number") {
    if (keyName === "amount" && parentKind && parentStat) {
      const name = CONSTANTS[parentKind]?.[parentStat];
      if (name && Math.abs(CONSTANT_VALUES[name] - value) < 1e-9) {
        used.add(name);
        return name;
      }
    }
    return num(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => literal(v, used)).join(", ")}]`;
  const record = value as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind : undefined;
  const stat = typeof record.stat === "string" ? record.stat : undefined;
  const parts = Object.entries(record)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${key(k)}: ${literal(v, used, kind, stat, k)}`);
  return `{ ${parts.join(", ")} }`;
}

function effectsLiteral(effects: readonly SkillEffect[], used: Set<string>, indent: string): string {
  if (effects.length === 0) return "[]";
  return `[\n${effects.map((e) => `${indent}  ${literal(e, used)},`).join("\n")}\n${indent}]`;
}

/** 作り直す欄の本文(id・name など元のまま残す欄は含まない) */
function generatedFields(e: Emitted, used: Set<string>, indent: string, wrapped: boolean): string[] {
  const { skill } = e;
  const out: string[] = [];
  out.push(`${indent}description: ${wrapped ? '""' : JSON.stringify(skill.description)},`);
  out.push(`${indent}target: ${JSON.stringify(skill.target)},`);
  out.push(`${indent}cooldownTurns: ${skill.cooldownTurns},`);
  out.push(`${indent}effects: ${effectsLiteral(skill.effects, used, indent)},`);
  for (const flag of ["extraTurn", "resetCooldownOnKill", "gaugeIfThreeEnemies", "extraTurnOnKill", "targetPriority", "randomEnemyHits", "automatic"] as const) {
    const value = (skill as unknown as Record<string, unknown>)[flag];
    if (value !== undefined && value !== false) out.push(`${indent}${flag}: ${literal(value, used)},`);
  }
  if (skill.passive) {
    const levels = skill.passive.levels.map((l) => `${indent}    ${literal(l, used)},`).join("\n");
    out.push(`${indent}passive: {\n${indent}  trigger: ${JSON.stringify(skill.passive.trigger)},\n${indent}  levels: [\n${levels}\n${indent}  ],\n${indent}},`);
  }
  if (skill.levelOverrides) {
    const growth = describeSkillGrowth(skill);
    const rows = skill.levelOverrides.map((level, i) => {
      const changes = i === 0 ? [] : growth[i - 1]?.changes ?? [];
      const comment = `${indent}  // Lv${i + 1}${changes.length ? ` ${changes.join(" / ")}` : ""}`;
      const effects = `[${level.effects.map((x) => literal(x, used)).join(", ")}]`;
      return `${comment}\n${indent}  { cooldownTurns: ${level.cooldownTurns}, effects: ${effects} },`;
    });
    out.push(`${indent}levelOverrides: [\n${rows.join("\n")}\n${indent}],`);
  }
  return out;
}

/** 作り直す欄。元のオブジェクトからはこれらを捨てる */
const REGENERATED = new Set([
  "description", "target", "cooldownTurns", "effects", "levelOverrides", "maxLevelOverride", "passive",
  "extraTurn", "resetCooldownOnKill", "gaugeIfThreeEnemies", "extraTurnOnKill", "targetPriority", "randomEnemyHits", "automatic",
]);

function lineIndent(text: string, pos: number): string {
  const start = text.lastIndexOf("\n", pos - 1) + 1;
  return /^\s*/.exec(text.slice(start))![0];
}

/**
 * 作り直す欄の中にあったコメントを拾う。**設計の理由が書いてあるので捨てない。**
 *
 * 「なぜこの倍率なのか」「なぜ LIFESTEAL で組むのか」が、効果の配列の中に
 * コメントで残っていることが多い。欄ごと作り直すと一緒に消えるので、
 * 字句解析で拾って、作り直した欄の手前へまとめて戻す(文字列の中の // は拾わない)。
 * 各段の「// Lv2 …」は作り直すので拾わない。
 */
function commentsIn(node: ts.Node, source: ts.SourceFile, indent: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source.text.slice(node.getFullStart(), node.getEnd()));
  const out: string[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const raw = scanner.getTokenText();
    if (/^\/\/\s*Lv[1-5]\b/.test(raw)) continue;
    const lines = raw.split("\n").map((line) => line.trim());
    out.push(...lines.map((line, i) => `${indent}${i > 0 && line.startsWith("*") ? " " : ""}${line}`));
  }
  return out;
}

/** オブジェクトリテラルを作り直す。元の id・name・その他の欄はそのままの文字で残す */
function rewriteObject(text: string, source: ts.SourceFile, node: ts.ObjectLiteralExpression, e: Emitted, used: Set<string>, wrapped: boolean): string {
  const base = lineIndent(text, node.getStart());
  const indent = `${base}  `;
  const regenerated = (p: ts.ObjectLiteralElementLike) => Boolean(p.name && REGENERATED.has(p.name.getText().replace(/["']/g, "")));
  const kept = node.properties.filter((p) => !regenerated(p)).map((p) => {
    const lead = commentsIn({ getFullStart: () => p.getFullStart(), getEnd: () => p.getStart() } as ts.Node, source, indent);
    return [...lead, `${indent}${p.getText()},`].join("\n");
  });
  const notes = node.properties.filter(regenerated).flatMap((p) => commentsIn(p, source, indent));
  return `{\n${[...kept, ...notes, ...generatedFields(e, used, indent, wrapped)].join("\n")}\n${base}}`;
}

/** `skill('id', 'name', target, ct, effects, steps, extras)`(fourSpecies.ts)を1つのオブジェクトへ */
function rewriteBuilderCall(text: string, node: ts.CallExpression, e: Emitted, used: Set<string>): string {
  const base = lineIndent(text, node.getStart());
  const indent = `${base}  `;
  const [idArg, nameArg, , , , , extras] = node.arguments;
  const kept = [`${indent}id: ${idArg.getText()},`, `${indent}name: ${nameArg.getText()},`];
  if (extras && ts.isObjectLiteralExpression(extras)) {
    for (const p of extras.properties) {
      if (p.name && REGENERATED.has(p.name.getText())) continue;
      kept.push(`${indent}${p.getText()},`);
    }
  }
  return `{\n${[...kept, ...generatedFields(e, used, indent, false)].join("\n")}\n${base}}`;
}

interface Edit { start: number; end: number; text: string }

function idOf(node: ts.ObjectLiteralExpression): string | undefined {
  for (const p of node.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText() === "id" && ts.isStringLiteral(p.initializer)) return p.initializer.text;
  }
  return undefined;
}

function sourceFiles(): string[] {
  const dirs = ["src/data", "src/data/newMonsters", "src/data/collabMonsters"];
  return dirs.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => `${dir}/${f}`));
}

function addImports(text: string, file: string, wanted: Set<string>): string {
  // 既にどこかから取り込んでいる名前は足さない(newMonsters/shared.js が定数を再輸出している)
  const imported = new Set([...text.matchAll(/import\s*\{([^}]*)\}/g)].flatMap((m) => m[1].split(",").map((s) => s.trim())));
  const names = new Set([...wanted].filter((n) => !imported.has(n)));
  if (names.size === 0) return text;
  const depth = file.split("/").length - 2; // src/data/x.ts → 1
  const spec = `${"../".repeat(depth)}core/statusValues.js`;
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${spec.replace(/[.]/g, "\\.")}["'];?`);
  const found = re.exec(text);
  if (found) {
    const existing = new Set(found[1].split(",").map((s) => s.trim()).filter(Boolean));
    const missing = [...names].filter((n) => !existing.has(n));
    if (missing.length === 0) return text;
    const merged = [...existing, ...missing].join(", ");
    return text.replace(found[0], `import { ${merged} } from "${spec}";`);
  }
  const lastImport = [...text.matchAll(/^import[^;]*;\s*$/gm)].pop();
  const at = lastImport ? lastImport.index! + lastImport[0].length : 0;
  return `${text.slice(0, at)}\nimport { ${[...names].join(", ")} } from "${spec}";${text.slice(at)}`;
}

export function emit(): { files: string[]; written: string[] } {
  const all = finalSkills();
  const byId = new Map(all.map((e) => [e.skill.id, e]));
  const written: string[] = [];
  const files: string[] = [];
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const edits: Edit[] = [];
    const used = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "skill"
        && node.arguments.length >= 6 && ts.isStringLiteral(node.arguments[0]) && byId.has(node.arguments[0].text)) {
        const e = byId.get(node.arguments[0].text)!;
        edits.push({ start: node.getStart(), end: node.getEnd(), text: rewriteBuilderCall(text, node, e, used) });
        written.push(e.skill.id);
        return;
      }
      // pass('id', 'name', levels)(fourSpecies.ts のパッシブ)は、段の配列だけを書き換える
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "pass"
        && node.arguments.length === 3 && ts.isStringLiteral(node.arguments[0]) && byId.has(node.arguments[0].text)) {
        const e = byId.get(node.arguments[0].text)!;
        const levels = node.arguments[2];
        const rows = e.skill.passive!.levels.map((l) => literal(l, used)).join(", ");
        edits.push({ start: levels.getStart(), end: levels.getEnd(), text: `[${rows}]` });
        written.push(e.skill.id);
        return;
      }
      if (ts.isObjectLiteralExpression(node)) {
        const id = idOf(node);
        if (id && byId.has(id)) {
          const parent = node.parent;
          const wrapped = ts.isCallExpression(parent) && parent.expression.getText() === "described";
          edits.push({ start: node.getStart(), end: node.getEnd(), text: rewriteObject(text, source, node, byId.get(id)!, used, wrapped) });
          written.push(id);
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (edits.length === 0) continue;
    let next = text;
    for (const edit of edits.sort((a, b) => b.start - a.start)) next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
    next = addImports(next, file, used);
    files.push(file);
    if (!DRY) writeFileSync(file, next);
  }
  const missing = all.map((e) => e.skill.id).filter((id) => !written.includes(id));
  if (missing.length) throw new Error(`定義が見つからないスキル: ${missing.join(", ")}`);
  const dupes = written.filter((id, i) => written.indexOf(id) !== i);
  if (dupes.length) throw new Error(`定義が2か所にあるスキル: ${dupes.join(", ")}`);
  return { files, written };
}

if (process.argv[1]?.endsWith("emit.ts")) {
  const { files, written } = emit();
  console.log(`${DRY ? "(dry) " : ""}${written.length} スキルを ${files.length} ファイルへ書いた`);
  for (const f of files) console.log(`  ${f}`);
}
