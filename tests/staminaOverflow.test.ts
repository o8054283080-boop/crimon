import { describe, expect, it } from "vitest";
import { requiredExpForFighterLevel } from "../src/core/fighterLevel.js";
import {
  STAMINA_REFILL_PARTIAL_AMOUNT,
  STAMINA_REFILL_PARTIAL_COST,
  addFighterExp,
  applyPassiveStaminaRegen,
  createInitialState,
  normalizeLoadedState,
  tryRefillStaminaPartial,
} from "../src/game/playerState.js";

describe("上限超過スタミナ", () => {
  it("配布などで上限を超えたスタミナを再読込で切り捨てない", () => {
    const player = createInitialState();
    player.stamina = player.maxStamina + 300;

    const reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(player)));

    expect(reloaded.stamina).toBe(player.maxStamina + 300);
    expect(reloaded.maxStamina).toBe(player.maxStamina);
  });

  it("ダイヤの+100回復は上限をまたいでも固定量を全部加算する", () => {
    const player = createInitialState();
    player.stamina = player.maxStamina - 30;
    const beforeCrystal = player.crystal;

    expect(tryRefillStaminaPartial(player)).toEqual({ ok: true });
    expect(player.stamina).toBe(player.maxStamina - 30 + STAMINA_REFILL_PARTIAL_AMOUNT);
    expect(player.crystal).toBe(beforeCrystal - STAMINA_REFILL_PARTIAL_COST);
  });

  it("すでに上限超過中でも+100回復を追加購入できる", () => {
    const player = createInitialState();
    player.stamina = player.maxStamina + 300;

    expect(tryRefillStaminaPartial(player)).toEqual({ ok: true });
    expect(player.stamina).toBe(player.maxStamina + 300 + STAMINA_REFILL_PARTIAL_AMOUNT);
  });

  it("上限超過中は自然回復せず、超過分も減らさない", () => {
    const player = createInitialState();
    player.stamina = player.maxStamina + 300;
    player.lastStaminaUpdateAt = 0;

    applyPassiveStaminaRegen(player, 60 * 60 * 1000);

    expect(player.stamina).toBe(player.maxStamina + 300);
  });

  it("レベルアップ全回復で既存の超過スタミナを削らない", () => {
    const player = createInitialState();
    player.stamina = player.maxStamina + 300;
    const before = player.stamina;

    addFighterExp(player, requiredExpForFighterLevel(player.fighterLevel));

    expect(player.fighterLevel).toBe(2);
    expect(player.stamina).toBe(before);
  });
});
