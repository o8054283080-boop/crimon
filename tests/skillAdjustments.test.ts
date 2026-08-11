import { describe, expect, it } from "vitest";
import { findMonster } from "../src/data/monsters.js";

describe("フェアリーのスキル1(回復→攻撃に変更)", () => {
  it("スキル1がSINGLE_ENEMY対象のDAMAGE効果になっている", () => {
    const fairy = findMonster("fairy", "FIRE")!;
    const skill1 = fairy.skills[0];
    expect(skill1.target).toBe("SINGLE_ENEMY");
    expect(skill1.effects.some((e) => e.kind === "DAMAGE")).toBe(true);
    expect(skill1.effects.some((e) => e.kind === "HEAL")).toBe(false);
  });
});

describe("光ウルフのスキル3(行動ゲージ+防御バフ)", () => {
  it("ALL_ALLIES対象でGAUGE効果とDEFバフを持つ", () => {
    const wolf = findMonster("wolf", "LIGHT")!;
    const skill3 = wolf.skills[2];
    expect(skill3.target).toBe("ALL_ALLIES");
    expect(skill3.effects).toContainEqual({ kind: "GAUGE", amount: 0.2 });
    expect(skill3.effects).toContainEqual({ kind: "BUFF", stat: "def", amount: 0.5, durationTurns: 2 });
  });
});

describe("闇ドラゴンのスキル3(敵全体200%+最大HPスケールダメージ)", () => {
  it("ALL_ENEMIES対象でmultiplier2.0・hpスケールボーナスを持つ", () => {
    const dragon = findMonster("dragon", "DARK")!;
    const skill3 = dragon.skills[2];
    expect(skill3.target).toBe("ALL_ENEMIES");
    const damage = skill3.effects.find((e) => e.kind === "DAMAGE");
    expect(damage).toMatchObject({ kind: "DAMAGE", multiplier: 2.0, scaleBonus: { stat: "hp" } });
  });
});

describe("光ドラゴンのスキル3(味方全体atk/defバフ+自身def基準回復)", () => {
  it("ALL_ALLIES対象でATK/DEFバフ3ターンとDEFスケール回復を持つ", () => {
    const dragon = findMonster("dragon", "LIGHT")!;
    const skill3 = dragon.skills[2];
    expect(skill3.target).toBe("ALL_ALLIES");
    expect(skill3.effects).toContainEqual({ kind: "BUFF", stat: "atk", amount: 0.5, durationTurns: 3 });
    expect(skill3.effects).toContainEqual({ kind: "BUFF", stat: "def", amount: 0.5, durationTurns: 3 });
    expect(skill3.effects.some((e) => e.kind === "HEAL" && e.scaleStat === "def" && e.healRate === 1.5)).toBe(true);
  });
});

describe("終焉の一撃のスタン確率(70%に変更)", () => {
  it("FIRE/DARKネメシスのスキル3に含まれるSTUN効果のchanceが0.7", () => {
    for (const element of ["FIRE", "DARK"] as const) {
      const nemesis = findMonster("nemesis", element)!;
      const skill3 = nemesis.skills[2];
      expect(skill3.name).toBe("終焉の一撃");
      const stun = skill3.effects.find((e) => e.kind === "STUN");
      expect(stun).toMatchObject({ chance: 0.7 });
    }
  });
});

describe("血のいけにえに自身の防御力スケールダメージを追加", () => {
  it("防御力スケールのscaleBonusを持つ", () => {
    const nemesis = findMonster("nemesis", "DARK")!;
    const skill2 = nemesis.skills[1];
    expect(skill2.name).toBe("血のいけにえ");
    const damage = skill2.effects.find((e) => e.kind === "DAMAGE");
    expect(damage).toMatchObject({ kind: "DAMAGE", scaleBonus: { stat: "def" } });
  });
});

describe("光ネメシスのスキル3(味方全体の行動ゲージ+スピードバフ)", () => {
  it("ALL_ALLIES対象でGAUGE効果とSPDバフ2ターンを持つ", () => {
    const nemesis = findMonster("nemesis", "LIGHT")!;
    const skill3 = nemesis.skills[2];
    expect(skill3.target).toBe("ALL_ALLIES");
    expect(skill3.effects).toContainEqual({ kind: "GAUGE", amount: 0.3 });
    expect(skill3.effects).toContainEqual({ kind: "BUFF", stat: "spd", amount: 0.25, durationTurns: 2 });
  });
});
