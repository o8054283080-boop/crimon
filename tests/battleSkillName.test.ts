import { describe, expect, it } from "vitest";
import { actionNamesFromLines } from "../src/web/views/battleView.js";

describe("戦闘中のスキル名表示", () => {
  it("同じターンのバトルイリュージョンと最低なイタズラを順番どおり拾う", () => {
    const lines = [
      "[味方:P1] 電気ジョーカー の「バトルイリュージョン」！",
      "  → [敵:E1] に呪い",
      "[味方:P1] 電気ジョーカー の「最低なイタズラ」！",
      "  → [敵:E1] の呪いを起爆",
    ];
    expect(actionNamesFromLines(lines)).toEqual(["バトルイリュージョン", "最低なイタズラ"]);
  });

  it("通常の1スキルは1件だけ拾う", () => {
    expect(actionNamesFromLines(["[味方:P1] フェアリー の「生命の火」！"]))
      .toEqual(["生命の火"]);
  });
});
