import { describe, expect, it } from "vitest";
import { mergeArenaHistory } from "../src/game/arena/match.js";
import type { ArenaMatchRecord } from "../src/game/arena/types.js";

/**
 * 防衛履歴が消えないこと。
 *
 * **サーバから引いた分で丸ごと置き換えていた。** 繋がっていない間に積んだ記録
 * (留守中にNPCへ攻められた分)は、一度オンラインになった瞬間に全部消え、
 * その状態が保存されていた。サーバはその戦いを知らないので、二度と戻らない。
 *
 * 画面には残った2件だけが並び、しかも日付が昨日のまま動かない——
 * 「防衛履歴がおかしい」という報告は、ここから来ていた。
 */
function record(id: string, at: number, extra: Partial<ArenaMatchRecord> = {}): ArenaMatchRecord {
  return {
    id,
    at,
    side: "DEFENSE",
    opponentKind: "NPC",
    opponentName: "名もなき挑戦者",
    opponentRating: 1800,
    won: false,
    ratingDelta: -6,
    ratingAfter: 1869,
    coins: 0,
    ...extra,
  };
}

describe("サーバと手元の防衛履歴を合わせる", () => {
  it("手元だけにある記録を消さない", () => {
    const local = [record("local-2", 200), record("local-1", 100)];
    const remote = [record("remote-1", 300)];
    const merged = mergeArenaHistory(local, remote);
    expect(merged.map((r) => r.id)).toEqual(["remote-1", "local-2", "local-1"]);
  });

  it("同じ戦いはサーバ側を採る", () => {
    const local = [record("same", 100, { ratingAfter: 1000 })];
    const remote = [record("same", 100, { ratingAfter: 1869 })];
    const merged = mergeArenaHistory(local, remote);
    expect(merged).toHaveLength(1);
    // サーバの記録が正。手元の値で上書きし返さない
    expect(merged[0].ratingAfter).toBe(1869);
  });

  it("新しい順に並ぶ", () => {
    const merged = mergeArenaHistory(
      [record("b", 200), record("d", 400)],
      [record("a", 100), record("c", 300)],
    );
    expect(merged.map((r) => r.at)).toEqual([400, 300, 200, 100]);
  });

  it("同じ時刻でも並びが起動ごとに揺れない", () => {
    const local = [record("z", 100), record("y", 100)];
    const remote = [record("m", 100)];
    const first = mergeArenaHistory(local, remote).map((r) => r.id);
    const second = mergeArenaHistory([...local].reverse(), remote).map((r) => r.id);
    expect(first).toEqual(second);
    // サーバの記録を先に置く
    expect(first[0]).toBe("m");
  });

  it("上限を超えたら古い方から落とす", () => {
    const local = Array.from({ length: 40 }, (_, i) => record(`l${i}`, i));
    const remote = Array.from({ length: 40 }, (_, i) => record(`r${i}`, 1000 + i));
    const merged = mergeArenaHistory(local, remote);
    expect(merged.length).toBeLessThanOrEqual(40);
    // 残るのは新しい方
    expect(merged[0].at).toBe(1039);
  });

  it("サーバが空でも手元の記録は残る", () => {
    const local = [record("local-1", 100)];
    expect(mergeArenaHistory(local, []).map((r) => r.id)).toEqual(["local-1"]);
  });
});
