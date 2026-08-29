import { describe, expect, it } from "vitest";
import { constrainFloatingPosition, edgeDockSide, normalizeFloatingPanelState } from "../src/web/floatingPanel.js";
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

  it("Safe Areaとbottom navigationより上へDOCKEDタブを補正する", () => {
    expect(constrainFloatingPosition({
      x: 344, y: 999, width: 46, height: 46, viewportWidth: 390, viewportHeight: 844,
      safe: { top: 47, right: 0, bottom: 34, left: 0 }, margin: 0, bottomObstruction: 72,
    })).toEqual({ x: 344, y: 692 });
  });

  it("Pointer Events、移動閾値、個別localStorage、resize補正を共通実装する", () => {
    const source = readFileSync(new URL("../src/web/floatingPanel.ts", import.meta.url), "utf8");
    expect(source).toContain('handle.addEventListener("pointerdown"');
    expect(source).toContain("Math.hypot(dx, dy) < DRAG_THRESHOLD");
    expect(source).toContain("`${STORAGE_PREFIX}${id}`");
    expect(source).toContain('window.addEventListener("resize"');
  });

  it("左右端40pxだけをDOCK判定する", () => {
    expect(edgeDockSide(39, 390, { left: 0, right: 0 })).toBe("left");
    expect(edgeDockSide(351, 390, { left: 0, right: 0 })).toBe("right");
    expect(edgeDockSide(100, 390, { left: 0, right: 0 })).toBeNull();
  });

  it("三状態と左右の保存値を復元し、旧minimized形式も読み替える", () => {
    expect(normalizeFloatingPanelState({ x: 10, y: 20, displayState: "docked", dockSide: "left" }))
      .toEqual({ x: 10, y: 20, displayState: "docked", dockSide: "left" });
    expect(normalizeFloatingPanelState({ minimized: true }).displayState).toBe("compact");
    expect(normalizeFloatingPanelState({ minimized: false }).displayState).toBe("expanded");
    expect(normalizeFloatingPanelState({ x: Number.NaN, displayState: "broken", dockSide: "broken" }))
      .toEqual({ x: undefined, y: undefined, displayState: "expanded", dockSide: "right" });
  });

  it("戦闘時の強制compactは保存されたdocked状態より優先しない", () => {
    const source = readFileSync(new URL("../src/web/floatingPanel.ts", import.meta.url), "utf8");
    expect(source).toContain('options.forceCompact && state.displayState === "expanded" ? "compact" : state.displayState');
  });

  it("周回の進捗は右下に浮かせる", () => {
    const source = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
    expect(source).toContain('id: "background-farm"');
    expect(source).toContain('placement: "bottom"');
  });

  it("初心者ミッションは浮かせず、画面の流れの中へ差し込む", () => {
    /*
     * **浮遊パネルは、位置が固定なので必ず下の何かを覆う。**
     * 初心者ミッションを左上に浮かせていた間、モンスター画面の絞り込みと
     * 並べ替え、装備画面のボタン、ステージの「次はここ」が押せなかった。
     * 型もテストも全部通り、巡回だけが拾えた。同じ形へ戻さないよう見張る。
     */
    const source = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
    expect(source).not.toContain('id: "tutorial-mission"');
    expect(source).toContain("content.prepend(bar)");
  });
});
