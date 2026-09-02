import { describe, expect, it } from "vitest";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../src/web/update-notice.css", import.meta.url), "utf8");
const bootstrap = fs.readFileSync(new URL("../src/web/bootstrap.ts", import.meta.url), "utf8");

describe("アップデートお知らせの可読性", () => {
  it("HOMEのお知らせ本文を非表示にせず折り返して表示する", () => {
    expect(css).toContain(".compensation__message");
    expect(css).toContain("white-space: normal !important");
    expect(css).toContain("overflow-wrap: anywhere !important");
    // 隠してはいない(`display:none` へ戻していない)
    expect(css).not.toMatch(/\.compensation__message\s*\{[^}]*display:\s*none/);
  });

  it("HOMEでは本文を2行で止める", () => {
    /*
     * 全文を出すと、この1本だけで4行(約110px)を占める。
     * ホームは高さを分け合う縦並びなので、そのぶん世界の絵が縮み、
     * **始めたばかりの人が最初に見る画面が更新履歴の壁になる。**
     * 切った先はホーム左の「お知らせ」に全文がある。
     */
    expect(css).toContain("-webkit-line-clamp: 2");
    expect(css).toContain("display: -webkit-box !important");
  });

  it("bootstrapからお知らせ用CSSを必ず読み込む", () => {
    expect(bootstrap).toContain('import "./update-notice.css";');
  });
});
