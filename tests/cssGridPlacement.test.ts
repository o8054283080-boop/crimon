import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
 * グリッドの中で「隣が消えると列がずれる」置き方を見張る。
 *
 * ## 何が起きたか
 *
 * 同じ壊れ方を2箇所で出している。どちらも**画面は崩れない。文字だけが消える。**
 *
 *   1. アリーナのランキング
 *      列は `30px 22px minmax(0,1fr) auto`。代表モンスターの絵文字は
 *      `leadDexId` が無い行では**要素そのものが出ない**ので、名前が繰り上がって
 *      22px幅の「代表」列へ入り、実機で「ド‥」と2文字目で切れていた。
 *
 *   2. モンスター図鑑のカード
 *      「No.001 · アタッカー」の札に区画を与えていなかったため、`auto` の
 *      2列目へ自動配置されて札の幅ぶん膨らみ、**名前の列が2pxまで潰れた**。
 *      156枚すべてで、モンスターの名前が1文字も出ていなかった。
 *
 * ## なぜ気づけなかったか
 *
 * `text-overflow: ellipsis` があるので、はみ出しも重なりも起きない。
 * 型チェックもテストも素通りし、巡回の検査(はみ出し・押せないボタン・
 * 9px未満の文字・見出しとの重なり)にも1つも当たらない。
 * **画面は整って見えるのに、情報だけが抜け落ちる。**
 *
 * ## 二段で守る
 *
 * ここは「書いた時点で」落とす早期検出。実際に描かれた結果は
 * 巡回(`tools/lib/inspect.mjs` の「文字が切り落とされている」)が見る。
 * 巡回だけだと、その画面へ辿り着けなければ黙って素通りする
 * (ランキングは未接続だと表が出ないので、行を一度も検査していなかった)。
 */

/** 規則の中から1つのプロパティを読む。無ければ null */
function propOf(css: string, selector: string, prop: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`(^|[,}])\\s*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css);
  if (!rule) return null;
  const found = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "m").exec(rule[2]);
  return found ? found[1].trim() : null;
}

describe("グリッドの子は、隣が消えても動かない", () => {
  const arena = readFileSync("src/web/ui/arena.css", "utf8");

  it("ランキングの1行は、6つの区画すべてが列と行を明示している", () => {
    /*
     * **1つでも自動配置に戻すと、そこから先が全部ずれる。**
     * 代表モンスターの絵文字は出ない行があるので、
     * 「並べた順に入るはず」という前提が成り立たない。
     */
    const cells: [string, string, string][] = [
      [".ar-rank__no", "1", "1"],
      [".ar-rank__lead", "2", "1"],
      [".ar-rank__name", "3", "1"],
      [".ar-rank__rating", "4", "1"],
      [".ar-rank__tier", "3", "2"],
      [".ar-rank__record", "4", "2"],
    ];
    for (const [selector, column, row] of cells) {
      expect(propOf(arena, selector, "grid-column"), `${selector} の grid-column`).toBe(column);
      expect(propOf(arena, selector, "grid-row"), `${selector} の grid-row`).toBe(row);
    }
  });

  it("ランキングの名前の列は、可変幅のまま残っている", () => {
    // 名前だけが可変で、他は固定。ここを固定幅にすると長い名前が入らなくなる
    expect(propOf(arena, ".ar-rank__row", "grid-template-columns")).toBe("30px 22px minmax(0, 1fr) auto");
  });
});

describe("図鑑・所持一覧のカードは、区画を持たない子を作らない", () => {
  const list = readFileSync("src/web/ui/monsterList.css", "utf8");

  it("小型カードの子は全員が grid-area を持つ", () => {
    /*
     * `mcard__caption`(図鑑の「No.001 · アタッカー」)と
     * `mcard__info`(所持一覧の装備数など)は**出る画面と出ない画面がある。**
     * 区画が無いと `auto` の列へ落ちて、名前の列を押し潰す。
     */
    for (const [selector, area] of [
      [".mcard--compact .mcard__portrait", "portrait"],
      [".mcard--compact .mcard__name", "name"],
      [".mcard--compact .mcard__stars", "stars"],
      [".mcard--compact .mcard__info", "info"],
      [".mcard--compact .mcard__caption", "caption"],
    ] as [string, string][]) {
      expect(propOf(list, selector, "grid-area"), `${selector} の grid-area`).toBe(area);
    }
  });

  it("小型カードの区画割りに、上の5つ以外の名前が出てこない", () => {
    // 区画名を増やしたのに CSS 側を足し忘れる、を防ぐ
    const areas = propOf(list, ".mcard--compact", "grid-template-areas");
    expect(areas).not.toBeNull();
    const names = new Set((areas ?? "").match(/[a-z]+/g) ?? []);
    expect([...names].sort()).toEqual(["caption", "info", "name", "portrait", "stars"]);
  });
});
