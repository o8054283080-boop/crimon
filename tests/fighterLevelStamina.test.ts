import { describe, expect, it } from "vitest";
import {
  DUNGEON_STAMINA_COST,
  INITIAL_MAX_STAMINA,
  MAX_FIGHTER_LEVEL,
  STAGE_STAMINA_COST,
  maxStaminaForFighterLevel,
  requiredExpForFighterLevel,
} from "../src/core/fighterLevel.js";
import {
  addFighterExp,
  applyPassiveStaminaRegen,
  createInitialState,
  STAMINA_REFILL_FULL_COST,
  STAMINA_REFILL_PARTIAL_AMOUNT,
  STAMINA_REFILL_PARTIAL_COST,
  STAMINA_REGEN_INTERVAL_MINUTES,
  tryRefillStaminaFull,
  tryRefillStaminaPartial,
  trySpendStamina,
} from "../src/game/playerState.js";

describe("ファイターレベル・スタミナの初期状態", () => {
  it("初期スタミナは150、ファイターレベルは1", () => {
    const state = createInitialState();
    expect(state.fighterLevel).toBe(1);
    expect(state.stamina).toBe(150);
    expect(state.maxStamina).toBe(150);
    expect(state.stamina).toBe(INITIAL_MAX_STAMINA);
  });
});

describe("スタミナ消費 (trySpendStamina)", () => {
  it("通常ステージは5、装備ダンジョンは10消費できる", () => {
    const state = createInitialState();
    expect(trySpendStamina(state, STAGE_STAMINA_COST).ok).toBe(true);
    expect(state.stamina).toBe(150 - 5);
    expect(trySpendStamina(state, DUNGEON_STAMINA_COST).ok).toBe(true);
    expect(state.stamina).toBe(150 - 5 - 10);
  });

  it("スタミナが足りない場合は消費されず失敗する", () => {
    const state = createInitialState();
    state.stamina = 3;
    const result = trySpendStamina(state, STAGE_STAMINA_COST);
    expect(result.ok).toBe(false);
    expect(state.stamina).toBe(3);
  });
});

describe("ダイヤでのスタミナ回復 (tryRefillStaminaPartial / tryRefillStaminaFull)", () => {
  it("ダイヤ50を消費してスタミナが100回復する", () => {
    const state = createInitialState();
    state.stamina = 20;
    state.crystal = 100;
    const result = tryRefillStaminaPartial(state);
    expect(result.ok).toBe(true);
    expect(state.stamina).toBe(20 + STAMINA_REFILL_PARTIAL_AMOUNT);
    expect(state.crystal).toBe(100 - STAMINA_REFILL_PARTIAL_COST);
  });

  it("上限を超える分は切り捨てられる", () => {
    const state = createInitialState();
    state.stamina = state.maxStamina - 30;
    state.crystal = 100;
    tryRefillStaminaPartial(state);
    expect(state.stamina).toBe(state.maxStamina);
  });

  it("ダイヤが足りない場合は消費されず失敗する", () => {
    const state = createInitialState();
    state.stamina = 20;
    state.crystal = STAMINA_REFILL_PARTIAL_COST - 1;
    const result = tryRefillStaminaPartial(state);
    expect(result.ok).toBe(false);
    expect(state.stamina).toBe(20);
    expect(state.crystal).toBe(STAMINA_REFILL_PARTIAL_COST - 1);
  });

  it("スタミナが満タンの場合は実行できない(ダイヤを無駄にしない)", () => {
    const state = createInitialState();
    state.crystal = 1000;
    expect(state.stamina).toBe(state.maxStamina);
    const result = tryRefillStaminaPartial(state);
    expect(result.ok).toBe(false);
    expect(state.crystal).toBe(1000);
  });

  it("ダイヤ200を消費してスタミナが全回復する", () => {
    const state = createInitialState();
    state.stamina = 1;
    state.crystal = 500;
    const result = tryRefillStaminaFull(state);
    expect(result.ok).toBe(true);
    expect(state.stamina).toBe(state.maxStamina);
    expect(state.crystal).toBe(500 - STAMINA_REFILL_FULL_COST);
  });

  it("全回復もダイヤが足りない場合は失敗する", () => {
    const state = createInitialState();
    state.stamina = 1;
    state.crystal = STAMINA_REFILL_FULL_COST - 1;
    const result = tryRefillStaminaFull(state);
    expect(result.ok).toBe(false);
    expect(state.stamina).toBe(1);
  });
});

describe("ファイター経験値とレベルアップ (addFighterExp)", () => {
  it("必要経験値を満たすとレベルが上がり、スタミナが全回復・上限が+10される", () => {
    const state = createInitialState();
    state.stamina = 10; // 減っている状態から検証する
    const needed = requiredExpForFighterLevel(1);

    const result = addFighterExp(state, needed);

    expect(result.levelsGained).toBe(1);
    expect(state.fighterLevel).toBe(2);
    expect(state.maxStamina).toBe(maxStaminaForFighterLevel(2));
    expect(state.maxStamina).toBe(160);
    expect(state.stamina).toBe(state.maxStamina); // 全回復
  });

  it("大量に経験値を得ると複数レベル一気に上がる", () => {
    const state = createInitialState();
    let hugeExp = 0;
    for (let lvl = 1; lvl <= 5; lvl++) hugeExp += requiredExpForFighterLevel(lvl);

    const result = addFighterExp(state, hugeExp);

    expect(result.levelsGained).toBe(5);
    expect(state.fighterLevel).toBe(6);
  });

  it("ファイターレベルの上限は30", () => {
    const state = createInitialState();
    addFighterExp(state, 10_000_000);
    expect(state.fighterLevel).toBe(MAX_FIGHTER_LEVEL);
    expect(state.fighterLevel).toBe(30);
  });

  it("上限到達後はそれ以上レベルが上がらない", () => {
    const state = createInitialState();
    state.fighterLevel = MAX_FIGHTER_LEVEL;
    const result = addFighterExp(state, 999_999);
    expect(result.levelsGained).toBe(0);
    expect(state.fighterLevel).toBe(MAX_FIGHTER_LEVEL);
  });
});

describe("スタミナの自然回復 (applyPassiveStaminaRegen)", () => {
  it("規定の間隔が経過するとスタミナが1回復する", () => {
    const state = createInitialState();
    state.stamina = 100;
    const start = Date.now();
    state.lastStaminaUpdateAt = start;

    applyPassiveStaminaRegen(state, start + STAMINA_REGEN_INTERVAL_MINUTES * 60_000);

    expect(state.stamina).toBe(101);
  });

  it("複数間隔分が経過していればまとめて回復する", () => {
    const state = createInitialState();
    state.stamina = 100;
    const start = Date.now();
    state.lastStaminaUpdateAt = start;

    applyPassiveStaminaRegen(state, start + STAMINA_REGEN_INTERVAL_MINUTES * 60_000 * 7.9);

    expect(state.stamina).toBe(107);
  });

  it("上限を超えて回復しない", () => {
    const state = createInitialState();
    state.stamina = state.maxStamina - 1;
    const start = Date.now();
    state.lastStaminaUpdateAt = start;

    applyPassiveStaminaRegen(state, start + STAMINA_REGEN_INTERVAL_MINUTES * 60_000 * 100);

    expect(state.stamina).toBe(state.maxStamina);
  });

  it("既に満タンなら基準時刻だけ更新され増えない", () => {
    const state = createInitialState();
    const start = Date.now();
    state.lastStaminaUpdateAt = start - 1_000_000;

    applyPassiveStaminaRegen(state, start);

    expect(state.stamina).toBe(state.maxStamina);
    expect(state.lastStaminaUpdateAt).toBe(start);
  });
});
