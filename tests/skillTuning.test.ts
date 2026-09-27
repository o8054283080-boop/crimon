import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectAll, type LevelEntry, type MonsterReport } from "../tools/skillsReport/collect.js";
import { findWeakenings } from "../tools/skillsReport/compare.js";
import { SPEC } from "../tools/skillsReport/tuning/spec.js";
import { findSkill, resolveSkill } from "../tools/skillsReport/tuning/resolve.js";
import { COLLAB_MONSTER_TEMPLATES } from "../src/data/collabMonsters/index.js";

/*
 * **2026年10月のスキル調整が、指定どおりにゲームへ届いているか。**
 *
 * 見ているのは定義ファイルではなく、図鑑・戦闘と同じ経路で作った実効 Lv1〜5
 * (`tools/skillsReport/collect.ts`)。定義を直しても実行時の差し替えが上書きしていれば、
 * ここで落ちる(クロノスの時空崩壊がそうだった)。
 *
 *   1. 指定のあるスキル … 指定値(と、ナーフ禁止のために引き上げた値)に一致する
 *   2. 強化なし・保留・指定の無いスキル … 変更前と1文字も違わない
 *   3. どのスキルも、変更前より弱くなった数字が無い(置き換えの指定がある所を除く)
 *   4. スキルID・持つ属性・光闇固有・スロット・コラボの並びが変わっていない
 *
 * 変更前の実効値は `tests/fixtures/skills-before-2026-10.json`(調整前の main で
 * `collectAll()` を書き出したもの)。**これを作り直すと比較の意味が無くなる。**
 */
const BEFORE = JSON.parse(readFileSync("tests/fixtures/skills-before-2026-10.json", "utf8")) as MonsterReport[];
const AFTER = collectAll();
const TUNED = SPEC.filter((spec) => !spec.keep && !spec.pending);
const TUNED_IDS = new Set(TUNED.map((spec) => spec.id));

/** 数字の照合に使う部分だけ(画面用の文は比べない) */
function numbers(level: LevelEntry) {
  return { target: level.target, cooldownTurns: level.cooldownTurns, effects: level.effects, passive: level.passive, flags: level.flags };
}

/** "DAMAGE#0.perHit.GAUGE#0.amount" などのパスで、実効値の中の数字を拾う */
function valueAt(level: LevelEntry, path: string): unknown {
  if (path === "ct") return level.cooldownTurns;
  if (path.startsWith("passive.")) return (level.passive as Record<string, unknown>)[path.slice("passive.".length)];
  let list = level.effects as unknown as Record<string, unknown>[];
  let holder: unknown;
  for (const part of path.split(".")) {
    if (part.includes("#")) {
      const [kind, n] = part.split("#");
      holder = list.filter((e) => e.kind === kind)[Number(n)];
      continue;
    }
    if (part === "perHit") {
      list = ((holder as Record<string, unknown>).perHitEffects as Record<string, unknown>[]) ?? [];
      continue;
    }
    holder = (holder as Record<string, unknown> | undefined)?.[part];
  }
  return holder;
}

describe("2026年10月のスキル調整", () => {
  it("指定のあるスキルは、指定の Lv1〜5 どおりに実効値が決まっている", () => {
    const wrong: string[] = [];
    for (const spec of TUNED) {
      const resolved = resolveSkill(spec, findSkill(BEFORE, spec.id));
      const actual = findSkill(AFTER, spec.id);
      actual.levels.forEach((level, i) => {
        const expected = resolved.passiveLevels
          ? { target: resolved.target, cooldownTurns: level.cooldownTurns, effects: [], passive: resolved.passiveLevels[i], flags: resolved.flags }
          : { target: resolved.target, cooldownTurns: resolved.levels[i].cooldownTurns, effects: resolved.levels[i].effects, passive: undefined, flags: resolved.flags };
        if (JSON.stringify(numbers(level)) !== JSON.stringify(expected)) wrong.push(`${spec.id} Lv${i + 1}`);
      });
    }
    expect(wrong, `実効値が決めた値と違う:\n${wrong.join("\n")}`).toEqual([]);
  });

  it("指定値を1つずつ照合する(引き上げた値は、引き上げた記録と一致する)", () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const spec of TUNED) {
      const { deviations } = resolveSkill(spec, findSkill(BEFORE, spec.id));
      const actual = findSkill(AFTER, spec.id);
      for (const [path, series] of Object.entries(spec.values ?? {})) {
        series.forEach((specified, i) => {
          if (specified === undefined) return;
          checked += 1;
          const got = valueAt(actual.levels[i], path);
          const raised = deviations.find((d) => d.level === i + 1 && d.path === path);
          const want = raised ? raised.final : specified;
          // 0 の指定は「その段ではまだ付かない」(Lv3から付くゲージなど)。効果ごと無いのが正しい
          if (want === 0 && got === undefined) return;
          if (typeof got !== "number" || Math.abs(got - want) > 1e-9) {
            wrong.push(`${spec.id} Lv${i + 1} ${path}: 指定 ${specified}${raised ? `(引き上げ後 ${raised.final})` : ""} / 実効 ${String(got)}`);
          }
        });
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(wrong, `指定値と一致しない:\n${wrong.join("\n")}`).toEqual([]);
  });

  it("強化なし・保留・指定の無いスキルは、変更前と完全に一致する", () => {
    const changed: string[] = [];
    for (const monster of BEFORE) {
      for (const skill of monster.skills) {
        if (TUNED_IDS.has(skill.skillId)) continue;
        const after = findSkill(AFTER, skill.skillId);
        skill.levels.forEach((level, i) => {
          if (JSON.stringify(numbers(level)) !== JSON.stringify(numbers(after.levels[i]))) changed.push(`${skill.skillId} Lv${i + 1}`);
        });
      }
    }
    expect(changed, `触っていないはずのスキルが変わった:\n${changed.join("\n")}`).toEqual([]);
  });

  it("弱くなった数字は、置き換えの指定がある所だけ", () => {
    const allow = new Map(SPEC.map((spec) => [spec.id, spec.allowWeaker ?? {}]));
    const unexpected = findWeakenings(BEFORE, AFTER).filter((w) => {
      const allowed = allow.get(w.skillId) ?? {};
      if (allowed["*"]) return false;
      const path = w.where.replace(/^effects\./, "");
      return !Object.keys(allowed).some((key) => path === key || path.startsWith(`${key}.`));
    });
    expect(unexpected.map((w) => `${w.skillId} Lv${w.level} ${w.where}: ${JSON.stringify(w.before)} → ${JSON.stringify(w.after)}`)).toEqual([]);
  });

  it("弱くなって良い所には、必ず理由が書いてある", () => {
    for (const spec of SPEC) {
      for (const [path, reason] of Object.entries(spec.allowWeaker ?? {})) {
        expect(reason.length, `${spec.id} ${path}`).toBeGreaterThan(10);
      }
    }
  });

  it("スキルID・持つ属性・光闇固有・スロットは変わっていない", () => {
    const shape = (monsters: MonsterReport[]) => monsters.map((m) => ({
      templateId: m.templateId,
      elements: m.elements,
      skills: m.skills.map((s) => [s.skillId, s.slot, s.elements, s.uniqueLightDark]),
    }));
    expect(shape(AFTER)).toEqual(shape(BEFORE));
  });

  it("コラボモンスターの並びは変わっていない", () => {
    // 並びは属性ごとのスキル割り当てと召喚の表示順に効く。変える時は依頼主の確認が要る
    expect(COLLAB_MONSTER_TEMPLATES.map((t) => t.templateId)).toEqual(["mocchi", "suezo", "undine", "gujira"]);
  });

  /*
   * **育てると弱くなる段を作らない。**
   *
   * 「Lv2だけ上げて、Lv3〜5は現行」の指定を素直に入れると、現行の Lv3 が Lv2 を下回る
   * (スエゾーのキス 1.90→1.85 が実際に出た)。全スキルの Lv n → Lv n+1 を
   * 「変更前 → 変更後」と見立てて、弱くなった数字を探す。
   */
  it("どのスキルも、Lv が上がって弱くなる数字が無い", () => {
    // 形が変わる段(攻撃の回数が変わる)だけは、1回目どうしの倍率が下がって見える
    const reshaped = new Set(["mushroon_s3_dark Lv4→Lv5 effects.DAMAGE#0.multiplier"]);
    const found: string[] = [];
    for (const monster of AFTER) {
      for (const skill of monster.skills) {
        for (let i = 1; i < skill.levels.length; i += 1) {
          const at = (index: number): MonsterReport[] => [{ ...monster, skills: [{ ...skill, levels: [skill.levels[index]] }] }];
          for (const w of findWeakenings(at(i - 1), at(i))) {
            const label = `${skill.skillId} Lv${i}→Lv${i + 1} ${w.where}`;
            if (!reshaped.has(label)) found.push(`${label}: ${JSON.stringify(w.before)} → ${JSON.stringify(w.after)}`);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("書き出したレポートが最新の実効値と一致している(npm run skills:report)", () => {
    const committed = JSON.parse(readFileSync("docs/skills/effective-skills.json", "utf8")) as MonsterReport[];
    expect(JSON.stringify(committed)).toBe(JSON.stringify(AFTER));
  });
});
