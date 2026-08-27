import { describe, expect, it } from "vitest";
import { createBackgroundFarmJob, finishBackgroundFarm, parseRequestedRuns } from "../src/game/backgroundAutoFarm.js";
import { affordableCount } from "../src/web/views/autoFarmPanel.js";

describe("保存型バックグラウンド周回", () => {
  it.each([1, 7, 25, 47, 100])("任意の正整数 %i を受理する", (value) => expect(parseRequestedRuns(value)).toBe(value));
  it.each([0, -1, 1.5, NaN, "", "abc"])("無効値 %s を拒否する", (value) => expect(parseRequestedRuns(value)).toBeNull());
  it("固定30周上限を持たず、資源で実行可能数を示す", () => {
    expect(affordableCount(230, 10)).toBe(23);
    expect(affordableCount(100_000, 10)).toBe(10_000);
    expect(affordableCount(10_000, 10, 3)).toBe(3);
  });
  it("編成スナップショットと進行・集計を保存する", () => {
    const job = createBackgroundFarmJob({ kind: "STAGE", targetId: "1-1", targetName: "ステージ1-1", requestedRuns: 47, partyIds: ["a"], now: 1_700_000_000_000 });
    expect(job).toMatchObject({ requestedRuns: 47, completedRuns: 0, partyIds: ["a"], status: "RUNNING", inFlight: false });
    finishBackgroundFarm(job, "STOPPED");
    expect(job).toMatchObject({ status: "STOPPED", stopReason: "STOPPED" });
  });
});
