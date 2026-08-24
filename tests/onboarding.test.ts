import { describe, expect, it } from "vitest";
import { SUMMON_COST_TEN, TUTORIAL_GUARANTEED_STAR, summonTutorial } from "../src/game/gacha.js";
import { LOGIN_BONUS_FIRST_TIME_CRYSTAL, claimDailyLoginBonus, createInitialState, normalizeLoadedState } from "../src/game/playerState.js";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 始めた最初の1時間。
 *
 * 手持ちは星1が4体で、毎日200ずつ貯めて900の10連に届くまで4日。
 * **最初の日に「引く」体験がまったく無い**状態だった。
 */

describe("はじまりの10連", () => {
  it("**必ず★5以上を1体含む**(最初の1体が編成の軸になる)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const results = summonTutorial(mulberry32(seed));
      expect(results, `seed ${seed}`).toHaveLength(10);
      expect(results.some((r) => r.star >= TUTORIAL_GUARANTEED_STAR), `seed ${seed}`).toBe(true);
    }
  });

  it("残りは通常どおり抽選される(全部が★5になったりしない)", () => {
    const results = summonTutorial(mulberry32(3));
    expect(results.filter((r) => r.star < TUTORIAL_GUARANTEED_STAR).length).toBeGreaterThan(0);
  });

  it("通常の10連より1段高い星を保証する", () => {
    expect(TUTORIAL_GUARANTEED_STAR).toBe(5);
  });
});

describe("初回の開始祝い", () => {
  it("初日に10連が引ける額になる", () => {
    const state = createInitialState();
    claimDailyLoginBonus(state, Date.parse("2026-01-01T09:00:00Z"));
    expect(state.crystal).toBeGreaterThanOrEqual(SUMMON_COST_TEN);
  });

  it("**2日目以降は上乗せされない**", () => {
    const state = createInitialState();
    claimDailyLoginBonus(state, Date.parse("2026-01-01T09:00:00Z"));
    const second = claimDailyLoginBonus(state, Date.parse("2026-01-02T09:00:00Z"));
    expect(second.claimed).toBe(true);
    expect(second.firstTimeCrystal).toBe(0);
  });

  it("受け取れなかった日は0で返る(額が漏れない)", () => {
    const state = createInitialState();
    const now = Date.parse("2026-01-01T09:00:00Z");
    claimDailyLoginBonus(state, now);
    const again = claimDailyLoginBonus(state, now);
    expect(again.claimed).toBe(false);
    expect(again.firstTimeCrystal).toBe(0);
    expect(LOGIN_BONUS_FIRST_TIME_CRYSTAL).toBeGreaterThan(0);
  });
});

describe("はじまりの10連は1度きり", () => {
  it("新しく始めた人はまだ引いていない", () => {
    expect(createInitialState().tutorialSummonDone).toBe(false);
  });

  it("**古い控えにも1回ぶん残る**(印が無い＝未使用として扱う)", () => {
    const state = createInitialState();
    delete (state as { tutorialSummonDone?: boolean }).tutorialSummonDone;
    expect(normalizeLoadedState(state).tutorialSummonDone).toBe(false);
  });

  it("引いた印は読み込み直しても消えない", () => {
    const state = createInitialState();
    state.tutorialSummonDone = true;
    expect(normalizeLoadedState(state).tutorialSummonDone).toBe(true);
  });
});
