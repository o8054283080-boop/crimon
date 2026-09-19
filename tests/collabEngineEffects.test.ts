/**
 * コラボ4種のために足した戦闘機能。
 *
 * ここで見張るのは**「防御の影響を受けない」と書いた部分が、
 * 本当に受けていないか**。倍率の数字は仕様表と突き合わせるだけで足りるが、
 * 「防御を通さない」は実装を間違えても**それらしい数字が出てしまう**ので、
 * 硬い相手と柔らかい相手で同じ値になることを実際に測る。
 */
import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { Skill } from "../src/core/skill.js";

const IDLE: Skill = {
  id: "idle", name: "待機", description: "何もしない",
  target: "SINGLE_ENEMY", cooldownTurns: 0, effects: [],
};

function unit(id: string, skill: Skill, stats: Partial<MonsterDefinition["stats"]> = {}): MonsterDefinition {
  return {
    id, templateId: id, name: id, element: "GRASS", emoji: "🟢", color: "#0f0", role: "テスト",
    stats: {
      hp: 100_000, atk: 1_000, def: 100, spd: 100,
      criRate: 0, criDmg: 1.5, resistance: 0, accuracy: 1, ...stats,
    },
    skills: [skill, skill, skill],
  };
}

/** 1回殴らせて、敵のHPがいくつ減ったかを返す */
function damageOnce(attacker: MonsterDefinition, defender: MonsterDefinition): number {
  const result = new BattleEngine([attacker], [defender], { rng: () => 0.01, maxTurns: 1 }).run();
  const last = result.turns[result.turns.length - 1];
  const enemy = last.snapshot.find((u) => u.team === "ENEMY")!;
  return enemy.maxHp - enemy.currentHp;
}

describe("固定ダメージ", () => {
  const skill: Skill = {
    id: "flat", name: "固定", description: "固定ダメージ",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "FLAT_DAMAGE", amount: 5_000 }],
  };

  it("防御が違っても同じ量が入る", () => {
    const soft = damageOnce(unit("a", skill), unit("soft", IDLE, { def: 10 }));
    const hard = damageOnce(unit("a", skill), unit("hard", IDLE, { def: 100_000 }));
    expect(soft).toBe(5_000);
    expect(hard).toBe(5_000);
  });

  it("クリダメ倍率を掛けない", () => {
    // クリ率100%・クリダメ3.0倍でも、固定ダメージは書いた数字のまま
    const critter = unit("crit", skill, { criRate: 1, criDmg: 3.0 });
    expect(damageOnce(critter, unit("d", IDLE))).toBe(5_000);
  });

  it("条件を満たさなければ出ない", () => {
    const conditional: Skill = {
      ...skill, id: "flat_cond",
      // 会心しない個体なので ANY_CRIT は満たされない
      effects: [{ kind: "FLAT_DAMAGE", amount: 5_000, requires: "ANY_CRIT" }],
    };
    expect(damageOnce(unit("a", conditional, { criRate: 0 }), unit("d", IDLE))).toBe(0);
  });
});

describe("対象の最大HP割合ダメージ", () => {
  const skill: Skill = {
    id: "maxhp", name: "割合", description: "最大HPの30%",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "MAX_HP_DAMAGE", ratio: 0.3 }],
  };

  it("防御に関係なく、対象の最大HPの割合で入る", () => {
    const soft = damageOnce(unit("a", skill), unit("soft", IDLE, { hp: 50_000, def: 10 }));
    const hard = damageOnce(unit("a", skill), unit("hard", IDLE, { hp: 50_000, def: 100_000 }));
    expect(soft).toBe(15_000);
    expect(hard).toBe(15_000);
  });

  it("HPを積んだ相手ほど大きく入る", () => {
    const small = damageOnce(unit("a", skill), unit("s", IDLE, { hp: 10_000 }));
    const big = damageOnce(unit("a", skill), unit("b", IDLE, { hp: 100_000 }));
    expect(big).toBeGreaterThan(small);
    expect(big / small).toBeCloseTo(10, 1);
  });
});

describe("自傷", () => {
  const skill: Skill = {
    id: "recoil", name: "反動", description: "自傷",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "SELF_DAMAGE", ratio: 0.25 }],
  };

  it("自分の最大HPの割合で自分が減る", () => {
    const attacker = unit("a", skill, { hp: 20_000 });
    const result = new BattleEngine([attacker], [unit("d", IDLE)], { rng: () => 0.01, maxTurns: 1 }).run();
    const me = result.turns[result.turns.length - 1].snapshot.find((u) => u.team === "PLAYER")!;
    expect(me.maxHp - me.currentHp).toBe(5_000);
  });

  /*
   * **HP1で止めない。**依頼主の指定で、自傷による死亡はそのまま許す。
   * ここを「必ず生き残る」にすると、代償を払う技が代償を払わなくなる。
   */
  it("自傷で倒れることを許す", () => {
    const heavy: Skill = { ...skill, id: "recoil_all", effects: [{ kind: "SELF_DAMAGE", ratio: 1.0 }] };
    const attacker = unit("a", heavy, { hp: 10_000 });
    const result = new BattleEngine([attacker], [unit("d", IDLE)], { rng: () => 0.01, maxTurns: 1 }).run();
    const me = result.turns[result.turns.length - 1].snapshot.find((u) => u.team === "PLAYER")!;
    expect(me.currentHp).toBe(0);
  });
});

describe("条件: 防御と速度の比べ合い", () => {
  const skill: Skill = {
    id: "cond", name: "条件", description: "条件付き固定ダメージ",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "FLAT_DAMAGE", amount: 3_000, requires: "SELF_DEF_ABOVE_TARGET" }],
  };

  it("自分の防御が高い時だけ出る", () => {
    expect(damageOnce(unit("a", skill, { def: 5_000 }), unit("d", IDLE, { def: 100 }))).toBe(3_000);
    expect(damageOnce(unit("a", skill, { def: 100 }), unit("d", IDLE, { def: 5_000 }))).toBe(0);
  });

  it("対象の速度が高い時だけ出る", () => {
    const spdSkill: Skill = {
      ...skill, id: "cond_spd",
      effects: [{ kind: "FLAT_DAMAGE", amount: 3_000, requires: "TARGET_SPD_ABOVE_SELF" }],
    };
    /*
     * **自分が遅い側なので、相手が先に動く。**
     * 1ターンで打ち切ると自分の手番が来ないので、回数を増やして測る
     * (速度50対200だと、自分の1手に対して相手が4手動く)。
     */
    const slowAttacker = new BattleEngine(
      [unit("a", spdSkill, { spd: 50 })], [unit("d", IDLE, { spd: 200 })],
      { rng: () => 0.01, maxTurns: 8 },
    ).run();
    expect(slowAttacker.log.some((l) => /固定ダメージ/.test(l))).toBe(true);

    const fastAttacker = new BattleEngine(
      [unit("a", spdSkill, { spd: 200 })], [unit("d", IDLE, { spd: 50 })],
      { rng: () => 0.01, maxTurns: 8 },
    ).run();
    expect(fastAttacker.log.some((l) => /固定ダメージ/.test(l))).toBe(false);
  });
});

describe("抵抗を無視する弱体", () => {
  const skill: Skill = {
    id: "pierce", name: "貫通低下", description: "抵抗無視の防御低下",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "DEBUFF", stat: "def", amount: 0.75, durationTurns: 2, chance: 1, ignoreResistance: true }],
  };

  function hasDefDown(defender: MonsterDefinition): boolean {
    // 抵抗100%でも通ることを見たいので、乱数は「外れる側」に倒してある
    const result = new BattleEngine([unit("a", skill)], [defender], { rng: () => 0.99, maxTurns: 1 }).run();
    return result.log.some((line) => /DEF が低下/.test(line));
  }

  it("抵抗100%の相手にも通る", () => {
    expect(hasDefDown(unit("d", IDLE, { resistance: 1 }))).toBe(true);
  });

  /*
   * **免疫だけは貫けない。**
   * 抵抗は運で弾くもの、免疫は「弱体を受け付けない」と決めて張った答え。
   * ここを貫くと、免疫を張る意味そのものが消える。
   */
  it("免疫中の相手には入らない", () => {
    const immune: Skill = {
      id: "immune", name: "免疫", description: "免疫",
      target: "SELF", cooldownTurns: 0,
      effects: [{ kind: "IMMUNITY", durationTurns: 5 }],
    };
    const defender = unit("d", immune, { spd: 999 }); // 先に動いて免疫を張る
    const result = new BattleEngine([unit("a", skill)], [defender], { rng: () => 0.99, maxTurns: 2 }).run();
    expect(result.log.some((line) => /DEF が低下/.test(line))).toBe(false);
  });
});
