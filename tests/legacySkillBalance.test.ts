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

  it("時空崩壊を70%で行動ゲージ100%ダウンにする", () => {
    const collapse = skill("chronos_s3_b");
    expect(collapse.description).toContain("70%");
    expect(collapse.description).toContain("100%減少");
    expect(collapse.effects[0]).toMatchObject({ kind: "DAMAGE", multiplier: 1.0 });
    expect(collapse.effects[1]).toMatchObject({ kind: "STUN", durationTurns: 0, chance: 0.7 });
    expect(collapse.effects[2]).toMatchObject({
      kind: "GAUGE",
      amount: -1,
      conditionalExtra: { when: "STUN_FAILED", amount: 1 },
    });
  });
});
