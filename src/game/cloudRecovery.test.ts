import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "./playerState.js";
import { serializeSaveFile } from "./saveFile.js";
import {
  CLOUD_RESTORE_BACKUP_KEY,
  CloudRecoveryError,
  currentSaveEnvelope,
  registerRecovery,
  restoreBeforeCloudRecovery,
  restoreCloudSave,
  uploadCloudSave,
  type CloudRecoveryMeta,
  type CloudSaveEnvelope,
} from "./cloudRecovery.js";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function envelope(): CloudSaveEnvelope {
  return JSON.parse(serializeSaveFile(createInitialState())) as CloudSaveEnvelope;
}

afterEach(() => vi.restoreAllMocks());

describe("cloud recovery", () => {
  it("builds a validated cloud envelope from the existing local save", () => {
    const storage = new MemoryStorage();
    const state = createInitialState();
    storage.setItem("crimon_save_v1", JSON.stringify(state));
    const save = currentSaveEnvelope(storage as unknown as Storage);
    expect(save?.kind).toBe("crimon-save");
    expect(save?.state.monsters.length).toBe(state.monsters.length);
  });

  it("registers without storing the password in returned metadata", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      recoveryId: "testuser",
      recoveryKey: "CRMN-AAAA-BBBB-CCCC-DDDD",
      revision: 1,
      savedAt: "2026-09-01T00:00:00.000Z",
      session: { token: "session-token-abcdefghijklmnopqrstuvwxyz", expiresAt: "2099-01-01T00:00:00.000Z" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await registerRecovery("TestUser", "password123", envelope());
    expect(result.meta.recoveryId).toBe("testuser");
    expect(result.recoveryKey).toContain("CRMN-");
    expect(JSON.stringify(result.meta)).not.toContain("password123");
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.action).toBe("register");
    expect(sent.recoveryId).toBe("testuser");
  });

  it("does not advance local revision when the server rejects a stale revision", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: false, code: "STALE_REVISION" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    }));
    const meta: CloudRecoveryMeta = {
      recoveryId: "testuser",
      sessionToken: "session-token-abcdefghijklmnopqrstuvwxyz",
      sessionExpiresAt: "2099-01-01T00:00:00.000Z",
      revision: 7,
      savedAt: "2026-09-01T00:00:00.000Z",
      lastUploadedSave: "different",
    };
    await expect(uploadCloudSave(meta, envelope())).rejects.toMatchObject<Partial<CloudRecoveryError>>({ code: "STALE_REVISION" });
    expect(meta.revision).toBe(7);
  });

  it("backs up current local data before applying cloud recovery and can roll back", () => {
    const storage = new MemoryStorage();
    const before = createInitialState();
    before.gold = 12345;
    storage.setItem("crimon_save_v1", JSON.stringify(before));

    const cloud = envelope();
    cloud.state.gold = 999;
    restoreCloudSave(cloud, storage as unknown as Storage);
    expect(storage.getItem(CLOUD_RESTORE_BACKUP_KEY)).toBe(JSON.stringify(before));
    expect(JSON.parse(storage.getItem("crimon_save_v1")!).gold).toBe(999);

    expect(restoreBeforeCloudRecovery(storage as unknown as Storage)).toBe(true);
    expect(JSON.parse(storage.getItem("crimon_save_v1")!).gold).toBe(12345);
  });
});
