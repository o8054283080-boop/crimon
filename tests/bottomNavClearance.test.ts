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

/**
 * ホームの下端。**プレゼントが下のバーに食い込んでいた**(依頼主の実機)。
 *
 * ## なぜ字面で見張るのか
 *
 * **確認用ブラウザには safe-area が無い。**こちらでは隙間が17pxに見えていて、
 * 実機で沈んでいることに気づけない。実測は `tools/homeSafeArea.mjs` が
 * 変数を注入してやるが、あれは手で走らせる道具なので、
 * 値が戻されたことを機械的に拾えるのはここだけ。
 *
 * ## 「バーを低くすれば空く」は効かない
 *
 * 世界の枠は `flex:1 1 auto` で余りを全部吸う。**バーを112→94pxにしても、
 * プレゼントの下は17pxのままだった**(実測)。隙間は
 * `.crimon-home` の下余白で先に取り置くしかない。
 */
describe("ホームの下端に、バーとの隙間がある", () => {
  const css = read("home-pop-design.css");

  it("下余白がバーの高さ + 余裕になっている", () => {
    const at = css.indexOf("padding-bottom: calc(var(--bottom-nav-h)");
    expect(at, "ホームの下余白が --bottom-nav-h を通っていない").toBeGreaterThan(-1);
    const extra = /padding-bottom: calc\(var\(--bottom-nav-h\) \+ (\d+)px\)/.exec(css.slice(at));
    expect(extra, "余裕のpxが読めない").not.toBeNull();
    /*
     * 実測(`tools/homeSafeArea.mjs`)で、ここが+4pxだとプレゼントの下は17px。
     * +28pxで41pxになる。**17pxでは実機で沈む**ので、20px以上は残す。
     */
    expect(Number(extra![1]), "バーとの隙間が足りない(実機でプレゼントが沈む)").toBeGreaterThanOrEqual(20);
  });

  it("safe-area は変数を通す(確認用ブラウザで測れなくなる)", () => {
    // 上下とも `--home-safe-*` を通していること
    expect(css).toContain("padding-top: max(12px, var(--home-safe-top))");
    // 下はバーの高さ(`--bottom-nav-h`)の中で通す。バーは絵を全体に敷き、下の余白を持たない
    expect(css).toMatch(/--bottom-nav-h: max\(calc\(var\(--home-nav-base-h\) \+ var\(--home-safe-bottom\)\)/);
    // ホームの箱の指定に `env()` を直書きしていないこと
    const at = css.indexOf("padding-top: max(12px, var(--home-safe-top))");
    const body = css.slice(at - 400, at + 400);
    expect(body, "env() を直に書くと、実機相当を注入して測れない").not.toContain("env(safe-area-inset");
  });

  it("バーの高さは、指で押せる大きさを保つ", () => {
    const base = /--home-nav-base-h:\s*(\d+)px/.exec(css);
    expect(base, "バーの基準の高さが読めない").not.toBeNull();
    // safe-area を除いた実質がボタンの高さになる。36pxを割ると巡回が落ちる
    expect(Number(base![1]), "バーが低すぎて的が小さくなる").toBeGreaterThanOrEqual(56);
    // 低くした意味が無くならないよう、上も見る(元は82px)
    expect(Number(base![1]), "バーを低くした変更が戻っている").toBeLessThanOrEqual(76);
  });
});
