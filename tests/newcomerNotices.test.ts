import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  COMPENSATIONS, claimCompensations, hasReward, isFirstLaunch, pendingCompensations, selectHomeBanners,
} from "../src/game/compensation.js";
import { claimDailyLoginBonus, createInitialState, readPlayerSave } from "../src/game/playerState.js";

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

/** 保存データを1件だけ持つ、確かめる用の置き場 */
function storageWith(raw: string | null): Pick<Storage, "getItem"> {
  return { getItem: (key: string) => (key === "crimon_save_v1" ? raw : null) };
}

/** 保存データを読み、main と同じ形で「はじめてか」を聞く */
function firstLaunchFor(raw: string | null): { origin: string; firstLaunch: boolean } {
  const { state, origin } = readPlayerSave(storageWith(raw));
  return { origin, firstLaunch: isFirstLaunch(state, origin) };
}

describe("はじめて開いたかどうか(保存データの有無で決める)", () => {
  it("保存データが無い人は「はじめて」", () => {
    expect(firstLaunchFor(null)).toEqual({ origin: "NEW", firstLaunch: true });
  });

  it("ログインボーナスが入る前のセーブの人は「はじめて」にならない", () => {
    /*
     * **前の判定の穴。**ログインボーナスの欄が無い古いセーブは、読み込むと
     * `lastLoginBonusAt: null` / `loginBonusClaimCount: 0` に補われる。
     * セーブの中身だけで見ていた頃は、ここが「はじめて」になり、
     * 久しぶりに開いた人のお知らせが全部既読にされていた。
     */
    const legacy = createInitialState() as Partial<ReturnType<typeof createInitialState>>;
    delete legacy.lastLoginBonusAt;
    delete legacy.loginBonusClaimCount;
    const { state, origin } = readPlayerSave(storageWith(JSON.stringify(legacy)));
    expect(state.lastLoginBonusAt, "古いセーブの補い方が変わった(このテストの前提)").toBeNull();
    expect(state.loginBonusClaimCount).toBe(0);
    expect(origin).toBe("LOADED");
    expect(isFirstLaunch(state, origin)).toBe(false);
  });

  it("壊れたセーブ・空のセーブから作り直した人は「はじめて」にしない(安全な側)", () => {
    // 前から遊んでいた人。既読にして過去の更新を隠すより、全部見せる方が安全
    for (const raw of ["{壊れている", "", JSON.stringify({ monsters: [] }), "null"]) {
      expect(firstLaunchFor(raw), `保存データ ${JSON.stringify(raw)}`).toEqual({ origin: "REBUILT", firstLaunch: false });
    }
  });

  it("保存データが読めない(置き場そのものが使えない)人も「はじめて」にしない", () => {
    const broken = { getItem: () => { throw new Error("SecurityError"); } };
    const { state, origin } = readPlayerSave(broken);
    expect(origin).toBe("REBUILT");
    expect(isFirstLaunch(state, origin)).toBe(false);
  });

  it("まだ一度も読んでいない(出どころが分からない)時は「はじめて」にしない", () => {
    expect(isFirstLaunch(createInitialState(), null)).toBe(false);
  });

  it("保存データが無くても、ログインボーナスを受け取った後なら「はじめて」ではない", () => {
    /*
     * main はこの判定を**ログインボーナスより先に**取る。
     * 後で取ると、受け取った瞬間に偽になり、誰も「はじめて」にならない。
     */
    const state = createInitialState();
    claimDailyLoginBonus(state);
    expect(isFirstLaunch(state, "NEW")).toBe(false);
  });

  it("出どころは、ページで最初にセーブを読んだ時のものを使う", () => {
    /*
     * 経験値のお詫び(`expBalanceCompensation.ts`)が main より先にセーブを読み、
     * 保存まで済ませる。main の読み込みで決めると、新しく始めた人も「読めた」になる。
     */
    const playerState = readFileSync(new URL("../src/game/playerState.ts", import.meta.url), "utf8");
    expect(playerState).toMatch(/if \(startupSaveOriginValue === null\) startupSaveOriginValue = origin;/);
  });

  it("起動の順番を守っている(ログインボーナスより先に判定し、その結果で受け取る)", () => {
    const main = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
    expect(main).toContain("isFirstLaunch(state.player, startupSaveOrigin())");
    const judge = main.indexOf("isFirstLaunch(state.player");
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
