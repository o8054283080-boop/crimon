import { describe, expect, it } from "vitest";
import { ELEMENTS } from "../src/core/element.js";
import { MONSTER_TEMPLATES, REINCARNATION_PIG_DEX, findMonster } from "../src/data/monsters.js";

describe("スキル2・3の属性別バリエーション", () => {
  it("各モンスター種はスキル2・スキル3それぞれ3種類の候補を持つ", () => {
    for (const template of MONSTER_TEMPLATES) {
      expect(template.skill2Variants).toHaveLength(3);
      expect(template.skill3Variants).toHaveLength(3);
    }
  });

  it("スキル1は属性によらず全属性で共通", () => {
    for (const template of MONSTER_TEMPLATES) {
      const variants = ELEMENTS.map((element) => findMonster(template.templateId, element)!);
      const skill1Ids = new Set(variants.map((v) => v.skills[0].id));
      expect(skill1Ids.size).toBe(1);
    }
  });

  it("スキル2・スキル3は属性によって異なる組み合わせになる(6属性で3種類以上の見分けがつく)", () => {
    for (const template of MONSTER_TEMPLATES) {
      const variants = ELEMENTS.map((element) => findMonster(template.templateId, element)!);
      const skill2Ids = new Set(variants.map((v) => v.skills[1].id));
      const skill3Ids = new Set(variants.map((v) => v.skills[2].id));
      expect(skill2Ids.size).toBe(3);
      expect(skill3Ids.size).toBe(3);
    }
  });

  it("同じ属性同士は同じスキル2・3の組み合わせになる(決定的)", () => {
    for (const template of MONSTER_TEMPLATES) {
      const fireVariant = findMonster(template.templateId, "FIRE")!;
      const waterVariant = findMonster(template.templateId, "WATER")!;
      // FIRE(index0)とWATER(index3)は index%3 が同じ(0)になる想定
      expect(fireVariant.skills[1].id).toBe(waterVariant.skills[1].id);
      expect(fireVariant.skills[2].id).toBe(waterVariant.skills[2].id);
    }
  });

  it("転生ピッグはスキル候補が1種類のみで、全属性共通のスキルになる", () => {
    const skill2Ids = new Set(REINCARNATION_PIG_DEX.map((v) => v.skills[1].id));
    const skill3Ids = new Set(REINCARNATION_PIG_DEX.map((v) => v.skills[2].id));
    expect(skill2Ids.size).toBe(1);
    expect(skill3Ids.size).toBe(1);
  });

  it("スキルには名前・説明・クールタイム情報が含まれる(UI表示用)", () => {
    for (const template of MONSTER_TEMPLATES) {
      const dex = findMonster(template.templateId, "FIRE")!;
      for (const skill of dex.skills) {
        expect(skill.name.length).toBeGreaterThan(0);
        expect(skill.description.length).toBeGreaterThan(0);
        expect(typeof skill.cooldownTurns).toBe("number");
      }
      expect(dex.skills[0].cooldownTurns).toBe(0);
    }
  });
});
