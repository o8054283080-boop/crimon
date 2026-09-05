import { describe, expect, it } from "vitest";
import { loadMonsterListDense, saveMonsterListDense } from "./monsterListDensity.js";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("モンスター一覧の簡易表示設定", () => {
  it("3画面で使う設定を同じキーへ保存して読み戻せる", () => {
    const storage = memoryStorage();
    expect(loadMonsterListDense(storage)).toBe(false);
    saveMonsterListDense(true, storage);
    expect(loadMonsterListDense(storage)).toBe(true);
    saveMonsterListDense(false, storage);
    expect(loadMonsterListDense(storage)).toBe(false);
  });

  it("未知の保存値は簡易表示として扱わない", () => {
    expect(loadMonsterListDense(memoryStorage({ crimon_monster_list_dense_v1: "true" }))).toBe(false);
  });

  it("ストレージが使えない場合も通常表示へ安全に戻る", () => {
    const blocked = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(loadMonsterListDense(blocked)).toBe(false);
    expect(() => saveMonsterListDense(true, blocked)).not.toThrow();
  });
});
