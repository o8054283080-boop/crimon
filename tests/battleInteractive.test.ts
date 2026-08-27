import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { findMonster } from "../src/data/monsters.js";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTeams() {
  const playerTeam = ["slime", "wolf", "golem", "fairy"].map((id) => findMonster(id, "FIRE")!);
  const enemyTeam = ["slime", "wolf", "golem", "fairy"].map((id) => findMonster(id, "WATER")!);
  return { playerTeam, enemyTeam };
}

describe("BattleEngine のインタラクティブ操作API", () => {
  it("勝利対象の死亡で護衛が生存していても勝利し、護衛だけ倒しても勝利しない", () => {
    const player = findMonster("slime", "FIRE")!;
    const boss = { ...findMonster("golem", "WATER")!, victoryTarget: true };
    const guard = findMonster("wolf", "WATER")!;
    const engine = new BattleEngine([player], [boss, guard]);
    const units = engine.getUnits();
    units.find((unit) => unit.instanceId === "E2")!.alive = false;
    expect(engine.getWinner()).toBeNull();
    units.find((unit) => unit.instanceId === "E1")!.alive = false;
    expect(engine.getWinner()).toBe("PLAYER");
  });

  it("通常戦闘は敵全滅まで勝利せず、集中対象は指定・切替・再タップ解除できる", () => {
    const { playerTeam, enemyTeam } = buildTeams();
    const engine = new BattleEngine(playerTeam, enemyTeam);
    expect(engine.setFocusTarget("E1")).toBe(true);
    expect(engine.getFocusTarget()).toBe("E1");
    engine.setFocusTarget("E2");
    expect(engine.getFocusTarget()).toBe("E2");
    engine.setFocusTarget("E2");
    expect(engine.getFocusTarget()).toBeNull();
    engine.getUnits().filter((unit) => unit.team === "ENEMY").slice(0, -1).forEach((unit) => { unit.alive = false; });
    expect(engine.getWinner()).toBeNull();
  });
  it("getWinnerは決着前はnull、決着後は正しい勝者を返す", () => {
    const { playerTeam, enemyTeam } = buildTeams();
    const engine = new BattleEngine(playerTeam, enemyTeam, { rng: mulberry32(1), maxTurns: 300 });
    expect(engine.getWinner()).toBeNull();

    let actor = engine.getNextActor();
    let guard = 0;
    while (actor && guard < 1000) {
      engine.resolveTurn(actor);
      actor = engine.getNextActor();
      guard += 1;
    }
    expect(engine.getWinner()).not.toBeNull();
    expect(["PLAYER", "ENEMY", "DRAW"]).toContain(engine.getWinner());
  });

  it("choiceなしでresolveTurnするとAIが選ぶのと同じ結果になる(run()と同じ勝敗に収束する)", () => {
    const { playerTeam, enemyTeam } = buildTeams();

    const autoEngine = new BattleEngine(playerTeam, enemyTeam, { rng: mulberry32(7), maxTurns: 300 });
    const autoResult = autoEngine.run();

    const interactiveEngine = new BattleEngine(playerTeam, enemyTeam, { rng: mulberry32(7), maxTurns: 300 });
    let actor = interactiveEngine.getNextActor();
    let guard = 0;
    while (actor && guard < 1000) {
      interactiveEngine.resolveTurn(actor);
      actor = interactiveEngine.getNextActor();
      guard += 1;
    }

    expect(interactiveEngine.getWinner()).toBe(autoResult.winner);
  });

  it("指定したスキルインデックスと対象で行動させられる", () => {
    const { playerTeam, enemyTeam } = buildTeams();
    const engine = new BattleEngine(playerTeam, enemyTeam, { rng: mulberry32(3), maxTurns: 300 });

    const actor = engine.getNextActor();
    expect(actor).not.toBeNull();
    if (!actor) return;

    const targetTeam = actor.team === "PLAYER" ? "ENEMY" : "PLAYER";
    const target = engine.getUnits().find((u) => u.team === targetTeam && u.alive)!;

    const record = engine.resolveTurn(actor, { skillIndex: 0, targetId: target.instanceId });
    expect(record.actorId).toBe(actor.instanceId);
    // スキル0(通常攻撃)はクールタイム無しなので、選んだ通り使われているはず
    expect(record.lines[0]).toContain(actor.def.skills[0].name);
  });

  it("クールタイム中のスキルを指定した場合はAIにフォールバックする", () => {
    const { playerTeam, enemyTeam } = buildTeams();
    const engine = new BattleEngine(playerTeam, enemyTeam, { rng: mulberry32(11), maxTurns: 300 });

    const actor = engine.getNextActor()!;
    actor.cooldowns = [0, 2, 0]; // スキル1をクールタイム中にしておく
    const record = engine.resolveTurn(actor, { skillIndex: 1 });
    // スキル1(クールタイム中)は使われず、フォールバックされた別のスキルが使われる
    expect(record.lines[0]).not.toContain(actor.def.skills[1].name);
  });

  it("getNextActorは決着後にnullを返す", () => {
    const { playerTeam, enemyTeam } = buildTeams();
    const engine = new BattleEngine(playerTeam, enemyTeam, { rng: mulberry32(5), maxTurns: 300 });

    let actor = engine.getNextActor();
    let guard = 0;
    while (actor && guard < 1000) {
      engine.resolveTurn(actor);
      actor = engine.getNextActor();
      guard += 1;
    }
    expect(engine.getNextActor()).toBeNull();
  });
});
