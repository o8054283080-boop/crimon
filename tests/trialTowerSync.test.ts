import { afterEach, describe, expect, it, vi } from "vitest";
import { configureArenaSync, setArenaSyncAccessToken } from "../src/net/arenaSync.js";
import {
  fetchTrialTowerRanking,
  fetchTrialTowerSelf,
  submitTrialTowerProgress,
} from "../src/net/trialTowerSync.js";

function connect(fetchImpl: typeof fetch): void {
  configureArenaSync({ url: "https://example.test", anonKey: "anon-key", accessToken: "player-token", fetchImpl, timeoutMs: 50 });
}

function response(payload: unknown, ok = true): Response {
  return { ok, json: async () => payload } as Response;
}

const row = {
  rank: 1,
  user_id: "user-a",
  display_name: "PLAYER-A",
  best_floor: 100,
  best_floor_reached_at: "2026-09-04T01:00:00Z",
  updated_at: "2026-09-04T01:00:00Z",
};

afterEach(() => {
  setArenaSyncAccessToken(null);
  configureArenaSync(null);
});

describe("試練の塔ランキング同期", () => {
  it("未接続・通信失敗でも例外を出さない", async () => {
    configureArenaSync(null);
    await expect(submitTrialTowerProgress(74)).resolves.toBeNull();
    await expect(fetchTrialTowerRanking()).resolves.toEqual({ ok: false, entries: [] });
    await expect(fetchTrialTowerSelf("user-a")).resolves.toBeNull();

    connect(vi.fn(async () => { throw new Error("offline"); }) as typeof fetch);
    await expect(submitTrialTowerProgress(74)).resolves.toBeNull();
    await expect(fetchTrialTowerRanking()).resolves.toEqual({ ok: false, entries: [] });
  });

  it("最高階だけを認証済みRPCへ送る", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response({
      ok: true,
      updated: true,
      bestFloor: 74,
      bestFloorReachedAt: "2026-09-04T01:00:00Z",
      updatedAt: "2026-09-04T01:00:00Z",
    }));
    connect(fetchImpl as typeof fetch);
    await expect(submitTrialTowerProgress(74)).resolves.toMatchObject({ ok: true, updated: true, bestFloor: 74 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example.test/rest/v1/rpc/trial_tower_submit_progress");
    expect(JSON.parse(String(options?.body))).toEqual({ p_best_floor: 74 });
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer player-token");
  });

  it("1〜100以外は送らない", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response([]));
    connect(fetchImpl as typeof fetch);
    for (const floor of [0, 101, 7.5, Number.NaN]) await expect(submitTrialTowerProgress(floor)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("正常な空ランキングと取得失敗を区別する", async () => {
    connect(vi.fn(async () => response([])) as typeof fetch);
    await expect(fetchTrialTowerRanking()).resolves.toEqual({ ok: true, entries: [] });
    connect(vi.fn(async () => response({ error: "failed" }, false)) as typeof fetch);
    await expect(fetchTrialTowerRanking()).resolves.toEqual({ ok: false, entries: [] });
  });

  it("100F CLEARを含む行を安全に読み、自分の行を絞り込む", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response([row]));
    connect(fetchImpl as typeof fetch);
    const ranking = await fetchTrialTowerRanking();
    expect(ranking).toEqual({ ok: true, entries: [{
      rank: 1,
      userId: "user-a",
      name: "PLAYER-A",
      bestFloor: 100,
      bestFloorReachedAt: "2026-09-04T01:00:00Z",
      updatedAt: "2026-09-04T01:00:00Z",
    }] });
    await expect(fetchTrialTowerSelf("user-a")).resolves.toMatchObject({ rank: 1, userId: "user-a", bestFloor: 100 });
    const selfUrl = String(fetchImpl.mock.calls[1][0]);
    expect(selfUrl).toContain("user_id=eq.user-a");
  });

  it("壊れた行は捨て、画面を落とさない", async () => {
    connect(vi.fn(async () => response([row, null, { ...row, user_id: "" }, { ...row, best_floor_reached_at: "bad" }])) as typeof fetch);
    const ranking = await fetchTrialTowerRanking();
    expect(ranking.ok).toBe(true);
    expect(ranking.entries).toHaveLength(1);
  });
});
