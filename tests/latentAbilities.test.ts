import { describe, expect, it } from "vitest";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";
import {
  LATENT_ABILITY_CANDIDATES,
  awakenLatentAbility,
  reawakenLatentAbility,
} from "../src/game/monsterDevelopment.js";
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

  it("再覚醒費用を払い、同じ候補から追加料金なしで選び直せる", () => {
    const state = createInitialState();
    const instance = state.monsters[0];
    const candidates = LATENT_ABILITY_CANDIDATES[instance.dexId];
    const [abilityA, abilityB] = candidates;
    instance.development.latentAbilityId = abilityA.id;
    state.awakeningOrbs = 3;
    state.gold = 150_000;

    expect(reawakenLatentAbility(instance, state)).toBe(true);
    expect(state.awakeningOrbs).toBe(1);
    expect(state.gold).toBe(50_000);
    expect(instance.development.latentAbilityId).toBeNull();
    expect(instance.development.latentReselectPending).toBe(true);

    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)));
    const loadedInstance = loaded.monsters[0];
    expect(loadedInstance.development.latentReselectPending).toBe(true);
    expect(awakenLatentAbility(loadedInstance, abilityB.id, candidates, loaded)).toBe(true);
    expect(loaded.awakeningOrbs).toBe(1);
    expect(loaded.gold).toBe(50_000);
    expect(loadedInstance.development.latentAbilityId).toBe(abilityB.id);
    expect(loadedInstance.development.latentReselectPending).toBe(false);
  });

  it("再覚醒にはオーブ2個と100,000Gの両方が必要", () => {
    const instance = createMonsterInstance("slime_FIRE", 3);
    instance.development.latentAbilityId = LATENT_ABILITY_CANDIDATES[instance.dexId][0].id;

    expect(reawakenLatentAbility(instance, { awakeningOrbs: 1, gold: 100_000 })).toBe(false);
    expect(reawakenLatentAbility(instance, { awakeningOrbs: 2, gold: 99_999 })).toBe(false);
    expect(instance.development.latentAbilityId).not.toBeNull();
    expect(instance.development.latentReselectPending).toBe(false);
  });

  it("旧セーブの個体は再選択待ちではない状態に補完する", () => {
    const state = createInitialState();
    delete (state.monsters[0].development as Partial<typeof state.monsters[0]["development"]>).latentReselectPending;
    expect(normalizeLoadedState(state).monsters[0].development.latentReselectPending).toBe(false);
  });
});
