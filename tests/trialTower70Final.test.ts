import { describe, expect, it } from "vitest";
import type { MonsterDefinition } from "../src/core/monster.js";
import type { Skill } from "../src/core/skill.js";
import type { Stats } from "../src/core/stats.js";
import { BattleEngine } from "../src/battle/engine.js";
import type { BattleUnit } from "../src/battle/unit.js";
import { buildTowerFloor } from "../src/data/trialTower.js";
import {
  TOWER70_BOSS_ATK,
  TOWER70_BOSS_DEF,
  TOWER70_BOSS_HP,
  TOWER70_BOSS_SPD,
  TOWER70_ENEMIES,
} from "../src/data/trialTowerFloor70.js";

const BASIC_SKILL = (id: string): Skill => ({
  id,
  name: id,
  description: "test",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [{ kind: "DAMAGE", multiplier: 0.1 }],
});

function statsOf(enemy: (typeof TOWER70_ENEMIES)[number]): Stats {
  const s = enemy.fixedStats!;
  return {
    hp: s.hp!, atk: s.atk!, def: s.def!, spd: s.spd!,
    criRate: s.criRate!, criDmg: s.criDmg!, accuracy: s.accuracy!, resistance: s.resistance!,
  };
}

function enemyDef(index: number): MonsterDefinition {
  const enemy = TOWER70_ENEMIES[index];
  return {
    id: `tower70-e${index}`,
    templateId: enemy.templateId,
    name: enemy.displayName ?? `E${index}`,
    element: enemy.element,
    color: "#000",
    role: "test",
    emoji: "",
    stats: statsOf(enemy),
    skills: enemy.skills!,
    victoryTarget: enemy.victoryTarget,
    primaryTarget: enemy.primaryTarget,
    initialCooldowns: enemy.initialCooldowns,
  };
}

function playerDef(index: number, hp = 1_000_000): MonsterDefinition {
  return {
    id: `tower70-p${index}`,
    templateId: `tower70-p${index}`,
    name: `P${index}`,
    element: "FIRE",
    color: "#000",
    role: "test",
    emoji: "",
    stats: { hp, atk: 1000, def: 5000, spd: 100, criRate: 0, criDmg: 1.5, accuracy: 0, resistance: 0 },
    skills: [BASIC_SKILL(`p${index}s1`), BASIC_SKILL(`p${index}s2`), BASIC_SKILL(`p${index}s3`)],
  };
}

function makeEngine(playerCount = 5): BattleEngine {
  return new BattleEngine(
    Array.from({ length: playerCount }, (_, i) => playerDef(i + 1)),
    [enemyDef(0), enemyDef(1), enemyDef(2)],
    { trialTowerFloor: 70, rng: () => 0.99, maxTurns: 10 },
  );
}

type Tower70Internal = {
  units: BattleUnit[];
  applyTower70BossRegen(boss: BattleUnit): void;
  syncTower70BossTier(boss: BattleUnit): void;
  tower70HpCoefficientFactor(boss: BattleUnit): number;
  applyTower70PulseCrush(): void;
  afterTower70BossHpChanged(boss: BattleUnit): void;
  checkWinner(): "PLAYER" | "ENEMY" | null;
  tower70RoaredThresholds: Set<number>;
};

const internal = (engine: BattleEngine): Tower70Internal => engine as unknown as Tower70Internal;

describe("試練の塔70階 確定仕様", () => {
  it("本編70階が始祖ベヒモス+生命晶+脈動晶の固定3体になる", () => {
    const floor = buildTowerFloor(70);
    expect(floor.label).toBe("始祖ベヒモス");
    expect(floor.enemies).toHaveLength(3);
    expect(floor.enemies.map((enemy) => enemy.displayName)).toEqual(["始祖ベヒモス", "古代の生命晶", "古代の脈動晶"]);
    expect(floor.enemies[0].victoryTarget).toBe(true);
    expect(floor.enemies[0].fixedStats).toMatchObject({
      hp: TOWER70_BOSS_HP,
      atk: TOWER70_BOSS_ATK,
      def: TOWER70_BOSS_DEF,
      spd: TOWER70_BOSS_SPD,
    });
  });

  it("始祖ベヒモスは生命晶生存中7%、撃破後3%、回復阻害中0%再生する", () => {
    const engine = makeEngine();
    const e = internal(engine);
    const boss = e.units[5];
    const life = e.units[6];

    boss.currentHp = 100_000;
    e.applyTower70BossRegen(boss);
    expect(boss.currentHp).toBe(111_900); // 170000 * 7%

    life.alive = false;
    life.currentHp = 0;
    e.applyTower70BossRegen(boss);
    expect(boss.currentHp).toBe(117_000); // +170000 * 3%

    boss.healBlockTurns = 2;
    boss.healBlockMultiplier = 0;
    e.applyTower70BossRegen(boss);
    expect(boss.currentHp).toBe(117_000);
  });

  it("HP帯強化は置き換え式でATK/SPD/HP比例倍率が70/50/30%帯で切り替わる", () => {
    const engine = makeEngine();
    const e = internal(engine);
    const boss = e.units[5];

    const cases = [
      { ratio: 0.8, atk: 0, spd: 0, hpFactor: 1 },
      { ratio: 0.65, atk: 500, spd: 10, hpFactor: 1.3 },
      { ratio: 0.45, atk: 1000, spd: 25, hpFactor: 1.6 },
      { ratio: 0.25, atk: 1500, spd: 45, hpFactor: 2.5 },
    ];

    for (const c of cases) {
      boss.currentHp = Math.floor(boss.maxHp * c.ratio);
      e.syncTower70BossTier(boss);
      expect(boss.flatStatBonus.atk).toBe(c.atk);
      expect(boss.flatStatBonus.spd).toBe(c.spd);
      expect(e.tower70HpCoefficientFactor(boss)).toBe(c.hpFactor);
    }
  });

  it("命脈断ちは現在HP実数の高い生存3体だけを半減し、同値は元スロット順で決める", () => {
    const engine = makeEngine();
    const e = internal(engine);
    const players = e.units.slice(0, 5);
    [1000, 900, 800, 800, 700].forEach((hp, i) => { players[i].currentHp = hp; });

    e.applyTower70PulseCrush();

    expect(players.map((unit) => unit.currentHp)).toEqual([500, 450, 400, 800, 700]);
  });

  it("75/50/25%を一気に跨いでも咆哮は各1回、DEF低下は3重化せず更新される", () => {
    const engine = makeEngine();
    const e = internal(engine);
    const boss = e.units[5];
    const players = e.units.slice(0, 5);
    players.forEach((unit) => { unit.gauge = 100; });

    boss.currentHp = Math.floor(boss.maxHp * 0.24);
    e.afterTower70BossHpChanged(boss);

    expect(e.tower70RoaredThresholds.size).toBe(3);
    for (const player of players) {
      expect(player.gauge).toBe(0);
      const roarDefDown = player.effects.filter((effect) => effect.kind === "DEBUFF" && effect.stat === "def" && effect.amount === -0.5);
      expect(roarDefDown).toHaveLength(1);
      expect(roarDefDown[0].remainingTurns).toBe(3);
    }

    const hpAfterFirst = players.map((unit) => unit.currentHp);
    e.afterTower70BossHpChanged(boss);
    expect(players.map((unit) => unit.currentHp)).toEqual(hpAfterFirst);
  });

  it("始祖ベヒモスを倒せば生命晶・脈動晶が残っていても即クリア", () => {
    const engine = makeEngine();
    const e = internal(engine);
    const boss = e.units[5];
    boss.currentHp = 0;
    boss.alive = false;
    expect(e.checkWinner()).toBe("PLAYER");
  });
});
