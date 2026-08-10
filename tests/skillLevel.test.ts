import { describe, expect, it } from "vitest";
import { MAX_SKILL_LEVEL, Skill, computeLeveledSkill, describeSkillEffect } from "../src/core/skill.js";
import { createMonsterInstance, isSkillMaxLevel, rollSkillLevelUp } from "../src/core/monsterInstance.js";

const damageSkill: Skill = {
  id: "test_damage",
  name: "テスト斬撃",
  description: "テスト用のダメージスキル",
  target: "SINGLE_ENEMY",
  cooldownTurns: 3,
  effects: [{ kind: "DAMAGE", multiplier: 1.5 }],
};

const healSkill: Skill = {
  id: "test_heal",
  name: "テスト回復",
  description: "テスト用の回復スキル",
  target: "SINGLE_ALLY",
  cooldownTurns: 4,
  effects: [{ kind: "HEAL", healRate: 0.2 }],
};

const buffSkill: Skill = {
  id: "test_buff",
  name: "テストバフ",
  description: "テスト用のバフスキル",
  target: "ALL_ALLIES",
  cooldownTurns: 2,
  effects: [{ kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 2 }],
};

describe("computeLeveledSkill", () => {
  it("レベル1は元のスキルをそのまま返す", () => {
    const leveled = computeLeveledSkill(damageSkill, 1);
    expect(leveled).toEqual(damageSkill);
  });

  it("レベル2〜4はダメージ倍率が少しずつ上昇する", () => {
    const lv2 = computeLeveledSkill(damageSkill, 2);
    const lv3 = computeLeveledSkill(damageSkill, 3);
    const lv4 = computeLeveledSkill(damageSkill, 4);
    const dmg2 = (lv2.effects[0] as { multiplier: number }).multiplier;
    const dmg3 = (lv3.effects[0] as { multiplier: number }).multiplier;
    const dmg4 = (lv4.effects[0] as { multiplier: number }).multiplier;
    expect(dmg2).toBeGreaterThan(damageSkill.effects[0].kind === "DAMAGE" ? damageSkill.effects[0].multiplier : 0);
    expect(dmg3).toBeGreaterThan(dmg2);
    expect(dmg4).toBeGreaterThan(dmg3);
  });

  it("レベル2〜4は回復量が少しずつ上昇する", () => {
    const base = healSkill.effects[0].kind === "HEAL" ? healSkill.effects[0].healRate : 0;
    const lv4 = computeLeveledSkill(healSkill, 4);
    const heal4 = (lv4.effects[0] as { healRate: number }).healRate;
    expect(heal4).toBeGreaterThan(base);
  });

  it("レベル2〜4ではクールタイムは変化しない", () => {
    for (const level of [2, 3, 4]) {
      expect(computeLeveledSkill(damageSkill, level).cooldownTurns).toBe(damageSkill.cooldownTurns);
    }
  });

  it("レベル5はクールタイムが1ターン短縮される", () => {
    const lv5 = computeLeveledSkill(damageSkill, 5);
    expect(lv5.cooldownTurns).toBe(damageSkill.cooldownTurns - 1);
  });

  it("レベル5でクールタイムが0の場合は0未満にならない", () => {
    const noCooldownSkill: Skill = { ...damageSkill, cooldownTurns: 0 };
    const lv5 = computeLeveledSkill(noCooldownSkill, 5);
    expect(lv5.cooldownTurns).toBe(0);
  });

  it("レベル5はバフの継続ターンが1ターン延びる", () => {
    const lv5 = computeLeveledSkill(buffSkill, 5);
    const effect = lv5.effects[0];
    expect(effect.kind).toBe("BUFF");
    if (effect.kind === "BUFF") {
      expect(effect.durationTurns).toBe(buffSkill.effects[0].kind === "BUFF" ? buffSkill.effects[0].durationTurns + 1 : -1);
    }
  });

  it("範囲外のレベルはクランプされる(0→1扱い、6→5扱い)", () => {
    expect(computeLeveledSkill(damageSkill, 0)).toEqual(damageSkill);
    expect(computeLeveledSkill(damageSkill, 6)).toEqual(computeLeveledSkill(damageSkill, MAX_SKILL_LEVEL));
  });
});

describe("describeSkillEffect", () => {
  it("各効果種別を日本語テキストに変換できる", () => {
    expect(describeSkillEffect({ kind: "DAMAGE", multiplier: 1.5 })).toContain("1.50倍");
    expect(describeSkillEffect({ kind: "DAMAGE", multiplier: 1.0, hits: 2 })).toContain("× 2回");
    expect(describeSkillEffect({ kind: "HEAL", healRate: 0.2 })).toContain("20.0%");
    expect(describeSkillEffect({ kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 2 })).toContain("+30%");
    expect(describeSkillEffect({ kind: "DEBUFF", stat: "def", amount: 0.3, durationTurns: 2 })).toContain("-30%");
    expect(describeSkillEffect({ kind: "STUN", durationTurns: 1 })).toContain("スタン");
  });
});

describe("MonsterInstance のスキルレベル", () => {
  it("新規作成時はスキルレベルが全て1", () => {
    const instance = createMonsterInstance("slime_FIRE", 1, 1);
    expect(instance.skillLevels).toEqual([1, 1, 1]);
  });

  it("isSkillMaxLevel はすべて5になるまでfalseを返す", () => {
    const instance = createMonsterInstance("slime_FIRE", 1, 1);
    expect(isSkillMaxLevel(instance)).toBe(false);
    instance.skillLevels = [5, 5, 4];
    expect(isSkillMaxLevel(instance)).toBe(false);
    instance.skillLevels = [5, 5, 5];
    expect(isSkillMaxLevel(instance)).toBe(true);
  });

  it("rollSkillLevelUp はまだ最大でないスキルのいずれかを+1する", () => {
    const instance = createMonsterInstance("slime_FIRE", 1, 1);
    const rng = () => 0; // 常に最初の候補を選ぶ
    const index = rollSkillLevelUp(instance, rng);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(instance.skillLevels[index]).toBe(2);
  });

  it("rollSkillLevelUp は既に最大レベルのスキルを除外する", () => {
    const instance = createMonsterInstance("slime_FIRE", 1, 1);
    instance.skillLevels = [5, 1, 5];
    const index = rollSkillLevelUp(instance, () => 0);
    expect(index).toBe(1);
    expect(instance.skillLevels).toEqual([5, 2, 5]);
  });

  it("全スキルが最大レベルの場合は-1を返し何も変化しない", () => {
    const instance = createMonsterInstance("slime_FIRE", 1, 1);
    instance.skillLevels = [5, 5, 5];
    const index = rollSkillLevelUp(instance, () => 0);
    expect(index).toBe(-1);
    expect(instance.skillLevels).toEqual([5, 5, 5]);
  });
});
