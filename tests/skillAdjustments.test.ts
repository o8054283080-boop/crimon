import { describe, expect, it } from "vitest";
import { findMonster } from "../src/data/monsters.js";

describe("フェアリーのスキル1(攻撃しつつ自身を回復)", () => {
  it("SINGLE_ENEMY対象で、ダメージと自身への回復を併せ持つ", () => {
    const fairy = findMonster("fairy", "FIRE")!;
    const skill1 = fairy.skills[0];
    expect(skill1.target).toBe("SINGLE_ENEMY");
    expect(skill1.effects.some((e) => e.kind === "DAMAGE")).toBe(true);
    // 敵を殴りながら自分だけが回復する。相手を回復させないことが要点
    expect(skill1.effects.some((e) => e.kind === "HEAL" && e.toSelf === true)).toBe(true);
  });
});

describe("光ウルフのスキル3(光/闇の固有スキルへ変更)", () => {
  /**
   * 光と闇はステージにも装備ダンジョンにも出ず、召喚でしか手に入らない。
   * その希少さに見合うよう、同じ種族の他属性とは別の固有スキル3を持たせた。
   * 以前は候補からの抽選(味方全体のゲージ+速度)だったが、専用のものに置き換えている。
   */
  it("他の属性とは違う固有のスキル3を持つ", () => {
    const light = findMonster("wolf", "LIGHT")!;
    const fire = findMonster("wolf", "FIRE")!;
    const water = findMonster("wolf", "WATER")!;
    expect(light.skills[2].id).toBe("wolf_s3_light");
    expect(light.skills[2].id).not.toBe(fire.skills[2].id);
    expect(light.skills[2].id).not.toBe(water.skills[2].id);
  });

  it("役割は変えない(ウルフは単体を殴る側のまま)", () => {
    expect(findMonster("wolf", "LIGHT")!.skills[2].target).toBe("SINGLE_ENEMY");
  });
});

describe("闇ドラゴンのスキル3(破壊の流星)", () => {
  it("敵全体に防御力を無視したダメージを与える", () => {
    const dragon = findMonster("dragon", "DARK")!;
    const skill3 = dragon.skills[2];
    expect(skill3.name).toBe("破壊の流星");
    expect(skill3.target).toBe("ALL_ENEMIES");
    const damage = skill3.effects.find((e) => e.kind === "DAMAGE");
    expect(damage).toMatchObject({ kind: "DAMAGE", multiplier: 1.5, ignoreDefense: true });
  });
});

describe("光ドラゴンのスキル3(シャイニングブレス)", () => {
  it("敵全体にダメージと暗闇・攻撃力低下を与える", () => {
    const dragon = findMonster("dragon", "LIGHT")!;
    const skill3 = dragon.skills[2];
    expect(skill3.name).toBe("シャイニングブレス");
    expect(skill3.target).toBe("ALL_ENEMIES");
    expect(skill3.effects).toContainEqual({ kind: "BLIND", durationTurns: 2, chance: 0.75 });
    expect(skill3.effects.some((e) => e.kind === "DEBUFF" && e.stat === "atk")).toBe(true);
  });
});

describe("電気ドラゴンのスキル3(破滅の咆哮)", () => {
  it("敵全体に最大HPスケールのダメージを与える", () => {
    const dragon = findMonster("dragon", "ELECTRIC")!;
    const skill3 = dragon.skills[2];
    expect(skill3.name).toBe("破滅の咆哮");
    const damage = skill3.effects.find((e) => e.kind === "DAMAGE");
    expect(damage).toMatchObject({ kind: "DAMAGE", scaleBonus: { stat: "hp" } });
  });
});

describe("水ドラゴンのスキル3(古龍の加護)", () => {
  it("ALL_ALLIES対象でATK/DEFバフとDEFスケール回復を持つ", () => {
    const dragon = findMonster("dragon", "WATER")!;
    const skill3 = dragon.skills[2];
    expect(skill3.target).toBe("ALL_ALLIES");
    expect(skill3.effects).toContainEqual({ kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 3 });
    expect(skill3.effects).toContainEqual({ kind: "BUFF", stat: "def", amount: 0.3, durationTurns: 3 });
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

describe("光ネメシスのスキル3(味方全体の行動ゲージ+クリ率バフ)", () => {
  it("ALL_ALLIES対象でGAUGE効果とクリ率バフ2ターンを持つ", () => {
    const nemesis = findMonster("nemesis", "LIGHT")!;
    const skill3 = nemesis.skills[2];
    expect(skill3.target).toBe("ALL_ALLIES");
    expect(skill3.effects).toContainEqual({ kind: "GAUGE", amount: 0.3 });
    expect(skill3.effects).toContainEqual({ kind: "BUFF", stat: "criRate", amount: 0.3, durationTurns: 2 });
  });
});
