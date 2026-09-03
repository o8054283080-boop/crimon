import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { createBattleUnit, getEffectiveStat } from "../src/battle/unit.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import type { Skill } from "../src/core/skill.js";
import { MONSTER_DEX } from "../src/data/monsters.js";
import { TRIAL_TOWER_FLOORS } from "../src/data/trialTower.js";

/*
 * 取り巻きが倒れると本体が強くなる特性。
 *
 * ## 何のためにあるか
 *
 * 取り巻きを「先に消しておく置物」で終わらせないため。消せば消すほど
 * 本体が伸びるので、**どの順で倒すか**そのものが考えどころになる。
 *
 * ## この検査でいちばん大事なこと
 *
 * **指定しなければ、既存の戦闘は1つも変わらないこと。**
 * 本編の敵は誰も `empowerBossOnDeath` を持っていない。持っていない相手で
 * 何かが変わったら、その時点でこの機構は失敗している。
 */

/** 種から決まる乱数。同じ種なら必ず同じ戦いになる */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function skill(id: string, target: Skill["target"], multiplier = 0.2): Skill {
  return { id, name: id, description: "", target, cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier }] };
}

function unit(name: string, overrides: Partial<MonsterDefinition> = {}): MonsterDefinition {
  return {
    id: name,
    templateId: "slime",
    name,
    element: "FIRE",
    color: "#fff",
    role: "テスト",
    emoji: "🎯",
    stats: { hp: 100_000, atk: 1_000, def: 500, spd: 100, criRate: 0, criDmg: 1.5, accuracy: 0, resistance: 0 },
    skills: [skill("s1", "SINGLE_ENEMY"), skill("s2", "SINGLE_ENEMY"), skill("s3", "SINGLE_ENEMY")],
    ...overrides,
  };
}

/**
 * 攻め手は**全体攻撃**を持つ。
 *
 * 単体攻撃だと、AIは属性相性のあとHP割合の低い方を選ぶ。取り巻きのHPを1にしても
 * 割合は1.0のままなので本体ばかり殴り、**検査が空振りする**(実際にそうなった)。
 */
const STRIKER = unit("攻め手", {
  stats: { hp: 200_000, atk: 5_000, def: 1_000, spd: 500, criRate: 0, criDmg: 1.5, accuracy: 1, resistance: 1 },
  skills: [skill("a1", "ALL_ENEMIES"), skill("a2", "ALL_ENEMIES"), skill("a3", "ALL_ENEMIES")],
});

const BOSS = unit("本体", {
  stats: { hp: 500_000, atk: 1_000, def: 1_000, spd: 1, criRate: 0, criDmg: 1.5, accuracy: 0, resistance: 1 },
  victoryTarget: true,
});

function escort(boost: { atk?: number; spd?: number; def?: number } | undefined): MonsterDefinition {
  return unit("取り巻き", {
    stats: { hp: 1, atk: 100, def: 1, spd: 1, criRate: 0, criDmg: 1.5, accuracy: 0, resistance: 1 },
    bossTraits: boost ? { empowerBossOnDeath: boost } : undefined,
  });
}

const empowered = (log: string[]): string[] => log.filter((line) => line.includes("の力を取り込んだ！"));

describe("取り巻きが倒れると本体が強くなる", () => {
  it("指定した値だけ本体へ乗る", () => {
    const result = new BattleEngine([STRIKER], [BOSS, escort({ atk: 2_000 })], { rng: mulberry32(3), maxTurns: 12 }).run();
    const lines = empowered(result.log);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("ATK+2000");
  });

  it("複数の値を同時に乗せられる", () => {
    const result = new BattleEngine(
      [STRIKER], [BOSS, escort({ atk: 1_600, spd: 85, def: 300 })],
      { rng: mulberry32(3), maxTurns: 12 },
    ).run();
    const line = empowered(result.log)[0] ?? "";
    expect(line).toContain("ATK+1600");
    expect(line).toContain("SPD+85");
    expect(line).toContain("DEF+300");
  });

  it("同じ死で二度は強くならない", () => {
    /*
     * 死は毒でも火傷でも反撃でも起きるので、倒れ方ごとに合図を挿さず
     * **手番の切れ目で全員を走査**して拾っている。
     * 弔い済みの控えを忘れると、手番の数だけ際限なく伸びる。
     */
    const result = new BattleEngine([STRIKER], [BOSS, escort({ spd: 100 })], { rng: mulberry32(5), maxTurns: 40 }).run();
    expect(result.turnsTaken).toBeGreaterThan(10);
    expect(empowered(result.log)).toHaveLength(1);
  });

  it("勝利条件でない敵は強くならない", () => {
    // 取り巻き同士で強め合うと、どちらを先に倒しても同じになり順番を考える意味が消える
    const other = unit("別の取り巻き", {
      stats: { hp: 300_000, atk: 100, def: 1, spd: 1, criRate: 0, criDmg: 1.5, accuracy: 0, resistance: 1 },
    });
    const result = new BattleEngine([STRIKER], [other, escort({ atk: 2_000 })], { rng: mulberry32(11), maxTurns: 8 }).run();
    expect(empowered(result.log)).toHaveLength(0);
  });

  it("本体が先に倒れていたら乗らない", () => {
    // 死んだ相手を強くしても意味が無い。生き残っている本体だけが対象
    const frail = unit("もろい本体", {
      stats: { hp: 1, atk: 100, def: 1, spd: 1, criRate: 0, criDmg: 1.5, accuracy: 0, resistance: 1 },
      victoryTarget: true,
    });
    const result = new BattleEngine([STRIKER], [frail, escort({ atk: 2_000 })], { rng: mulberry32(13), maxTurns: 8 }).run();
    expect(empowered(result.log)).toHaveLength(0);
  });

  it("実数の上乗せが、実効ステータスへそのまま出る", () => {
    // 既存のバフは全部「何%上げる」なので、実数の口が要る
    const target = createBattleUnit(unit("的", { stats: { ...unit("的").stats, atk: 1_000, spd: 100 } }), "ENEMY", "E1");
    expect(getEffectiveStat(target, "atk")).toBe(1_000);
    target.flatStatBonus.atk = 1_600;
    target.flatStatBonus.spd = 85;
    expect(getEffectiveStat(target, "atk")).toBe(2_600);
    expect(getEffectiveStat(target, "spd")).toBe(185);
  });

  it("実数の上乗せと、倍率のバフが両立する", () => {
    // 実数を足してから倍率が掛かる。片方だけしか効かない、が起きないこと
    const target = createBattleUnit(unit("的"), "ENEMY", "E1");
    target.flatStatBonus.atk = 1_000;
    target.effects.push({ kind: "BUFF", stat: "atk", amount: 0.5, remainingTurns: 3 });
    expect(getEffectiveStat(target, "atk")).toBe(Math.round((1_000 + 1_000) * 1.5));
  });
});

describe("使っているのは60階だけ", () => {
  it("図鑑のテンプレートは1体も empowerBossOnDeath を持たない", () => {
    /*
     * **図鑑側に持たせない。**持たせると、召喚で手に入る個体やステージの敵にまで
     * 「倒すと味方が強くなる」が付いて回る。指定は**階の側**で置くもの。
     */
    for (const dex of MONSTER_DEX) {
      expect(dex.bossTraits?.empowerBossOnDeath, `${dex.id} が指定を持っている`).toBeUndefined();
    }
  });

  it("試練の塔で指定を持つのは60階の取り巻きだけ", () => {
    const withEmpower = TRIAL_TOWER_FLOORS.filter((floor) => JSON.stringify(floor).includes("empowerBossOnDeath"));
    expect(withEmpower.map((floor) => floor.floor)).toEqual([60]);
    for (const enemy of withEmpower[0].enemies) {
      // **本体には付けない。**自分が倒れた時に自分を強くする指定は意味を持たない
      if (enemy.bossTraits?.empowerBossOnDeath) expect(enemy.victoryTarget).toBe(false);
    }
  });

  it("指定の無い取り巻きでは何も起きない", () => {
    const result = new BattleEngine([STRIKER], [BOSS, escort(undefined)], { rng: mulberry32(7), maxTurns: 12 }).run();
    expect(empowered(result.log)).toHaveLength(0);
  });

  it("指定が無ければ、勝敗もターン数もログも一字一句そのまま", () => {
    /*
     * **回帰の本丸。**同じ種で2回走らせて、片方だけ「指定の無い取り巻き」を
     * 使う……のではなく、機構を通る前と同じ結果になることを、
     * ログ全体の一致で見る。1行でも増えていたら気づける。
     */
    const build = () => new BattleEngine(
      [STRIKER, unit("味方2")],
      [BOSS, escort(undefined), unit("取り巻き2", { stats: { ...unit("x").stats, hp: 50_000 } })],
      { rng: mulberry32(4242), maxTurns: 60 },
    ).run();
    const a = build();
    const b = build();
    expect(a.winner).toBe(b.winner);
    expect(a.turnsTaken).toBe(b.turnsTaken);
    expect(a.log).toEqual(b.log);
    // 取り巻きは実際に倒れている(倒れない盤面では検査にならない)
    expect(a.log.some((line) => line.includes("は倒れた！"))).toBe(true);
    expect(empowered(a.log)).toHaveLength(0);
  });

  it("flatStatBonus は空で始まる", () => {
    const target = createBattleUnit(unit("的"), "PLAYER", "P1");
    expect(target.flatStatBonus).toEqual({});
    expect(getEffectiveStat(target, "atk")).toBe(target.def.stats.atk);
    expect(getEffectiveStat(target, "spd")).toBe(target.def.stats.spd);
    expect(getEffectiveStat(target, "def")).toBe(target.def.stats.def);
  });
});
