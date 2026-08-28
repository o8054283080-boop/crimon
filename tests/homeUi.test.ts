import { describe, expect, it } from "vitest";
import { homeTowerSummary } from "../src/web/views/home.js";

describe("redesigned CRIMON home tower summary", () => {
  it("uses real best and in-progress floor data", () => {
    expect(homeTowerSummary({ trialTowerBestFloor: 37, trialTowerRun: { floor: 42, members: [] } })).toEqual({ bestFloor: 37, floor: 42, progress: 37, isRunning: true });
  });
  it("normalizes old or malformed saves to a safe 0–100 range", () => {
    expect(homeTowerSummary({ trialTowerBestFloor: undefined as unknown as number, trialTowerRun: undefined as never })).toEqual({ bestFloor: 0, floor: 1, progress: 0, isRunning: false });
    expect(homeTowerSummary({ trialTowerBestFloor: 999, trialTowerRun: { floor: -8, members: [] } })).toEqual({ bestFloor: 100, floor: 1, progress: 100, isRunning: true });
  });
});
