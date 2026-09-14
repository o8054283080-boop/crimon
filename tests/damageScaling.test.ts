import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calcDamage } from "../src/battle/damage.js";
import { BattleUnit, createBattleUnit } from "../src/battle/unit.js";
import { resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
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

/**
 * **入れ替える前の方式E。**軽減が「攻める側の攻撃力との比」で決まっていた頃の性質。
 * いまの本番は攻撃力を見ないので、ここは `legacy` を立てて旧式の実装を守る。
 * 本番の式の性質は下の「いまの防御軽減」で見ている。
 */
describe("入れ替える前の方式Eの防御軽減(比較用)", () => {
  beforeEach(() => setBalanceFlags({ defenseFormula: "legacy", elementMode: "legacy" }));
  afterEach(() => resetBalanceFlags());

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

/**
 * **いまの本番の防御軽減。**`1000 / (1000 + 1.2 × DEF)`。
 *
 * 方式Eとの違いは1点で、**攻撃力を見ない**こと。
 * 攻撃を積んでも軽減率は動かず、通すには防御無視か防御低下が要る。
 * ここが崩れると、敵のDEFを決め直した根拠ごと崩れる。
 */
describe("いまの防御軽減(攻撃力を見ない)", () => {
  it("**攻撃力をいくら積んでも、軽減の割合は変わらない**", () => {
    const defender = unitWith({ def: 3500 }, "ENEMY");
    const share = (atk: number) => {
      const withDef = calcDamage(unitWith({ atk }), defender, { kind: "DAMAGE", multiplier: 1 }, noCrit).damage;
      const without = calcDamage(unitWith({ atk }), defender, { kind: "DAMAGE", multiplier: 1, ignoreDefense: true }, noCrit).damage;
      return withDef / without;
    };
    // 攻撃力を10倍にしても残る割合は同じ
    expect(share(1000)).toBeCloseTo(share(10000), 2);
  });

  it("残る割合は 1000/(1000+1.2×DEF) に一致する", () => {
    for (const def of [500, 1500, 3500, 6000]) {
      const attacker = unitWith({ atk: 3500 });
      const defender = unitWith({ def }, "ENEMY");
      const withDef = calcDamage(attacker, defender, { kind: "DAMAGE", multiplier: 1 }, noCrit).damage;
      const without = calcDamage(attacker, defender, { kind: "DAMAGE", multiplier: 1, ignoreDefense: true }, noCrit).damage;
      expect(withDef / without).toBeCloseTo(1000 / (1000 + 1.2 * def), 2);
    }
  });

  it("防御を積むほど硬くなる", () => {
    const hit = (def: number) =>
      calcDamage(unitWith({}), unitWith({ def }, "ENEMY"), { kind: "DAMAGE", multiplier: 1 }, noCrit).damage;
    expect(hit(6000)).toBeLessThan(hit(3500));
    expect(hit(3500)).toBeLessThan(hit(1500));
  });

  it("**終盤の防御でも技が通る**", () => {
    // 攻撃力を見なくなったぶん、終盤のDEFで詰まっていないかは別途見る必要がある
    const damage = calcDamage(unitWith({}), unitWith({}, "ENEMY"), { kind: "DAMAGE", multiplier: 1 }, noCrit).damage;
    expect(damage / BASELINE.hp).toBeGreaterThan(0.01);
  });
});

/**
 * **属性相性はサマナーズウォー方式。**倍率ではなく、クリ率と「かすり」で効く。
 * いちばん重いのは「かすった一撃は弱体を入れられない」ところで、
 * これが妨害役に属性を選ばせている。
 */
describe("属性相性(クリ率とかすり)", () => {
  const elementUnit = (element: "FIRE" | "GRASS" | "WATER", team: "PLAYER" | "ENEMY") => {
    const def: MonsterDefinition = {
      id: `e_${team}`, templateId: "e", name: "属性テスト", element, color: "#fff",
      role: "テスト", emoji: "⬜", stats: { ...BASELINE, criRate: 0.5 },
      skills: [] as unknown as MonsterDefinition["skills"],
    };
    return createBattleUnit(def, team, `${team}_e`);
  };

  it("不利属性はかすることがあり、かすった一撃はクリティカルにならない", () => {
    // rng が 0 を返すと「50%のかすり判定」に必ず当たる
    const result = calcDamage(elementUnit("FIRE", "PLAYER"), elementUnit("WATER", "ENEMY"), { kind: "DAMAGE", multiplier: 1 }, () => 0);
    expect(result.isGlancing).toBe(true);
    expect(result.isCrit).toBe(false);
  });

  it("有利属性でも等倍属性でも、かすりは起きない", () => {
    for (const [attacker, defender] of [["FIRE", "GRASS"], ["FIRE", "FIRE"]] as const) {
      const result = calcDamage(elementUnit(attacker, "PLAYER"), elementUnit(defender, "ENEMY"), { kind: "DAMAGE", multiplier: 1 }, () => 0);
      expect(result.isGlancing).toBeFalsy();
    }
  });

  it("**倍率では効かない。**かすらなければ、不利でも等倍と同じダメージになる", () => {
    // rng 0.99 ならかすり判定を外し、クリティカルにもならない
    const neutral = calcDamage(elementUnit("FIRE", "PLAYER"), elementUnit("FIRE", "ENEMY"), { kind: "DAMAGE", multiplier: 1 }, () => 0.99).damage;
    const disadvantage = calcDamage(elementUnit("FIRE", "PLAYER"), elementUnit("WATER", "ENEMY"), { kind: "DAMAGE", multiplier: 1 }, () => 0.99).damage;
    const advantage = calcDamage(elementUnit("FIRE", "PLAYER"), elementUnit("GRASS", "ENEMY"), { kind: "DAMAGE", multiplier: 1 }, () => 0.99).damage;
    expect(disadvantage).toBe(neutral);
    expect(advantage).toBe(neutral);
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
