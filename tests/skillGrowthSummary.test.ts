/**
 * 「レベルを上げると何が変わるか」の一行要約。
 *
 * **Lv別の全文を5段ぶん並べても、どこが動いたのかは読み取れない**
 * という依頼主の指摘で足したもの。
 *
 *   Lv.2 → ダメージ倍率 0.80倍→0.85倍
 *   Lv.5 → クールタイム -1(3→2ターン)
 *
 * いちばん大事なのは**取りこぼさないこと。**
 * 見ていない欄が伸びると「Lv3は変化なし」と嘘を出してしまう。
 */
import { describe, expect, it } from "vitest";
import { MAX_SKILL_LEVEL, computeLeveledSkill, describeSkillGrowth } from "../src/core/skill.js";
import { MONSTER_DEX_ENTRIES, MONSTER_TEMPLATES_DEX } from "../src/data/monsters.js";
import { CRIM } from "../src/data/newMonsters/crim.js";
import type { Skill } from "../src/core/skill.js";

/** 図鑑に出る全スキル。自動発動だけはレベルで伸びないので外す */
function activeSkills(): { name: string; skill: Skill }[] {
  const out: { name: string; skill: Skill }[] = [];
  for (const template of MONSTER_TEMPLATES_DEX) {
    for (const skill of template.skills ?? []) {
      if (skill.passive || skill.automatic) continue;
      out.push({ name: `${template.name} / ${skill.name}`, skill });
    }
  }
  return out;
}

/**
 * 図鑑に出るパッシブ全部。
 *
 * **`MONSTER_TEMPLATES_DEX` には入っていない。**コラボや追加種のパッシブは
 * 図鑑の一覧(`MONSTER_DEX_ENTRIES`)にしか出てこないので、
 * そちらを見ないと0件になる(最初それで見張れていなかった)。
 */
function passiveSkills(): { name: string; skill: Skill }[] {
  const out: { name: string; skill: Skill }[] = [];
  for (const entry of MONSTER_DEX_ENTRIES) {
    for (const skill of entry.skills ?? []) {
      if (!skill.passive) continue;
      out.push({ name: `${entry.name} / ${skill.name}`, skill });
    }
  }
  return out;
}

describe("並びの形", () => {
  it("Lv2からLv5までの4段が出る", () => {
    const steps = describeSkillGrowth(MONSTER_TEMPLATES_DEX[0].skills[0]);
    expect(steps.map((step) => step.level)).toEqual([2, 3, 4, 5]);
    expect(steps).toHaveLength(MAX_SKILL_LEVEL - 1);
  });

  /** 同じ文が2本並ばない。全体技で同じ効果が4つ乗っている時に効く */
  it("同じ言い回しは1回にまとめる", () => {
    for (const { name, skill } of activeSkills()) {
      for (const step of describeSkillGrowth(skill)) {
        expect(new Set(step.changes).size, `${name} Lv.${step.level} に同じ行が並んでいる`).toBe(step.changes.length);
      }
    }
  });
});

/*
 * **ここが本丸。**
 *
 * 実効値が動いているのに1行も出せない段があれば、画面には
 * 「変化なし」と出る。**育てたのに何も起きていないように見える。**
 */
describe("取りこぼさない", () => {
  it("実効値が動いた段は、必ず何か書ける", () => {
    const missed: string[] = [];
    for (const { name, skill } of activeSkills()) {
      for (const step of describeSkillGrowth(skill)) {
        if (step.changes.length > 0) continue;
        const before = JSON.stringify(computeLeveledSkill(skill, step.level - 1));
        const after = JSON.stringify(computeLeveledSkill(skill, step.level));
        if (before !== after) missed.push(`${name} Lv.${step.level}`);
      }
    }
    expect(missed, `動いているのに「変化なし」と出る段: ${missed.join(", ")}`).toEqual([]);
  });

  /*
   * **多段攻撃の1発ごとの効果(`perHitEffects`)まで見る。**
   * クリムのS2は Lv3・Lv4 の伸びがまるごとその中にあり、
   * 入れ子を見るまで「変化なし」と出ていた。
   */
  it("多段攻撃の中の伸びも拾う", () => {
    const rush = CRIM.skill2Variants?.[0];
    expect(rush, "クリムのS2が見つからない").toBeDefined();
    const steps = describeSkillGrowth(rush!);
    expect(steps.find((step) => step.level === 3)!.changes.join()).toContain("発動率");
    expect(steps.find((step) => step.level === 4)!.changes.join()).toContain("持続");
  });

  /*
   * **パッシブは別の場所に値がある。**
   *
   * `computeLeveledSkill` はパッシブに対してレベルを焼き込むだけで、
   * 中身(`passive.levels`)には触らない。そこを見ずに作ったせいで、
   * **伸びているのに全段「変化なし」と出ていた**(依頼主の指摘。
   * ウンディーネの「水の祝福」は Lv3で軽減20%→22%、Lv5で25%になる)。
   */
  it("パッシブも、段が違えば必ず何か書ける", () => {
    const all = passiveSkills();
    expect(all.length, "パッシブを1つも見ていない").toBeGreaterThan(0);
    const missed: string[] = [];
    for (const { name, skill } of all) {
      const levels = skill.passive!.levels;
      for (const step of describeSkillGrowth(skill)) {
        if (step.changes.length > 0) continue;
        if (JSON.stringify(levels[step.level - 2]) !== JSON.stringify(levels[step.level - 1])) {
          missed.push(`${name} Lv.${step.level}`);
        }
      }
    }
    expect(missed, `動いているのに「変化なし」と出るパッシブ: ${missed.join(", ")}`).toEqual([]);
  });

  /** 名前を付けていない欄は「強くなる」としか書けない。**1つも残さない** */
  it("パッシブの欄に名前が付いている", () => {
    const vague: string[] = [];
    for (const { name, skill } of passiveSkills()) {
      for (const step of describeSkillGrowth(skill)) {
        if (step.changes.includes("強くなる")) vague.push(`${name} Lv.${step.level}`);
      }
    }
    expect(vague, `名前の無い欄が伸びている: ${vague.join(", ")}`).toEqual([]);
  });

  /** その段で初めて生える効果も拾う(モッチー電気のLv5) */
  it("その段で初めて付く効果も書ける", () => {
    const guts = passiveSkills().find((entry) => /ガッツチャージ/.test(entry.name));
    expect(guts, "ガッツチャージが見つからない").toBeDefined();
    const lv5 = describeSkillGrowth(guts!.skill).find((step) => step.level === 5)!;
    expect(lv5.changes.join(" / ")).toContain("が付く");
  });

  it("1つも書けない段が全体のごく一部に収まっている", () => {
    const all = activeSkills().flatMap((entry) => describeSkillGrowth(entry.skill));
    const empty = all.filter((step) => step.changes.length === 0).length;
    // 本当に何も動かない段(Lv5でしか伸びない守りの技など)はある
    expect(empty / all.length, "「変化なし」が多すぎる。見落としている欄がありそう").toBeLessThan(0.1);
  });
});

describe("書き方", () => {
  const first = MONSTER_TEMPLATES_DEX.find((t) => t.templateId === "wolf" && t.element === "DARK")!;

  it("ダメージ倍率は「前→後」で書く", () => {
    const bite = describeSkillGrowth(first.skills[0]);
    expect(bite[0].changes[0]).toMatch(/^ダメージ倍率 \d+\.\d{2}倍→\d+\.\d{2}倍$/);
  });

  it("クールタイムは何ターン縮むかを先に書く", () => {
    const claw = describeSkillGrowth(first.skills[1]);
    expect(claw.find((step) => step.level === 5)!.changes.join(" / ")).toContain("クールタイム -1(3→2ターン)");
  });

  /*
   * **「持続」だけだと、どれの持続か分からない。**
   * 毒と治癒阻害の両方を持つ技で「持続 1→2ターン / 持続 2→3ターン」と
   * 並んで読めなかった。効果の名前を頭に付ける。
   */
  it("同じ名前の項目は、どの効果のものか分かるように書く", () => {
    // 2026年10月の調整で、ウルフの毒の持続は Lv1 から2ターンになり Lv5 では伸びなくなった。
    // 毒と治癒阻害の持続が同じ段で伸びる技として、雷フェンリルのS3を見る
    const fenrir = MONSTER_DEX_ENTRIES.find((t) => t.templateId === "fenrir" && t.element === "ELECTRIC")!;
    const fang = describeSkillGrowth(fenrir.skills[2]);
    const lv5 = fang.find((step) => step.level === 5)!.changes.join(" / ");
    expect(lv5).toContain("毒の持続");
    expect(lv5).toContain("治癒阻害の持続");
  });

  /** 二進小数の誤差を画面へ出さない(「0.08624999999999998」を出した前科がある) */
  it("桁が勝手に伸びない", () => {
    for (const { name, skill } of activeSkills()) {
      for (const step of describeSkillGrowth(skill)) {
        for (const change of step.changes) {
          expect(change, `${name} Lv.${step.level} の桁が伸びている: ${change}`).not.toMatch(/\d\.\d{4,}/);
        }
      }
    }
  });

  it("確率の数字は出してよい(編成を考えるのに要る)", () => {
    const claw = describeSkillGrowth(first.skills[1]);
    expect(claw[0].changes.join(" / ")).toMatch(/発動率 \d/);
  });
});

/** 画面側の配線。ここが外れると要約が出ない */
describe("画面への配線", () => {
  it("図鑑の折りたたみが要約を先に出している", async () => {
    const { readFileSync } = await import("node:fs");
    const panel = readFileSync(new URL("../src/web/views/skillPanel.ts", import.meta.url), "utf8");
    expect(panel).toContain("describeSkillGrowth(skill)");
    expect(panel).toContain("skill-growth-summary");
    // 要約 → 全文 の順。全文が先だと、また「どこが変わったか」が読めない
    expect(panel.indexOf("skill-growth-summary")).toBeLessThan(panel.lastIndexOf('className: "skill-growth" }'));
  });
});

/*
 * `amount` は**効果の種類で意味が違う。**一律に「行動ゲージ(%)」と読んでいたため、
 * グジラ電気のホワイトサージLv3(固定ダメージ 10,000→12,000)が
 * 「行動ゲージ 1000000%→1200000%」と出ていた(依頼主の指摘)。
 */
/**
 * 図鑑に並ぶ個体(属性ごと)が実際に持つ全スキル。
 * `activeSkills` はテンプレートしか見ないので、**コラボや新種の属性別S3が入らない**
 * (ホワイトサージもそこから漏れていた)。
 */
function dexSkills(): { name: string; skill: Skill }[] {
  const out = new Map<string, { name: string; skill: Skill }>();
  for (const entry of MONSTER_DEX_ENTRIES) {
    for (const skill of entry.skills ?? []) {
      if (skill.passive || skill.automatic || out.has(skill.id)) continue;
      out.set(skill.id, { name: `${entry.name} / ${skill.name}`, skill });
    }
  }
  return [...out.values()];
}

describe("amount を効果の種類ごとに読み分ける", () => {
  const SURGE: Skill = {
    id: "t_surge", name: "t", description: "", target: "SINGLE_ENEMY", cooldownTurns: 5,
    effects: [{ kind: "DAMAGE", multiplier: 4.8 }, { kind: "FLAT_DAMAGE", amount: 10_000, requires: "ANY_CRIT" }],
    levelOverrides: [
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.8 }, { kind: "FLAT_DAMAGE", amount: 10_000, requires: "ANY_CRIT" }] },
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.8 }, { kind: "FLAT_DAMAGE", amount: 12_000, requires: "ANY_CRIT" }] },
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.8 }, { kind: "FLAT_DAMAGE", amount: 12_000, requires: "ANY_CRIT" }] },
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.8 }, { kind: "FLAT_DAMAGE", amount: 12_000, requires: "ANY_CRIT" }] },
      { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.8 }, { kind: "FLAT_DAMAGE", amount: 12_000, requires: "ANY_CRIT" }] },
    ],
  };

  it("固定ダメージは桁区切りの素の数で出す", () => {
    expect(describeSkillGrowth(SURGE)[0].changes).toEqual(["固定ダメージ 10,000→12,000"]);
  });

  it("本物のホワイトサージとセレスティアルストームも正しい名前で出る", () => {
    const find = (id: string) => dexSkills().find((s) => s.skill.id === id)!.skill;
    const lv3 = (id: string) => describeSkillGrowth(find(id)).find((s) => s.level === 3)!.changes;
    expect(lv3("gujira_s3_white_surge")).toEqual(["固定ダメージ 10,000→12,000"]);
    expect(lv3("harpy_s3_light")).toEqual(["与ダメージ増加 20%→25%"]);
  });

  it("「行動ゲージ」と出す行は、実際に行動ゲージを動かす効果だけ", () => {
    for (const { name, skill } of dexSkills()) {
      for (let level = 2; level <= MAX_SKILL_LEVEL; level += 1) {
        // 1撃ごとの効果(`perHitEffects`)の中の行動ゲージも数える(モッチー水のガッチャー)
        const effects = computeLeveledSkill(skill, level).effects
          .flatMap((e) => [e, ...((e as { perHitEffects?: typeof e[] }).perHitEffects ?? [])]);
        const kinds = new Set(effects.map((e) => e.kind));
        const says = describeSkillGrowth(skill)[level - 2].changes.some((c) => c.startsWith("行動ゲージ"));
        if (says) expect(kinds.has("GAUGE") || kinds.has("GAUGE_ON_HIT"), `${name} Lv${level}`).toBe(true);
      }
    }
  });

  it("どの段にも、ありえない大きさの割合は出ない", () => {
    for (const { name, skill } of dexSkills()) {
      for (const step of describeSkillGrowth(skill)) {
        for (const change of step.changes) expect(change, `${name} Lv${step.level}`).not.toMatch(/\d{4,}%/);
      }
    }
  });
});
