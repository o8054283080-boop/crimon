import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { vi } from "vitest";
import { dungeonActions, homeTowerSummary, homeUtilityActions } from "../src/web/views/home.js";

const source = readFileSync(new URL("../src/web/views/home.ts", import.meta.url), "utf8");

describe("redesigned CRIMON home tower summary", () => {
  it("uses real best and in-progress floor data", () => {
    expect(homeTowerSummary({ trialTowerBestFloor: 37, trialTowerRun: { floor: 42, members: [] } })).toEqual({ bestFloor: 37, floor: 42, progress: 37, isRunning: true });
  });
  it("normalizes old or malformed saves to a safe 0–100 range", () => {
    expect(homeTowerSummary({ trialTowerBestFloor: undefined as unknown as number, trialTowerRun: undefined as never })).toEqual({ bestFloor: 0, floor: 1, progress: 0, isRunning: false });
    expect(homeTowerSummary({ trialTowerBestFloor: 999, trialTowerRun: { floor: -8, members: [] } })).toEqual({ bestFloor: 100, floor: 1, progress: 100, isRunning: true });
  });
});

describe("Task D home information architecture", () => {
  it("orders brand, party, primary, management, secondary and missions", () => {
    const selectors = ["crimon-resource-header", "crimon-brand", "home-party crimon-section", "crimon-section crimon-section--primary", "crimon-section crimon-section--management", "crimon-section crimon-section--secondary"];
    const positions = selectors.map((selector) => source.indexOf(`className: \"${selector}`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(source.indexOf("crimon-section--secondary")).toBeLessThan(source.indexOf("tutorial,"));
    expect(source).not.toContain('className: "crimon-hero"');
  });

  it("uses the required primary and management variants", () => {
    for (const variant of ["adventure", "dungeon", "arena", "monster", "equipment", "summon", "shop"]) {
      expect(source).toContain(`\"${variant}\"`);
    }
    expect(source).toContain("props.onGoStages");
    expect(source).toContain("props.onGoMonsters");
    expect(source).toContain("props.onGoEquipment");
    expect(source).toContain("props.onGoSummon");
    expect(source).toContain("props.onGoMonsterDex");
  });

  it("preserves all dungeon chooser callbacks", () => {
    const callbacks = [vi.fn(), vi.fn(), vi.fn()] as const;
    dungeonActions({ onGoEquipDungeon: callbacks[0], onGoLevelDungeon: callbacks[1], onGoGoldDungeon: callbacks[2] }).forEach((action) => action());
    callbacks.forEach((callback) => expect(callback).toHaveBeenCalledOnce());
    expect(source).toContain("dungeonChooser.hidden = !dungeonChooser.hidden");
  });

  it("preserves arena, shop and help callbacks", () => {
    const callbacks = [vi.fn(), vi.fn(), vi.fn()] as const;
    homeUtilityActions({ onGoArena: callbacks[0], onGoShop: callbacks[1], onGoHowToPlay: callbacks[2] }).forEach((action) => action());
    callbacks.forEach((callback) => expect(callback).toHaveBeenCalledOnce());
  });
});
