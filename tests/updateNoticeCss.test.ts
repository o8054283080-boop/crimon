import { describe, expect, it } from "vitest";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../src/web/update-notice.css", import.meta.url), "utf8");
const bootstrap = fs.readFileSync(new URL("../src/web/bootstrap.ts", import.meta.url), "utf8");

describe("アップデートお知らせの可読性", () => {
  it("HOMEのお知らせ本文を非表示にせず折り返して表示する", () => {
    expect(css).toContain(".compensation__message");
    expect(css).toContain("display: block !important");
    expect(css).toContain("white-space: normal !important");
    expect(css).toContain("overflow-wrap: anywhere !important");
  });

  it("bootstrapからお知らせ用CSSを必ず読み込む", () => {
    expect(bootstrap).toContain('import "./update-notice.css";');
  });
});
