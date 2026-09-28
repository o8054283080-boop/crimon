import { afterEach, describe, expect, it } from "vitest";
import { addMonster, createInitialState, lastSaveFailure, savePlayerState } from "../src/game/playerState.js";
import { readStartupBackup, takeStartupBackup } from "../src/game/saveDurability.js";
import { encodeSave } from "../src/game/saveCodec.js";
import { serializeSaveFile } from "../src/game/saveFile.js";
import {
  CLOUD_RESTORE_BACKUP_KEY,
  STARTUP_BACKUP_AT_KEY,
  STARTUP_BACKUP_KEY,
} from "../src/game/disposableStorage.js";
import { CLOUD_RESTORE_BACKUP_KEY as CLOUD_KEY_FROM_RECOVERY } from "../src/game/cloudRecovery.js";

/**
 * 控えが本体の保存を邪魔しない。
 *
 * 依頼主の端末で「データを保存できていません(いまのセーブは344KB)」が出て、
 * 保管所へ預けても元に戻されていた。起動時の控えを**縮めていない整形JSON**で
 * 置いていたため、本体の約14倍(5MB近く)になり、Safari の保存領域
 * (1サイト5MB前後)を控えだけで使い切っていた。
 */

const KEY = "crimon_save_v1";

/** 文字数の合計で上限を持つ localStorage の代役 */
function installQuotaStorage(limit: number): Map<string, string> {
  const data = new Map<string, string>();
  const used = (): number => [...data].reduce((sum, [k, v]) => sum + k.length + v.length, 0);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const before = data.get(k);
      const next = used() - (before === undefined ? 0 : k.length + before.length) + k.length + v.length;
      if (next > limit) throw new DOMException("quota", "QuotaExceededError");
      data.set(k, v);
    },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => { data.clear(); },
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
  return data;
}

function bigState() {
  const state = createInitialState();
  for (let i = 0; i < 400; i += 1) addMonster(state, "slime_FIRE", 3, 1);
  return state;
}

afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

describe("起動時の控え", () => {
  it("本体と同じ縮めた形で置く(整形JSONの何倍にもしない)", () => {
    const data = installQuotaStorage(Number.POSITIVE_INFINITY);
    const state = bigState();
    takeStartupBackup(state);
    const backup = data.get(STARTUP_BACKUP_KEY)!;
    expect(backup.length).toBe(encodeSave(state).length);
    expect(backup.length * 5).toBeLessThan(serializeSaveFile(state).length);
  });

  it("縮めた控えも、昔の整形JSONの控えも読める", () => {
    const data = installQuotaStorage(Number.POSITIVE_INFINITY);
    const state = bigState();
    takeStartupBackup(state);
    expect(readStartupBackup()?.state.monsters).toHaveLength(state.monsters.length);

    data.set(STARTUP_BACKUP_KEY, serializeSaveFile(state));
    expect(readStartupBackup()?.state.monsters).toHaveLength(state.monsters.length);
  });

  it("入らない時は、古い控えを居座らせない", () => {
    const data = installQuotaStorage(10);
    data.set(STARTUP_BACKUP_KEY, "x".repeat(5));
    data.set(STARTUP_BACKUP_AT_KEY, "old");
    takeStartupBackup(bigState());
    expect(data.has(STARTUP_BACKUP_KEY)).toBe(false);
    expect(data.has(STARTUP_BACKUP_AT_KEY)).toBe(false);
  });
});

describe("保存領域が一杯の時は、控えを捨ててでも本体を書く", () => {
  it("昔の巨大な控えが居座っていても、本体の保存は通る", () => {
    const state = bigState();
    const packed = encodeSave(state).length;
    const legacyBackup = serializeSaveFile(state);
    // 本体と昔の控えは同時に入らないが、本体だけなら入る広さ
    const data = installQuotaStorage(packed + legacyBackup.length / 2);
    data.set(STARTUP_BACKUP_KEY, legacyBackup);
    expect(savePlayerState(state)).toBe(true);
    expect(lastSaveFailure()).toBeNull();
    expect(data.get(KEY)).toBe(encodeSave(state));
    expect(data.has(STARTUP_BACKUP_KEY)).toBe(false);
  });

  it("起動時の控えを先に捨て、それで足りればクラウド復元前の控えは残す", () => {
    const state = bigState();
    const packed = encodeSave(state).length;
    const data = installQuotaStorage(packed * 2 + 200);
    data.set(CLOUD_RESTORE_BACKUP_KEY, "c".repeat(packed));
    data.set(STARTUP_BACKUP_KEY, "s".repeat(packed));
    expect(savePlayerState(state)).toBe(true);
    expect(data.has(STARTUP_BACKUP_KEY)).toBe(false);
    expect(data.has(CLOUD_RESTORE_BACKUP_KEY)).toBe(true);
  });

  it("控えを全部捨てても入らなければ、失敗として記録する(黙って成功にしない)", () => {
    const state = bigState();
    installQuotaStorage(100);
    expect(savePlayerState(state)).toBe(false);
    expect(lastSaveFailure()?.quotaExceeded).toBe(true);
  });

  it("クラウド復元前の控えの鍵は1か所で決まっている", () => {
    expect(CLOUD_KEY_FROM_RECOVERY).toBe(CLOUD_RESTORE_BACKUP_KEY);
  });
});
