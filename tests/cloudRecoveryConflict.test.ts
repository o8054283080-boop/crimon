import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudRecoveryError, pendingCloudMeta, envelopeFingerprint, uploadCloudSave, saveConfirmedCloud, cloudRecoveryWarning, CLOUD_RECOVERY_META_KEY, type CloudRecoveryMeta, type CloudSaveEnvelope } from "../src/game/cloudRecovery.js";

const save = (gold: number) => ({ kind: "crimon-save", version: 1, exportedAt: "2026-09-25T00:00:00Z", state: { gold, monsters: [{ id: "one" }], equipment: [] } }) as unknown as CloudSaveEnvelope;
const meta = (): CloudRecoveryMeta => ({ recoveryId: "test", sessionToken: "test-session", sessionExpiresAt: "2099-01-01", revision: 2, savedAt: "2026-09-01", lastUploadedSave: envelopeFingerprint(save(10)), arenaUserId: "original" });
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const stale = () => reply({ ok: false, code: "STALE_REVISION" }, 409);
const latest = (value: CloudSaveEnvelope, revision = 3) => reply({ ok: true, revision, savedAt: "2026-09-25", save: value, arenaUserId: "original" });
afterEach(() => vi.unstubAllGlobals());

describe("保存の応答が届かなかった場合の安全な再開", () => {
  it("同じ内容が既に保存されていれば、JSONBのキー順に依存せず世代だけ受け取る", async () => {
    const remote = save(20);
    remote.state = { equipment: [], monsters: [{ id: "one" }], gold: 20 } as unknown as typeof remote.state;
    const fetch = vi.fn().mockResolvedValueOnce(stale()).mockResolvedValueOnce(latest(remote));
    vi.stubGlobal("fetch", fetch);
    const result = await uploadCloudSave(meta(), save(20), "different");
    expect(result.revision).toBe(3);
    expect(result.arenaUserId).toBe("original");
    expect(result.syncConflict).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("既知の保存内容と一致する場合だけ、確認した世代の次で一度再送する", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(stale()).mockResolvedValueOnce(latest(save(10), 8))
      .mockResolvedValueOnce(reply({ ok: true, revision: 9, savedAt: "2026-09-25" }));
    vi.stubGlobal("fetch", fetch);
    expect((await uploadCloudSave(meta(), save(20))).revision).toBe(9);
    expect(JSON.parse(fetch.mock.calls[2][1].body).revision).toBe(9);
  });
  it("内容の違う別端末の保存には世代を合わせて上書きしない", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(stale()).mockResolvedValueOnce(latest(save(30), 100));
    vi.stubGlobal("fetch", fetch);
    await expect(uploadCloudSave(meta(), save(20))).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(meta().revision).toBe(2);
  });
  it("確認と再送の間に別端末が保存したら再び停止し、再試行を繰り返さない", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(stale()).mockResolvedValueOnce(latest(save(10))).mockResolvedValueOnce(stale());
    vi.stubGlobal("fetch", fetch);
    await expect(uploadCloudSave(meta(), save(20))).rejects.toBeInstanceOf(CloudRecoveryError);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("通信障害は競合と区別し、勝手にloadして世代を変えない", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    await expect(uploadCloudSave(meta(), save(20))).rejects.toThrow("offline");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("前回送信の応答が失われ、その後遊びが進んでいても内容の連続性を確認して再開する", async () => {
    const pending = await pendingCloudMeta(meta(), save(20));
    const fetch = vi.fn().mockResolvedValueOnce(stale()).mockResolvedValueOnce(latest(save(20), 3))
      .mockResolvedValueOnce(reply({ ok: true, revision: 4, savedAt: "2026-09-25" }));
    vi.stubGlobal("fetch", fetch);
    const result = await uploadCloudSave(pending, save(30));
    expect(result.revision).toBe(4);
    expect(result.pendingSaveHash).toBeUndefined();
  });
  it("前回の送信内容とも違う場合は自動で上書きしない", async () => {
    const pending = await pendingCloudMeta(meta(), save(20));
    const fetch = vi.fn().mockResolvedValueOnce(stale()).mockResolvedValueOnce(latest(save(40), 3));
    vi.stubGlobal("fetch", fetch);
    await expect(uploadCloudSave(pending, save(30))).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("本人が選んだデータも確認後の競合は無視しない", async () => {
    const fetch = vi.fn().mockResolvedValue(stale());
    vi.stubGlobal("fetch", fetch);
    await expect(saveConfirmedCloud(meta(), save(20))).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("再起動後もホームに競合を表示する", () => {
    const stored = { ...meta(), syncConflict: true };
    expect(cloudRecoveryWarning({ getItem: key => key === CLOUD_RECOVERY_META_KEY ? JSON.stringify(stored) : null })).toBe("CONFLICT");
  });
});
