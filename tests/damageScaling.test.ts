import { describe, expect, it } from "vitest";
import { calcDamage } from "../src/battle/damage.js";
import { BattleUnit, createBattleUnit } from "../src/battle/unit.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { SCALE_REFERENCE } from "../src/core/skill.js";
import { Stats } from "../src/core/stats.js";

/**
 * 終盤のステータスでもダメージ計算が成立していることの検査。
 *
 * どちらも、終盤の数値を入れて初めて壊れていることが分かった問題を防ぐためのもの。
 * 序盤の数値だけで見ていると、両方とも正常に見えてしまう。
 */

const BASELINE: Stats = {
  hp: 30000,
  atk: 3500,
  def: 3500,
  spd: 110,
  criRate: 0.6,
  criDmg: 1.5,
  resistance: 0.15,
  accuracy: 0.15,
};

function unitWith(overrides: Partial<Stats>, team: "PLAYER" | "ENEMY" = "PLAYER"): BattleUnit {
  const def: MonsterDefinition = {
    id: `t_${team}`,
    templateId: "t",
    name: "テスト",
    element: "FIRE",
    color: "#fff",
    role: "テスト",
    emoji: "⬜",
    stats: { ...BASELINE, ...overrides },
    skills: [] as unknown as MonsterDefinition["skills"],
  };
  return createBattleUnit(def, team, `${team}_t`);
}

const noCrit = () => 0.999;

describe("方式Eの防御軽減", () => {
  it("攻撃と防御が同じなら、段階によらず同じ30%が残る", () => {
    for (const value of [200, 1000, 3500, 8000]) {
      const attacker = unitWith({ atk: value });
      const defender = unitWith({ def: value }, "ENEMY");
      const withDef = calcDamage(attacker, defender, { kind: "DAMAGE", multiplier: 1 }, noCrit).damage;
      const without = calcDamage(attacker, defender, { kind: "DAMAGE", multiplier: 1, ignoreDefense: true }, noCrit).damage;
      expect(withDef / without).toBeCloseTo(0.3, 2);
    }
  });

  it("**終盤の防御でも技が通る**", () => {
    // 以前は固定の定数300だったため、防御3500で92%を弾き、
    // 攻撃力1.0倍の技が相手のHPを1%も削れなかった
    const damage = calcDamage(unitWith({}), unitWith({}, "ENEMY"), { kind: "DAMAGE", multiplier: 1 }, noCrit).damage;
    expect(damage / BASELINE.hp).toBeGreaterThan(0.03);
  });

  it("防御を積めば硬くなり、攻撃を積めば抜ける", () => {
    const target = (def: number) => unitWith({ def }, "ENEMY");
    const hit = (atk: number, def: number) =>
      calcDamage(unitWith({ atk }), target(def), { kind: "DAMAGE", multiplier: 1 }, noCrit).damage / atk;

    expect(hit(3500, 5000)).toBeLessThan(hit(3500, 2000));
    expect(hit(7000, 3500)).toBeGreaterThan(hit(3500, 3500));
  });
});

describe("ステータス補正は基準値に対する割合", () => {
  it("基準ちょうどなら、書いた倍率がそのまま乗る", () => {
    const attacker = unitWith({ hp: SCALE_REFERENCE.hp });
    const defender = unitWith({}, "ENEMY");
    const plain = calcDamage(attacker, defender, { kind: "DAMAGE", multiplier: 1 }, noCrit).damage;
    const scaled = calcDamage(
      attacker,
      defender,
      { kind: "DAMAGE", multiplier: 1, scaleBonus: { stat: "hp", bonusAtReference: 1 } },
      noCrit,
    ).damage;
    // 1.0倍 + 1.0倍ぶんの補正 = 2.0倍
    expect(scaled / plain).toBeCloseTo(2, 1);
  });

  it("基準の半分なら、上乗せも半分になる", () => {
    const defender = unitWith({}, "ENEMY");
    const effect = { kind: "DAMAGE", multiplier: 1, scaleBonus: { stat: "hp", bonusAtReference: 1 } } as const;
    const full = calcDamage(unitWith({ hp: SCALE_REFERENCE.hp }), defender, effect, noCrit).damage;
    const half = calcDamage(unitWith({ hp: SCALE_REFERENCE.hp / 2 }), defender, effect, noCrit).damage;
    const plain = calcDamage(unitWith({}), defender, { kind: "DAMAGE", multiplier: 1 }, noCrit).damage;

    expect(full - plain).toBeCloseTo((half - plain) * 2, -1);
  });

  it("**HP補正も速度補正も、同じ数字なら同じだけ効く**", () => {
    // 「能力値1につき+○倍」で書いていた頃は、HPが3万・速度が110なので
    // 同じ係数でもHP補正は+72、速度補正は+0.4にしかならなかった
    const defender = unitWith({}, "ENEMY");
    const byHp = calcDamage(
      unitWith({ hp: SCALE_REFERENCE.hp }),
      defender,
      { kind: "DAMAGE", multiplier: 1, scaleBonus: { stat: "hp", bonusAtReference: 0.5 } },
      noCrit,
    ).damage;
    const bySpd = calcDamage(
      unitWith({ spd: SCALE_REFERENCE.spd }),
      defender,
      { kind: "DAMAGE", multiplier: 1, scaleBonus: { stat: "spd", bonusAtReference: 0.5 } },
      noCrit,
    ).damage;
    expect(byHp).toBe(bySpd);
  });
});
