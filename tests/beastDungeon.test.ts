import { describe, expect, it } from "vitest";
import { computeSetCombatModifiers, generateEquipment } from "../src/core/equipment.js";
import { BEAST_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { ANCIENT_BEAST, ANCIENT_FANG_BEAST, ANCIENT_GUARD_BEAST } from "../src/data/monsters.js";
import { createInitialState, isDungeonFloorCleared, markDungeonFloorCleared } from "../src/game/playerState.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";

describe("魔獣のダンジョン", () => {
  it("10階構成・属性巡回・確定ステータスが設計どおり", () => {
    expect(BEAST_DUNGEON_FLOORS).toHaveLength(10);
    expect(BEAST_DUNGEON_FLOORS.map((floor) => floor.enemies[0].element)).toEqual([
      "FIRE", "WATER", "ELECTRIC", "GRASS", "LIGHT", "DARK", "FIRE", "WATER", "ELECTRIC", "DARK",
    ]);
    const floor10 = BEAST_DUNGEON_FLOORS[9];
    expect(floor10.enemies.map((enemy) => enemy.templateId)).toEqual([
      ANCIENT_BEAST.templateId, ANCIENT_GUARD_BEAST.templateId, ANCIENT_FANG_BEAST.templateId,
    ]);
    expect(floor10.enemies[0].initialCooldowns).toEqual([0, 3, 5]);
    expect(floor10.enemies.every((enemy) => enemy.victoryTarget === (enemy.isBoss === true))).toBe(true);
    expect(buildDungeonEnemyTeam(floor10).map((enemy) => enemy.stats)).toMatchObject([
      { hp: 350000, atk: 4550, def: 3650, spd: 205 },
      { hp: 200000, atk: 1550, def: 3900, spd: 175 },
      { hp: 120000, atk: 3250, def: 1990, spd: 173 },
    ]);
  });

  it("既存ダンジョンとは別にクリア進行を保存する", () => {
    const state = createInitialState();
    markDungeonFloorCleared(state, 1, "BEAST");
    expect(isDungeonFloorCleared(state, 1, "BEAST")).toBe(true);
    expect(isDungeonFloorCleared(state, 1, "DEMON")).toBe(false);
  });

  it("新5セットの戦闘補正を正しく集計する", () => {
    const make = (set: "WARD" | "RAMPAGE" | "IMMUNITY_SET" | "COLLAPSE" | "BLESSING", count: number) =>
      Array.from({ length: count }, (_, i) => generateEquipment({ star: 6, slot: (i + 1) as 1 | 2 | 3 | 4 | 5 | 6, set, subStatCount: 0, rng: () => 0 }));
    expect(computeSetCombatModifiers(make("WARD", 6))).toMatchObject({ battleStartShieldPercent: 0.24, battleStartShieldTurns: 1 });
    expect(computeSetCombatModifiers(make("IMMUNITY_SET", 6))).toMatchObject({ battleStartImmunityTurns: 3 });
    expect(computeSetCombatModifiers(make("RAMPAGE", 4))).toMatchObject({ extraTurnChance: 0.15 });
    expect(computeSetCombatModifiers(make("COLLAPSE", 4))).toMatchObject({ defenseIgnoreChance: 0.5, defenseIgnoreRatio: 0.5 });
    expect(computeSetCombatModifiers(make("BLESSING", 4))).toMatchObject({ thresholdHealHpRatio: 0.35, thresholdHealPercent: 0.35 });
  });

  it("3体の専用スキルとパッシブを保持する", () => {
    expect(ANCIENT_BEAST.skill2Variants[0]).toMatchObject({ randomEnemyHits: true, cooldownTurns: 3 });
    expect(ANCIENT_BEAST.skill3Variants[0].effects.map((effect) => effect.kind)).toEqual(["DAMAGE", "STRIP", "DEBUFF"]);
    expect(ANCIENT_BEAST.bossTraits?.extraTurnChance).toBe(0.15);
    expect(ANCIENT_GUARD_BEAST.bossTraits?.allyThresholdHeal).toEqual({ hpRatio: 0.35, healPercent: 0.35 });
    expect(ANCIENT_FANG_BEAST.bossTraits).toMatchObject({ defenseIgnoreChance: 0.5, defenseIgnoreRatio: 0.5 });
  });
});
