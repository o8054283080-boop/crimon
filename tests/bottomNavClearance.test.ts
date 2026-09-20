/**
 * 下タブの裏に部品を沈めない。
 *
 * **図鑑の「スキルLv別の変化を見る」が、どこまで動かしても押せなかった。**
 * 画面の下余白が `max(14px, env(safe-area-inset-bottom))` しか無く、
 * その上に64pxの下タブが固定で乗っているので、**一番下まで送っても
 * 最後の行がタブの裏から出てこなかった。**
 *
 * 型検査もテストも素通りする崩れなので、ここでCSSの字面を見張る。
 * 実際に押せるかは巡回(`tools/lib/inspect.mjs` の検査3)が見ている。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../src/web/${path}`, import.meta.url), "utf8");

/** 画面いっぱいに伸びる一覧系。**どれも下タブのぶんを空ける** */
const SCREENS: { css: string; selector: string }[] = [
  { css: "ui/monsterDex.css", selector: ".monster-dex" },
  { css: "ui/monsterList.css", selector: ".monsters-screen:not(:has(.management-header))" },
  { css: "ui/party.css", selector: ".party-screen" },
];

/** `セレクタ { ... }` の中身を取り出す */
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`) >= 0 ? css.indexOf(`${selector} {`) : css.indexOf(`${selector}{`);
  expect(at, `${selector} の指定が見つからない`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
}

describe("下タブのぶんを空けている", () => {
  for (const screen of SCREENS) {
    it(`${screen.selector} の下余白に下タブの高さが入っている`, () => {
      const body = ruleBody(read(screen.css), screen.selector);
      expect(body, `${screen.selector} に padding-bottom が無い`).toContain("padding-bottom");
      expect(body, `${screen.selector} の下余白に --bottom-nav-h が入っていない`).toContain("--bottom-nav-h");
    });
  }

  /*
   * **実機のノッチぶんも一緒に空ける。**
   * `--bottom-nav-h` だけだと、下が34px高い実機でまた沈む。
   */
  it("実機のノッチぶんも足している", () => {
    for (const screen of SCREENS) {
      const body = ruleBody(read(screen.css), screen.selector);
      expect(body, `${screen.selector} に safe-area が入っていない`).toContain("env(safe-area-inset-bottom)");
    }
  });
});

/*
 * 折りたたみの見出し(`summary`)は button でも a でもないので、
 * **巡回の押下検査に長いこと入っていなかった。**
 * 入れた途端、文字の高さぶんしかない的が3か所出てきた。
 */
describe("折りたたみの見出しが指で押せる大きさ", () => {
  const SUMMARIES: { css: string; selector: string; 実測: string }[] = [
    { css: "ui/monsterDex.css", selector: ".monster-dex-detail__growth summary", 実測: "15px" },
    { css: "ui/trialTower.css", selector: ".tower-band__head", 実測: "19px" },
    { css: "ui/arena.css", selector: ".ar-rewards__summary", 実測: "21px" },
  ];

  for (const target of SUMMARIES) {
    it(`${target.selector} が44px以上(前は${target.実測})`, () => {
      const body = ruleBody(read(target.css), target.selector);
      const matched = /min-height:\s*(\d+)px/.exec(body);
      expect(matched, `${target.selector} に min-height が無い`).not.toBeNull();
      expect(Number(matched![1]), `${target.selector} が44pxを割っている`).toBeGreaterThanOrEqual(44);
    });
  }
});

/*
 * 巡回そのものが検査を持っていること。
 * **ここが抜けると、同じ崩れをまた実機で指摘されるまで気づけない。**
 */
describe("巡回の検査", () => {
  const INSPECT = readFileSync(new URL("../tools/lib/inspect.mjs", import.meta.url), "utf8");

  it("summary も押しものとして見ている", () => {
    expect(INSPECT).toContain("a[href], summary");
  });

  it("「送りきっても下タブの裏から出てこない」を見ている", () => {
    expect(INSPECT).toContain("下タブの裏から出てこない");
    // 送れる量から判定している(いまのスクロール位置に左右されない)
    expect(INSPECT).toContain("scroller.scrollHeight - vh");
  });

  /** 固定・粘着の部品はページと一緒に動かないので、この検査の対象外 */
  it("固定された部品を誤って拾わない", () => {
    expect(INSPECT).toContain("movesWithPage");
    expect(INSPECT).toContain("'fixed' || pos === 'sticky'");
  });
});
