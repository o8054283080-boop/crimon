import { describe, expect, it } from "vitest";
import { generateEquipment } from "../src/core/equipment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import {
  PlayerState,
  addEquipment,
  equipToMonster,
  findEquippedOwner,
  isEquipmentEquipped,
  unequipFromMonster,
} from "../src/game/playerState.js";

function makeState(): PlayerState {
  return {
    crystal: 0,
    gold: 0,
    monsters: [],
    partyIds: [],
    clearedStageIds: [],
    clearedDungeonFloors: [],
    clearedLevelDungeonTiers: [],
    equipment: [],
    dungeonPartyIds: [],
    summonScrolls: 0,
    fighterLevel: 1,
    fighterExp: 0,
    stamina: 150,
    maxStamina: 150,
    lastStaminaUpdateAt: Date.now(),
  };
}

describe("装備の装着・解除", () => {
  it("装備はその装備自身のスロット番号にのみ装着される", () => {
    const state = makeState();
    const monster = createMonsterInstance("slime_FIRE", 1, 1);
    state.monsters.push(monster);
    const eq = generateEquipment({ slot: 4, star: 1, subStatCount: 0 });
    addEquipment(state, eq);

    expect(equipToMonster(state, monster.id, eq.id)).toBe(true);
    expect(monster.equipment[4]).toBe(eq.id);
    expect(monster.equipment[1]).toBeUndefined();
  });

  it("同じスロットに別の装備を付けると元の装備は外れる", () => {
    const state = makeState();
    const monster = createMonsterInstance("slime_FIRE", 1, 1);
    state.monsters.push(monster);
    const eqA = generateEquipment({ slot: 1, star: 1, subStatCount: 0 });
    const eqB = generateEquipment({ slot: 1, star: 1, subStatCount: 0 });
    addEquipment(state, eqA);
    addEquipment(state, eqB);

    equipToMonster(state, monster.id, eqA.id);
    equipToMonster(state, monster.id, eqB.id);

    expect(monster.equipment[1]).toBe(eqB.id);
    expect(isEquipmentEquipped(state, eqA.id)).toBe(false);
  });

  it("別のモンスターに装着し直すと元のモンスターから外れる", () => {
    const state = makeState();
    const monsterA = createMonsterInstance("slime_FIRE", 1, 1);
    const monsterB = createMonsterInstance("wolf_WATER", 1, 1);
    state.monsters.push(monsterA, monsterB);
    const eq = generateEquipment({ slot: 2, star: 1, subStatCount: 0 });
    addEquipment(state, eq);

    equipToMonster(state, monsterA.id, eq.id);
    equipToMonster(state, monsterB.id, eq.id);

    expect(monsterA.equipment[2]).toBeUndefined();
    expect(monsterB.equipment[2]).toBe(eq.id);
    expect(findEquippedOwner(state, eq.id)?.id).toBe(monsterB.id);
  });

  it("unequipFromMonsterでスロットが空になる", () => {
    const state = makeState();
    const monster = createMonsterInstance("slime_FIRE", 1, 1);
    state.monsters.push(monster);
    const eq = generateEquipment({ slot: 3, star: 1, subStatCount: 0 });
    addEquipment(state, eq);
    equipToMonster(state, monster.id, eq.id);

    unequipFromMonster(state, monster.id, 3);

    expect(monster.equipment[3]).toBeUndefined();
    expect(isEquipmentEquipped(state, eq.id)).toBe(false);
  });

  it("存在しないモンスター/装備を指定した場合はfalseを返し何も変えない", () => {
    const state = makeState();
    const monster = createMonsterInstance("slime_FIRE", 1, 1);
    state.monsters.push(monster);
    const eq = generateEquipment({ slot: 1, star: 1, subStatCount: 0 });
    addEquipment(state, eq);

    expect(equipToMonster(state, "no-such-monster", eq.id)).toBe(false);
    expect(equipToMonster(state, monster.id, "no-such-equipment")).toBe(false);
    expect(monster.equipment[1]).toBeUndefined();
  });
});
