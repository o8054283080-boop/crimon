type ElementProps<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], "style">> & {
  className?: string;
  style?: string;
  /**
   * data-* 属性。見た目の分岐(等級・シリーズ・強化段階など)をCSS側へ渡すのに使う。
   * 状態ごとにクラス名を増やすより、値そのものを属性で持たせた方が
   * CSS変数で色を引けて、組み合わせが増えても破綻しない。
   */
  [key: `data-${string}`]: string | undefined;
  /**
   * aria-* 属性。**絵で示すボタンには文字での名前が要る。**
   * アイコンだけのボタンは、読み上げでは無名の押しものになってしまう。
   */
  [key: `aria-${string}`]: string | undefined;
};

/** 属性を割り当てつつ子要素を追加する簡易DOM生成ヘルパー */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps<K> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (key === "style") {
      node.setAttribute("style", value as string);
    } else if (key.startsWith("data-") || key.startsWith("aria-") || key === "role") {
      node.setAttribute(key, value as string);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (node as any)[key] = value;
    }
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}
