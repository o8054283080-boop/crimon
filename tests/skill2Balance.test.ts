import { describe, expect, it } from "vitest";
import { Skill } from "../src/core/skill.js";
import {
  GACHA_STAR3_TEMPLATES,
  GACHA_STAR4_TEMPLATES,
  GACHA_STAR5_TEMPLATES,
} from "../src/data/monsters.js";

const PLAYABLE_TEMPLATES = [
  ...GACHA_STAR3_TEMPLATES,
  ...GACHA_STAR4_TEMPLATES,
  ...GACHA_STAR5_TEMPLATES,
];

function skill2(id: string): Skill {
  const found = PLAYABLE_TEMPLATES.flatMap((template) => template.skill2Variants)
    .find((skill) => skill.id === id);
  if (!found) throw new Error(`スキル2が見つかりません: ${id}`);
  return found;
}

describe("スキル2の全体攻撃・弱スキル見直し", () => {
  it("全体攻撃へ変更した6種類を維持する", () => {
    const ids = [
      "slime_s2_a",
      "imp_s2_b",
      "treant_s2_a",
      "griffon_s2_a",
      "seraph_s2_a",
      "thunderbeast_s2_b",
    ];
    for (const id of ids) {
      expect(skill2(id).target, id).toBe("ALL_ENEMIES");
    }
  });

  it("攻撃型スキル2の全体攻撃が13種類ある", () => {
    const attacking = PLAYABLE_TEMPLATES.flatMap((template) => template.skill2Variants)
      .filter((skill) => skill.effects.some((effect) => effect.kind === "DAMAGE"));
    expect(attacking).toHaveLength(49);
    expect(attacking.filter((skill) => skill.target === "ALL_ENEMIES")).toHaveLength(13);
  });

  it("コボルトの急所突きは強化後の威力と防御無視率を持つ", () => {
    const damage = skill2("kobold_s2_a").effects.find((effect) => effect.kind === "DAMAGE");
    expect(damage).toMatchObject({ multiplier: 1.9, ignoreDefenseRatio: 0.25 });
  });
});
