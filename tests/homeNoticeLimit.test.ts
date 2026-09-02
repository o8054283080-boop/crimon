import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COMPENSATIONS, CompensationClaim, Compensation, hasReward, selectHomeBanners } from "../src/game/compensation.js";

/*
 * ホームに出すお知らせの本数。
 *
 * ## なぜ要るのか
 *
 * 配布・お知らせは「期間中に一度開けば受け取れる」作りなので、
 * **始めたばかりの人は過去の更新履歴を全部まとめて受け取る。**
 * 実機では11本の札がホームを埋め、世界の絵もメニューも下へ押し出されていた。
 * 初めて開いた画面が更新履歴の壁になっていて、何をする場所なのか分からない。
 *
 * ただし単純に1件へ絞ると**配布を見落とす**。
 * 「ダイヤ1500と召喚の書30枚を受け取った」は読み飛ばされてよい情報ではない。
 */

function claim(compensation: Compensation): CompensationClaim {
  return { compensation };
}

function notice(id: string, fromDate: string): Compensation {
  return { id, title: id, message: id, kind: "UPDATE", fromDate, toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0 };
}

function gift(id: string, fromDate: string): Compensation {
  return { id, title: id, message: id, kind: "CELEBRATION", fromDate, toDate: "9999-12-31", crystal: 1500, gold: 0, summonScrolls: 30 };
}

describe("ホームに出すお知らせを絞る", () => {
  it("モノの無いお知らせは、いちばん新しい1件だけ出す", () => {
    const claims = [notice("c", "2026-09-02"), notice("a", "2026-08-30"), notice("b", "2026-09-01")].map(claim);
    const { shown, hiddenCount } = selectHomeBanners(claims);
    expect(shown.map(({ compensation }) => compensation.id)).toEqual(["c"]);
    expect(hiddenCount).toBe(2);
  });

  it("並び順が日付順でなくても、いちばん新しいものを選ぶ", () => {
    // COMPENSATIONS の並びは手で書いているので、日付順である保証は無い
    const claims = [notice("old", "2026-08-01"), notice("new", "2026-09-02")].map(claim);
    expect(selectHomeBanners(claims).shown.map(({ compensation }) => compensation.id)).toEqual(["new"]);
  });

  it("モノを受け取ったものは、お知らせより先に枠を取る", () => {
    /*
     * ここを落とすと「ダイヤ1500を受け取った」が画面に一度も出ない。
     * 受け取り自体は済んでいるので損はしないが、**貰ったことに気づけない。**
     */
    const claims = [notice("n1", "2026-09-02"), gift("g", "2026-08-20"), notice("n2", "2026-09-01")].map(claim);
    const { shown, hiddenCount } = selectHomeBanners(claims);
    expect(shown.map(({ compensation }) => compensation.id)).toEqual(["n1", "g"]);
    expect(hiddenCount).toBe(1);
  });

  it("配布が多くても上限で止め、お知らせの枠は必ず1つ残す", () => {
    /*
     * 「配布は全部出す」にしていると、放っておいて必ず増える。
     * 今日2本でも半年後には10本になり、同じ事故が再発する。
     */
    const claims = [
      notice("n", "2026-09-02"),
      gift("g1", "2026-09-01"), gift("g2", "2026-08-30"), gift("g3", "2026-08-28"), gift("g4", "2026-08-20"),
    ].map(claim);
    const { shown, hiddenCount } = selectHomeBanners(claims);
    expect(shown.map(({ compensation }) => compensation.id)).toEqual(["n", "g1", "g2"]);
    expect(hiddenCount).toBe(2);
  });

  it("元の並び順を崩さない", () => {
    const claims = [gift("g1", "2026-09-02"), notice("n", "2026-09-01"), gift("g2", "2026-08-01")].map(claim);
    expect(selectHomeBanners(claims).shown.map(({ compensation }) => compensation.id)).toEqual(["g1", "n", "g2"]);
  });

  it("1件だけ・0件でも畳んだ件数は0", () => {
    expect(selectHomeBanners([]).hiddenCount).toBe(0);
    expect(selectHomeBanners([claim(notice("n", "2026-09-01"))]).hiddenCount).toBe(0);
    expect(selectHomeBanners([claim(gift("g", "2026-09-01"))]).hiddenCount).toBe(0);
  });

  it("いま配ってあるお知らせでも、ホームの札は3本を超えない", () => {
    /*
     * **これが本番の条件。** 何も受け取っていない人が今日はじめて開くと、
     * 期間内のもの全部を一度に受け取る。ここが増え続けると同じ事故が再発する。
     */
    const claims = COMPENSATIONS
      .filter((c) => "2026-09-02" >= c.fromDate && "2026-09-02" <= c.toDate)
      .map(claim);
    expect(claims.length).toBeGreaterThan(4); // 絞る意味がある件数であること自体を確かめる
    const { shown, hiddenCount } = selectHomeBanners(claims);
    expect(shown.length, `ホームに出る札: ${shown.map(({ compensation }) => compensation.title).join(" / ")}`)
      .toBeLessThanOrEqual(3);
    expect(shown.length + hiddenCount).toBe(claims.length);
    // お知らせの枠と、いちばん新しい配布は必ず出ている
    expect(shown.some(({ compensation }) => !hasReward(compensation))).toBe(true);
    expect(shown.some(({ compensation }) => hasReward(compensation))).toBe(true);
  });

  it("畳んだ件数はホームに1行で出す(消えたように見せない)", () => {
    const source = readFileSync(new URL("../src/web/views/home.ts", import.meta.url), "utf8");
    expect(source).toContain("selectHomeBanners");
    expect(source).toContain("reward-banner-stack__rest");
    expect(source).toContain("件のお知らせがあります");
  });

  it("畳んだ1行の高さも、世界の枠へ申告している", () => {
    /*
     * ホームは `100dvh` を分け合う縦並び。申告しない高さのぶんだけ
     * `.home-world` が潰れ、`overflow:hidden` が「試練の塔」を切り落として
     * 押せなくする。過去に実際に出している事故。
     */
    const css = readFileSync(new URL("../src/web/crimon-visual-system.css", import.meta.url), "utf8");
    expect(css).toContain(".crimon-home:has(.reward-banner-stack__rest){--home-banner-h:");
  });
});
