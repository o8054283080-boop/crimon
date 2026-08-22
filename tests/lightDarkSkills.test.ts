import { describe, expect, it } from "vitest";
import { MonsterTemplate } from "../src/core/monster.js";
import { Skill } from "../src/core/skill.js";
import {
  GACHA_SR_COMMON_TEMPLATE,
  GACHA_SR_RARE_TEMPLATE,
  GACHA_SSR_COMMON_TEMPLATE,
  GACHA_SSR_RARE_TEMPLATE,
  MONSTER_TEMPLATES,
  findMonster,
} from "../src/data/monsters.js";

/**
 * 光/闇の固有スキル3が、全種族に揃っていることの検査。
 *
 * 実際の強さは `npx tsx tools/lightDarkProbe.ts` で実測している
 * (共通の相手への押し込み具合を、スキル3だけ差し替えて比べる)。
 * ここで見るのは「存在するか」「役割を保っているか」という、
 * 戦わせなくても分かる部分だけにする。
 */

const ALL: MonsterTemplate[] = [
  ...MONSTER_TEMPLATES,
  GACHA_SR_COMMON_TEMPLATE,
  GACHA_SR_RARE_TEMPLATE,
  GACHA_SSR_COMMON_TEMPLATE,
  GACHA_SSR_RARE_TEMPLATE,
];

const attacksEnemies = (s: Skill) => s.target === "SINGLE_ENEMY" || s.target === "ALL_ENEMIES";

describe("光/闇の固有スキル3", () => {
  it("ガチャ限定の高レアを含め、全種族が光と闇の両方を持つ", () => {
    const missing = ALL.filter((t) => !t.lightSkill3 || !t.darkSkill3).map((t) => t.baseName);
    expect(missing).toEqual([]);
  });

  it("実際に光/闇のモンスターへ行き渡っている", () => {
    for (const template of ALL) {
      expect(findMonster(template.templateId, "LIGHT")!.skills[2].id).toBe(template.lightSkill3!.id);
      expect(findMonster(template.templateId, "DARK")!.skills[2].id).toBe(template.darkSkill3!.id);
    }
  });

  it("スキルIDが重複していない", () => {
    const ids = ALL.flatMap((t) => [t.lightSkill3!.id, t.darkSkill3!.id]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("説明文が空でない", () => {
    for (const template of ALL) {
      for (const skill of [template.lightSkill3!, template.darkSkill3!]) {
        expect(skill.description.length).toBeGreaterThan(10);
        expect(skill.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("敵を殴る種族は、光/闇でも敵を殴る側のまま", () => {
    // 役割ごと変えてしまうと、同じ種族として育ててきた意味が消える。
    // 通常のスキル3が全部「敵を狙う」種族は、光/闇の少なくとも片方も敵を狙う
    for (const template of ALL) {
      if (!template.skill3Variants.every(attacksEnemies)) continue;
      const keepsRole = attacksEnemies(template.lightSkill3!) || attacksEnemies(template.darkSkill3!);
      expect(keepsRole, `${template.baseName} が攻撃役でなくなっている`).toBe(true);
    }
  });

  it("**クールタイムは通常のスキル3から2ターン以上は延びない**", () => {
    // 効果を盛るぶんクールタイムを伸ばすのは構わないが、
    // 伸ばしすぎると「強いが1戦に1回しか撃てない」ただの死にスキルになる
    for (const template of ALL) {
      const normalMax = Math.max(...template.skill3Variants.map((s) => s.cooldownTurns));
      for (const skill of [template.lightSkill3!, template.darkSkill3!]) {
        expect(skill.cooldownTurns, `${template.baseName} / ${skill.name}`).toBeLessThanOrEqual(normalMax + 2);
      }
    }
  });
});
