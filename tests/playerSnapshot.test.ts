import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ uid: vi.fn(), token: vi.fn(), save: vi.fn() }));
vi.mock("../src/net/arenaAuth.js", () => ({ arenaAuthUserId: mocks.uid, arenaAuthAccessToken: mocks.token }));
vi.mock("../src/game/cloudRecovery.js", () => ({ currentSaveEnvelope: mocks.save }));
let values: Map<string, string>;
let send: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T00:00:00Z"));
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "public-key");
  values = new Map();
  vi.stubGlobal("localStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
  mocks.uid.mockReturnValue("existing-user");
  mocks.token.mockResolvedValue("existing-token");
  mocks.save.mockReturnValue({ kind: "crimon-save", state: { monsters: [{}], equipment: [] } });
  send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", send);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("管理用自動保存", () => {
  it("既存IDなしでは認証処理も通信も開始しない", async () => {
    mocks.uid.mockReturnValue(null);
    const { syncAdminSnapshot } = await import("../src/net/playerSnapshot.js");
    await syncAdminSnapshot();
    expect(mocks.token).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it("DB準備前の503は成功時刻を残さず1分後に再試行する", async () => {
    send.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    const { syncAdminSnapshot } = await import("../src/net/playerSnapshot.js");
    await syncAdminSnapshot();
    expect(values.size).toBe(0);
    await syncAdminSnapshot();
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    await syncAdminSnapshot();
    expect(send).toHaveBeenCalledTimes(2);
    expect(values.size).toBe(1);
    vi.advanceTimersByTime(60_000);
    await syncAdminSnapshot();
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("重複呼出しをまとめ、本人IDは送信JSONへ含めない", async () => {
    const { syncAdminSnapshot } = await import("../src/net/playerSnapshot.js");
    await Promise.all([syncAdminSnapshot(), syncAdminSnapshot()]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({ save: mocks.save() });
    expect(send.mock.calls[0][1].headers.Authorization).toBe("Bearer existing-token");
  });
  it("ストレージが使えなくても例外を漏らさない", async () => {
    vi.stubGlobal("localStorage", { getItem() { throw new Error("blocked"); } });
    const { syncAdminSnapshot } = await import("../src/net/playerSnapshot.js");
    await expect(syncAdminSnapshot()).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
  it("認証待機中に本人が変わったら送信を中止する", async () => {
    mocks.token.mockImplementation(async () => { mocks.uid.mockReturnValue("other-user"); return "token"; });
    const { syncAdminSnapshot } = await import("../src/net/playerSnapshot.js");
    await syncAdminSnapshot();
    expect(send).not.toHaveBeenCalled();
  });
});
