import { describe, expect, it } from "vitest";
import { createMonsterVariant } from "../src/core/monster.js";
import { BattleEngine } from "../src/battle/engine.js";
import { calcDamage } from "../src/battle/damage.js";
import { createBattleUnit } from "../src/battle/unit.js";
import { chooseSkill } from "../src/battle/ai.js";
import { MONSTER_TEMPLATES, findMonster } from "../src/data/monsters.js";

const noCrit = () => 0.999; // criRate は常に1未満なのでクリティカルにならない

describe("ダメージ計算", () => {
  it("属性有利は不利より大きなダメージになる", () => {
    const fireSlime = createMonsterVariant(MONSTER_TEMPLATES[0], "FIRE");
    const grassGolem = createMonsterVariant(MONSTER_TEMPLATES[2], "GRASS");
    const waterGolem = createMonsterVariant(MONSTER_TEMPLATES[2], "WATER");

    const attacker = createBattleUnit(fireSlime, "PLAYER", "P1");
    const strongTarget = createBattleUnit(grassGolem, "ENEMY", "E1");
    const weakTarget = createBattleUnit(waterGolem, "ENEMY", "E2");

    const effect = { kind: "DAMAGE" as const, multiplier: 1.0 };
    const advDamage = calcDamage(attacker, strongTarget, effect, noCrit).damage;
    const disDamage = calcDamage(attacker, weakTarget, effect, noCrit).damage;

    expect(advDamage).toBeGreaterThan(disDamage);
  });

  it("最低ダメージは1", () => {
    const weakest = findMonster("fairy", "WATER")!;
    const tankiest = findMonster("golem", "FIRE")!;
    const attacker = createBattleUnit(weakest, "PLAYER", "P1");
    const target = createBattleUnit(tankiest, "ENEMY", "E1");
    const effect = { kind: "DAMAGE" as const, multiplier: 0.01 };
    const result = calcDamage(attacker, target, effect, noCrit);
    expect(result.damage).toBeGreaterThanOrEqual(1);
  });
});

describe("スキル選択AI", () => {
  it("クールタイムが明けている最も強いスキルを選ぶ", () => {
    const def = findMonster("slime", "FIRE")!;
    const unit = createBattleUnit(def, "PLAYER", "P1");

    unit.cooldowns = [0, 0, 0];
    expect(chooseSkill(unit).index).toBe(2);

    unit.cooldowns = [0, 0, 2];
    expect(chooseSkill(unit).index).toBe(1);

    unit.cooldowns = [0, 3, 2];
    expect(chooseSkill(unit).index).toBe(0);
  });
});

describe("BattleEngine 4vs4", () => {
  it("有限ターン数で必ず決着する", () => {
    const rng = (() => {
      let x = 12345;
      return () => {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        return x / 0x7fffffff;
      };
    })();

    const playerTeam = ["slime", "wolf", "golem", "fairy"].map((id) => findMonster(id, "FIRE")!);
    const enemyTeam = ["slime", "wolf", "golem", "fairy"].map((id) => findMonster(id, "WATER")!);

    const engine = new BattleEngine(playerTeam, enemyTeam, { rng, maxTurns: 300 });
    const result = engine.run();

    expect(["PLAYER", "ENEMY", "DRAW"]).toContain(result.winner);
    expect(result.turnsTaken).toBeGreaterThan(0);
    expect(result.turnsTaken).toBeLessThanOrEqual(300);
    expect(result.log.length).toBeGreaterThan(0);
  });

  it("片方のチームが全滅した時点でそのチームの敗北になる", () => {
    const strongDef = findMonster("wolf", "FIRE")!;
    const weakDef = findMonster("fairy", "WATER")!;

    const playerTeam = [strongDef, strongDef, strongDef, strongDef];
    const enemyTeam = [weakDef, weakDef, weakDef, weakDef];

    const rng = () => 0.999;
    const engine = new BattleEngine(playerTeam, enemyTeam, { rng, maxTurns: 300 });
    const result = engine.run();

    expect(result.winner).toBe("PLAYER");
  });
});
