import { describe, expect, it } from "vitest";
import { availableBackgroundRuns, createBackgroundFarmJob, dismissFinishedBackgroundFarm, finishBackgroundFarm, parseRequestedRuns } from "../src/game/backgroundAutoFarm.js";
import { addManualClearTime, manualClearKey, medianSeconds, recordManualBattle, referenceRunTime } from "../src/game/manualClearTimes.js";
import { affordableCount } from "../src/web/views/autoFarmPanel.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";

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

describe("実戦時間を基準にした周回速度", () => {
  it("100秒の手動戦闘を100秒の基準にし、初回クリアも保存できる", () => {
    const records = {};
    expect(recordManualBattle(records, manualClearKey("STAGE", "1-1", "NORMAL"), 10_000, 110_000)).toBe(true);
    expect(referenceRunTime(records, "STAGE", "1-1", "NORMAL")).toMatchObject({ seconds: 100, fromManual: true });
  });
  it("直近5件の中央値を使い、6件目で最古を捨てる", () => {
    const records = { key: [] as number[] };
    [20, 95, 100, 104, 160, 98].forEach((value) => addManualClearTime(records, "key", value));
    expect(records.key).toEqual([95, 100, 104, 160, 98]);
    expect(medianSeconds(records.key)).toBe(100);
  });
  it("偶数件は中央2件の平均を使う", () => expect(medianSeconds([90, 100])).toBe(95));
  it("コンテンツ別の最低時間を適用する", () => {
    expect(referenceRunTime({ "stage_1-1_NORMAL": [12] }, "STAGE", "1-1", "NORMAL").seconds).toBe(30);
    expect(referenceRunTime({ equip_10: [20] }, "EQUIP_DUNGEON", "10").seconds).toBe(45);
  });
  it("記録なしは旧固定値へフォールバックする", () => {
    expect(referenceRunTime({}, "STAGE", "1-1", "NORMAL")).toMatchObject({ seconds: 120, fromManual: false });
    expect(referenceRunTime({}, "EQUIP_DUNGEON", "10").seconds).toBe(150);
  });
  it("異常値・時計逆行・10分超を保存しない", () => {
    const records = {};
    for (const value of [0, NaN, Infinity, 601]) expect(addManualClearTime(records, "x", value)).toBe(false);
    expect(recordManualBattle(records, "x", 2_000, 1_000)).toBe(false);
  });
  it("99秒で0周、100秒で1周、200秒で2周（表示中・終了中で同じ計算）", () => {
    const job = createBackgroundFarmJob({ kind: "STAGE", targetId: "1-1", targetName: "1-1", requestedRuns: 10, partyIds: ["a"], referenceRunSeconds: 100, now: 0 });
    expect(availableBackgroundRuns(job, 99_000)).toBe(0);
    expect(availableBackgroundRuns(job, 100_000)).toBe(1);
    expect(availableBackgroundRuns(job, 200_000)).toBe(2);
  });
  it("ジョブ開始時の基準値は後から実戦記録が増えても固定される", () => {
    const records = { "stage_1-1_NORMAL": [100] };
    const first = referenceRunTime(records, "STAGE", "1-1", "NORMAL");
    const job = createBackgroundFarmJob({ kind: "STAGE", targetId: "1-1", targetName: "1-1", requestedRuns: 2, partyIds: ["a"], referenceRunSeconds: first.seconds });
    addManualClearTime(records, "stage_1-1_NORMAL", 40);
    expect(job.referenceRunSeconds).toBe(100);
    expect(referenceRunTime(records, "STAGE", "1-1", "NORMAL").seconds).toBe(70);
  });
  it("実戦記録フィールドのない旧セーブを空の記録としてロードできる", () => {
    const legacy = createInitialState() as unknown as { recentManualClearTimes?: unknown };
    delete legacy.recentManualClearTimes;
    expect(normalizeLoadedState(legacy as never).recentManualClearTimes).toEqual({});
  });
});

describe("completed background farm notification", () => {
  it("dismisses only the job and keeps already awarded resources", () => {
    const job = createBackgroundFarmJob({ kind: "STAGE", targetId: "1-1", targetName: "1-1", requestedRuns: 1, partyIds: [] });
    finishBackgroundFarm(job, "COMPLETED");
    const player = { backgroundFarmJob: job, gold: 1234, diamonds: 56 };
    expect(dismissFinishedBackgroundFarm(player, job.id)).toBe(true);
    expect(player).toEqual({ backgroundFarmJob: null, gold: 1234, diamonds: 56 });
  });

  it.each(["RUNNING", "SETTLING"] as const)("does not dismiss a %s job", (status) => {
    const job = createBackgroundFarmJob({ kind: "STAGE", targetId: "1-1", targetName: "1-1", requestedRuns: 1, partyIds: [] });
    job.status = status;
    const holder = { backgroundFarmJob: job };
    expect(dismissFinishedBackgroundFarm(holder, job.id)).toBe(false);
    expect(holder.backgroundFarmJob).toBe(job);
  });
});
