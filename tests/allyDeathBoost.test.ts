import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { Skill } from "../src/core/skill.js";

/**
 * 倒れた味方が残していく強化。
 *
 * **「周回だと負ける」と言われて見つかった。**負けていたのではなく、
 * *手で遊ぶ側だけ*がこの仕掛けを飛ばしていた。
 *
 * `applyAllyDeathBoosts()` は `run()`(まとめて決着だけ出す道)の中の
 * 1か所でしか呼ばれておらず、画面から1手ずつ進める `resolveTurn` は
 * 通らなかった。つまり**画面で遊ぶ限り、目覚の深域の才能晶を倒しても
 * ボスが強くならない**。周回と手動で、同じ階の難しさが違っていた。
 *
 * `recordTurn` の中へ移して、どの道を通っても呼ばれるようにしてある。
 * ここはその「どの道でも」を確かめる。
 */
const HIT: Skill = {
  id: "test_hit",
  name: "たたく",
  description: "殴る",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [{ kind: "DAMAGE", multiplier: 1 }],
};

function unit(id: string, overrides: Partial<MonsterDefinition> = {}): MonsterDefinition {
  return {
    id,
    templateId: id,
    name: id,
    element: "GRASS",
    emoji: "⬜",
    color: "#888",
    role: "テスト",
    stats: { hp: 10_000, atk: 1_000, def: 500, spd: 100, criRate: 0, criDmg: 1.5, resistance: 0, accuracy: 1 },
    skills: [HIT, HIT, HIT],
    ...overrides,
  };
}

/**
 * ボス1体 + 倒れると本体の速度を上げるお供1体。
 * 味方は圧倒的に強くしてあり、**お供が必ず先に落ちる**。
 */
function setup(): BattleEngine {
  const ally = unit("ally", {
    stats: { hp: 900_000, atk: 90_000, def: 9_000, spd: 300, criRate: 0, criDmg: 1.5, resistance: 1, accuracy: 1 },
  });
  const boss = unit("boss", {
    victoryTarget: true,
    stats: { hp: 400_000, atk: 100, def: 100, spd: 1, criRate: 0, criDmg: 1.5, resistance: 0, accuracy: 0 },
  });
  const shard = unit("shard", {
    stats: { hp: 1, atk: 100, def: 1, spd: 1, criRate: 0, criDmg: 1.5, resistance: 0, accuracy: 0 },
    bossTraits: { empowerBossOnDeath: { spd: 50 } },
  });
  return new BattleEngine([ally], [boss, shard], { maxTurns: 60 });
}

function bossSpeedBonus(engine: BattleEngine): number {
  const boss = engine.getUnits().find((u) => u.def.id === "boss");
  return boss?.flatStatBonus.spd ?? 0;
}

/**
 * お供を倒れた状態にする。
 *
 * **誰を狙うかはAIが決める**ので、殴って落とすのを待つと
 * 「AIがお供を狙わなかっただけ」で落ちるテストになる。
 * ここで見たいのは「倒れた後、強化が配られるか」だけなので、
 * 倒れた事実だけを作って手番を1つ進める。
 */
function killShard(engine: BattleEngine): void {
  const shard = engine.getUnits().find((u) => u.def.id === "shard")!;
  shard.currentHp = 0;
  shard.alive = false;
}

describe("倒れた味方が残す強化は、どの道を通っても配られる", () => {
  it("1手ずつ進める道（画面と同じ）でも配られる", () => {
    const engine = setup();
    expect(bossSpeedBonus(engine)).toBe(0);
    killShard(engine);
    const actor = engine.getNextActor();
    expect(actor, "行動できる者が居ない").toBeTruthy();
    engine.resolveTurn(actor!);
    // ここが0のままだと、画面で遊ぶ人だけが易しい階を戦うことになる
    expect(bossSpeedBonus(engine)).toBe(50);
  });

  it("まとめて決着だけ出す道でも配られる", () => {
    const engine = setup();
    killShard(engine);
    engine.run();
    expect(bossSpeedBonus(engine)).toBe(50);
  });

  it("同じ相手から二重には受け取らない", () => {
    const engine = setup();
    killShard(engine);
    engine.run();
    engine.run();
    expect(bossSpeedBonus(engine)).toBe(50);
  });
});
