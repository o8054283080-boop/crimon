import { describe, expect, it } from "vitest";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";
import { LATENT_ABILITY_CANDIDATES, awakenLatentAbility } from "../src/game/monsterDevelopment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";

describe("潜在覚醒216候補", () => {
  it("プレイヤー72体へ有効な3候補を重複なく登録する", () => {
    expect(ALL_DISPLAYABLE_MONSTERS_DEX).toHaveLength(72);
    const candidates = ALL_DISPLAYABLE_MONSTERS_DEX.flatMap((monster) => LATENT_ABILITY_CANDIDATES[monster.id] ?? []);
    expect(candidates).toHaveLength(216);
    expect(new Set(candidates.map(({ id }) => id))).toHaveProperty("size", 216);
    for (const candidate of candidates) {
      expect(candidate.name.trim()).not.toBe("");
      expect(candidate.description.trim()).not.toBe("");
      expect(["OFFENSE", "DISRUPT", "DURABILITY", "SUPPORT", "SPECIAL"]).toContain(candidate.category);
      expect(candidate.chance).toBeGreaterThanOrEqual(0);
      expect(candidate.chance).toBeLessThanOrEqual(1);
      expect(candidate.skillSlot).toBe(0);
    }
    for (const monster of ALL_DISPLAYABLE_MONSTERS_DEX) expect(LATENT_ABILITY_CANDIDATES[monster.id]).toHaveLength(3);
  });

  it("1個体は1候補だけを選択し、ロード後もIDを維持する", () => {
    const instance = createMonsterInstance("slime_FIRE", 3);
    const candidates = LATENT_ABILITY_CANDIDATES[instance.dexId];
    const inventory = { awakeningOrbs: 2 };
    expect(awakenLatentAbility(instance, candidates[0].id, candidates, inventory)).toBe(true);
    expect(awakenLatentAbility(instance, candidates[1].id, candidates, inventory)).toBe(false);
    expect(instance.development.latentAbilityId).toBe(candidates[0].id);
    expect(inventory.awakeningOrbs).toBe(1);

    const state = createInitialState();
    state.monsters[0] = instance;
    expect(normalizeLoadedState(JSON.parse(JSON.stringify(state))).monsters[0].development.latentAbilityId).toBe(candidates[0].id);
  });
});
