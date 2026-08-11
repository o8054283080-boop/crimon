import { describe, expect, it } from "vitest";
import { EQUIP_SLOTS, generateEquipment } from "../src/core/equipment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { STAGE_STAMINA_COST, DUNGEON_STAMINA_COST } from "../src/core/fighterLevel.js";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { STAGES } from "../src/data/stages.js";
import { MAX_FIGHTER_LEVEL } from "../src/core/fighterLevel.js";
import {
  FIRST_CLEAR_CRYSTAL_REWARD,
  addEquipment,
  createInitialState,
  equipToMonster,
  toggleDungeonPartyMember,
} from "../src/game/playerState.js";
import { runDungeonAutoFarm, runStageAutoFarm } from "../src/game/autoFarm.js";

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

describe("ステージのオート周回 (runStageAutoFarm)", () => {
  it("指定回数を消化し、1回目は初回クリア報酬(ダイヤ200)、2回目以降はスタミナ分のダイヤになる", () => {
    const state = createInitialState();
    const stage = STAGES[0];

    const result = runStageAutoFarm(state, stage, 5);

    expect(result.attempts).toBe(5);
    expect(result.cleared).toBe(5);
    expect(result.stopReason).toBe("COMPLETED");
    expect(result.totalCrystal).toBe(FIRST_CLEAR_CRYSTAL_REWARD + 4 * STAGE_STAMINA_COST);
    expect(result.totalGold).toBeGreaterThan(0);
    // ファイターレベルアップでスタミナが全回復することがあるため、消費した分だけ減っているとは限らない
    expect(state.stamina).toBeLessThanOrEqual(150);
    expect(state.stamina).toBeGreaterThanOrEqual(150 - 5 * STAGE_STAMINA_COST);
  });

  it("スタミナが尽きたら指定回数未満で中断する(ファイターレベル上限に達している場合)", () => {
    const state = createInitialState();
    const stage = STAGES[0];
    // ファイターレベル上限にしておくことで、クリア時のレベルアップによるスタミナ全回復を防ぐ
    state.fighterLevel = MAX_FIGHTER_LEVEL;
    state.stamina = STAGE_STAMINA_COST * 2; // 2回分しかない
    state.maxStamina = STAGE_STAMINA_COST * 2;

    const result = runStageAutoFarm(state, stage, 10);

    expect(result.attempts).toBe(2);
    expect(result.cleared).toBe(2);
    expect(result.stopReason).toBe("STAMINA");
    expect(state.stamina).toBe(0);
  });

  it("パーティが編成されていなければ1回も挑戦せず中断する", () => {
    const state = createInitialState();
    state.partyIds = [];
    const stage = STAGES[0];

    const result = runStageAutoFarm(state, stage, 5);

    expect(result.attempts).toBe(0);
    expect(result.cleared).toBe(0);
    expect(result.stopReason).toBe("NO_PARTY");
  });
});

describe("装備ダンジョンのオート周回 (runDungeonAutoFarm)", () => {
  it("十分な戦力なら指定回数を消化してクリアできる", () => {
    const state = createInitialState();
    const floor = EQUIPMENT_DUNGEON_FLOORS[0];
    // 装備生成用と戦闘用でrngを分け、戦闘側は十分強いパーティで決着が安定する値を使う
    const equipRng = mulberry32(1);
    const battleRng = mulberry32(2);

    const STARTER = [
      { templateId: "slime", element: "FIRE" },
      { templateId: "wolf", element: "WATER" },
      { templateId: "golem", element: "ELECTRIC" },
      { templateId: "fairy", element: "GRASS" },
    ];
    state.monsters = [];
    state.partyIds = [];
    state.dungeonPartyIds = [];
    // 1階の推奨戦力(星3+星1装備)よりかなり高い戦力(星5満レベル+星3装備)にして、
    // 乱数のブレによる偶発的な敗北を避け、テストの決定性を保つ
    for (const s of STARTER) {
      const instance = createMonsterInstance(`${s.templateId}_${s.element}`, 5, 50);
      state.monsters.push(instance);
      toggleDungeonPartyMember(state, instance.id);
      for (const slot of EQUIP_SLOTS) {
        const eq = generateEquipment({ slot, star: 3, subStatCount: 2, rng: equipRng });
        addEquipment(state, eq);
        equipToMonster(state, instance.id, eq.id);
      }
    }

    const result = runDungeonAutoFarm(state, floor, 3, battleRng);

    expect(result.attempts).toBe(3);
    expect(result.cleared).toBe(3);
    expect(result.stopReason).toBe("COMPLETED");
    expect(result.totalCrystal).toBe(FIRST_CLEAR_CRYSTAL_REWARD + 2 * DUNGEON_STAMINA_COST);
  });
});
