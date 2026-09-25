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
  it("内容の違う別端末の保存には世代を合わせて上書きせず、この端末の最新データを別のバックアップとして控える", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(stale()).mockResolvedValueOnce(latest(save(30), 100))
      .mockResolvedValueOnce(reply({ ok: true, savedAt: "2026-09-25T06:00:00Z" }));
    vi.stubGlobal("fetch", fetch);
    const result = await uploadCloudSave(meta(), save(20));
    expect(fetch).toHaveBeenCalledTimes(3);
    const body = JSON.parse(fetch.mock.calls[2][1].body);
    // 本来のバックアップ(save)ではなく、別の控え(save_copy)へ送る
    expect(body.action).toBe("save_copy");
    expect(body.save.state.gold).toBe(20);
    expect(body.deviceId).toMatch(/^[a-z0-9-]{8,64}$/);
    // 世代も既知の保存内容も進めない(次の自動保存が別端末の続きを上書きしないため)
    expect(result.revision).toBe(2);
    expect(result.lastUploadedSave).toBe(meta().lastUploadedSave);
    expect(result.syncConflict).toBe(true);
    expect(result.conflictCopySavedAt).toBe("2026-09-25T06:00:00Z");
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
  it("前回の送信内容とも違う場合は上書きせず、別のバックアップとして控える", async () => {
    const pending = await pendingCloudMeta(meta(), save(20));
    const fetch = vi.fn().mockResolvedValueOnce(stale()).mockResolvedValueOnce(latest(save(40), 3))
      .mockResolvedValueOnce(reply({ ok: true, savedAt: "2026-09-25T06:00:00Z" }));
    vi.stubGlobal("fetch", fetch);
    const result = await uploadCloudSave(pending, save(30));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetch.mock.calls[2][1].body).action).toBe("save_copy");
    expect(result.revision).toBe(2);
    expect(result.syncConflict).toBe(true);
  });
  it("競合している間は本来のバックアップへ書きに行かず、控えを更新し続ける", async () => {
    const conflicted: CloudRecoveryMeta = { ...meta(), syncConflict: true, deviceCopyId: "0123456789abcdef", conflictCopySavedAt: "2026-09-25T06:00:00Z", conflictCopyFingerprint: envelopeFingerprint(save(20)) };
    const fetch = vi.fn().mockResolvedValueOnce(latest(save(40), 5))
      .mockResolvedValueOnce(reply({ ok: true, savedAt: "2026-09-25T07:00:00Z" }));
    vi.stubGlobal("fetch", fetch);
    const result = await uploadCloudSave(conflicted, save(25));
    const actions = fetch.mock.calls.map((call) => JSON.parse(call[1].body).action);
    expect(actions).toEqual(["load", "save_copy"]);
    // 同じ端末は同じ控えの行を上書きする
    expect(JSON.parse(fetch.mock.calls[1][1].body).deviceId).toBe("0123456789abcdef");
    expect(result.revision).toBe(2);
    expect(result.conflictCopySavedAt).toBe("2026-09-25T07:00:00Z");
  });
  it("競合中でも、端末の内容が変わっていなければ控えを送り直さない", async () => {
    const conflicted: CloudRecoveryMeta = { ...meta(), syncConflict: true, deviceCopyId: "0123456789abcdef", conflictCopySavedAt: "2026-09-25T06:00:00Z", conflictCopyFingerprint: envelopeFingerprint(save(25)) };
    const fetch = vi.fn().mockResolvedValueOnce(latest(save(40), 5));
    vi.stubGlobal("fetch", fetch);
    const result = await uploadCloudSave(conflicted, save(25));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.syncConflict).toBe(true);
  });
  it("クラウドがこの端末と同じ内容になっていれば、競合を解いて控えの記録を消す", async () => {
    const conflicted: CloudRecoveryMeta = { ...meta(), syncConflict: true, deviceCopyId: "0123456789abcdef", conflictCopySavedAt: "2026-09-25T06:00:00Z" };
    const fetch = vi.fn().mockResolvedValueOnce(latest(save(25), 6));
    vi.stubGlobal("fetch", fetch);
    const result = await uploadCloudSave(conflicted, save(25));
    expect(result.syncConflict).toBe(false);
    expect(result.revision).toBe(6);
    expect(result.conflictCopySavedAt).toBeUndefined();
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
