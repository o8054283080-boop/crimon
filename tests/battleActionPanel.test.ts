import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { targetSideOf } from "../src/web/views/battleView.js";

/*
 * 戦闘画面の下端: 対象選びと決着のボタン。
 *
 * ## 何が起きていたか
 *
 * - 対象選びの札を戦場の上(下から108px)へ浮かせていて、**左下の味方(P1)に乗っていた。**
 *   `elementFromPoint` でP1の位置は札が返り、本体は札の裏に隠れていた
 * - 対象を選んでいる間、下のスキル欄は「直前に動いた別の味方」を出していた
 * - 案内は「敵をタップして選び」で固定。回復など味方単体のスキルでも「敵を」と出ていた
 * - 決着のボタンが画面の下端に貼り付き、実機では iPhone のホームバーの帯に沈んでいた
 *
 * DOMを組む関数なので、置き場所はソースを読んで確かめる。
 * 見た目と押せるかどうかは実ブラウザで測ってある(P1の最前面が canvas になること)。
 */
const source = readFileSync(new URL("../src/web/views/battleView.ts", import.meta.url), "utf8");
const panelCss = readFileSync(new URL("../src/web/ui/battleActionPanel.css", import.meta.url), "utf8");
const styleCss = readFileSync(new URL("../src/web/style.css", import.meta.url), "utf8");

function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `${selector} が無い`).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf("}", at));
}

describe("対象選び", () => {
  it("案内は、味方向けのスキルなら「味方を」、それ以外は「敵を」", () => {
    expect(targetSideOf("SINGLE_ALLY")).toBe("味方");
    expect(targetSideOf("SINGLE_ENEMY")).toBe("敵");
    expect(source, "「敵をタップ」の固定文へ戻っている").not.toContain('["敵をタップして選び');
  });

  it("戦場の上に浮かせない。スキルドックの中身と入れ替える", () => {
    expect(source, "浮いた札の置き場が戻っている").not.toContain("action-panel-slot");
    expect(styleCss, "浮いた札のルールが戻っている").not.toContain("action-panel-slot");
    expect(source).toContain("renderTargetDock(picker.unit, picker.skillIndex)");
  });

  it("対象を選んでいる間も、スキル欄は選んでいる本人の名前を出す", () => {
    const dock = source.slice(source.indexOf("function renderTargetDock"));
    expect(dock.slice(0, dock.indexOf("skillDock.replaceChildren(") + 200)).toContain(
      'el("div", { className: "skill-dock__owner" }, [unit.def.name])',
    );
  });

  it("操作欄の上で離した指は、裏の本体を選ばない", () => {
    const tap = source.slice(source.indexOf("function handleStageTap"));
    const guard = tap.indexOf('closest("button, .skill-dock, .battle-topbar")');
    expect(guard, "操作欄のタップを除いていない").toBeGreaterThanOrEqual(0);
    expect(guard, "本体を拾った後で除いている").toBeLessThan(tap.indexOf("stage.pickUnitAt"));
  });
});

describe("戦闘画面の下の safe-area", () => {
  /*
   * **変数を通す。**確認用ブラウザには safe-area が無く `env()` は0で返る。
   * 変数なら34pxを入れて、実機のホームバーぶんを再現して撮れる。
   */
  it("safe-area は `--battle-safe-bottom` を通す", () => {
    expect(ruleBody(styleCss, ".screen.battle-view")).toContain("--battle-safe-bottom: env(safe-area-inset-bottom, 0px)");
    expect(ruleBody(styleCss, ".skill-dock")).toContain("max(8px, var(--battle-safe-bottom, 0px))");
  });

  it("決着のボタンは帯の中に置き、帯の下余白が safe-area を見る", () => {
    expect(source).toContain('className: "battle-result-foot battle-result-foot--hidden" }, [resultBanner, finishBtn]');
    expect(ruleBody(panelCss, ".battle-result-foot")).toContain("max(6px, var(--battle-safe-bottom, 0px))");
  });
});
