import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { vi } from "vitest";
import { dungeonActions, homeTowerSummary, homeUtilityActions } from "../src/web/views/home.js";

const source = readFileSync(new URL("../src/web/views/home.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");

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
  it("orders brand, party, primary, management, secondary and compact missions", () => {
    const selectors = ["crimon-resource-header", "crimon-brand", "home-party crimon-section", "crimon-section crimon-section--primary", "crimon-section crimon-section--management", "crimon-section crimon-section--secondary"];
    const positions = selectors.map((selector) => source.indexOf(`className: \"${selector}`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(source.indexOf("crimon-section--secondary")).toBeLessThan(source.indexOf("tutorialCompact,"));
    expect(source).not.toContain('className: "crimon-hero"');
  });

  it("uses the required three primary artwork variants and four utility actions", () => {
    for (const variant of ["adventure", "dungeon", "arena"]) {
      expect(source).toContain(`\"${variant}\"`);
    }
    expect(source).toContain("props.onGoStages");
    expect(source).toContain('roundMenu("試練の塔"');
    expect(source).toContain('roundMenu("初心者"');
    expect(source).toContain("props.onGoMonsterDex");
    expect(source).toContain('roundMenu("遊び方"');
  });

  it("keeps the mission detail panel closed until an explicit compact-row action", () => {
    expect(source).toContain('className: "crimon-tutorial-panel", hidden: true');
    expect(source).toContain("tutorialPanel.hidden = false");
    expect(source).toContain("tutorialPanel.hidden = true");
    expect(source).toContain("crimon-tutorial-panel__scrim");
    expect(mainSource).toContain('state.screen === "HOME" ? null : buildTutorialFloatingPanel()');
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
