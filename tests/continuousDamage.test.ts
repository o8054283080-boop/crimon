import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { Skill } from "../src/core/skill.js";
import { ANCIENT_DEMON, MONSTER_TEMPLATES_DEX } from "../src/data/monsters.js";

/**
 * 毒と火傷は**ちゃんとした戦術**であって、塞ぐべき抜け道ではない。
 *
 * 装備ダンジョンが「毒を重ねる」「耐久で待つ」で抜けられるのを難易度の問題と捉えて、
 * 一度ボスに継続ダメージ耐性を持たせた。それはその戦術を選んだこと自体への罰で、
 * 「スキルがモンスターにいろんな場所での役割を与える」という設計と正面から衝突する
 * (docs/design-concept.md)。難易度は、戦術を否定しない形で作ること。
 */

const POISON_SKILL: Skill = {
  id: "test_poison",
  name: "毒",
  description: "毒を与える",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [{ kind: "POISON", damageRatePerStack: 0.02, durationTurns: 5, chance: 1 }],
};

const BURN_SKILL: Skill = {
  id: "test_burn",
  name: "火傷",
  description: "火傷させる",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [{ kind: "BURN", durationTurns: 5, chance: 1 }],
};

const IDLE_SKILL: Skill = {
  id: "test_idle",
  name: "待機",
  description: "何もしない",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [],
};

function unit(id: string, skill: Skill, overrides: Partial<MonsterDefinition> = {}): MonsterDefinition {
  return {
    id,
    templateId: id,
    name: id,
    element: "GRASS",
    emoji: "🟢",
    color: "#0f0",
    role: "テスト",
    // 通常ダメージがほぼ入らないよう防御を極端に高くしてある。ここで測りたいのは継続ダメージの分だけ。
    // **速度を両者同じにしてあるのが要点**。毒は「毒を受けている側の手番の頭」に、
    // 火傷は「その手番の終わり」に入るので、相手に手番が回らないと一度も発生しない
    stats: { hp: 10_000_000, atk: 100_000, def: 1_000_000, spd: 100, criRate: 0, criDmg: 1.5, resistance: 0, accuracy: 1 },
    // AIがどれを選んでも狙った効果が入るよう、3枠とも同じ技にしてある
    skills: [skill, skill, skill],
    ...overrides,
  };
}

/** 敵の最大HPのうち、何割を削れたかを測る */
function damageShare(attackerSkill: Skill, defenderOverrides: Partial<MonsterDefinition>): number {
  const attacker = unit("attacker", attackerSkill);
  const defender = unit("defender", IDLE_SKILL, defenderOverrides);
  // 削り切ってしまうと両者とも「100%削れた」になり、差があっても見えなくなる。
  // 途中で打ち切って、部分的に削れた状態どうしを比べる
  const result = new BattleEngine([attacker], [defender], { rng: () => 0.01, maxTurns: 12 }).run();
  const last = result.turns[result.turns.length - 1];
  const enemy = last.snapshot.find((u) => u.team === "ENEMY")!;
  return 1 - enemy.currentHp / enemy.maxHp;
}

const COUNTER_ONLY = { counterAfterHits: 7, counterMultiplier: 1.4 };

describe("毒・火傷は戦術として通す", () => {
  it("毒も火傷も、実際に相手のHPを削る(効果そのものが死んでいないことの確認)", () => {
    expect(damageShare(POISON_SKILL, {}), "毒").toBeGreaterThan(0);
    expect(damageShare(BURN_SKILL, {}), "火傷").toBeGreaterThan(0);
  });

  it("**ボスの特性で毒のダメージが減らされない**", () => {
    expect(damageShare(POISON_SKILL, { bossTraits: COUNTER_ONLY })).toBeCloseTo(damageShare(POISON_SKILL, {}), 5);
  });

  it("**ボスの特性で火傷のダメージが減らされない**", () => {
    expect(damageShare(BURN_SKILL, { bossTraits: COUNTER_ONLY })).toBeCloseTo(damageShare(BURN_SKILL, {}), 5);
  });

  it("装備ダンジョンのボスは継続ダメージへの耐性を一切持たない", () => {
    // 復活させる時は「特定の戦い方への罰になっていないか」を先に考えること。
    // 反撃は、どの戦い方であれ手数を掛けたぶん返るもので、特定の型を狙い撃ちにしない
    expect(Object.keys(ANCIENT_DEMON.bossTraits!).sort()).toEqual(["counterAfterHits", "counterMultiplier"]);
  });

  it("**毒を持つのは属性違いのごく一部だけ**。誰が持っているかを取り違えない", () => {
    /*
     * 難易度の実測で毒編成として imp_GRASS / imp_WATER / imp_FIRE を並べたが、
     * この3体は毒を1つも持っていなかった。毒を一度も撒けない編成で戦って
     * 「毒は8階以降まったく通用しない」という**まるごと嘘の結論**を出している。
     *
     * 通常モンスターだけで組める勝ち筋がどこにあるかを測る時は、
     * その戦術を実行できる顔ぶれを選べているかを先に確かめること
     * (tools/dungeonPressure.ts は毒スタックが0のまま終わったら警告を出す)。
     */
    const carriers = MONSTER_TEMPLATES_DEX.filter((m) => m.skills.some((s) => s.effects.some((e) => e.kind === "POISON"))).map((m) => m.id);

    expect(carriers).toContain("slime_GRASS");
    expect(carriers).toContain("wolf_DARK");
    expect(carriers).toContain("imp_DARK");
    // 実測で毒編成に選んでしまった顔ぶれ。持っていないことをここに残しておく
    expect(carriers).not.toContain("imp_GRASS");
    expect(carriers).not.toContain("imp_WATER");
    expect(carriers).not.toContain("imp_FIRE");
  });
});
