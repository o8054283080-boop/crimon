import { describe, expect, it } from "vitest";
import { constrainFloatingPosition } from "../src/web/floatingPanel.js";
import { readFileSync } from "node:fs";

describe("共通フローティングパネル", () => {
  it("四辺のSafe Areaと余白より外へ出さない", () => {
    const common = { width: 200, height: 100, viewportWidth: 390, viewportHeight: 844, safe: { top: 47, right: 4, bottom: 34, left: 4 } };
    expect(constrainFloatingPosition({ ...common, x: -100, y: -100 })).toEqual({ x: 12, y: 55 });
    expect(constrainFloatingPosition({ ...common, x: 999, y: 999 })).toEqual({ x: 178, y: 702 });
  });

  it("パネルがviewportより大きい場合も安全側の左上へ固定する", () => {
    expect(constrainFloatingPosition({ x: 20, y: 20, width: 500, height: 900, viewportWidth: 390, viewportHeight: 844, safe: { top: 10, right: 0, bottom: 0, left: 0 } })).toEqual({ x: 8, y: 18 });
  });

  it("Pointer Events、移動閾値、個別localStorage、resize補正を共通実装する", () => {
    const source = readFileSync(new URL("../src/web/floatingPanel.ts", import.meta.url), "utf8");
    expect(source).toContain('handle.addEventListener("pointerdown"');
    expect(source).toContain("Math.hypot(dx, dy) < DRAG_THRESHOLD");
    expect(source).toContain("`${STORAGE_PREFIX}${id}`");
    expect(source).toContain('window.addEventListener("resize"');
  });

  it("周回と初心者ミッションは別ID・別初期位置で同じ機構を使う", () => {
    const source = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
    expect(source).toContain('id: "background-farm"');
    expect(source).toContain('placement: "bottom"');
    expect(source).toContain('id: "tutorial-mission"');
    expect(source).toContain('placement: "top"');
  });
});
