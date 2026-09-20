/**
 * 左上の「戻る」が2つ並ばないこと。
 *
 * 共通の「戻る」は `position: fixed` で左上に居座る。自前の戻り口を持つ
 * 画面でこれを出すと、**同じ場所にボタンが2つ**並ぶ。
 *
 * さらに困るのは、自前のものは画面と一緒に動くこと。少し巻いた瞬間に
 * **自前のボタンが共通ボタンの裏へ入って押せなくなる。**
 * 図鑑の「‹ 一覧」で実際に起きている(依頼主の指摘)。
 *
 * モンスター詳細では前に同じことが起きて、共通ボタンを出さない形で直した。
 * 図鑑の詳細も同じ扱いにする。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { OWN_BACK_SELECTOR } from "../src/web/views/backButton.js";

const read = (path: string) => readFileSync(new URL(`../src/web/${path}`, import.meta.url), "utf8");

describe("自前の戻り口を持つ画面", () => {
  it("モンスター詳細と図鑑の詳細が入っている", () => {
    expect(OWN_BACK_SELECTOR).toContain(".monster-detail-head");
    expect(OWN_BACK_SELECTOR).toContain(".monster-dex-detail__back");
  });

  it("描く側が、その画面では共通ボタンを返さない", () => {
    const source = read("views/backButton.ts");
    expect(source).toContain("document.querySelector(OWN_BACK_SELECTOR)");
  });

  /*
   * **逃げ場の余白も一緒に止める。**
   * クラスだけ付けたままだと、ボタンが無いのに上が42px空く。
   */
  it("上の余白を空けるかどうかも、同じ物差しで決めている", () => {
    const main = read("main.ts");
    expect(main).toContain("!content.querySelector(OWN_BACK_SELECTOR)");
  });
});

/*
 * 初心者ミッションの帯は粘着(`z-index: 30`)で、巻くと上に残る。
 * 図鑑の「‹ 一覧」はその下を通るので、**帯は半透明で、うっすら見えているのに
 * 押せない**状態になっていた。重ね順だけ上げて、見えている間は押せるようにする。
 */
describe("初心者ミッションの帯より手前に置く", () => {
  const dexCss = readFileSync(new URL("../src/web/ui/monsterDex.css", import.meta.url), "utf8");
  const tutorialCss = readFileSync(new URL("../src/web/ui/tutorialBar.css", import.meta.url), "utf8");

  /** 帯の重ね順を読む。ここが変わったら「‹ 一覧」側も見直す */
  function barZIndex(): number {
    const at = tutorialCss.indexOf(".screen > .tutorial-bar[data-tutorial-bar]");
    expect(at, "帯の粘着指定が見つからない").toBeGreaterThanOrEqual(0);
    const body = tutorialCss.slice(at, tutorialCss.indexOf("}", at));
    const matched = /z-index:\s*(\d+)/.exec(body);
    expect(matched, "帯に z-index が無い").not.toBeNull();
    return Number(matched![1]);
  }

  it("「‹ 一覧」の重ね順が帯より上", () => {
    const at = dexCss.indexOf(".monster-dex-detail__back {");
    expect(at, "「‹ 一覧」の指定が見つからない").toBeGreaterThanOrEqual(0);
    const body = dexCss.slice(at, dexCss.indexOf("}", at));
    const matched = /z-index:\s*(\d+)/.exec(body);
    expect(matched, "「‹ 一覧」に z-index が無い").not.toBeNull();
    expect(Number(matched![1])).toBeGreaterThan(barZIndex());
  });

  /** **浮かせない。**粘着や固定にすると、今度は下の中身を覆う */
  it("「‹ 一覧」は画面と一緒に動く(粘着も固定もしない)", () => {
    const at = dexCss.indexOf(".monster-dex-detail__back {");
    const body = dexCss.slice(at, dexCss.indexOf("}", at));
    expect(body).toContain("position:relative");
    expect(body).not.toContain("position:sticky");
    expect(body).not.toContain("position:fixed");
  });
});
