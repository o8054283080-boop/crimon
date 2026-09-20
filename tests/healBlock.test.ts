/**
 * 治癒阻害は「回復を受けられない」の一本。
 *
 * **表示と実態が食い違っていた。**スキル側に `healMultiplier` という欄があり、
 * 0.5(半減)と書かれたものが17件あった。ところがエンジンは掛かった時点で
 * 回復量を0に固定していて、**この欄は説明文と戦闘ログにしか出ていなかった。**
 * 画面には「受ける回復が50%減る」と出るのに、実際は1も回復しない。
 *
 * 依頼主の指定で**全部「回復不能」に揃えた。**書ける場所ごと無くしてある。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { applyHeal, createBattleUnit } from "../src/battle/unit.js";
import { describeSkillEffect } from "../src/core/skill.js";
import { MONSTER_TEMPLATES_DEX } from "../src/data/monsters.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import type { Skill, SkillEffect } from "../src/core/skill.js";

/** 何もしない技。枠を埋めるためだけに要る */
const IDLE: Skill = { id: "idle", name: "待機", description: "何もしない", target: "SINGLE_ENEMY", cooldownTurns: 0, effects: [] };

/** 回復を測るだけの的。数字はどれも計算に関係しない */
const DUMMY: MonsterDefinition = {
  id: "heal_block_target",
  templateId: "heal_block_target",
  name: "的",
  element: "GRASS",
  emoji: "🟢",
  color: "#0f0",
  role: "テスト",
  stats: { hp: 10_000, atk: 100, def: 100, spd: 100, criRate: 0, criDmg: 1.5, resistance: 0, accuracy: 1 },
  // 回復しか測らないので中身は空の技でよい。枠は3つ要る
  skills: [IDLE, IDLE, IDLE],
};

describe("掛かっている間は1も回復しない", () => {
  it("治癒阻害が無ければ回復する", () => {
    const unit = createBattleUnit(DUMMY, "PLAYER", "a");
    unit.currentHp = 1_000;
    applyHeal(unit, 500);
    expect(unit.currentHp).toBe(1_500);
  });

  /** **半分でもなく、1でもなく、0。** */
  it("治癒阻害中は回復量がまるごと消える", () => {
    const unit = createBattleUnit(DUMMY, "PLAYER", "a");
    unit.currentHp = 1_000;
    unit.healBlockTurns = 2;
    unit.healBlockMultiplier = 0;
    applyHeal(unit, 500);
    expect(unit.currentHp, "治癒阻害中なのに回復した").toBe(1_000);
  });

  it("大きな回復でも通らない", () => {
    const unit = createBattleUnit(DUMMY, "PLAYER", "a");
    unit.currentHp = 1;
    unit.healBlockTurns = 1;
    unit.healBlockMultiplier = 0;
    applyHeal(unit, 9_999);
    expect(unit.currentHp).toBe(1);
  });
});

describe("効き目に段を作れない", () => {
  /*
   * **半減を書ける場所そのものを無くした。**
   * 欄が残っていると、また「50%減」と書いて表示だけが嘘をつく。
   */
  it("スキルの効果に healMultiplier という欄が無い", () => {
    const skill = readFileSync(new URL("../src/core/skill.ts", import.meta.url), "utf8");
    const decl = skill.slice(skill.indexOf("export interface HealBlockEffect"));
    expect(decl.slice(0, decl.indexOf("\n}"))).not.toContain("healMultiplier:");
  });

  it("データにも道具にも healMultiplier が1つも残っていない", () => {
    const roots = ["../src/data", "../src/battle", "../src/core", "../tools/battleLab"];
    const leaked: string[] = [];
    for (const root of roots) {
      const dir = fileURLToPath(new URL(root, import.meta.url));
      for (const file of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
        if (!file.endsWith(".ts")) continue;
        const body = readFileSync(join(dir, file), "utf8");
        // skill.ts の説明コメントには、何が起きていたかの記録として残してある
        if (/healMultiplier:/.test(body)) leaked.push(`${root}/${file}`);
      }
    }
    expect(leaked, `healMultiplier が残っている: ${leaked.join(", ")}`).toEqual([]);
  });

  /** 半減の共通定数も消す。**呼べる名前が残っていると、また使われる** */
  it("HEAL_BLOCK_HALF という定数が無い", () => {
    const shared = readFileSync(new URL("../src/data/newMonsters/shared.ts", import.meta.url), "utf8");
    expect(shared).not.toContain("export const HEAL_BLOCK_HALF");
  });
});

describe("説明文と戦闘ログ", () => {
  const effect: SkillEffect = { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.8 };

  it("「回復を受けられない」と書く", () => {
    const text = describeSkillEffect(effect);
    expect(text).toContain("回復を受けられない");
    expect(text, "%減という書き方が残っている").not.toMatch(/\d+%減/);
  });

  it("発動%は残す(編成を考えるのに要る)", () => {
    expect(describeSkillEffect(effect)).toContain("80%");
  });

  it("戦闘ログも「回復を受けられない」", () => {
    const engine = readFileSync(new URL("../src/battle/engine.ts", import.meta.url), "utf8");
    expect(engine).toContain("は治癒阻害を受けた！ (${effect.durationTurns}ターン、回復を受けられない)");
  });
});

describe("実際のモンスター", () => {
  /** 図鑑に出る全スキルを通して見る。1件でも%減が残っていたら落とす */
  it("治癒阻害を持つスキルの説明に「%減」が出てこない", () => {
    const leaked: string[] = [];
    for (const template of MONSTER_TEMPLATES_DEX) {
      for (const skill of template.skills ?? []) {
        for (const effect of skill.effects ?? []) {
          if (effect.kind !== "HEAL_BLOCK") continue;
          const text = describeSkillEffect(effect);
          if (/\d+%減/.test(text)) leaked.push(`${template.templateId} / ${skill.name}: ${text}`);
        }
      }
    }
    expect(leaked, leaked.join("\n")).toEqual([]);
  });

  it("治癒阻害を持つスキルがちゃんと存在する", () => {
    const count = MONSTER_TEMPLATES_DEX
      .flatMap((template) => template.skills ?? [])
      .flatMap((skill) => skill.effects ?? [])
      .filter((effect) => effect.kind === "HEAL_BLOCK").length;
    expect(count, "治癒阻害が1つも無い").toBeGreaterThan(0);
  });
});
