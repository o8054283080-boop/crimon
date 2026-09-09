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

/**
 * 「どこまで表示したか」の記憶。
 *
 * ## 何が起きていたか
 *
 * この画面たちは、**何か操作するたびに丸ごと組み直す。**
 * ロックを掛ける、素材に選ぶ、編成へ入れる——どれも `render()` を通るので、
 * グリッドも新しく作られ、表示数が24件へ巻き戻っていた。
 *
 *   100体持っている人が「さらに表示」を3回押して72件出す
 *   → 1体ロックする
 *   → **また24件に戻り、3回押し直す**
 *
 * 選ぶ操作が続くほど押し直しが増えるので、**選ぶための画面ほど辛い。**
 * 8つの画面(モンスター・装備・編成・ランクアップ素材・クリエイト素材・
 * 育成素材・アリーナ編成・交換所)すべてで同じことが起きていた。
 *
 * ## 覚え方
 *
 * 画面ごとの合言葉(`memoryKey`)で件数だけを覚える。
 * **画面を移ったら忘れる**(`forgetShownCounts`)——別の場所から戻ってきた時に
 * 何百件も並ぶのは、速さのために段階描画を入れた意味を失う。
 * 同じ画面の中の出入り(一覧 ↔ 詳細)は `render()` だけなので覚えたまま。
 */
const shownCounts = new Map<string, number>();

/** 画面を移る時に呼ぶ。次にその画面へ来た時は最初の24件から始まる */
export function forgetShownCounts(): void {
  shownCounts.clear();
}

/** いまその画面が何件まで出したことになっているか */
export function rememberedShownCount(key: string): number {
  return shownCounts.get(key) ?? 0;
}

/**
 * 描き直した時、最初に何件出すか。
 *
 * 覚えている件数まで戻す。ただし**いま並べられる数を超えない**
 * (絞り込みで10件に減った一覧に、48件ぶんの席は要らない)。
 */
export function plannedInitialCount(memoryKey: string | undefined, initialCount: number, total: number): number {
  const remembered = memoryKey ? shownCounts.get(memoryKey) ?? 0 : 0;
  return Math.min(total, Math.max(initialCount, remembered));
}

/**
 * 出した件数を覚える。
 *
 * **増えた時だけ。** 絞り込みで件数が10件に減った時にそこで10と覚えてしまうと、
 * 絞り込みを外した後も10件しか出なくなる。押した回数は減っていないので、
 * 高い方を残す。
 */
export function rememberShownCount(memoryKey: string | undefined, rendered: number): void {
  if (!memoryKey) return;
  shownCounts.set(memoryKey, Math.max(rendered, shownCounts.get(memoryKey) ?? 0));
}

interface IncrementalGridOptions<T> {
  className: string;
  items: readonly T[];
  renderItem: (item: T, index: number) => HTMLElement;
  initialCount?: number;
  batchSize?: number;
  moreLabel?: (shown: number, total: number) => string;
  /**
   * 表示数を覚えておく合言葉。
   *
   * 渡すと、描き直しても**押した回数ぶんの表示が残る。**
   * 渡さなければ毎回24件から始まる(一度きりの一覧向け)。
   */
  memoryKey?: string;
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
    rememberShownCount(options.memoryKey, rendered);
    updateMore();
  };

  const loadMore = (): void => appendUntil(nextIncrementalCount(items.length, rendered, batchSize));
  more.onclick = loadMore;

  const reset = (nextItems: readonly T[]): void => {
    observer?.disconnect();
    items = nextItems;
    rendered = 0;
    grid.replaceChildren(more);
    // 前に押したぶんまで戻す。合言葉が無ければ最初の24件だけ
    appendUntil(plannedInitialCount(options.memoryKey, initialCount, items.length));
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
