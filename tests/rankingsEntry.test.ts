/**
 * ホームから開く順位の一覧。
 *
 * ## 何が問題だったのか
 *
 * ホームの「ランキング」は**押せないまま置いてあった**(依頼主の指摘)。
 * 順位そのものは2つとも前からあり、アリーナの中と塔の中に
 * それぞれ入口が隠れていた——**見に行く道を知らないと辿り着けない。**
 *
 * ## ここで見るのは配線と、表が1つであること
 *
 * 表を書き起こすと、同じ順位が2つの見た目で並ぶ。
 * 既存の描画をそのまま呼んでいることを字面で押さえる。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const HOME = read("web/views/home.ts");
const MAIN = read("web/main.ts");
const VIEW = read("web/views/rankings.ts");
const TOUR = readFileSync(new URL("../tools/tour.mjs", import.meta.url), "utf8");

describe("ホームの「ランキング」が押せる", () => {
  it("タイルに行き先が繋がっている", () => {
    // 行き先が無い `worldButton` は `disabled` になる(押せない札として出る)
    expect(HOME).toContain('worldButton("left", "menu-ranking", "ランキング", props.onGoRankings)');
    expect(HOME).toContain("onGoRankings: () => void;");
  });

  it("押すと順位の一覧へ移る", () => {
    expect(MAIN).toContain("onGoRankings: () => { openRankings(state.rankingTab); }");
    expect(MAIN).toContain('navigate("RANKINGS")');
  });

  it("開いた札のぶんだけ取りに行く", () => {
    /*
     * 両方いきなり呼ぶと、塔しか見ない人にもアリーナの通信が走る。
     * 逆に**何も呼ばないと、空の表を見せたまま何も起きない。**
     */
    const at = MAIN.indexOf("function openRankings(");
    expect(at, "開く関数が無い").toBeGreaterThan(-1);
    const block = MAIN.slice(at, at + 420);
    expect(block).toContain("refreshArenaRanking()");
    expect(block).toContain("refreshTrialTowerRanking()");
    expect(block, "どちらか一方だけを呼ぶ形になっていない").toContain('tab === "ARENA"');
  });
});

describe("表は各画面のものを借りる", () => {
  it("書き起こさず、既存の描画を呼ぶ", () => {
    expect(VIEW).toContain("renderArenaRankingBody");
    expect(VIEW).toContain("renderTrialTowerRankingBody");
    // 行を自前で組み直していないこと(同じ順位が2つの見た目になる)
    expect(VIEW).not.toContain("ar-rank__row");
    expect(VIEW).not.toContain("tower-ranking__row");
  });

  it("切り出した先も、元の画面がそのまま使っている", () => {
    const arena = read("web/views/arena/ranking.ts");
    const tower = read("web/views/trialTower.ts");
    expect(arena).toContain("export function renderArenaRankingBody(");
    expect(arena, "アリーナの画面が切り出した表を使っていない").toContain("const body = renderArenaRankingBody({");
    expect(tower).toContain("export function renderTrialTowerRankingBody(");
    expect(tower, "塔の小窓が切り出した表を使っていない").toContain("const body = renderTrialTowerRankingBody({");
  });
});

describe("繋がっていなくても、自分の記録は出す", () => {
  it("塔の最高到達階は手元の控えから出す", () => {
    /*
     * 順位はサーバのものだが、到達階は手元にある。
     * 「取得できませんでした」だけで終わると、**自分の記録まで見えなくなる。**
     */
    expect(VIEW).toContain("myBestFloor");
    expect(VIEW).toContain("あなたの最高到達階");
    expect(MAIN).toContain("myBestFloor: state.player.trialTowerLifetimeBestFloor");
  });
});

describe("巡回が両方の札を見る", () => {
  it("アリーナと試練の塔、どちらも画面として入っている", () => {
    // 札で中身がまるごと入れ替わるので、片方だけでは足りない
    expect(TOUR).toContain('name: "ランキング/アリーナ"');
    expect(TOUR).toContain('name: "ランキング/試練の塔"');
    expect(TOUR).toContain('rankings:tower');
  });
});
