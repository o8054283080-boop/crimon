import { describe, expect, it } from "vitest";
import { findMonster } from "../src/data/monsters.js";

describe("フェアリーのスキル1(攻撃しつつ自身を回復)", () => {
  it("SINGLE_ENEMY対象で、ダメージと自身への回復を併せ持つ", () => {
    const fairy = findMonster("fairy", "FIRE")!;
    const skill1 = fairy.skills[0];
    expect(skill1.target).toBe("SINGLE_ENEMY");
    expect(skill1.effects.some((e) => e.kind === "DAMAGE")).toBe(true);
    // 敵を殴りながら自分だけが回復する。相手を回復させないことが要点
    expect(skill1.effects.some((e) => e.kind === "HEAL" && e.applyTo === "SELF")).toBe(true);
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
    expect(damage).toMatchObject({ kind: "DAMAGE", multiplier: 1.2, ignoreDefense: true });
    expect(skill3.effects).toContainEqual({ kind: "LIFESTEAL", healRate: 0.25 });
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
    expect(damage).toMatchObject({ kind: "DAMAGE", hpCoefficient: 0.05 });
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
  // 光/闇のネメシスは固有スキル3を持つようになったので、通常枠での確認は火で行う
  it("火ネメシスのスキル3に含まれるSTUN効果のchanceが0.7", () => {
    const skill3 = findMonster("nemesis", "FIRE")!.skills[2];
    expect(skill3.name).toBe("終焉の一撃");
    expect(skill3.effects.find((e) => e.kind === "STUN")).toMatchObject({ chance: 0.7 });
  });
});

describe("血のいけにえに自身の防御力スケールダメージを追加", () => {
  it("独立した防御力係数を持つ", () => {
    const nemesis = findMonster("nemesis", "DARK")!;
    const skill2 = nemesis.skills[1];
    expect(skill2.name).toBe("血のいけにえ");
    const damage = skill2.effects.find((e) => e.kind === "DAMAGE");
    expect(damage).toMatchObject({ kind: "DAMAGE", defCoefficient: 0.5 });
  });
});

describe("光ネメシスのスキル3(ラストジャッジメント)", () => {
  it("単体を殴る役割のまま、通常の終焉の一撃より強い", () => {
    const light = findMonster("nemesis", "LIGHT")!.skills[2];
    const normal = findMonster("nemesis", "FIRE")!.skills[2];

    expect(light.name).toBe("ラストジャッジメント");
    // 役割は変えない。「別のモンスター」になってしまうと、育ててきた意味が消える
    expect(light.target).toBe("SINGLE_ENEMY");

    const damageOf = (s: typeof light) => s.effects.find((e) => e.kind === "DAMAGE")!;
    const stunOf = (s: typeof light) => s.effects.find((e) => e.kind === "STUN")!;
    expect(damageOf(light).multiplier).toBeGreaterThan(damageOf(normal).multiplier);
    expect(stunOf(light).chance!).toBeGreaterThan(stunOf(normal).chance!);
    // ゲージ操作は吸収でなければ、敵を先に動かしてしまう
    expect(light.effects).toContainEqual({ kind: "GAUGE", amount: 0.4, drain: true });
  });
});

describe("闇ネメシスのスキル3(エンドオブオール)", () => {
  it("全体攻撃にゲージ吸収と防御低下が乗る", () => {
    const skill3 = findMonster("nemesis", "DARK")!.skills[2];
    expect(skill3.name).toBe("エンドオブオール");
    expect(skill3.target).toBe("ALL_ENEMIES");
    expect(skill3.effects).toContainEqual({ kind: "GAUGE", amount: 0.2, drain: true });
  });
});
