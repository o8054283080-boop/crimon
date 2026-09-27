import { describe, expect, it } from "vitest";
import { navShiftFor } from "../src/web/viewportNavFix.js";

/**
 * 下のバーを見えている画面の下端へ戻す量。
 * iPhoneでキーボードを閉じた後、固定の基準がキーボードの高さぶん上に取り残されると、
 * 下のバーが画面の途中に浮く(依頼主の実機)。
 */
describe("下のバーの位置の補正", () => {
  const base = { innerHeight: 844, viewportHeight: 844, viewportOffsetTop: 0, scale: 1, editing: false };

  it("ずれていなければ動かさない", () => {
    expect(navShiftFor(base)).toBe(0);
  });

  it("見えている画面の下端が固定の基準より下にあれば、その差だけ下げる", () => {
    // 基準がキーボードぶん(336px)縮んだまま戻らない
    expect(navShiftFor({ ...base, innerHeight: 508 })).toBe(336);
    // 見えている画面だけが下へずれたまま戻らない
    expect(navShiftFor({ ...base, viewportOffsetTop: 300 })).toBe(300);
  });

  it("入力中(キーボードが出ている)と拡大中は動かさない", () => {
    expect(navShiftFor({ ...base, innerHeight: 508, editing: true })).toBe(0);
    expect(navShiftFor({ ...base, innerHeight: 508, scale: 1.5 })).toBe(0);
  });

  it("上へは動かさない。1〜2pxの揺れも無視する", () => {
    expect(navShiftFor({ ...base, viewportHeight: 508 })).toBe(0);
    expect(navShiftFor({ ...base, viewportOffsetTop: 2 })).toBe(0);
  });
});
