/**
 * コラボ4種のパッシブ。
 *
 * ここで見張るのは**「1回しか起きない」と決めた部分**。
 * 溜まり方や回数の制限は、実装を間違えても動いてはしまうので、
 * 多段・全体の技を実際に撃たせて数を確かめる。
 */
import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { PassiveSpec } from "../src/core/passive.js";
import { Skill } from "../src/core/skill.js";

const IDLE: Skill = {
  id: "idle", name: "待機", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0, effects: [],
};

/** 同じ中身を5段ぶん並べる。レベル差を見たい時だけ個別に書く */
function flat(level: PassiveSpec["levels"][number]): PassiveSpec {
  return { trigger: "ALWAYS", levels: [level, level, level, level, level] as PassiveSpec["levels"] };
}

/**
 * パッシブは**スキルの `passive` 欄**で持つ(`passiveSkillOf` が
 * `def.skills` から探す)。モンスター直下の欄ではない。
 */
function unit(
  id: string, skill: Skill,
  opts: { stats?: Partial<MonsterDefinition["stats"]>; passive?: PassiveSpec } = {},
): MonsterDefinition {
  const passiveSkill: Skill | undefined = opts.passive
    ? {
        id: `${id}_passive`, name: "パッシブ", description: "",
        target: "SELF", cooldownTurns: 0, effects: [],
        passive: opts.passive, passiveLevel: 1,
      }
    : undefined;
  return {
    id, templateId: id, name: id, element: "GRASS", emoji: "🟢", color: "#0f0", role: "テスト",
    stats: {
      hp: 100_000, atk: 1_000, def: 100, spd: 100,
      criRate: 0, criDmg: 1.5, resistance: 0, accuracy: 1, ...opts.stats,
    },
    skills: passiveSkill ? [skill, skill, passiveSkill] : [skill, skill, skill],
  } as MonsterDefinition;
}

describe("ガッツチャージ(モッチー電気)", () => {
  const spec = flat({ kind: "GUTS_CHARGE", damageUp: 0.25, spd: 15, maxStacks: 4, gaugeAtMax: 0.2 });

  it("通常のターンが回るたびに1つ溜まり、上限で止まる", () => {
    const me = unit("m", IDLE, { passive: spec, stats: { spd: 300 } });
    const result = new BattleEngine([me], [unit("d", IDLE, { stats: { spd: 10 } })], { rng: () => 0.5, maxTurns: 12 }).run();
    const gained = result.log.filter((l) => /気合が高まった/.test(l));
    // 上限4を超えて増えない
    expect(gained.length).toBe(4);
    expect(gained[3]).toContain("(4/4)");
  });

  /*
   * **追加ターンでは溜まらない。**
   * 溜めた結果もう一度動ける技と組み合わせると、1手で2つ3つと増えて青天井になる。
   */
  it("追加ターンでは溜まらない", () => {
    const extraTurnSkill: Skill = {
      id: "again", name: "もう一度", description: "追加ターン",
      target: "SINGLE_ENEMY", cooldownTurns: 0, extraTurn: true,
      effects: [{ kind: "DAMAGE", multiplier: 0.1 }],
    };
    const me = unit("m", extraTurnSkill, { passive: spec, stats: { spd: 300 } });
    const result = new BattleEngine([me], [unit("d", IDLE, { stats: { spd: 10, hp: 10_000_000 } })], { rng: () => 0.5, maxTurns: 6 }).run();
    const gained = result.log.filter((l) => /気合が高まった/.test(l)).length;
    const extras = result.log.filter((l) => /追加ターンを得た/.test(l)).length;
    // 追加ターンが実際に起きていて、なお溜まった数がターン数を超えていない
    expect(extras).toBeGreaterThan(0);
    expect(gained).toBeLessThanOrEqual(4);
  });
});

describe("深淵の主(グジラ闇)", () => {
  const spec = flat({
    kind: "ABYSS_LORD", damageTaken: 0.25, atkPerStack: 0.15, spdPerStack: 0.05,
    maxStacks: 10, healOnTurn: 0.1,
  });

  /*
   * **多段でも敵の1スキルにつき1つ。**
   * 1ヒット1つにすると、4回殴る技ひとつで上限近くまで飛ぶ。
   */
  it("4回殴られても1スキルにつき1つしか溜まらない", () => {
    const fourHits: Skill = {
      id: "four", name: "4連", description: "4回攻撃",
      target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 0.05, hits: 4 }],
    };
    const me = unit("m", IDLE, { passive: spec, stats: { spd: 10 } });
    const enemy = unit("e", fourHits, { stats: { spd: 300 } });
    const result = new BattleEngine([me], [enemy], { rng: () => 0.5, maxTurns: 6 }).run();
    const deepened = result.log.filter((l) => /深淵が深まった/.test(l));
    const attacks = result.log.filter((l) => /「4連」/.test(l)).length;
    expect(attacks).toBeGreaterThan(1);
    // 攻撃回数と同じ数だけ溜まっている(1スキル1つ)。ヒット数(×4)にはならない
    expect(deepened.length).toBe(attacks);
  });

  /* 先に敵へ殴らせないと満タンのままで、回復したかどうかが見えない */
  it("自分のターンの頭に回復する", () => {
    const me = unit("m", IDLE, { passive: spec, stats: { spd: 100, hp: 10_000 } });
    const enemy = unit("e", {
      id: "hit", name: "殴る", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 0.5 }],
    }, { stats: { spd: 120, atk: 2_000 } });
    const result = new BattleEngine([me], [enemy], { rng: () => 0.5, maxTurns: 10 }).run();
    expect(result.log.some((l) => /深淵の力でHPが/.test(l))).toBe(true);
  });
});

describe("水の祝福(ウンディーネ)", () => {
  const spec = flat({ kind: "WATER_BLESSING", damageTaken: 0.2, critTaken: 0.25, healOnAct: 0.05, atkUpTurns: 1 });

  /** 味方が受けたダメージの合計を測る */
  function allyDamage(withBlessing: boolean): number {
    const healer = unit("h", IDLE, withBlessing ? { passive: spec } : {});
    const friend = unit("f", IDLE, { stats: { hp: 50_000 } });
    const attacker = unit("a", {
      id: "hit", name: "殴る", description: "", target: "ALL_ENEMIES", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 1.0 }],
    }, { stats: { atk: 3_000, spd: 300 } });
    const result = new BattleEngine([healer, friend], [attacker], { rng: () => 0.5, maxTurns: 2 }).run();
    const last = result.turns[result.turns.length - 1];
    const f = last.snapshot.find((u) => u.instanceId === "P2")!;
    return f.maxHp - f.currentHp;
  }

  it("自分以外の味方が受けるダメージを減らす", () => {
    expect(allyDamage(true)).toBeLessThan(allyDamage(false));
  });

  /*
   * **張り主自身は守らない。**
   * 守る側が同時にいちばん硬くなると、狙う場所が無くなって戦いが止まる。
   */
  it("張り主自身には軽減がかからない", () => {
    function healerDamage(withBlessing: boolean): number {
      const healer = unit("h", IDLE, withBlessing ? { passive: spec, stats: { hp: 50_000 } } : { stats: { hp: 50_000 } });
      const attacker = unit("a", {
        id: "hit", name: "殴る", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0,
        effects: [{ kind: "DAMAGE", multiplier: 1.0 }],
      }, { stats: { atk: 3_000, spd: 300 } });
      const result = new BattleEngine([healer], [attacker], { rng: () => 0.5, maxTurns: 2 }).run();
      const last = result.turns[result.turns.length - 1];
      const h = last.snapshot.find((u) => u.team === "PLAYER")!;
      return h.maxHp - h.currentHp;
    }
    expect(healerDamage(true)).toBe(healerDamage(false));
  });

  it("行動すると味方全体が回復する", () => {
    const healer = unit("h", IDLE, { passive: spec, stats: { hp: 100_000 } });
    const friend = unit("f", IDLE, { stats: { hp: 50_000 } });
    const attacker = unit("a", {
      id: "hit", name: "殴る", description: "", target: "ALL_ENEMIES", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 0.5 }],
    }, { stats: { atk: 2_000, spd: 300 } });
    const result = new BattleEngine([healer, friend], [attacker], { rng: () => 0.5, maxTurns: 6 }).run();
    expect(result.log.some((l) => /「水の祝福」で味方全体が/.test(l))).toBe(true);
  });
});

describe("魅惑のまなこ(スエゾー光)", () => {
  const spec = flat({
    kind: "CHARM_EYE", accuracy: 0.3, critRate: 0.3,
    stripChance: 0.85, stunChance: 1.0, followUpMultiplier: 1.0,
  });

  /*
   * **多段でも1スキルにつき1回ずつ。**
   * 解除も気絶も追撃も、4回殴る技で4回起こしてはいけない。
   */
  it("4連撃でも気絶は1回しか起きない", () => {
    const fourHits: Skill = {
      id: "four", name: "4連", description: "4回攻撃",
      target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 0.05, hits: 4 }],
    };
    const me = unit("m", fourHits, { passive: spec, stats: { spd: 300 } });
    const result = new BattleEngine([me], [unit("d", IDLE, { stats: { spd: 10, hp: 10_000_000 } })], { rng: () => 0.01, maxTurns: 1 }).run();
    expect(result.log.filter((l) => /は気絶した/.test(l)).length).toBe(1);
  });

  it("会心が出た時だけ全体追撃する", () => {
    const skill: Skill = {
      id: "one", name: "一撃", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 0.1 }],
    };
    // クリ率0(パッシブ+30%でも rng 0.99 なら外れる) → 追撃なし
    const noCrit = new BattleEngine(
      [unit("m", skill, { passive: spec, stats: { spd: 300, criRate: 0 } })],
      [unit("d", IDLE, { stats: { spd: 10, hp: 10_000_000 } })],
      { rng: () => 0.99, maxTurns: 1 },
    ).run();
    expect(noCrit.log.some((l) => /「魅惑のまなこ」が敵全体を撃った/.test(l))).toBe(false);

    // クリ率100% → 追撃あり
    const crit = new BattleEngine(
      [unit("m", skill, { passive: spec, stats: { spd: 300, criRate: 1 } })],
      [unit("d", IDLE, { stats: { spd: 10, hp: 10_000_000 } })],
      { rng: () => 0.01, maxTurns: 1 },
    ).run();
    expect(crit.log.some((l) => /「魅惑のまなこ」が敵全体を撃った/.test(l))).toBe(true);
  });

  it("追撃からさらに追撃は起きない", () => {
    const skill: Skill = {
      id: "one", name: "一撃", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 0.1 }],
    };
    const result = new BattleEngine(
      [unit("m", skill, { passive: spec, stats: { spd: 300, criRate: 1 } })],
      [unit("d", IDLE, { stats: { spd: 10, hp: 10_000_000 } })],
      { rng: () => 0.01, maxTurns: 1 },
    ).run();
    // 1手番につき追撃は1回だけ
    expect(result.log.filter((l) => /「魅惑のまなこ」が敵全体を撃った/.test(l)).length).toBe(1);
  });
});
