import { describe, expect, it } from "vitest";
import { COMPENSATIONS, claimCompensations, localDateString, pendingCompensations } from "../src/game/compensation.js";
import { createInitialState } from "../src/game/playerState.js";

const TARGET = COMPENSATIONS[0];

/** 端末のローカル日付で判定するので、テストもローカル時刻で日付を作る */
function localNoonOn(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

describe("お詫びの配布", () => {
  it("期間中に開くと受け取れて、所持品が増える", () => {
    const state = createInitialState();
    const before = { crystal: state.crystal, gold: state.gold, scrolls: state.summonScrolls };

    const claims = claimCompensations(state, localNoonOn(TARGET.fromDate));

    expect(claims).toHaveLength(1);
    expect(state.crystal).toBe(before.crystal + TARGET.crystal);
    expect(state.gold).toBe(before.gold + TARGET.gold);
    expect(state.summonScrolls).toBe(before.scrolls + TARGET.summonScrolls);
  });

  it("何度開いても二重には配られない", () => {
    const state = createInitialState();
    const when = localNoonOn(TARGET.fromDate);

    claimCompensations(state, when);
    const afterFirst = { crystal: state.crystal, gold: state.gold, scrolls: state.summonScrolls };

    expect(claimCompensations(state, when)).toHaveLength(0);
    expect(claimCompensations(state, when)).toHaveLength(0);
    expect(state.crystal).toBe(afterFirst.crystal);
    expect(state.gold).toBe(afterFirst.gold);
    expect(state.summonScrolls).toBe(afterFirst.scrolls);
  });

  it("期間より前・後には受け取れない", () => {
    const before = createInitialState();
    expect(claimCompensations(before, localNoonOn("2026-08-17"))).toHaveLength(0);
    expect(before.crystal).toBe(createInitialState().crystal);

    const after = createInitialState();
    expect(claimCompensations(after, localNoonOn("2026-08-19"))).toHaveLength(0);
    expect(after.crystal).toBe(createInitialState().crystal);
  });

  it("受け取り済みの記録が状態に残る(保存して読み直しても重複しない)", () => {
    const state = createInitialState();
    claimCompensations(state, localNoonOn(TARGET.fromDate));
    expect(state.claimedCompensationIds).toContain(TARGET.id);

    // 保存 → 読み直しを模した往復
    const restored = JSON.parse(JSON.stringify(state));
    expect(claimCompensations(restored, localNoonOn(TARGET.fromDate))).toHaveLength(0);
  });

  it("期間中でも、受け取り済みなら候補に出ない", () => {
    const state = createInitialState();
    const when = localNoonOn(TARGET.fromDate);
    expect(pendingCompensations(state, when)).toHaveLength(1);
    claimCompensations(state, when);
    expect(pendingCompensations(state, when)).toHaveLength(0);
  });

  it("配布の中身は約束どおり(ダイヤ10000・ゴールド100万・召喚の書50枚)", () => {
    expect(TARGET.crystal).toBe(10000);
    expect(TARGET.gold).toBe(1000000);
    expect(TARGET.summonScrolls).toBe(50);
  });

  it("日付は端末のローカル日付で判定する(UTCで日付が変わる時刻でもずれない)", () => {
    // ローカルの 2026-08-18 00:30 は、UTC+9 なら UTC では前日になる。
    // それでもローカル日付で見ているので受け取れる
    const justAfterLocalMidnight = new Date(2026, 7, 18, 0, 30, 0);
    expect(localDateString(justAfterLocalMidnight)).toBe("2026-08-18");
    const state = createInitialState();
    expect(claimCompensations(state, justAfterLocalMidnight)).toHaveLength(1);
  });
});
