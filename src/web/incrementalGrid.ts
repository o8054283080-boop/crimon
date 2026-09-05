export const INVENTORY_INITIAL_RENDER_COUNT = 24;
export const INVENTORY_RENDER_BATCH_SIZE = 24;

export function nextIncrementalCount(total: number, current: number, batchSize = INVENTORY_RENDER_BATCH_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const safeCurrent = Math.max(0, Math.min(total, Math.floor(current)));
  const safeBatch = Math.max(1, Math.floor(batchSize));
  return Math.min(total, safeCurrent + safeBatch);
}

export interface IncrementalGridHandle<T> {
  element: HTMLDivElement;
  reset: (items: readonly T[]) => void;
  loadMore: () => void;
  renderedCount: () => number;
}

interface IncrementalGridOptions<T> {
  className: string;
  items: readonly T[];
  renderItem: (item: T, index: number) => HTMLElement;
  initialCount?: number;
  batchSize?: number;
  moreLabel?: (shown: number, total: number) => string;
}

/**
 * 大量の所持品を一度にDOM化しないための段階描画グリッド。
 *
 * 配列の絞り込み・並べ替え結果そのものは維持し、画面へ実体化するカードだけを
 * 最初の24件→以後24件ずつに分ける。IntersectionObserverが使えるブラウザでは
 * 一覧末尾へ近づくと自動で次を足し、使えない環境でも「さらに表示」ボタンで進める。
 * セーブ形式や所持数には一切触れない。
 */
export function createIncrementalGrid<T>(options: IncrementalGridOptions<T>): IncrementalGridHandle<T> {
  let items = options.items;
  let rendered = 0;
  const initialCount = Math.max(1, Math.floor(options.initialCount ?? INVENTORY_INITIAL_RENDER_COUNT));
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? INVENTORY_RENDER_BATCH_SIZE));

  const grid = document.createElement("div");
  grid.className = `${options.className} incremental-grid`;

  const more = document.createElement("button");
  more.type = "button";
  more.className = "btn btn--ghost incremental-grid__more";
  more.style.gridColumn = "1 / -1";
  more.style.width = "100%";

  let observer: IntersectionObserver | null = null;

  const updateMore = (): void => {
    if (rendered >= items.length) {
      more.remove();
      observer?.disconnect();
      return;
    }
    more.textContent = options.moreLabel?.(rendered, items.length) ?? `さらに表示（${rendered} / ${items.length}）`;
    if (!more.isConnected) grid.append(more);
  };

  const appendUntil = (target: number): void => {
    const end = Math.max(rendered, Math.min(items.length, target));
    const fragment = document.createDocumentFragment();
    for (let index = rendered; index < end; index += 1) {
      fragment.append(options.renderItem(items[index], index));
    }
    grid.insertBefore(fragment, more.isConnected ? more : null);
    rendered = end;
    updateMore();
  };

  const loadMore = (): void => appendUntil(nextIncrementalCount(items.length, rendered, batchSize));
  more.onclick = loadMore;

  const reset = (nextItems: readonly T[]): void => {
    observer?.disconnect();
    items = nextItems;
    rendered = 0;
    grid.replaceChildren(more);
    appendUntil(Math.min(items.length, initialCount));
    if (typeof IntersectionObserver !== "undefined" && rendered < items.length) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      }, { rootMargin: "600px 0px" });
      observer.observe(more);
    }
  };

  reset(items);
  return { element: grid, reset, loadMore, renderedCount: () => rendered };
}
