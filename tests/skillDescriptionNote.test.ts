/**
 * スキルの説明文が二度書きにならないこと。
 *
 * 新しいモンスターの説明は `described()` で
 * 「`describeSkillLines` の出力」＋「一言」の形に作ってある(CLAUDE.md)。
 * それをそのまま画面へ出すと、**すぐ下に並ぶ効果の行と同じ文が二度出る。**
 *
 * しかも説明文の数字は**Lv1で焼いてある。**育てると
 *
 *   上: 85%で対象の強化1個を解除し、25%で1ターン気絶
 *   下: 90%で対象の強化1個を解除し、35%で1ターン気絶
 *
 * と、同じ項目に違う数字が2つ並ぶ(依頼主の指摘。スエゾー光のS3)。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { describeSkillLines, skillDescriptionNote } from "../src/core/skill.js";
import { MONSTER_DEX_ENTRIES } from "../src/data/monsters.js";
import { skillDescriptionText } from "../src/web/views/skillPanel.js";
import type { Skill } from "../src/core/skill.js";

function allSkills(): { name: string; skill: Skill }[] {
  return MONSTER_DEX_ENTRIES.flatMap((entry) =>
    (entry.skills ?? []).map((skill) => ({ name: `${entry.name} / ${skill.name}`, skill })));
}

/** その説明文が `described()` で作られたものか */
const isGenerated = (skill: Skill) => skillDescriptionNote(skill) !== null;

describe("切り分け", () => {
  it("生成文で始まる説明は、その先の一言だけを返す", () => {
    const target = allSkills().find((entry) => {
      const note = skillDescriptionNote(entry.skill);
      return note !== null && note.length > 0;
    });
    expect(target, "一言付きの説明が1つも無い").toBeDefined();
    const note = skillDescriptionNote(target!.skill)!;
    expect(note).not.toContain(describeSkillLines(target!.skill)[0]);
    expect(target!.skill.description).toContain(note);
  });

  /** 昔ながらの説明文は効果の行とは別のことを書いている。**そのまま出す** */
  it("手書きの説明文には手を付けない", () => {
    const prose = allSkills().find((entry) => !isGenerated(entry.skill) && entry.skill.description);
    expect(prose, "手書きの説明が1つも無い").toBeDefined();
    expect(skillDescriptionText(prose!.skill)).toEqual([prose!.skill.description]);
  });

  it("説明が無いスキルは1行も出さない", () => {
    const empty: Skill = { id: "x", name: "無説明", description: "", target: "SELF", cooldownTurns: 0, effects: [] };
    expect(skillDescriptionText(empty)).toEqual([]);
  });
});

describe("実際のモンスター", () => {
  /** **画面に出る文が、下の効果の行をそのまま繰り返していないこと** */
  it("どのスキルも、効果の行を二度書きしない", () => {
    const duplicated: string[] = [];
    for (const { name, skill } of allSkills()) {
      const [text] = skillDescriptionText(skill);
      if (!text) continue;
      const generated = describeSkillLines(skill).join("。");
      if (generated && text.startsWith(generated)) duplicated.push(name);
    }
    expect(duplicated, `説明と効果が二度書きになっている: ${duplicated.join(", ")}`).toEqual([]);
  });

  it("一言の部分は消さずに残している", () => {
    const withNote = allSkills().filter((entry) => (skillDescriptionNote(entry.skill) ?? "").length > 0);
    expect(withNote.length, "一言付きの説明が1つも無い").toBeGreaterThan(0);
    for (const { name, skill } of withNote) {
      expect(skillDescriptionText(skill)[0], `${name} の一言が消えている`).toBe(skillDescriptionNote(skill));
    }
  });
});

/*
 * 画面側の配線。**3つの画面が同じ切り分けを通ること。**
 * 1つでも素の `description` に戻ると、そこだけ二度書きが復活する。
 */
describe("画面への配線", () => {
  const read = (path: string) => readFileSync(new URL(`../src/web/views/${path}`, import.meta.url), "utf8");

  it("所持モンスター・図鑑・スキル一覧が、みな切り分けを通している", () => {
    expect(read("monsters.ts")).toContain("skillDescriptionText(skill)");
    expect(read("monsterDex.ts")).toContain("skillDescriptionText(skill)");
    expect(read("skillPanel.ts")).toContain("descriptionNodes(skill)");
  });

  it("素の description を直に出す書き方が残っていない", () => {
    for (const path of ["monsters.ts", "monsterDex.ts", "skillPanel.ts"]) {
      expect(read(path), `${path} が素の説明文を出している`).not.toContain("[skill.description]");
    }
  });

  /*
   * **育てるかどうかを決めるのは所持モンスターの画面。**
   * 図鑑だけに要約があっても、そこまで見に行かない(依頼主の指摘)。
   */
  it("所持モンスターの画面にも、レベルの要約が出る", () => {
    expect(read("monsters.ts")).toContain("renderSkillGrowthSummary(skill, level)");
  });

  /*
   * **開いた札は幅を取る。**所持モンスターのスキルは3列に並んでいて、
   * 1枚110pxしかない。そのまま要約を入れると
   * 「ダ / メ / ージ倍率」と1文字ずつ折れて読めなかった(実機で確認)。
   */
  it("開いている間は、スキルの札が縦1列になる", () => {
    const css = readFileSync(new URL("../src/web/ui/monsterDetail.css", import.meta.url), "utf8");
    expect(css).toContain(".monster-detail-skills__grid:has(.monster-skill-compact[open])");
  });

  /** 要約のCSSは部品が自分で持つ。片方の画面のCSSに書くと、もう片方で色が付かない */
  it("要約のCSSを、描いている部品が読み込んでいる", () => {
    expect(read("skillPanel.ts")).toContain('import "../ui/skillGrowth.css"');
  });
});
