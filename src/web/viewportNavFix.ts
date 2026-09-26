/**
 * 下のバーを、**見えている画面の下端**に留める。
 *
 * iPhone(iOS 26 の Safari とホーム画面のアプリ)では、キーボードを閉じた後に
 * `position: fixed; bottom: 0` の部品が**キーボードの高さぶん上に取り残される**ことがある。
 * 依頼主の実機で、ショップの途中に下のバーが浮いていた(スキル図鑑の検索欄を足した直後)。
 * 固定の基準(レイアウトの画面)と、実際に見えている画面(visualViewport)の下端がずれたまま戻らない。
 *
 * 2つで塞ぐ:
 *   1. ずれを測り、`--viewport-nav-shift` としてバーを下へずらす(`.bottom-nav` の transform)。
 *      ずれていなければ 0 で、何も起きない
 *   2. 入力欄から離れた直後に、位置の計算をやり直させる(同じ位置への scrollTo)
 *
 * **入力中と拡大中は動かさない。**入力中のずれはキーボードそのもので、
 * バーはキーボードの裏に隠れているのが正しい。
 */

export interface ViewportSample {
  innerHeight: number;
  viewportHeight: number;
  viewportOffsetTop: number;
  scale: number;
  editing: boolean;
}

/** バーを下へずらす量(px)。上へは動かさない */
export function navShiftFor(sample: ViewportSample): number {
  if (sample.editing) return 0;
  if (Math.abs(sample.scale - 1) > 0.01) return 0;
  const shift = Math.round(sample.viewportOffsetTop + sample.viewportHeight - sample.innerHeight);
  // 1〜2pxの揺れは丸めの誤差。触るとバーが震える
  return shift > 2 ? shift : 0;
}

function isEditing(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "range", "submit", "reset", "color", "file", "image"].includes(element.type);
  }
  return (element as HTMLElement).isContentEditable === true;
}

export function installViewportNavFix(win: Window = window): void {
  const doc = win.document;
  const vv = win.visualViewport;
  let applied = -1;

  const update = (): void => {
    const shift = vv
      ? navShiftFor({
        innerHeight: win.innerHeight,
        viewportHeight: vv.height,
        viewportOffsetTop: vv.offsetTop,
        scale: vv.scale,
        editing: isEditing(doc.activeElement),
      })
      : 0;
    if (shift === applied) return;
    applied = shift;
    doc.documentElement.style.setProperty("--viewport-nav-shift", `${shift}px`);
  };

  vv?.addEventListener("resize", update);
  vv?.addEventListener("scroll", update);
  win.addEventListener("resize", update);
  win.addEventListener("orientationchange", update);

  // キーボードが閉じ切るまでに少しかかる。閉じる途中・閉じた後で測り直す
  doc.addEventListener("focusout", (event) => {
    if (!isEditing(event.target as Element | null)) return;
    for (const delay of [0, 120, 360, 720]) {
      win.setTimeout(() => {
        if (isEditing(doc.activeElement)) return;
        // 同じ位置へのスクロールで、固定部品の位置の計算をやり直させる
        win.scrollTo(win.scrollX, win.scrollY);
        update();
      }, delay);
    }
  });
  doc.addEventListener("focusin", update);
  update();
}
