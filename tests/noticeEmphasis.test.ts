/**
 * お知らせ本文の `**強調**`。
 *
 * **実機でアスタリスクがそのまま出ていた。**
 * 書く側はずっと `**` で強調していたのに、画面側は `textContent` で
 * 流し込んでいたので、「開催期間を **10月19日 → 12月19日** へ延長しました」と
 * 記号ごと表示されていた。型検査もテストも素通りする類の崩れ。
 *
 * ここで見るのは `splitEmphasis`(DOMを触らない方)。
 * **画面に出る文字を決めているのはこちら**なので、ブラウザが無くても足りる。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { splitEmphasis } from "../src/web/dom.js";
import { COMPENSATIONS } from "../src/game/compensation.js";

/** 画面に出る文字（太字かどうかに関係なく、目に見える並び） */
const shown = (text: string) => splitEmphasis(text).map((part) => part.text).join("");
/** 太字になるところ */
const bold = (text: string) => splitEmphasis(text).filter((part) => part.strong).map((part) => part.text);

describe("強調の切り分け", () => {
  it("`**` で挟んだところが太字になる", () => {
    expect(bold("開催期間を **12月19日** へ延長しました")).toEqual(["12月19日"]);
  });

  /** **画面に記号を出さない。**これが直したかったこと */
  it("表示される文字からアスタリスクが消える", () => {
    expect(shown("**ここ**が太字")).toBe("ここが太字");
  });

  it("1つの文に何か所あっても全部太字になる", () => {
    expect(bold("**あ**と**い**と**う**")).toEqual(["あ", "い", "う"]);
  });

  it("強調が無い文はそのまま出る", () => {
    const text = "ゴールドの入手量を見直しました。";
    expect(bold(text)).toEqual([]);
    expect(shown(text)).toBe(text);
  });

  /*
   * **閉じていない `**` は文字として残す。**
   * 消すと本文が欠ける。書き間違いで文章が消えるより、
   * 記号が1つ見えている方がまだましという判断。
   */
  it("閉じていない `**` は本文を欠けさせない", () => {
    const text = "**閉じ忘れた強調";
    expect(shown(text)).toBe(text);
    expect(bold(text)).toEqual([]);
  });

  it("改行はそのまま残る", () => {
    expect(shown("上\n\n**下**")).toBe("上\n\n下");
  });
});

describe("実際のお知らせ", () => {
  /** 全件通しで見る。1つでも記号が残っていたら落とす */
  it("どのお知らせにもアスタリスクが表示されない", () => {
    const leaked = COMPENSATIONS
      .filter((notice) => shown(notice.message).includes("*"))
      .map((notice) => notice.id);
    expect(leaked, `アスタリスクが画面に出るお知らせ: ${leaked.join(", ")}`).toEqual([]);
  });

  it("強調を書いてあるお知らせは、ちゃんと太字になっている", () => {
    const withMark = COMPENSATIONS.filter((notice) => notice.message.includes("**"));
    expect(withMark.length, "強調を使ったお知らせが1件も無い").toBeGreaterThan(0);
    for (const notice of withMark) {
      expect(bold(notice.message).length, `${notice.id} が太字にならない`).toBeGreaterThan(0);
    }
  });

  /** 本文が1文字も落ちていないこと。切り分けで消えるのは `**` だけ */
  it("切り分けても本文が欠けない", () => {
    for (const notice of COMPENSATIONS) {
      expect(shown(notice.message), `${notice.id} の本文が変わっている`)
        .toBe(notice.message.replaceAll("**", ""));
    }
  });
});

/*
 * **画面側が `textContent` へ戻らないように見張る。**
 * ここが元の1行へ戻ると、また記号がそのまま出る。
 */
describe("画面側の配線", () => {
  it("お知らせ一覧とホームの札の両方が、強調を通している", () => {
    const notice = readFileSync(new URL("../src/web/noticeUi.ts", import.meta.url), "utf8");
    const home = readFileSync(new URL("../src/web/views/home.ts", import.meta.url), "utf8");
    expect(notice).toContain("emphasizedNodes(notice.message)");
    expect(notice).not.toContain("message.textContent = notice.message");
    expect(home).toContain("emphasizedNodes(compensation.message)");
  });

  /** `innerHTML` は使わない。本文は必ずテキストノードとして置く */
  it("本文を innerHTML で流し込んでいない", () => {
    const dom = readFileSync(new URL("../src/web/dom.ts", import.meta.url), "utf8");
    const fn = dom.slice(dom.indexOf("export function emphasizedNodes"));
    expect(fn.slice(0, fn.indexOf("\n}\n"))).not.toContain("innerHTML");
  });
});
