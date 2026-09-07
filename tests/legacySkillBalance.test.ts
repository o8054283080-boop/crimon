import { describe, expect, it } from "vitest";
import { findSkillById } from "../src/data/monsters.js";

function skill(id: string) {
  const found = findSkillById(id);
  expect(found, `${id} が見つからない`).toBeDefined();
  return found!;
}

describe("既存モンスターの弱スキル底上げ", () => {
  it("スライムの通常スキル3を強化する", () => {
    const limitBreak = skill("slime_s3_a");
    expect(limitBreak.effects[0]).toMatchObject({ kind: "DAMAGE", multiplier: 1.8 });
    expect(limitBreak.effects[1]).toMatchObject({ kind: "GAUGE", amount: 0.2, applyTo: "SELF", requires: "KILLED_TARGET" });

    const flash = skill("slime_s3_c");
    expect(flash.effects[0]).toMatchObject({ kind: "DAMAGE", multiplier: 1.5 });
    expect(flash.effects[1]).toMatchObject({ kind: "BLIND", chance: 0.75, durationTurns: 2 });
  });

  it("ウルフの通常スキル3を強化する", () => {
    const fullPower = skill("wolf_s3_a");
    expect(fullPower.effects[0]).toMatchObject({ kind: "DAMAGE", multiplier: 2.8 });
    expect(fullPower.effects[1]).toMatchObject({ kind: "STUN", chance: 0.5 });

    const slash = skill("wolf_s3_b");
    expect(slash.effects[0]).toMatchObject({ kind: "DAMAGE", multiplier: 0.85, hits: 3 });
  });

  it("インプの全体妨害を強化する", () => {
    const malice = skill("imp_s3_a");
    expect(malice.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "DEBUFF", stat: "atk", chance: 0.75 }),
      expect.objectContaining({ kind: "GAUGE", amount: -0.15 }),
    ]));

    const seal = skill("imp_s3_b");
    expect(seal.cooldownTurns).toBe(4);
    expect(seal.effects[1]).toMatchObject({ kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.75 });
  });

  it("ウィスプ・フェアリー・グレイヴナイトを底上げする", () => {
    expect(skill("wisp_s2_b").effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "GAUGE", amount: 0.25 }),
    ]));

    const forest = skill("fairy_s3_c");
    expect(forest.cooldownTurns).toBe(4);
    expect(forest.effects[0]).toMatchObject({ kind: "HEAL", healRate: 0.25 });

    const cross = skill("knight_s3_b");
    expect(cross.effects[0]).toMatchObject({ kind: "DAMAGE", multiplier: 1.5 });
    expect(cross.effects[1]).toMatchObject({ kind: "STUN", chance: 0.6 });
  });

  /*
   * 時空崩壊。**書いたままが起きる形で持つ。**
   *
   * 以前は「GAUGEに発動率が無い」という理由で0ターンのスタンを判定の印にし、
   * 外れた時だけ +100% を足して打ち消していた。GAUGEに `chance` が入った後も
   * 残っていて、画面には
   *   「70%でスタン(0ターン) / 行動ゲージ-100%(スタンが失敗したらさらに100%)」
   * と出ていた。**何が起きるのか読めない**と指摘を受けて組み直した。
   */
  it("時空崩壊は70%でゲージ100%ダウン、20%でスタン", () => {
    const collapse = skill("chronos_s3_b");
    expect(collapse.description).toContain("70%で行動ゲージを100%減少");
    expect(collapse.description).toContain("20%で1ターン行動不能");
    expect(collapse.effects).toHaveLength(3);
    expect(collapse.effects[0]).toMatchObject({ kind: "DAMAGE", multiplier: 1.0 });
    expect(collapse.effects[1]).toMatchObject({ kind: "GAUGE", amount: -1, chance: 0.7 });
    expect(collapse.effects[2]).toMatchObject({ kind: "STUN", durationTurns: 1, chance: 0.2 });
    // **判定の印として使う0ターンのスタンは、もう持たない**
    for (const effect of collapse.effects) {
      if (effect.kind === "STUN") expect(effect.durationTurns).toBeGreaterThan(0);
    }
  });

  /*
   * 表示。ゲージは0〜100%に収まるので、100%を超える指定は意味を持たない。
   * スキルを上げると量も伸びるため、-100%と書いた技がMAXで「-118%」と
   * 表示されていた(**足りない数字を盛って見せていた**)。
   */
  it("行動ゲージの増減は、100%を超えて表示しない", async () => {
    const { computeLeveledSkill, describeSkillLines } = await import("../src/core/skill.js");
    const collapse = skill("chronos_s3_b");
    const maxed = describeSkillLines(computeLeveledSkill(collapse, 5)).join(" / ");
    expect(maxed).toContain("行動ゲージ-100%");
    // 出ている数字を全部取り出して、100を超えるものが無いことを見る
    const shown = [...maxed.matchAll(/行動ゲージ[+-](\d+)%/g)].map((m) => Number(m[1]));
    expect(shown.length).toBeGreaterThan(0);
    expect(Math.max(...shown), `100%を超える表示: ${maxed}`).toBeLessThanOrEqual(100);
  });
});
