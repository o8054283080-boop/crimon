import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  COMPENSATIONS, claimCompensations, hasReward, isFirstLaunch, pendingCompensations, selectHomeBanners,
} from "../src/game/compensation.js";
import { claimDailyLoginBonus, createInitialState } from "../src/game/playerState.js";

/*
 * 始めたばかりの人に、始める前のお知らせを札で配らない。
 *
 * ## 何が起きていたか
 *
 * お知らせは「期間中に一度開けば受け取れる」作りで、期間の長いものが
 * 100件を超えていた。はじめて開いた人のホームは、1枚目が
 * 「経験値バランス調整のお詫び」、下に「ほかに119件のお知らせがあります」、
 * 左の「お知らせ」には赤い「9+」。札の山が世界の枠をほぼ覆い、ホームの顔が消えていた。
 *
 * ## 決めたこと
 *
 * - モノの無いお知らせは、受け取り済みの印だけ付けて札にしない
 * - **モノの付いた配布は、今までどおり受け取る。量は1つも変えない**
 *   (配らないことにするのは配布の方針の変更で、画面の直しの範囲を越える)
 * - モノの付いた配布は1件ずつ札にせず、件数だけを1枚にまとめる
 * - 既に遊んでいる人には何も変えない
 */

/** 端末のローカル日付で判定するので、テストもローカル時刻で日付を作る */
function localNoonOn(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** いちばん新しいお知らせの日。この日なら、期間内のもの全部が一度に届く */
const NEWEST = [...COMPENSATIONS].map((c) => c.fromDate).sort().at(-1)!;

describe("はじめて開いたかどうか", () => {
  it("作ったばかりのセーブは「はじめて」", () => {
    expect(isFirstLaunch(createInitialState())).toBe(true);
  });

  it("ログインボーナスを一度でも受け取ったら「はじめて」ではない", () => {
    /*
     * main はこの判定を**ログインボーナスより先に**取る。
     * 後で取ると、受け取った瞬間に偽になり、誰も「はじめて」にならない。
     */
    const state = createInitialState();
    claimDailyLoginBonus(state);
    expect(isFirstLaunch(state)).toBe(false);
  });

  it("起動の順番を守っている(ログインボーナスより先に判定し、その結果で受け取る)", () => {
    const main = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
    const judge = main.indexOf("isFirstLaunch(state.player)");
    const bonus = main.indexOf("claimDailyLoginBonus(state.player)");
    expect(judge, "main が「はじめて」を判定していない").toBeGreaterThan(0);
    expect(judge, "ログインボーナスの後で判定している(必ず偽になる)").toBeLessThan(bonus);
    expect(main).toContain("claimCompensations(state.player, new Date(), { firstLaunch })");
  });
});

describe("始めたばかりの人の受け取り", () => {
  it("モノの付いた配布は、今までどおり全部受け取る(量は変えない)", () => {
    const when = localNoonOn(NEWEST);
    const usual = createInitialState();
    const newcomer = createInitialState();

    claimCompensations(usual, when);
    claimCompensations(newcomer, when, { firstLaunch: true });

    expect(newcomer.crystal).toBe(usual.crystal);
    expect(newcomer.gold).toBe(usual.gold);
    expect(newcomer.summonScrolls).toBe(usual.summonScrolls);
    expect(newcomer.fourStarSummonScrolls).toBe(usual.fourStarSummonScrolls);
    expect(newcomer.lightDarkFourStarSummonScrolls).toBe(usual.lightDarkFourStarSummonScrolls);
    expect(newcomer.monsters.length).toBe(usual.monsters.length);
    // 受け取り済みの印も同じ。次に開いた時に同じものがもう一度届かない
    expect([...newcomer.claimedCompensationIds].sort()).toEqual([...usual.claimedCompensationIds].sort());
    expect(pendingCompensations(newcomer, when)).toHaveLength(0);
  });

  it("モノの無いお知らせは札にしない", () => {
    const claims = claimCompensations(createInitialState(), localNoonOn(NEWEST), { firstLaunch: true });
    expect(claims.every(({ compensation }) => hasReward(compensation))).toBe(true);
    expect(claims.every(({ beforeStart }) => beforeStart === true)).toBe(true);
  });

  it("ホームには1枚も個別の札を出さず、件数だけを残す", () => {
    const claims = claimCompensations(createInitialState(), localNoonOn(NEWEST), { firstLaunch: true });
    const { shown, hiddenCount, beforeStartCount } = selectHomeBanners(claims);
    // 「経験値バランス調整のお詫び」のような、始める前の出来事の札が1枚目に出ない
    expect(shown).toHaveLength(0);
    // 「ほかに119件」も出ない
    expect(hiddenCount).toBe(0);
    expect(beforeStartCount).toBe(claims.length);
  });

  it("既に遊んでいる人は、今までと同じ札が出る", () => {
    const state = createInitialState();
    claimDailyLoginBonus(state);
    const claims = claimCompensations(state, localNoonOn(NEWEST));
    expect(claims.some(({ beforeStart }) => beforeStart)).toBe(false);
    const { shown, beforeStartCount } = selectHomeBanners(claims);
    expect(shown.length).toBeGreaterThan(0);
    expect(beforeStartCount).toBe(0);
  });
});

describe("ホームの札", () => {
  const home = readFileSync(new URL("../src/web/views/home.ts", import.meta.url), "utf8");

  it("始める前の配布は1枚にまとめ、閉じられるようにする", () => {
    /*
     * 1行の案内にすると閉じる手段が無い。「ほかにN件」の行は配布の札の
     * 閉じると一緒に消えるが、始めたばかりの人には他の配布の札が無い。
     */
    const block = home.slice(home.indexOf("compensation--before-start"), home.indexOf("compensation--before-start") + 600);
    expect(block).toContain("reward-banner__close");
    expect(block).toContain("これまでの配布");
    // その人は何も迷惑を被っていない
    expect(block).not.toContain("お詫び");
  });

  it("左の「お知らせ」の赤い印も、始める前の履歴を数えない", () => {
    const main = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
    expect(main).toMatch(/if \(firstLaunch\) markAllNoticesRead\(\)/);
  });
});
