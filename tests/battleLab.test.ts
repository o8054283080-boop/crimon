import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import type { Skill } from "../src/core/skill.js";
import { buildAlly, buildEnemy, buildTeams } from "../tools/battleLab/build.js";
import { mulberry32, runSeed } from "../tools/battleLab/rng.js";
import { runBattle, runMany } from "../tools/battleLab/run.js";
import { summarize, toMarkdown } from "../tools/battleLab/report.js";
import { TOWER60 } from "../tools/battleLab/scenarios/tower60.js";
import type { GearGrade } from "../tools/battleLab/types.js";
import { findScenario } from "../tools/battleLab/scenarios/index.js";
import { createInitialState } from "../src/game/playerState.js";

/*
 * Battle Lab。
 *
 * ## 何を見張るか
 *
 * 一番大事なのは**「本編と別の戦闘を測っていないこと」**。
 * この道具にダメージ式や会心判定が生えていないか、勝敗の出どころが
 * エンジンのままか、を機械的に確かめる。
 *
 * 次に、依頼された6ヒット反撃の決まり事。多段は1発ずつ数える・
 * 継続ダメージは数えない・反撃でクールタイムが動かない・連鎖しない。
 * どれも**そうなっていないことに気づけない**種類の壊れ方なので、
 * 目で見るのではなくここで押さえる。
 */

/** 検査用の的。素直に殴られるだけの相手 */
function dummy(name: string, overrides: Partial<MonsterDefinition> = {}): MonsterDefinition {
  return {
    id: name,
    templateId: "slime",
    name,
    element: "FIRE",
    color: "#fff",
    role: "テスト",
    emoji: "🎯",
    stats: { hp: 100_000, atk: 1_000, def: 500, spd: 100, criRate: 0, criDmg: 1.5, accuracy: 0, resistance: 0 },
    skills: [plain("たたく", 1.0), plain("たたく2", 1.0), plain("たたく3", 1.0)],
    ...overrides,
  };
}

function plain(name: string, multiplier: number, extra: Partial<Skill> = {}): Skill {
  return {
    id: `t_${name}`,
    name,
    description: "",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier }],
    ...extra,
  };
}

/** 1手番で6発当てる技 */
const sixHit = (id: string): Skill =>
  plain("六連", 0.2, { id, effects: [{ kind: "DAMAGE", multiplier: 0.2, hits: 6 }] });

/** 1発だけ当てる技 */
const oneHit = (id: string): Skill => plain("単発", 0.2, { id });

/** ダメージを1も出さず、毒だけ入れる技 */
const poisonOnly = (id: string): Skill =>
  plain("毒", 0, { id, effects: [{ kind: "POISON", damageRatePerStack: 0.02, durationTurns: 20, chance: 1 }] });

/** 反撃で撃たせる全体技。CT3 */
const COUNTER_SKILL: Skill = {
  id: "t_counter", name: "反撃の渦", description: "", target: "ALL_ENEMIES", cooldownTurns: 3,
  effects: [{ kind: "DAMAGE", multiplier: 0.5 }],
};

describe("本編の戦闘をそのまま使っている", () => {
  it("Battle Lab のどこにもダメージ式・会心判定・命中判定が書かれていない", async () => {
    /*
     * **これが崩れたら、この道具で測った数字は本編の数字ではない。**
     *
     * 判定の言葉が道具側のソースへ現れていないかを、本文で見張る。
     * 注釈は数えない——「別式を書かない」という戒めそのものに
     * 同じ言葉が入るので、文字列で探すと自分の注意書きに引っかかる。
     */
    const { readFileSync, readdirSync } = await import("node:fs");
    const dir = new URL("../tools/battleLab/", import.meta.url);
    const files = [
      ...readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => new URL(f, dir)),
      new URL("scenarios/tower60.ts", dir),
      new URL("scenarios/index.ts", dir),
    ];
    for (const file of files) {
      const statements = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => {
          const trimmed = line.trimStart();
          return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
        })
        .join("\n");
      // 会心倍率・防御軽減・命中抵抗の式を、道具側で組み立てていないこと
      expect(statements, `${file.pathname} に会心判定`).not.toMatch(/criDmg\s*[*+]/);
      expect(statements, `${file.pathname} に防御計算`).not.toMatch(/\bdef\b\s*[*/+-]\s*\d/);
      expect(statements, `${file.pathname} に命中判定`).not.toMatch(/resistance\s*[<>]/);
    }
  });

  it("勝敗は BattleEngine の返り値をそのまま使う", () => {
    const tally = runBattle(TOWER60, 12345);
    expect(["PLAYER", "ENEMY", "DRAW"]).toContain(tally.winner);
    // ログの最終行までの勝敗と、集計の勝敗が食い違わない
    const survivors = tally.units.filter((u) => u.team === "PLAYER" && u.alive).length;
    expect(tally.survivors).toBe(survivors);
    if (tally.winner === "PLAYER") expect(survivors).toBeGreaterThan(0);
  });
});

describe("走らせる", () => {
  it("1戦走る", () => {
    const tally = runBattle(TOWER60, 1);
    expect(tally.turns).toBeGreaterThan(0);
    expect(tally.log.length).toBeGreaterThan(10);
    expect(tally.units).toHaveLength(TOWER60.allies.length + TOWER60.enemies.length);
  });

  it("100戦走る", () => {
    const tallies = runMany(TOWER60, 555, 100);
    expect(tallies).toHaveLength(100);
    expect(tallies.every((t) => t.turns > 0)).toBe(true);
  });

  it("同じ種なら同じ結果になる", () => {
    const a = runMany(TOWER60, 4242, 20);
    const b = runMany(TOWER60, 4242, 20);
    expect(a.map((t) => [t.winner, t.turns, t.survivors])).toEqual(b.map((t) => [t.winner, t.turns, t.survivors]));
  });

  it("種が違えば結果も揺れる", () => {
    // 全部同じになるなら、乱数が効いていない
    const results = Array.from({ length: 30 }, (_, i) => runBattle(TOWER60, runSeed(9000, i)).turns);
    expect(new Set(results).size).toBeGreaterThan(1);
  });

  it("ターン上限で必ず止まる", () => {
    // 互いに1ダメージしか出ない盤面。上限が効かなければ終わらない
    const stone = dummy("石", { stats: { hp: 9_999_999, atk: 1, def: 99_999, spd: 100, criRate: 0, criDmg: 1.5, accuracy: 0, resistance: 1 } });
    const engine = new BattleEngine([stone], [dummy("石2", stone)], { rng: mulberry32(1), maxTurns: 50 });
    const result = engine.run();
    expect(result.turnsTaken).toBeLessThanOrEqual(50);
  });

  it("JSONにできる", () => {
    const summary = summarize(TOWER60, runMany(TOWER60, 7, 10), { seed: 7, focus: "テスト" });
    const json = JSON.parse(JSON.stringify(summary));
    expect(json.scenario).toBe("tower-60");
    expect(json.runs).toBe(10);
    expect(json.wins + json.losses + json.draws).toBe(10);
    expect(toMarkdown(summary)).toContain("勝率");
  });
});

describe("6ヒット反撃", () => {
  /**
   * 6発受けたらスキル2(全体攻撃)を撃ち返すだけの相手。
   *
   * **速度1・攻撃100の置物**にしてある。反撃だけを見たいので、
   * 自分から動いて盤面を動かさない相手にする。
   */
  function counterBoss(hits: number): MonsterDefinition {
    return dummy("反撃ボス", {
      stats: { hp: 500_000, atk: 100, def: 1_000, spd: 1, criRate: 0, criDmg: 1.5, accuracy: 0, resistance: 1 },
      skills: [oneHit("bs1"), COUNTER_SKILL, oneHit("bs3")],
      bossTraits: { counterAfterHits: hits, counterSkillIndex: 1 },
    });
  }

  /**
   * 攻め手。**3枠とも同じ技**にしてある。
   *
   * AIは撃てる技のうち後ろの枠を好むので、1枠だけに検査したい技を置くと
   * 別の技ばかり撃って**検査が空振りする**(実際にそうなった)。
   */
  function striker(make: (id: string) => Skill): MonsterDefinition {
    return dummy("攻め手", {
      stats: { hp: 200_000, atk: 5_000, def: 1_000, spd: 500, criRate: 0, criDmg: 1.5, accuracy: 1, resistance: 1 },
      skills: [make("s1"), make("s2"), make("s3")],
    });
  }

  function countCounters(log: string[]): number {
    return log.filter((line) => line.includes("の反撃「")).length;
  }

  it("多段攻撃は1ヒットごとに数える", () => {
    /*
     * 6ヒットの技を**1回**撃つだけで反撃が返る。
     * 「スキル1回=1カウント」になっていたら、ここで返らない。
     */
    const result = new BattleEngine([striker(sixHit)], [counterBoss(6)], { rng: mulberry32(3), maxTurns: 1 }).run();
    expect(countCounters(result.log)).toBe(1);
  });

  it("単発では6回ぶんに届かない", () => {
    // 数えているのが本当に「ヒット数」であることの裏取り
    const result = new BattleEngine([striker(oneHit)], [counterBoss(6)], { rng: mulberry32(3), maxTurns: 1 }).run();
    expect(countCounters(result.log)).toBe(0);
  });

  it("毒などの継続ダメージでは数えない", () => {
    /*
     * 1発でも反撃する設定のボスへ、毒だけを入れて25手放置する。
     * **1度も返らない。**毒と耐久はちゃんとした戦術であって、
     * そこへ余計な罰を置かないための決まり(docs/design-concept.md)。
     */
    const result = new BattleEngine([striker(poisonOnly)], [counterBoss(1)], { rng: mulberry32(5), maxTurns: 25 }).run();
    const ticks = result.log.filter((line) => line.includes("毒")).length;
    expect(ticks, "毒が1度も入っていない検査は意味がない").toBeGreaterThan(0);
    expect(countCounters(result.log)).toBe(0);
  });

  it("反撃でクールタイムが動かない", () => {
    /*
     * 反撃で撃った技の溜まりが消えると、**こちらの手数がそのまま
     * ボスの手を縛る道具**になってしまう。
     *
     * 反撃の渦はCT3。手番ごとに6ヒット入るので、CTを消費しているなら
     * 反撃は3手番に1回しか返せない。返る回数が手番数と同じなら、動いていない。
     */
    const result = new BattleEngine([striker(sixHit)], [counterBoss(6)], { rng: mulberry32(11), maxTurns: 9 }).run();
    const counters = countCounters(result.log);
    const strikerTurns = result.log.filter((line) => /^\[味方:.+の「六連」！$/.test(line)).length;
    expect(strikerTurns).toBeGreaterThan(2);
    expect(counters).toBe(strikerTurns);
  });

  it("反撃が反撃を呼ばない(無限に往復しない)", () => {
    // 1発ごとに反撃する設定でも、戦闘は必ず終わり、返る数はヒット数を超えない
    const result = new BattleEngine([striker(sixHit)], [counterBoss(1)], { rng: mulberry32(13), maxTurns: 20 }).run();
    expect(result.turnsTaken).toBeLessThanOrEqual(20);
    const strikerTurns = result.log.filter((line) => /^\[味方:.+の「六連」！$/.test(line)).length;
    expect(countCounters(result.log)).toBeLessThanOrEqual(strikerTurns * 6);
  });

  it("指定が無いボスは、これまでどおり倍率だけの反撃を返す", () => {
    // 既存の敵の振る舞いを1つも変えていないこと
    const old = dummy("旧ボス", {
      stats: { hp: 500_000, atk: 100, def: 1_000, spd: 1, criRate: 0, criDmg: 1.5, accuracy: 0, resistance: 1 },
      skills: [oneHit("o1"), oneHit("o2"), oneHit("o3")],
      bossTraits: { counterAfterHits: 6, counterMultiplier: 1.4 },
    });
    const result = new BattleEngine([striker(sixHit)], [old], { rng: mulberry32(17), maxTurns: 4 }).run();
    expect(result.log.some((line) => /の反撃！/.test(line))).toBe(true);
    expect(result.log.some((line) => line.includes("の反撃「"))).toBe(false);
  });
});

describe("シナリオの組み立て", () => {
  it("プリセットが★6Lv60・スキル最大・能力ポイント100の実戦個体になる", () => {
    const def = buildAlly({ templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" }, mulberry32(1));
    expect(def.stats.hp).toBeGreaterThan(10_000);
    expect(def.stats.criRate).toBeGreaterThan(0.5);
    // 装備を6個通しているので、素の図鑑値より必ず高い
    expect(def.combatMods).toBeDefined();
  });

  it("プリセットの一部だけを上書きできる", () => {
    const base = buildAlly({ templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" }, mulberry32(2));
    const fast = buildAlly(
      { templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER", statOverrides: { spd: 180 } },
      mulberry32(2),
    );
    expect(fast.stats.spd).toBe(180);
    expect(fast.stats.atk).toBe(base.stats.atk);
  });

  it("敵は最終ステータスを直接置ける", () => {
    const boss = buildEnemy({
      label: "検査ボス", templateId: "ancient_demon", element: "DARK",
      stats: { hp: 300_000, atk: 6_200, def: 3_800, spd: 165 },
    });
    expect([boss.stats.hp, boss.stats.atk, boss.stats.def, boss.stats.spd]).toEqual([300_000, 6_200, 3_800, 165]);
    expect(boss.name).toBe("検査ボス");
    // 敵に装備は無い。セット効果を持ち込まない
    expect(boss.combatMods).toBeUndefined();
  });

  it("tower-60 は5対3で、豪魔人が勝利条件になっている", () => {
    const { players, enemies } = buildTeams(TOWER60, mulberry32(1));
    expect(players).toHaveLength(5);
    expect(enemies).toHaveLength(3);
    expect(enemies[0].bossTraits?.counterAfterHits).toBe(6);
    expect(enemies[0].bossTraits?.counterSkillIndex).toBe(1);
    expect(enemies[0].victoryTarget).toBe(true);
    expect(findScenario("tower-60")).toBe(TOWER60);
  });

  it("狙う順の候補は、実在する敵だけを指している", () => {
    const labels = new Set(TOWER60.enemies.map((e) => e.label));
    for (const pattern of TOWER60.focusPatterns ?? []) {
      for (const name of pattern.order) expect(labels, `${pattern.name} の ${name}`).toContain(name);
    }
  });

  it("崩れの基準を持っている", () => {
    expect(TOWER60.expect?.minWinRate).toBeGreaterThan(0);
    expect(TOWER60.expect?.maxWinRate).toBeLessThanOrEqual(1);
  });
});

describe("装備の仕上がり具合", () => {
  /*
   * **プリセットは「装備を極めた人」の姿しか出せない。**
   * それだけで測ると、その階が誰にとって難しいのかが読めない。
   * 段階を落として測れること、そして段階の順に弱くなることを見る。
   */
  it("段階を落とすほど弱くなる", () => {
    /*
     * **1個体で比べない。**
     *
     * 下の段ほどサブの中身が運任せになるので、たまたま狙った項目を
     * 引いて上の段を追い越すことがある(会心率で実際に起きた)。
     * それは装備が本当にそう振る舞うということなので、直すのは検査の方。
     * 何個体かの平均で見る。
     */
    const spec = { templateId: "dragon", element: "FIRE" as const, preset: "MAX_ATTACKER" as const };
    const avg = (grade: GearGrade, pick: (s: { atk: number; criDmg: number; hp: number }) => number): number => {
      const values = Array.from({ length: 20 }, (_, i) => pick(buildAlly(spec, mulberry32(100 + i), grade).stats));
      return values.reduce((a, b) => a + b, 0) / values.length;
    };
    for (const pick of [(s: { atk: number }) => s.atk, (s: { criDmg: number }) => s.criDmg, (s: { hp: number }) => s.hp]) {
      const get = pick as (s: { atk: number; criDmg: number; hp: number }) => number;
      expect(avg("FINISHED", get)).toBeGreaterThan(avg("MID", get));
      expect(avg("MID", get)).toBeGreaterThan(avg("ROUGH", get));
    }
  });

  it("段階を渡さなければプリセットのまま", () => {
    const spec = { templateId: "dragon", element: "FIRE" as const, preset: "MAX_ATTACKER" as const };
    const bare = buildAlly(spec, mulberry32(9));
    const finished = buildAlly(spec, mulberry32(9), "FINISHED");
    expect(bare.stats).toEqual(finished.stats);
  });

  it("段階ごとに戦って、決着ターンが伸びる", () => {
    /*
     * 勝率は上でも下でも張り付くが、**決着ターンは飽和しない。**
     * 難易度を読むならこちらを見る(この案件で何度も刺さっている)。
     */
    const turnsOf = (grade: GearGrade): number => {
      const tallies = runMany(TOWER60, 4242, 12, undefined, grade);
      return tallies.reduce((sum, t) => sum + t.turns, 0) / tallies.length;
    };
    expect(turnsOf("ROUGH")).toBeGreaterThan(turnsOf("FINISHED"));
  });
});

describe("セーブデータへ触らない", () => {
  it("何度走らせても、プレイヤーの持ち物が1つも動かない", () => {
    /*
     * Battle Lab は完全に開発用。**遊んでいる人のデータへは絶対に書かない。**
     * 初期状態を控えてから走らせ、隅から隅まで同じであることを見る。
     */
    /*
     * `createInitialState()` は呼ぶたびに新しいIDと時刻を作るので、
     * 2回呼んで比べても必ず違う(最初そう書いて、当然のように落ちた)。
     * **同じ1つの状態**を控えてから走らせ、後で見比べる。
     */
    const state = createInitialState();
    const before = JSON.stringify(state);
    runMany(TOWER60, 31, 5);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("localStorage も Supabase も呼ばない", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const dir = new URL("../tools/battleLab/", import.meta.url);
    const files = [
      ...readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => new URL(f, dir)),
      new URL("scenarios/tower60.ts", dir),
      new URL("scenarios/index.ts", dir),
    ];
    for (const file of files) {
      const statements = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => {
          const trimmed = line.trimStart();
          return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
        })
        .join("\n");
      expect(statements, file.pathname).not.toMatch(/localStorage|supabase|savePlayerState|fetch\(/i);
    }
  });
});

describe("味方の属性だけを差し替える", () => {
  /*
   * 「火ドラゴンと闇ドラゴン、どちらが良いか」を測る時、比べたいのは
   * **属性の違いだけ**。★もLvも装備も能力ポイントもタイプも潜在も、
   * 他が1つでも違えば、出た差がどこから来たのか言えなくなる。
   */
  it("属性を変えると、本編の正式なスキルがそのまま入る", () => {
    /*
     * **Battle Lab用に簡略化した技を作る余地はどこにも無い。**
     * `<templateId>_<属性>` の図鑑を引くので、闇ドラゴンなら
     * 本編の「破壊の流星」、闇クロノスなら「時の管理者」が来る。
     */
    const fire = buildAlly({ templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" }, mulberry32(7));
    const dark = buildAlly({ templateId: "dragon", element: "DARK", preset: "MAX_ATTACKER" }, mulberry32(7));
    expect(fire.skills[2].name).toBe("破滅の咆哮");
    expect(dark.skills[2].name).toBe("破壊の流星");
    // 闇のS3は防御無視。図鑑の中身がそのまま来ていることの裏取り
    expect(dark.skills[2].effects.some((e) => e.kind === "DAMAGE" && e.ignoreDefense === true)).toBe(true);

    const electric = buildAlly({ templateId: "chronos", element: "ELECTRIC", preset: "MAX_SPEED" }, mulberry32(7));
    const darkChronos = buildAlly({ templateId: "chronos", element: "DARK", preset: "MAX_SPEED" }, mulberry32(7));
    expect(electric.skills[2].name).toBe("終焉時計");
    expect(darkChronos.skills[2].name).toBe("時の管理者");
    // 闇のS3はパッシブ。手番の行動として選ばれない側へ変わる
    expect(darkChronos.skills[2].passive).toBeDefined();
  });

  it("属性以外は同じ育て方のまま", () => {
    // 差が属性から出たと言うために、他が揃っている必要がある
    const fire = buildAlly({ templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" }, mulberry32(11));
    const dark = buildAlly({ templateId: "dragon", element: "DARK", preset: "MAX_ATTACKER" }, mulberry32(11));
    expect(fire.templateId).toBe(dark.templateId);
    expect(fire.skills[0].name).toBe(dark.skills[0].name);
    expect(fire.combatMods).toEqual(dark.combatMods);
  });

  it("図鑑に無い組み合わせは、候補を添えて止まる", () => {
    // 黙って別のモンスターを作らない。書き間違いはその場で分かる方がよい
    expect(() => buildAlly({ templateId: "dragon", element: "WATER" }, mulberry32(1))).not.toThrow();
    expect(() => buildAlly({ templateId: "notamonster", element: "FIRE" }, mulberry32(1))).toThrow(/図鑑に/);
  });
});

describe("ゲージまわりの数え上げ", () => {
  it("吸収とパッシブによる上昇を、別々に数える", () => {
    /*
     * 行の主語が違うので分けている。
     *   吸収した … 主語は吸った側
     *   進んだ   … 主語は進んだ本人
     * 闇クロノスの「時の管理者」は両方を出すので、まとめて数えると意味が壊れる。
     */
    const scenario: typeof TOWER60 = {
      ...TOWER60,
      allies: TOWER60.allies.map((ally) => (
        ally.templateId === "chronos" ? { ...ally, element: "DARK" as const } : ally
      )),
    };
    const tally = runBattle(scenario, 20260903, [], "TYPICAL");
    const chronos = tally.units.find((u) => u.id === "P3")!;
    expect(chronos.passiveGaugeGains).toBeGreaterThan(0);
    expect(chronos.gaugeDrains).toBeGreaterThan(0);
    // 数えているのは行動した本人のぶんだけ。味方全員に散らばっていない
    expect(tally.units.filter((u) => u.passiveGaugeGains > 0)).toHaveLength(1);
  });

  it("パッシブを持たない編成では0のまま", () => {
    const tally = runBattle(TOWER60, 20260903, [], "TYPICAL");
    expect(tally.units.every((u) => u.passiveGaugeGains === 0)).toBe(true);
  });
});
