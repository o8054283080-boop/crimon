import { describe, expect, it } from "vitest";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";
import {
  LATENT_ABILITY_CANDIDATES,
  awakenLatentAbility,
  confirmLatentAwakening,
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

  it("再覚醒は候補確定時だけ費用とIDをまとめて更新する", () => {
    const state = createInitialState();
    const instance = state.monsters[0];
    const candidates = LATENT_ABILITY_CANDIDATES[instance.dexId];
    const [abilityA, abilityB] = candidates;
    instance.development.latentAbilityId = abilityA.id;
    state.awakeningOrbs = 3;
    state.gold = 150_000;

    const result = confirmLatentAwakening(instance, abilityB.id, candidates, state, abilityA.id);
    expect(result.ok).toBe(true);
    expect(state.awakeningOrbs).toBe(1);
    expect(state.gold).toBe(50_000);
    expect(instance.development.latentAbilityId).toBe(abilityB.id);
    expect(instance.development.latentReselectPending).toBe(false);

    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)));
    const loadedInstance = loaded.monsters[0];
    expect(loadedInstance.development.latentReselectPending).toBe(false);
    expect(confirmLatentAwakening(loadedInstance, abilityB.id, candidates, loaded, abilityA.id)).toEqual({ ok: false, reason: "STALE" });
    expect(loaded.awakeningOrbs).toBe(1);
    expect(loaded.gold).toBe(50_000);
    expect(loadedInstance.development.latentAbilityId).toBe(abilityB.id);
    expect(loadedInstance.development.latentReselectPending).toBe(false);
  });

  it("再覚醒にはオーブ2個と100,000Gの両方が必要", () => {
    const instance = createMonsterInstance("slime_FIRE", 3);
    instance.development.latentAbilityId = LATENT_ABILITY_CANDIDATES[instance.dexId][0].id;

    const candidates = LATENT_ABILITY_CANDIDATES[instance.dexId];
    const current = instance.development.latentAbilityId;
    const orbShort = { awakeningOrbs: 1, gold: 100_000 };
    const goldShort = { awakeningOrbs: 2, gold: 99_999 };
    expect(confirmLatentAwakening(instance, candidates[1].id, candidates, orbShort, current)).toEqual({ ok: false, reason: "ORB_SHORTAGE" });
    expect(confirmLatentAwakening(instance, candidates[1].id, candidates, goldShort, current)).toEqual({ ok: false, reason: "GOLD_SHORTAGE" });
    expect(orbShort).toEqual({ awakeningOrbs: 1, gold: 100_000 });
    expect(goldShort).toEqual({ awakeningOrbs: 2, gold: 99_999 });
    expect(instance.development.latentAbilityId).not.toBeNull();
    expect(instance.development.latentReselectPending).toBe(false);
  });

  it("不正候補と同一処理再送では資源もIDも二重変更しない", () => {
    const state = createInitialState();
    const instance = state.monsters[0];
    const candidates = LATENT_ABILITY_CANDIDATES[instance.dexId];
    state.awakeningOrbs = 5;
    state.gold = 300_000;
    expect(confirmLatentAwakening(instance, "unknown", candidates, state, null).ok).toBe(false);
    expect(state.awakeningOrbs).toBe(5);
    expect(instance.development.latentAbilityId).toBeNull();
    expect(confirmLatentAwakening(instance, candidates[0].id, candidates, state, null).ok).toBe(true);
    expect(confirmLatentAwakening(instance, candidates[0].id, candidates, state, null)).toEqual({ ok: false, reason: "STALE" });
    expect(state.awakeningOrbs).toBe(4);
    expect(state.gold).toBe(300_000);
  });

  it("旧セーブの個体は再選択待ちではない状態に補完する", () => {
    const state = createInitialState();
    delete (state.monsters[0].development as Partial<typeof state.monsters[0]["development"]>).latentReselectPending;
    expect(normalizeLoadedState(state).monsters[0].development.latentReselectPending).toBe(false);
  });
});
