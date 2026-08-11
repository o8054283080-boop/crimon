import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { findMonster } from "../src/data/monsters.js";

describe("回復スキルの能力値依存(scaleStat)", () => {
  it("DEF依存の回復は自身の防御力×healRateで計算される(最大HP依存ではない)", () => {
    // dragon[ELECTRIC] のスキル3は「古龍の守り」(SELF, HEAL scaleStat:def healRate:1.8)
    const dragon = findMonster("dragon", "ELECTRIC")!;
    const healSkill = dragon.skills[2];
    expect(healSkill.name).toBe("古龍の守り");
    expect(healSkill.effects[0]).toMatchObject({ kind: "HEAL", scaleStat: "def", healRate: 1.8 });

    const weakEnemy = findMonster("slime", "FIRE")!;
    const engine = new BattleEngine([dragon], [weakEnemy], { rng: () => 0.999 });

    const actor = engine.getNextActor();
    expect(actor).not.toBeNull();
    const dragonUnit = actor!;
    dragonUnit.currentHp = 1; // 最大HP依存の回復なら極端に少ない量になるはず

    const record = engine.resolveTurn(dragonUnit, { skillIndex: 2 });
    const expectedHeal = Math.round(dragonUnit.def.stats.def * 1.8);
    const snapshot = record.snapshot.find((s) => s.instanceId === dragonUnit.instanceId)!;

    expect(snapshot.currentHp).toBe(Math.min(dragonUnit.maxHp, 1 + expectedHeal));
    // 最大HPの何割か、という回復量よりずっと大きい(防御力ベースの回復が効いていることの確認)
    expect(expectedHeal).toBeGreaterThan(dragonUnit.maxHp * 0.05);
  });

  it("ATK依存の回復は自身の攻撃力×healRateで計算される", () => {
    // nemesis[LIGHT] のスキル3は「不死なる魂」(SELF, HEAL scaleStat:atk healRate:1.0)
    const nemesis = findMonster("nemesis", "LIGHT")!;
    const healSkill = nemesis.skills[2];
    expect(healSkill.name).toBe("不死なる魂");
    expect(healSkill.effects[0]).toMatchObject({ kind: "HEAL", scaleStat: "atk", healRate: 1.0 });

    const weakEnemy = findMonster("slime", "FIRE")!;
    const engine = new BattleEngine([nemesis], [weakEnemy], { rng: () => 0.999 });

    const actor = engine.getNextActor();
    const nemesisUnit = actor!;
    nemesisUnit.currentHp = 1;

    const record = engine.resolveTurn(nemesisUnit, { skillIndex: 2 });
    const expectedHeal = Math.round(nemesisUnit.def.stats.atk * 1.0);
    const snapshot = record.snapshot.find((s) => s.instanceId === nemesisUnit.instanceId)!;

    expect(snapshot.currentHp).toBe(Math.min(nemesisUnit.maxHp, 1 + expectedHeal));
  });
});
