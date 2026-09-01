import { describe, expect, it } from "vitest";
import { COMPENSATIONS, claimCompensations, compensationBannerLabel, localDateString, pendingCompensations } from "../src/game/compensation.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";

const TARGET = COMPENSATIONS.find((c) => c.id === "2026-08-18-save-loss")!;
const AUTOFARM_TARGET = COMPENSATIONS.find((c) => c.id === "2026-08-28-autofarm-summon-freeze")!;
const TRANSITION_2D_TARGET = COMPENSATIONS.find((c) => c.id === "2026-08-30-2d-transition")!;

/** 端末のローカル日付で判定するので、テストもローカル時刻で日付を作る */
function localNoonOn(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

describe("お詫びの配布", () => {
  it("2D化のお詫びは新規ユーザーへダイヤ3000だけを1度配る", () => {
    const state = createInitialState();
    // 同日に有効な既存配布を受取済みにし、今回の配布だけを検証する。
    state.claimedCompensationIds.push(TARGET.id, AUTOFARM_TARGET.id);
    const before = { crystal: state.crystal, gold: state.gold, scrolls: state.summonScrolls };
    const when = localNoonOn(TRANSITION_2D_TARGET.fromDate);

    expect(claimCompensations(state, when).map((claim) => claim.compensation.id)).toEqual([TRANSITION_2D_TARGET.id]);
    expect(state.crystal).toBe(before.crystal + 3000);
    expect(state.gold).toBe(before.gold);
    expect(state.summonScrolls).toBe(before.scrolls);
    expect(claimCompensations(state, when)).toHaveLength(0);
  });

  it("2D化のお詫びは既存セーブを読み直しても二重配布されない", () => {
    const legacy = createInitialState() as Partial<ReturnType<typeof createInitialState>>;
    delete legacy.claimedCompensationIds;
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(legacy)) as ReturnType<typeof createInitialState>);
    loaded.claimedCompensationIds.push(TARGET.id, AUTOFARM_TARGET.id);
    const when = localNoonOn(TRANSITION_2D_TARGET.fromDate);
    const before = loaded.crystal;

    expect(claimCompensations(loaded, when)).toHaveLength(1);
    expect(loaded.crystal).toBe(before + 3000);

    // 保存→ロードと、HOME再入場・画面遷移相当の再呼び出しをまとめて確認する。
    const reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(loaded)));
    expect(claimCompensations(reloaded, when)).toHaveLength(0);
    expect(claimCompensations(reloaded, when)).toHaveLength(0);
    expect(reloaded.crystal).toBe(before + 3000);
    expect(reloaded.claimedCompensationIds).toContain(TRANSITION_2D_TARGET.id);
  });

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

  it("自動周回＋召喚不具合のお詫びは期間中に900ダイヤだけを1度配る", () => {
    const state = createInitialState();
    // 同日に有効な別配布が将来追加されても、このIDだけを検証できるよう既存履歴を維持する。
    state.claimedCompensationIds.push(TARGET.id);
    const before = { crystal: state.crystal, gold: state.gold, scrolls: state.summonScrolls };
    const when = localNoonOn("2026-08-28");

    expect(claimCompensations(state, when).map((claim) => claim.compensation.id)).toEqual([AUTOFARM_TARGET.id]);
    expect(state.crystal).toBe(before.crystal + 900);
    expect(state.gold).toBe(before.gold);
    expect(state.summonScrolls).toBe(before.scrolls);
    expect(claimCompensations(state, when)).toHaveLength(0);
    expect(state.claimedCompensationIds).toEqual([TARGET.id, AUTOFARM_TARGET.id]);
  });

  it("新しいお詫びは終了日を含み、期間外には配られない", () => {
    expect(pendingCompensations(createInitialState(), localNoonOn("2026-09-30")).some((c) => c.id === AUTOFARM_TARGET.id)).toBe(true);
    expect(pendingCompensations(createInitialState(), localNoonOn("2026-10-01")).some((c) => c.id === AUTOFARM_TARGET.id)).toBe(false);
  });
});

describe("新モンスター追加の記念配布", () => {
  const CELEBRATION = COMPENSATIONS.find((c) => c.id === "2026-09-01-new-monsters")!;

  /** その日に有効な他の配布を受取済みにして、この配布だけを見る */
  function only(state: ReturnType<typeof createInitialState>): void {
    for (const c of COMPENSATIONS) if (c.id !== CELEBRATION.id) state.claimedCompensationIds.push(c.id);
  }

  it("ダイヤ1500・召喚の書30枚・★4以上召喚書2枚を1度だけ配る", () => {
    const state = createInitialState();
    only(state);
    const before = {
      crystal: state.crystal, gold: state.gold,
      scrolls: state.summonScrolls, fourStar: state.fourStarSummonScrolls,
    };
    const when = localNoonOn(CELEBRATION.fromDate);

    expect(claimCompensations(state, when).map((claim) => claim.compensation.id)).toEqual([CELEBRATION.id]);
    expect(state.crystal).toBe(before.crystal + 1500);
    expect(state.summonScrolls).toBe(before.scrolls + 30);
    expect(state.fourStarSummonScrolls).toBe(before.fourStar + 2);
    expect(state.gold).toBe(before.gold);

    // 何度開いても二重には配られない
    expect(claimCompensations(state, when)).toHaveLength(0);
    expect(state.crystal).toBe(before.crystal + 1500);
  });

  it("既存セーブを読み直しても二重配布されない", () => {
    const legacy = createInitialState() as Partial<ReturnType<typeof createInitialState>>;
    delete legacy.claimedCompensationIds;
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(legacy)) as ReturnType<typeof createInitialState>);
    only(loaded);
    const when = localNoonOn(CELEBRATION.fromDate);

    expect(claimCompensations(loaded, when)).toHaveLength(1);
    const reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(loaded)));
    expect(claimCompensations(reloaded, when)).toHaveLength(0);
    expect(reloaded.fourStarSummonScrolls).toBe(2);
  });

  it("終了日を設けていないので、後から始めた人にも届く", () => {
    const state = createInitialState();
    only(state);
    expect(pendingCompensations(state, localNoonOn("2027-06-15")).map((c) => c.id)).toEqual([CELEBRATION.id]);
  });

  it("記念の配布に「お詫び」とは書かない", () => {
    // 祝いの配布へお詫びと書くと、受け取った人は不具合があったと誤解する
    expect(compensationBannerLabel([{ compensation: CELEBRATION }])).toBe("記念の配布");
    const apology = COMPENSATIONS.find((c) => c.id === "2026-08-18-save-loss")!;
    expect(compensationBannerLabel([{ compensation: apology }])).toBe("お詫びの配布");
    // 混ざった時は、どちらの言葉も嘘になるので中立にする
    expect(compensationBannerLabel([{ compensation: CELEBRATION }, { compensation: apology }])).toBe("配布のお知らせ");
  });
});
