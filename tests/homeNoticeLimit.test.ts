import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COMPENSATIONS, CompensationClaim, Compensation, HOME_BANNER_LIMIT, hasReward, selectHomeBanners } from "../src/game/compensation.js";

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
    // **上限の値そのものは書かない。**札の置き場所(いまは世界の空)が変われば
    // 入る本数も変わる。ここが見張るのは「上限で止まること」と
    // 「お知らせの枠が必ず1つ残ること」の2つ
    expect(shown.length).toBe(HOME_BANNER_LIMIT);
    expect(shown[0].compensation.id, "モノの無いお知らせの枠が消えている").toBe("n");
    expect(shown.slice(1).every(({ compensation }) => hasReward(compensation))).toBe(true);
    expect(shown.length + hiddenCount).toBe(claims.length);
  });

  it("元の並び順を崩さない", () => {
    // 上限2なら「いちばん新しいお知らせ n」と「いちばん新しい配布 g1」が残る。
    // **並べ替えない**ので、出る順は元の並び(g1 → n)のまま
    const claims = [gift("g1", "2026-09-02"), notice("n", "2026-09-01"), gift("g2", "2026-08-01")].map(claim);
    expect(selectHomeBanners(claims).shown.map(({ compensation }) => compensation.id)).toEqual(["g1", "n"]);
  });

  it("1件だけ・0件でも畳んだ件数は0", () => {
    expect(selectHomeBanners([]).hiddenCount).toBe(0);
    expect(selectHomeBanners([claim(notice("n", "2026-09-01"))]).hiddenCount).toBe(0);
    expect(selectHomeBanners([claim(gift("g", "2026-09-01"))]).hiddenCount).toBe(0);
  });

  it("いま配ってあるお知らせでも、ホームの札は上限を超えない", () => {
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
      .toBeLessThanOrEqual(HOME_BANNER_LIMIT);
    expect(shown.length + hiddenCount).toBe(claims.length);
    // お知らせの枠と、いちばん新しい配布は必ず出ている
    expect(shown.some(({ compensation }) => !hasReward(compensation))).toBe(true);
    expect(shown.some(({ compensation }) => hasReward(compensation))).toBe(true);
    expect(shown.some(({ compensation }) => compensation.id === "2026-09-02-stage-5-8-rebalance")).toBe(true);
  });

  it("畳んだ件数はホームに1行で出す(消えたように見せない)", () => {
    const source = readFileSync(new URL("../src/web/views/home.ts", import.meta.url), "utf8");
    expect(source).toContain("selectHomeBanners");
    expect(source).toContain("reward-banner-stack__rest");
    expect(source).toContain("件のお知らせがあります");
  });

  it("札は世界の中に置く(ホームの高さを分け合わない)", () => {
    /*
     * もとはヘッダーの下に積み、高さを `--home-banner-h` として世界の枠へ
     * 申告していた。申告した分だけ世界が縮む作りで、札が何枚か出ている日は
     * **世界そのものが画面の外まで押し出されていた。**
     *
     * いまは札を世界の中(左右の縦列の間、モンスターより上)へ置いてある。
     * 場所を分け合っていないので、縮める理由が無い。
     * **申告を復活させると、札が出ている日だけ世界が二重に縮む。**
     */
    const source = readFileSync(new URL("../src/web/views/home.ts", import.meta.url), "utf8");
    expect(source, "札の高さを世界の枠へ申告し直している").not.toContain("declareBannerStackHeight(menu");

    const css = readFileSync(new URL("../src/web/home-pop-design.css", import.meta.url), "utf8");
    expect(css).toContain(".home-world > .reward-banner-stack");
  });

  it("札の中の閉じるボタンは、本文の上に重ねず右の列に置く", () => {
    /*
     * **前はここが逆だった。**札を54pxに抑え、切り落とされないよう
     * 閉じるを右上へ `position:absolute` で浮かせていた。その44x44の不透明な箱が
     * 本文の上に乗り、「+1,500 ダイヤ」の「ダイヤ」やアップデートの本文を覆い、
     * 抑えた高さは報酬の2行目「+20 召喚の書」を切り落としていた。
     *
     * いまは閉じるを本文と同じ流れの右の列に置き、高さは中身に任せる。
     * 閉じるが切り落とされないのは、**高さを抑えないから**。
     */
    const css = readFileSync(new URL("../src/web/home-pop-design.css", import.meta.url), "utf8");
    const selector = ".crimon-home .home-world .reward-banner-stack .reward-banner .reward-banner__close {";
    const close = css.slice(css.indexOf(selector), css.indexOf("}", css.indexOf(selector)));
    expect(close, "閉じるの指定が見つからない").toContain("reward-banner__close");
    expect(close, "閉じるをまた浮かせている(本文の上に乗る)").not.toContain("position: absolute");
    expect(close).toContain("grid-column: 2");

    const cardSelector = ".crimon-home .home-world .reward-banner-stack .reward-banner {";
    const card = css.slice(css.indexOf(cardSelector), css.indexOf("}", css.indexOf(cardSelector)));
    expect(card).toContain("grid-template-columns: minmax(0, 1fr) 44px");
    expect(card, "札の高さをまた決め打ちしている(報酬の2行目が切れる)").toContain("max-height: none");
    // 本文の右に閉じるぶんの余白を空けて、そこへ浮かせる形へ戻していない
    expect(card).not.toMatch(/padding:\s*\d+px\s+4[48]px/);
  });

  it("札の箱は世界の枠の中で止め、入りきらない日は巻物にする", () => {
    // 札の高さを中身に任せた。世界の枠は overflow:hidden なので、越えた分は黙って切れる
    const css = readFileSync(new URL("../src/web/home-pop-design.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.home-world > \.world-info \{\s*max-height: calc\(100% - 12px\)/);
    expect(css).toMatch(/\.home-world > \.world-info > \.reward-banner-stack \{[^}]*overflow-y: auto/);
  });

  it("札の枚数から高さを当てる決め打ちを戻さない", () => {
    // 52px刻みの `:has()`。札の高さは中身次第なので、当たりようがない
    const css = readFileSync(new URL("../src/web/crimon-visual-system.css", import.meta.url), "utf8");
    expect(css).not.toMatch(/:has\(\.reward-banner[^)]*\)\{--home-banner-h:\d+px\}/);
  });
});
