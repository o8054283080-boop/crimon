import { describe, expect, it } from "vitest";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";
import {
  LATENT_ABILITY_CANDIDATES,
  awakenLatentAbility,
  reawakenLatentAbility,
} from "../src/game/monsterDevelopment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";

describe("潜在覚醒の候補", () => {
  it("図鑑に載る全個体へ有効な3候補を重複なく登録する", () => {
    // 体数はモンスターを足すたびに増える。**数そのものではなく「全員に3つある」ことを見る**
    expect(ALL_DISPLAYABLE_MONSTERS_DEX.length).toBeGreaterThanOrEqual(72);
    const candidates = ALL_DISPLAYABLE_MONSTERS_DEX.flatMap((monster) => LATENT_ABILITY_CANDIDATES[monster.id] ?? []);
    expect(candidates).toHaveLength(ALL_DISPLAYABLE_MONSTERS_DEX.length * 3);
    expect(new Set(candidates.map(({ id }) => id))).toHaveProperty("size", ALL_DISPLAYABLE_MONSTERS_DEX.length * 3);
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
    state.gold = 650_000;

    expect(reawakenLatentAbility(instance, state)).toBe(true);
    expect(state.awakeningOrbs).toBe(1);
    expect(state.gold).toBe(150_000);
    expect(instance.development.latentAbilityId).toBeNull();
    expect(instance.development.latentReselectPending).toBe(true);

    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)));
    const loadedInstance = loaded.monsters[0];
    expect(loadedInstance.development.latentReselectPending).toBe(true);
    expect(awakenLatentAbility(loadedInstance, abilityB.id, candidates, loaded)).toBe(true);
    expect(loaded.awakeningOrbs).toBe(1);
    expect(loaded.gold).toBe(150_000);
    expect(loadedInstance.development.latentAbilityId).toBe(abilityB.id);
    expect(loadedInstance.development.latentReselectPending).toBe(false);
  });

  it("再覚醒にはオーブ2個と500,000Gの両方が必要", () => {
    const instance = createMonsterInstance("slime_FIRE", 3);
    instance.development.latentAbilityId = LATENT_ABILITY_CANDIDATES[instance.dexId][0].id;

    expect(reawakenLatentAbility(instance, { awakeningOrbs: 1, gold: 500_000 })).toBe(false);
    expect(reawakenLatentAbility(instance, { awakeningOrbs: 2, gold: 499_999 })).toBe(false);
    expect(instance.development.latentAbilityId).not.toBeNull();
    expect(instance.development.latentReselectPending).toBe(false);
  });

  it("旧セーブの個体は再選択待ちではない状態に補完する", () => {
    const state = createInitialState();
    delete (state.monsters[0].development as Partial<typeof state.monsters[0]["development"]>).latentReselectPending;
    expect(normalizeLoadedState(state).monsters[0].development.latentReselectPending).toBe(false);
  });
});

describe("原子的な潜在確定", () => {
  it("初回1個、再覚醒2個+500,000G、STALE/連打は無消費", async () => {
    const { confirmLatentAwakening } = await import("../src/game/monsterDevelopment.js");
    const instance = createMonsterInstance("slime_FIRE", 6);
    const candidates = LATENT_ABILITY_CANDIDATES[instance.dexId];
    const wallet = { awakeningOrbs: 4, gold: 600_000 };
    expect(confirmLatentAwakening(instance, candidates[0].id, candidates, wallet, null)).toBe(true);
    expect(wallet).toEqual({ awakeningOrbs: 3, gold: 600_000 });
    const stale = { ...wallet };
    expect(confirmLatentAwakening(instance, candidates[1].id, candidates, wallet, null)).toBe(false);
    expect(wallet).toEqual(stale);
    expect(confirmLatentAwakening(instance, candidates[1].id, candidates, wallet, candidates[0].id)).toBe(true);
    expect(wallet).toEqual({ awakeningOrbs: 1, gold: 100_000 });
    expect(confirmLatentAwakening(instance, candidates[2].id, candidates, wallet, candidates[0].id)).toBe(false);
    expect(wallet).toEqual({ awakeningOrbs: 1, gold: 100_000 });
  });
  it("支払済みlegacy reselectは追加課金しない", async () => {
    const { confirmLatentAwakening } = await import("../src/game/monsterDevelopment.js");
    const instance = createMonsterInstance("slime_FIRE", 6); instance.development.latentReselectPending = true;
    const candidates = LATENT_ABILITY_CANDIDATES[instance.dexId]; const wallet = { awakeningOrbs: 0, gold: 0 };
    expect(confirmLatentAwakening(instance, candidates[2].id, candidates, wallet, null)).toBe(true);
    expect(wallet).toEqual({ awakeningOrbs: 0, gold: 0 });
  });
});
