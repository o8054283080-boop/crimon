/**
 * 実効スキル一覧を出す。
 *
 *   npm run skills:report                       docs/skills/ へ Markdown・JSON・CSV を書き出す
 *   npm run skills:report -- --check            書き出し済みのものが最新か確かめる(CIで使う)
 *   npm run skills:report -- --monster chronos  その種族の Lv1〜5 だけを画面に出す(書き出さない)
 *   npm run skills:report -- --skill chronos_s3_b   そのスキルだけを出す
 *   npm run skills:report -- --overrides        実行時に差し替えられているスキルだけを出す
 *   npm run skills:report -- --unique           光/闇専用S3だけを出す
 *
 * 数字は**ゲーム内と同じ経路**で作る(`tools/skillsReport/collect.ts`)。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectAll, monsterMarkdown, reportCsv, reportJson, reportMarkdown, skillMarkdown,
} from "./collect.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OUT_DIR = join(ROOT, "docs", "skills");
const FILES = {
  md: join(OUT_DIR, "effective-skills.md"),
  json: join(OUT_DIR, "effective-skills.json"),
  csv: join(OUT_DIR, "effective-skills.csv"),
};

const args = process.argv.slice(2);
const valueOf = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const monsters = collectAll();

const monsterFilter = valueOf("--monster");
const skillFilter = valueOf("--skill");
if (monsterFilter || skillFilter || args.includes("--overrides") || args.includes("--unique")) {
  const picked = monsters
    .filter((m) => !monsterFilter || m.templateId === monsterFilter)
    .map((m) => ({
      ...m,
      skills: m.skills.filter((s) =>
        (!skillFilter || s.skillId === skillFilter)
        && (!args.includes("--overrides") || s.runtimeOverride)
        && (!args.includes("--unique") || s.uniqueLightDark !== null)),
    }))
    .filter((m) => m.skills.length > 0);
  if (picked.length === 0) {
    console.error("該当するスキルがありません");
    process.exit(1);
  }
  for (const monster of picked) {
    if (monsterFilter && !skillFilter) console.log(monsterMarkdown(monster));
    else for (const skill of monster.skills) console.log(`${monster.name}\n${skillMarkdown(skill)}\n`);
  }
  process.exit(0);
}

const outputs = { md: reportMarkdown(monsters), json: reportJson(monsters), csv: reportCsv(monsters) };

if (args.includes("--check")) {
  const stale = (Object.keys(FILES) as (keyof typeof FILES)[]).filter((key) => {
    try {
      return readFileSync(FILES[key], "utf8") !== outputs[key];
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    console.error(`実効スキル一覧が古いです(${stale.join(", ")})。npm run skills:report で作り直してください`);
    process.exit(1);
  }
  console.log("実効スキル一覧は最新です");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const key of Object.keys(FILES) as (keyof typeof FILES)[]) writeFileSync(FILES[key], outputs[key]);
const skillCount = monsters.reduce((n, m) => n + m.skills.length, 0);
console.log(`書き出しました: ${monsters.length}種 / ${skillCount}スキル → docs/skills/`);
