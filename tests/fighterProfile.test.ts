import { describe, expect, it } from "vitest";
import { SUMMON_COST_TEN } from "../src/game/gacha.js";
import {
  DEFAULT_FIGHTER_NAME,
  FIGHTER_NAME_MAX_LENGTH,
  LOGIN_BONUS_DAILY_CRYSTAL,
  LOGIN_BONUS_FIRST_TIME_CRYSTAL,
  LOGIN_BONUS_MILESTONE_CRYSTAL,
  LOGIN_BONUS_MILESTONE_INTERVAL_DAYS,
  claimDailyLoginBonus,
  createInitialState,
  setFighterName,
} from "../src/game/playerState.js";

describe("ファイター名 (setFighterName)", () => {
  it("初期値はデフォルト名になっている", () => {
    const state = createInitialState();
    expect(state.fighterName).toBe(DEFAULT_FIGHTER_NAME);
  });

  it("名前を変更できる", () => {
    const state = createInitialState();
    setFighterName(state, "勇者");
    expect(state.fighterName).toBe("勇者");
  });

  it("前後の空白はトリムされる", () => {
    const state = createInitialState();
    setFighterName(state, "  勇者  ");
    expect(state.fighterName).toBe("勇者");
  });

  it("空文字は無視され、元の名前のままになる", () => {
    const state = createInitialState();
    setFighterName(state, "勇者");
    setFighterName(state, "   ");
    expect(state.fighterName).toBe("勇者");
  });

  it("最大文字数を超える分は切り詰められる", () => {
    const state = createInitialState();
    const longName = "あ".repeat(FIGHTER_NAME_MAX_LENGTH + 5);
    setFighterName(state, longName);
    expect(state.fighterName).toBe("あ".repeat(FIGHTER_NAME_MAX_LENGTH));
  });
});

describe("ログインボーナス (claimDailyLoginBonus)", () => {
  it("**初回は開始祝いが上乗せされる**(初日に10連を引ける額を渡す)", () => {
    /*
     * 始めたばかりの手持ちは星1が4体。毎日200ずつ貯めて900の10連に届くまで
     * 4日かかるのでは、最初の日に「引く」体験がまったく無い。
     */
    const state = createInitialState();
    const crystalBefore = state.crystal;
    const result = claimDailyLoginBonus(state, Date.parse("2026-01-01T09:00:00Z"));

    expect(result.claimed).toBe(true);
    expect(result.dailyCrystal).toBe(LOGIN_BONUS_DAILY_CRYSTAL);
    expect(result.milestoneCrystal).toBe(0);
    expect(result.firstTimeCrystal).toBe(LOGIN_BONUS_FIRST_TIME_CRYSTAL);
    expect(state.crystal).toBe(crystalBefore + LOGIN_BONUS_DAILY_CRYSTAL + LOGIN_BONUS_FIRST_TIME_CRYSTAL);
    // 渡した額で10連が引けること。ここが崩れたら渡す意味が無い
    expect(state.crystal).toBeGreaterThanOrEqual(SUMMON_COST_TEN);
    expect(state.loginBonusClaimCount).toBe(1);
  });

  it("同じ日にもう一度呼んでも受け取れない", () => {
    const state = createInitialState();
    const now = Date.parse("2026-01-01T09:00:00Z");
    claimDailyLoginBonus(state, now);
    const crystalAfterFirst = state.crystal;

    // UTC固定だと日本時間では翌日になる。どの実行環境でも同じローカル日を指す値にする。
    const later = now + 60 * 60 * 1000;
    const result = claimDailyLoginBonus(state, later);

    expect(result.claimed).toBe(false);
    expect(state.crystal).toBe(crystalAfterFirst);
    expect(state.loginBonusClaimCount).toBe(1);
  });

  it("日付が変わると再び受け取れる", () => {
    const state = createInitialState();
    claimDailyLoginBonus(state, Date.parse("2026-01-01T09:00:00Z"));
    const crystalBefore = state.crystal;

    const result = claimDailyLoginBonus(state, Date.parse("2026-01-02T09:00:00Z"));

    expect(result.claimed).toBe(true);
    expect(state.crystal).toBe(crystalBefore + LOGIN_BONUS_DAILY_CRYSTAL);
    expect(state.loginBonusClaimCount).toBe(2);
  });

  it(`${LOGIN_BONUS_MILESTONE_INTERVAL_DAYS}日分受け取ると追加でダイヤ${LOGIN_BONUS_MILESTONE_CRYSTAL}がもらえる`, () => {
    const state = createInitialState();
    const baseDay = Date.parse("2026-01-01T09:00:00Z");
    const dayMs = 24 * 60 * 60 * 1000;

    for (let day = 0; day < LOGIN_BONUS_MILESTONE_INTERVAL_DAYS - 1; day++) {
      claimDailyLoginBonus(state, baseDay + day * dayMs);
    }
    const crystalBeforeMilestone = state.crystal;

    const result = claimDailyLoginBonus(state, baseDay + (LOGIN_BONUS_MILESTONE_INTERVAL_DAYS - 1) * dayMs);

    expect(result.claimed).toBe(true);
    expect(result.dailyCrystal).toBe(LOGIN_BONUS_DAILY_CRYSTAL);
    expect(result.milestoneCrystal).toBe(LOGIN_BONUS_MILESTONE_CRYSTAL);
    expect(state.loginBonusClaimCount).toBe(LOGIN_BONUS_MILESTONE_INTERVAL_DAYS);
    expect(state.crystal).toBe(crystalBeforeMilestone + LOGIN_BONUS_DAILY_CRYSTAL + LOGIN_BONUS_MILESTONE_CRYSTAL);
  });
});
