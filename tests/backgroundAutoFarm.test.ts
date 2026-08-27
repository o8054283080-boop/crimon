import { describe, expect, it } from "vitest";
import { MAX_OFFLINE_SECONDS, calculateOfflineProgress, createBackgroundFarmJob, finishBackgroundFarm, jstDateKey, parseRequestedRuns, referenceRunSeconds } from "../src/game/backgroundAutoFarm.js";
import { affordableCount } from "../src/web/views/autoFarmPanel.js";

describe("保存型バックグラウンド周回", () => {
  it.each([1, 7, 25, 47, 100])("任意の正整数 %i を受理する", (value) => expect(parseRequestedRuns(value)).toBe(value));
  it.each([7, 47, 100, 123])("固定上限なしで %i 周を保存する", (requestedRuns) => {
    expect(createBackgroundFarmJob({ kind: "STAGE", targetId: "1", targetName: "1", requestedRuns, partyIds: ["a"], now: 0 }).requestedRuns).toBe(requestedRuns);
  });
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

  it("即再起動では1周も進まず、30分/120秒では15周だけ進む", () => {
    const job = createBackgroundFarmJob({ kind: "STAGE", targetId: "1", targetName: "1", requestedRuns: 100, partyIds: ["a"], now: 1_000 });
    expect(calculateOfflineProgress(job, 2_000).availableRuns).toBe(0);
    expect(calculateOfflineProgress(job, 1_000 + 30 * 60_000).availableRuns).toBe(15);
  });

  it("200秒を90秒基準で2周と20秒に分け、次回へ繰り越す", () => {
    const job = createBackgroundFarmJob({ kind: "EQUIP_DUNGEON", targetId: "10", targetName: "10階", requestedRuns: 100, partyIds: ["a"], now: 0 });
    job.referenceRunSeconds = 90;
    const first = calculateOfflineProgress(job, 200_000);
    expect(first).toMatchObject({ availableRuns: 2, carriedSeconds: 20 });
    job.completedRuns = 2; job.lastProcessedAt = 200_000; job.accumulatedOfflineSeconds = first.carriedSeconds;
    expect(calculateOfflineProgress(job, 270_000)).toMatchObject({ availableRuns: 1, carriedSeconds: 0 });
  });

  it("時刻逆行を0、巨大ジャンプを8時間へ制限する", () => {
    const job = createBackgroundFarmJob({ kind: "STAGE", targetId: "1", targetName: "1", requestedRuns: 1000, partyIds: ["a"], now: 10_000 });
    expect(calculateOfflineProgress(job, 0)).toMatchObject({ elapsedSeconds: 0, availableRuns: 0, clockWentBackwards: true });
    const jumped = calculateOfflineProgress(job, 100 * 24 * 60 * 60_000);
    expect(jumped.elapsedSeconds).toBe(MAX_OFFLINE_SECONDS);
    expect(jumped.capped).toBe(true);
  });

  it("希望残数を超えず、直近中央値とコンテンツ別最低時間を使う", () => {
    const job = createBackgroundFarmJob({ kind: "STAGE", targetId: "1", targetName: "1", requestedRuns: 7, partyIds: ["a"], now: 0 });
    job.completedRuns = 6;
    expect(calculateOfflineProgress(job, 3_600_000).availableRuns).toBe(1);
    expect(referenceRunSeconds("STAGE", [5, 90, 100, 110, 500])).toBe(100);
    expect(referenceRunSeconds("EQUIP_DUNGEON", [1])).toBe(90);
  });

  it("JST日付境界を正しく判定できる", () => {
    expect(jstDateKey(Date.parse("2026-08-27T14:59:59Z"))).toBe("2026-08-27");
    expect(jstDateKey(Date.parse("2026-08-27T15:00:00Z"))).toBe("2026-08-28");
  });
});
