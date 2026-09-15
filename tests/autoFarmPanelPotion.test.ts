/**
 * 自動周回の設定画面。
 *
 * ここで見張れるのは**計算と、部品が消えていないこと**まで。
 * 重なりと折り返しは実物を見るまで分からないので、巡回で目視する。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { affordableCount, autoFarmPotionProps, formatApproxDuration, usableStaminaForFarm } from "../src/web/views/autoFarmPanel.js";
import { STAMINA_POTION_AMOUNT, createInitialState } from "../src/game/playerState.js";

const panel = readFileSync(new URL("../src/web/views/autoFarmPanel.ts", import.meta.url), "utf8");

describe("「最大」の回数にポーションを数えるか", () => {
  it("OFFなら数えない(押した先で使われないので)", () => {
    expect(usableStaminaForFarm(40, 5, STAMINA_POTION_AMOUNT, false)).toBe(40);
    expect(affordableCount(usableStaminaForFarm(40, 5, STAMINA_POTION_AMOUNT, false), 8)).toBe(5);
  });

  it("ONなら手持ちのポーションぶんまで回せる", () => {
    expect(usableStaminaForFarm(40, 2, STAMINA_POTION_AMOUNT, true)).toBe(240);
    expect(affordableCount(usableStaminaForFarm(40, 2, STAMINA_POTION_AMOUNT, true), 8)).toBe(30);
  });

  it("ONでも0個なら手持ちのスタミナのまま", () => {
    expect(usableStaminaForFarm(40, 0, STAMINA_POTION_AMOUNT, true)).toBe(40);
  });

  it("日次上限のある場所では、ポーションがあっても上限を超えない", () => {
    expect(affordableCount(usableStaminaForFarm(40, 5, STAMINA_POTION_AMOUNT, true), 8, 3)).toBe(3);
  });
});

describe("控えからポーション欄を組み立てる", () => {
  it("既定はOFF・0個", () => {
    const player = createInitialState();
    const props = autoFarmPotionProps(player, () => {});
    expect(props).toMatchObject({ staminaPotions: 0, autoUsePotion: false, staminaPotionAmount: STAMINA_POTION_AMOUNT });
  });

  it("控えの設定と所持数をそのまま映す", () => {
    const player = createInitialState();
    player.staminaPotions = 4;
    player.autoUseStaminaPotionInFarm = true;
    expect(autoFarmPotionProps(player, () => {})).toMatchObject({ staminaPotions: 4, autoUsePotion: true });
  });

  it("欄そのものが無い旧セーブでもOFF・0個として扱う", () => {
    const legacy = createInitialState() as unknown as Record<string, unknown>;
    delete legacy.staminaPotions;
    delete legacy.autoUseStaminaPotionInFarm;
    expect(autoFarmPotionProps(legacy as never, () => {})).toMatchObject({ staminaPotions: 0, autoUsePotion: false });
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
    ["ポーションの自動使用", "スタミナポーションを自動で使う"],
    ["ポーションの所持数", "所持 🧪${props.staminaPotions}個"],
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
