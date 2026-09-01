import { describe, expect, it } from "vitest";
import { COMPENSATIONS, claimCompensations, compensationBannerLabel } from "../src/game/compensation.js";
import { createInitialState } from "../src/game/playerState.js";

const UPDATE_NOTICE = COMPENSATIONS.find((c) => c.id === "2026-09-01-update-missions-and-training")!;

function localNoonOn(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

describe("9/1アップデートのお知らせ", () => {
  it("アップデート内容を一度だけ表示し、所持品は増減させない", () => {
    const state = createInitialState();
    for (const c of COMPENSATIONS) {
      if (c.id !== UPDATE_NOTICE.id) state.claimedCompensationIds.push(c.id);
    }
    const before = {
      crystal: state.crystal,
      gold: state.gold,
      summonScrolls: state.summonScrolls,
      fourStarSummonScrolls: state.fourStarSummonScrolls,
    };

    const claims = claimCompensations(state, localNoonOn("2026-09-01"));
    expect(claims.map((claim) => claim.compensation.id)).toEqual([UPDATE_NOTICE.id]);
    expect(compensationBannerLabel(claims)).toBe("アップデートのお知らせ");
    expect(UPDATE_NOTICE.message).toContain("デイリー・ウィークリー・マンスリー・累計ミッション");
    expect(UPDATE_NOTICE.message).toContain("経験豚優先");
    expect(UPDATE_NOTICE.message).toContain("転生豚優先");
    expect(UPDATE_NOTICE.message).toContain("通常の1/3");
    expect(state).toMatchObject(before);
    expect(claimCompensations(state, localNoonOn("2026-09-01"))).toHaveLength(0);
  });

  it("記念配布などと同時に出る時は中立の見出しにする", () => {
    const celebration = COMPENSATIONS.find((c) => c.id === "2026-09-01-new-monsters")!;
    expect(compensationBannerLabel([{ compensation: UPDATE_NOTICE }, { compensation: celebration }])).toBe("お知らせ");
  });
});
