/**
 * 自動周回の設定画面。
 *
 * ここで見張れるのは**計算と、部品が消えていないこと**まで。
 * 重なりと折り返しは実物を見るまで分からないので、巡回で目視する。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { affordableCount, autoFarmPotionProps, formatApproxDuration, usableStaminaForFarm } from "../src/web/views/autoFarmPanel.js";
import {
  STAMINA_POTION_AMOUNT,
  STAMINA_POTION_BUDGET_CHOICES,
  STAMINA_POTION_UNLIMITED_BUDGET,
  createInitialState,
  normalizeLoadedState,
  staminaPotionBudgetLabel,
} from "../src/game/playerState.js";

const panel = readFileSync(new URL("../src/web/views/autoFarmPanel.ts", import.meta.url), "utf8");

describe("「最大」の回数にポーションを数えるか", () => {
  it("0個までなら数えない(押した先で使われないので)", () => {
    expect(usableStaminaForFarm(40, 5, STAMINA_POTION_AMOUNT, 0)).toBe(40);
    expect(affordableCount(usableStaminaForFarm(40, 5, STAMINA_POTION_AMOUNT, 0), 8)).toBe(5);
  });

  it("決めた数までしか数えない", () => {
    // 5個持っていても「3個まで」なら3個ぶん
    expect(usableStaminaForFarm(40, 5, STAMINA_POTION_AMOUNT, 3)).toBe(340);
    expect(affordableCount(usableStaminaForFarm(40, 5, STAMINA_POTION_AMOUNT, 3), 8)).toBe(42);
  });

  it("持っている数より多く決めても、手持ちまで", () => {
    // 「10個まで」でも2個しか無ければ2個ぶん
    expect(usableStaminaForFarm(40, 2, STAMINA_POTION_AMOUNT, 10)).toBe(240);
  });

  it("「全部」なら手持ちのポーションぶんまで回せる", () => {
    expect(usableStaminaForFarm(40, 2, STAMINA_POTION_AMOUNT, STAMINA_POTION_UNLIMITED_BUDGET)).toBe(240);
    expect(affordableCount(usableStaminaForFarm(40, 2, STAMINA_POTION_AMOUNT, STAMINA_POTION_UNLIMITED_BUDGET), 8)).toBe(30);
  });

  it("使う設定でも0個なら手持ちのスタミナのまま", () => {
    expect(usableStaminaForFarm(40, 0, STAMINA_POTION_AMOUNT, STAMINA_POTION_UNLIMITED_BUDGET)).toBe(40);
  });

  it("日次上限のある場所では、ポーションがあっても上限を超えない", () => {
    expect(affordableCount(usableStaminaForFarm(40, 5, STAMINA_POTION_AMOUNT, STAMINA_POTION_UNLIMITED_BUDGET), 8, 3)).toBe(3);
  });
});

describe("上限の札", () => {
  it("使わない / 1 / 3 / 5 / 10 / 全部 の6段", () => {
    expect(STAMINA_POTION_BUDGET_CHOICES.map(staminaPotionBudgetLabel))
      .toEqual(["使わない", "1個", "3個", "5個", "10個", "全部"]);
  });

  it("「全部」の中身が画面へ漏れない(MAX_SAFE_INTEGERを出さない)", () => {
    expect(staminaPotionBudgetLabel(STAMINA_POTION_UNLIMITED_BUDGET)).toBe("全部");
    expect(staminaPotionBudgetLabel(STAMINA_POTION_UNLIMITED_BUDGET)).not.toContain("9007");
  });

  it("先頭は必ず「使わない」(既定が誤って使う側にならない)", () => {
    expect(STAMINA_POTION_BUDGET_CHOICES[0]).toBe(0);
  });
});

describe("控えからポーション欄を組み立てる", () => {
  it("既定は使わない・0個", () => {
    const player = createInitialState();
    const props = autoFarmPotionProps(player, () => {});
    expect(props).toMatchObject({ staminaPotions: 0, staminaPotionBudget: 0, staminaPotionAmount: STAMINA_POTION_AMOUNT });
  });

  it("控えの設定と所持数をそのまま映す", () => {
    const player = createInitialState();
    player.staminaPotions = 4;
    player.staminaPotionFarmBudget = 3;
    expect(autoFarmPotionProps(player, () => {})).toMatchObject({ staminaPotions: 4, staminaPotionBudget: 3 });
  });

  it("欄そのものが無い旧セーブでも使わない・0個として扱う", () => {
    const legacy = createInitialState() as unknown as Record<string, unknown>;
    delete legacy.staminaPotions;
    delete legacy.staminaPotionFarmBudget;
    expect(autoFarmPotionProps(legacy as never, () => {})).toMatchObject({ staminaPotions: 0, staminaPotionBudget: 0 });
  });
});

/*
 * **入 / 切からの引き継ぎ。**
 *
 * 入にしていた人は「持っている分は全部」で回っていた。更新した途端に
 * 「使わない」へ落ちると、周回が途中で止まるようになる。
 */
describe("旧セーブ(入 / 切)からの引き継ぎ", () => {
  it("入だった人は「全部」になる", () => {
    const legacy = createInitialState() as unknown as Record<string, unknown>;
    delete legacy.staminaPotionFarmBudget;
    legacy.autoUseStaminaPotionInFarm = true;
    const loaded = normalizeLoadedState(legacy as never);
    expect(loaded.staminaPotionFarmBudget).toBe(STAMINA_POTION_UNLIMITED_BUDGET);
  });

  it("切だった人は「使わない」のまま", () => {
    const legacy = createInitialState() as unknown as Record<string, unknown>;
    delete legacy.staminaPotionFarmBudget;
    legacy.autoUseStaminaPotionInFarm = false;
    expect(normalizeLoadedState(legacy as never).staminaPotionFarmBudget).toBe(0);
  });

  it("引き継いだら古い欄は落とす(2つの設定が食い違わないように)", () => {
    const legacy = createInitialState() as unknown as Record<string, unknown>;
    delete legacy.staminaPotionFarmBudget;
    legacy.autoUseStaminaPotionInFarm = true;
    const loaded = normalizeLoadedState(legacy as never) as unknown as Record<string, unknown>;
    expect("autoUseStaminaPotionInFarm" in loaded).toBe(false);
  });

  it("新しい欄があれば、そちらが勝つ", () => {
    const player = createInitialState() as unknown as Record<string, unknown>;
    player.staminaPotionFarmBudget = 5;
    player.autoUseStaminaPotionInFarm = true;
    expect(normalizeLoadedState(player as never).staminaPotionFarmBudget).toBe(5);
  });

  it.each([-3, NaN, "5" as unknown as number])("壊れた上限 %s は0として扱う", (value) => {
    const broken = createInitialState() as unknown as Record<string, unknown>;
    broken.staminaPotionFarmBudget = value;
    expect(normalizeLoadedState(broken as never).staminaPotionFarmBudget).toBe(0);
  });
});

describe("設定画面に出ているもの", () => {
  it.each([
    ["1周の秒数", "1周 約"],
    ["予想完了時間", "予想完了時間 約"],
    ["実戦記録か標準時間か", "実戦記録から算出"],
    ["最近のクリア時間", "最近のクリア"],
    ["必要スタミナ", "⚡${totalCost}"],
    ["希望する周回回数", "希望する周回回数"],
    ["ポーションを使う設定", "スタミナポーションを使う"],
    ["ポーションの所持数", "所持 🧪${props.staminaPotions}"],
    ["使う数の説明", "決めた数まで使います"],
  ])("%s が出ている", (_name, needle) => expect(panel).toContain(needle));

  it("ダイヤを自動で使わないと明記してある", () => {
    expect(panel).toContain("ダイヤによる自動回復は行いません");
  });

  it("秒と分を読める形にする", () => {
    expect(formatApproxDuration(3)).toBe("3秒");
    expect(formatApproxDuration(90)).toBe("1分30秒");
    expect(formatApproxDuration(120)).toBe("2分");
  });
});
